import { NextRequest, NextResponse, after } from "next/server";
import sanitizeHtml from "sanitize-html";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { processEmailBatch } from "@/lib/process-email-batch";
import type { AttachmentMeta } from "@/lib/email-attachments";
import { SUPPORT_EMAIL } from "@/lib/config";

type RecipientFilter = "all" | "paid" | "free" | "pending" | "checked_in" | "not_checked_in";

// Allowed HTML for email body — permits all standard formatting, no scripts or event handlers
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p","br","div","span","h1","h2","h3","h4","h5","h6",
    "strong","b","em","i","u","s","strike","del","sup","sub",
    "ul","ol","li","blockquote","pre","code","hr",
    "a","img","table","thead","tbody","tr","th","td","mark",
  ],
  allowedAttributes: {
    "*":   ["style","class"],
    "a":   ["href","target","rel"],
    "img": ["src","alt","width","height","style"],
  },
  allowedSchemes: ["https", "http", "mailto"],
};

function sanitize(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

function applyVars(
  html: string,
  r: { user_name?: string | null; user_email?: string | null },
  eventTitle: string,
  eventDate: string,
  eventTime: string,
  eventVenue: string,
): string {
  const firstName = r.user_name?.split(" ")[0] ?? "Participant";
  const lastName  = r.user_name?.split(" ").slice(1).join(" ") ?? "";
  return html
    .replace(/\{\{firstName\}\}/gi,      firstName)
    .replace(/\{\{lastName\}\}/gi,       lastName)
    .replace(/\{\{eventName\}\}/gi,      eventTitle)
    .replace(/\{\{eventDate\}\}/gi,      eventDate)
    .replace(/\{\{eventVenue\}\}/gi,     eventVenue)
    .replace(/\{\{reportingTime\}\}/gi,  eventTime)
    .replace(/\{\{supportPhone\}\}/gi,   "+91-XXXXXXXXXX")
    .replace(/\{\{supportEmail\}\}/gi,   SUPPORT_EMAIL)
    // Legacy single-brace variables (backward compatibility)
    .replace(/\{name\}/gi,  r.user_name  ?? "Participant")
    .replace(/\{email\}/gi, r.user_email ?? "")
    .replace(/\{event\}/gi, eventTitle);
}

function buildHtmlEmail(name: string, bodyContent: string, isHtml: boolean): string {
  const content = isHtml
    ? bodyContent
    : bodyContent.replace(/\n/g, "<br>");

  const greeting = isHtml
    ? ""
    : `<p style="margin:0 0 12px;color:#ccc;">Hi <strong style="color:#fff;">${name}</strong>,</p>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
  body{margin:0;padding:0;background:#0a0a0a;font-family:sans-serif;}
  h1{font-size:22px;font-weight:800;color:#fff;margin:16px 0 8px;}
  h2{font-size:18px;font-weight:700;color:#fff;margin:14px 0 6px;}
  h3{font-size:15px;font-weight:700;color:#fff;margin:12px 0 4px;}
  p{margin:0 0 10px;color:#ccc;line-height:1.8;}
  strong,b{color:#fff;}
  a{color:#e8620a;text-decoration:underline;}
  ul,ol{color:#ccc;padding-left:20px;margin:6px 0 10px;}
  li{margin-bottom:3px;}
  blockquote{border-left:3px solid #e8620a;padding-left:12px;color:#999;margin:10px 0;}
  hr{border:none;border-top:1px solid rgba(255,255,255,0.12);margin:16px 0;}
  img{max-width:100%;height:auto;}
  table{border-collapse:collapse;width:100%;margin:12px 0;}
  td,th{border:1px solid rgba(255,255,255,0.15);padding:8px 12px;text-align:left;color:#ccc;}
  th{background:rgba(255,255,255,0.06);font-weight:700;color:#fff;}
  mark{border-radius:3px;padding:1px 2px;}
</style>
</head>
<body>
<div style="max-width:600px;margin:0 auto;padding:24px;background:#0a0a0a;color:#f0f0f0;">
  <div style="margin-bottom:20px;">
    <img src="https://www.connectedsteps.in/logo.png" width="40" style="border-radius:50%;vertical-align:middle;" alt="Connected Steps"/>
    <span style="font-size:16px;font-weight:700;color:#fff;margin-left:10px;">Connected Steps</span>
  </div>
  ${greeting}
  <div style="line-height:1.8;color:#ccc;">${content}</div>
  <div style="margin-top:28px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.1);font-size:11px;color:#555;">
    Connected Steps &middot; Hyderabad &middot; <a href="https://www.connectedsteps.in" style="color:#e8620a;text-decoration:none;">connectedsteps.in</a>
  </div>
</div>
</body>
</html>`;
}

// GET — communication history for this event
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();
  const { data } = await db
    .from("event_comm_history")
    .select("id, sent_at, subject, recipients, sent, failed, status, channel, recipient_filter, batch_id, attachments, scheduled_for")
    .eq("event_id", id)
    .order("sent_at", { ascending: false })
    .limit(20);
  return NextResponse.json({ history: data ?? [] });
}

