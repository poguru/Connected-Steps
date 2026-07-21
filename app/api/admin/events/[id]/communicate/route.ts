import { NextRequest, NextResponse, after } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { processEmailBatch } from "@/lib/process-email-batch";

type RecipientFilter = "all" | "paid" | "free" | "pending" | "checked_in" | "not_checked_in";

// GET — communication history for this event
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();
  const { data } = await db
    .from("event_comm_history")
    .select("id, sent_at, subject, recipients, sent, failed, status, channel, recipient_filter, batch_id")
    .eq("event_id", id)
    .order("sent_at", { ascending: false })
    .limit(20);
  return NextResponse.json({ history: data ?? [] });
}

// POST — enqueue all recipient emails for async delivery.
// Returns { batch_id, queued } immediately.
// The admin UI then calls /send-next once per second to process the queue.
// This design ensures SES sandbox rate (1 email/second) is never exceeded.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json() as { recipient_filter: RecipientFilter; subject: string; body: string };
  const { recipient_filter, subject } = body;
  const emailBody = body.body;

  if (!subject?.trim() || !emailBody?.trim())
    return NextResponse.json({ error: "subject and body are required" }, { status: 400 });

  const db = getSupabaseServer();

  // Fetch matching registrants
  let query = db
    .from("event_registrations")
    .select("user_email, user_name, payment_status, status, checked_in_at")
    .eq("event_id", id)
    .neq("status", "cancelled");

  if (recipient_filter === "paid")           query = query.eq("payment_status", "paid");
  if (recipient_filter === "free")           query = query.eq("payment_status", "free");
  if (recipient_filter === "pending")        query = query.eq("payment_status", "pending");
  if (recipient_filter === "checked_in")     query = query.not("checked_in_at", "is", null);
  if (recipient_filter === "not_checked_in") query = query.is("checked_in_at", null).eq("status", "confirmed");

  const [{ data: registrants, error: fetchErr }, { data: ev }] = await Promise.all([
    query,
    db.from("events").select("title").eq("id", id).single(),
  ]);
  if (fetchErr) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!registrants?.length)
    return NextResponse.json({ queued: 0, batch_id: null, message: "No recipients matched the filter." });

  const eventTitle = ev?.title ?? "";

  // Deduplicate by email
  const seen = new Set<string>();
  const recipients = registrants.filter(r => {
    if (!r.user_email || seen.has(r.user_email)) return false;
    seen.add(r.user_email);
    return true;
  });

  const batchId = crypto.randomUUID();

  // Build one queue row per recipient — personalise body variables per recipient
  const rows = recipients.map(r => {
    const personalizedBody = emailBody
      .replace(/\{name\}/gi,  r.user_name  || "Participant")
      .replace(/\{email\}/gi, r.user_email || "")
      .replace(/\{event\}/gi, eventTitle)
      .replace(/\n/g, "<br>");

    return {
      batch_id:        batchId,
      event_id:        id,
      recipient_email: r.user_email,
      recipient_name:  r.user_name ?? null,
      subject,
      html_body: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0a0a0a;color:#f0f0f0;border-radius:8px;">
      <div style="margin-bottom:20px;">
        <img src="https://www.connectedsteps.in/logo.png" width="40" style="border-radius:50%;vertical-align:middle;"/>
        <span style="font-size:16px;font-weight:700;color:#fff;margin-left:10px;">Connected Steps</span>
      </div>
      <p style="margin:0 0 12px;color:#ccc;">Hi <strong style="color:#fff;">${r.user_name || "there"}</strong>,</p>
      <div style="line-height:1.8;color:#ccc;">${personalizedBody}</div>
      <div style="margin-top:28px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.1);font-size:11px;color:#555;">
        Connected Steps · Hyderabad · <a href="https://www.connectedsteps.in" style="color:#e8620a;text-decoration:none;">connectedsteps.in</a>
      </div>
    </div>`,
    };
  });

  const { error: insertErr } = await db.from("email_queue").insert(rows);
  if (insertErr) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Create history entry in 'queued' state; updated to 'sent'/'failed' when processing completes
  void db.from("event_comm_history").insert({
    event_id:         id,
    subject,
    recipients:       recipients.length,
    sent:             0,
    failed:           0,
    status:           "queued",
    filter:           recipient_filter,
    recipient_filter,
    channel:          "email",
    batch_id:         batchId,
  });

  // Process the batch server-side after the response is sent.
  // This means email delivery continues even if the admin closes the tab.
  after(() => processEmailBatch(batchId));

  return NextResponse.json({ batch_id: batchId, queued: recipients.length });
}
