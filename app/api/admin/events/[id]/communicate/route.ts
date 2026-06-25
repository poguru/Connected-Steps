import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { sendBatchEmails } from "@/lib/email-service";

type RecipientFilter = "all" | "paid" | "free" | "pending" | "checked_in" | "not_checked_in";

// GET  — email history for this event
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();
  const { data } = await db
    .from("event_comm_history")
    .select("id, sent_at, subject, recipients, status")
    .eq("event_id", id)
    .order("sent_at", { ascending: false })
    .limit(20);
  return NextResponse.json({ history: data ?? [] });
}

// POST — send email to filtered registrants
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { recipient_filter, subject, body } = await req.json() as {
    recipient_filter: RecipientFilter;
    subject:          string;
    body:             string;
  };

  if (!subject?.trim() || !body?.trim()) {
    return NextResponse.json({ error: "subject and body are required" }, { status: 400 });
  }

  const db = getSupabaseServer();

  // Fetch registrants matching the filter
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

  const { data: registrants, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!registrants?.length) return NextResponse.json({ sent: 0, failed: 0, message: "No recipients matched the filter." });

  const fromEmail = process.env.AWS_SES_FROM_EMAIL ?? process.env.RESEND_FROM_EMAIL ?? "Connected Steps <info@connectedsteps.in>";
  const html      = body.replace(/\n/g, "<br>");

  const jobs = registrants.map(r => ({
    from:    fromEmail,
    to:      [r.user_email],
    subject,
    html:    `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0a0a0a;color:#f0f0f0;border-radius:8px;">
      <div style="margin-bottom:20px;"><img src="https://www.connectedsteps.in/logo.png" width="40" style="border-radius:50%;"/> <span style="font-size:16px;font-weight:700;color:#fff;margin-left:10px;">Connected Steps</span></div>
      <p style="margin:0 0 12px;color:#ccc;">Hi <strong style="color:#fff;">${r.user_name || "there"}</strong>,</p>
      <div style="line-height:1.8;color:#ccc;">${html}</div>
      <div style="margin-top:28px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.1);font-size:11px;color:#555;">
        Connected Steps · Hyderabad · <a href="https://www.connectedsteps.in" style="color:#e8620a;text-decoration:none;">connectedsteps.in</a>
      </div>
    </div>`,
  }));

  const { sent, failed } = await sendBatchEmails(jobs, 5);

  // Log to history (fire-and-forget — never block the response)
  void db.from("event_comm_history").insert({
    event_id:   id,
    subject,
    recipients: registrants.length,
    sent,
    failed,
    status:     failed === registrants.length ? "failed" : "sent",
    filter:     recipient_filter,
  });

  return NextResponse.json({ sent, failed, total: registrants.length });
}