// POST — enqueue all recipient emails for async delivery.
// Returns { batch_id, queued } immediately.
// The admin UI then calls /send-next once per second to process the queue.
// Accepts body_html (rich HTML from editor) or body (legacy plain text).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const raw = await req.json() as {
    recipient_filter: RecipientFilter;
    subject:          string;
    body?:            string;
    body_html?:       string;
    attachments?:     AttachmentMeta[];
    scheduled_for?:   string | null;   // ISO 8601 string in IST; null = send now
  };
  const { recipient_filter, subject } = raw;
  const bodyHtml    = raw.body_html?.trim() ?? "";
  const bodyPlain   = raw.body?.trim()      ?? "";
  const isHtml      = bodyHtml.length > 0;
  const attachments = raw.attachments ?? [];

  // Parse scheduled_for: convert IST datetime-local input ("YYYY-MM-DDTHH:MM") to UTC
  let scheduledFor: string | null = null;
  if (raw.scheduled_for?.trim()) {
    const raw_sf = raw.scheduled_for.trim();
    // Input arrives as IST datetime-local; append "+05:30" to interpret correctly
    const iso = raw_sf.includes("+") || raw_sf.includes("Z") ? raw_sf : `${raw_sf}:00+05:30`;
    const ts  = new Date(iso);
    if (isNaN(ts.getTime())) return NextResponse.json({ error: "Invalid scheduled_for date" }, { status: 400 });
    if (ts <= new Date()) scheduledFor = null; // past → send immediately
    else scheduledFor = ts.toISOString();
  }

  if (!subject?.trim() || (!bodyHtml && !bodyPlain))
    return NextResponse.json({ error: "subject and body are required" }, { status: 400 });

  const totalAttachmentBytes = attachments.reduce((s, a) => s + (a.size ?? 0), 0);
  if (totalAttachmentBytes > 10 * 1024 * 1024)
    return NextResponse.json({ error: "Total attachment size exceeds the 10 MB limit" }, { status: 400 });

  const db = getSupabaseServer();

  // Fetch matching registrants + event info
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
    db.from("events").select("title, start_date, start_time, location").eq("id", id).single(),
  ]);
  if (fetchErr) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!registrants?.length)
    return NextResponse.json({ queued: 0, batch_id: null, message: "No recipients matched the filter." });

  const eventTitle = ev?.title ?? "";
  const eventVenue = ev?.location ?? "";
  const eventDate  = ev?.start_date
    ? new Date(ev.start_date + "T12:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "";
  const eventTime  = ev?.start_time
    ? (() => { const [h, m] = (ev.start_time as string).split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2,"0")} ${h >= 12 ? "PM" : "AM"}`; })()
    : "";

  // Sanitize the HTML body once (applied before per-recipient variable replacement)
  const sanitizedHtml = isHtml ? sanitize(bodyHtml) : "";

  // Deduplicate by email
  const seen = new Set<string>();
  const recipients = registrants.filter(r => {
    if (!r.user_email || seen.has(r.user_email)) return false;
    seen.add(r.user_email);
    return true;
  });

  const batchId = crypto.randomUUID();

  const rows = recipients.map(r => {
    const name           = r.user_name ?? "Participant";
    const rawContent     = isHtml ? sanitizedHtml : bodyPlain;
    const personalized   = applyVars(rawContent, r, eventTitle, eventDate, eventTime, eventVenue);
    const html_body      = buildHtmlEmail(name, personalized, isHtml);

    return {
      batch_id:        batchId,
      event_id:        id,
      recipient_email: r.user_email,
      recipient_name:  r.user_name ?? null,
      subject,
      html_body,
      attachments,
      ...(scheduledFor ? { scheduled_for: scheduledFor } : {}),
    };
  });

  const { error: insertErr } = await db.from("email_queue").insert(rows);
  if (insertErr) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const histStatus = scheduledFor ? "scheduled" : "queued";
  const { error: histErr } = await db.from("event_comm_history").insert({
    event_id:         id,
    subject,
    recipients:       recipients.length,
    sent:             0,
    failed:           0,
    status:           histStatus,
    filter:           recipient_filter,
    recipient_filter,
    channel:          "email",
    batch_id:         batchId,
    attachments,
    ...(scheduledFor ? { scheduled_for: scheduledFor } : {}),
  });
  if (histErr) console.error("[communicate] history insert failed:", histErr.message, "batch:", batchId, "code:", histErr.code);

  // Only start processing immediately for non-scheduled sends
  if (!scheduledFor) {
    after(() => processEmailBatch(batchId));
  }

  return NextResponse.json({ batch_id: batchId, queued: recipients.length, scheduled_for: scheduledFor ?? null });
}
