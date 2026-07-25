import { NextRequest, NextResponse } from "next/server";
import sanitizeHtml from "sanitize-html";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { sendSingleEmail } from "@/lib/email-service";

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

// POST /api/admin/events/[id]/communicate/test
// Sends a single test email to a specified address with dummy variable values.
// Accepts body_html (rich HTML) or body (legacy plain text).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const raw = await req.json() as { to: string; subject: string; body?: string; body_html?: string };
  const { to, subject } = raw;
  const bodyHtml  = raw.body_html?.trim() ?? "";
  const bodyPlain = raw.body?.trim()      ?? "";
  const isHtml    = bodyHtml.length > 0;

  if (!to || !subject || (!bodyHtml && !bodyPlain))
    return NextResponse.json({ error: "to, subject, and body are required" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });

  const db = getSupabaseServer();
  const { data: ev } = await db.from("events").select("title, start_date, start_time, location").eq("id", id).single();

  const eventTitle = ev?.title ?? "Event";
  const eventVenue = ev?.location ?? "";
  const eventDate  = ev?.start_date
    ? new Date((ev.start_date as string) + "T12:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "";
  const eventTime  = ev?.start_time
    ? (() => { const [h, m] = (ev.start_time as string).split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2,"0")} ${h >= 12 ? "PM" : "AM"}`; })()
    : "";

  // Apply dummy variable substitution so the test shows exactly what recipients see
  const rawContent = isHtml ? sanitizeHtml(bodyHtml, SANITIZE_OPTIONS) : bodyPlain.replace(/\n/g, "<br>");
  const personalized = rawContent
    .replace(/\{\{firstName\}\}/gi,     "Test")
    .replace(/\{\{lastName\}\}/gi,      "Participant")
    .replace(/\{\{eventName\}\}/gi,     eventTitle)
    .replace(/\{\{eventDate\}\}/gi,     eventDate)
    .replace(/\{\{eventVenue\}\}/gi,    eventVenue)
    .replace(/\{\{reportingTime\}\}/gi, eventTime)
    .replace(/\{\{registrationId\}\}/gi,"CS-TEST-001")
    .replace(/\{\{category\}\}/gi,      "10K")
    .replace(/\{\{bibNumber\}\}/gi,     "1234")
    .replace(/\{\{supportPhone\}\}/gi,  "+91-XXXXXXXXXX")
    .replace(/\{\{supportEmail\}\}/gi,  "info@connectedsteps.in")
    .replace(/\{name\}/gi,  "Test Participant")
    .replace(/\{email\}/gi, to)
    .replace(/\{event\}/gi, eventTitle);

  const greeting = isHtml ? "" : `<p style="margin:0 0 12px;color:#ccc;">Hi <strong style="color:#fff;">Test Participant</strong>,</p>`;

  const html = `<!DOCTYPE html>
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
  <div style="margin-bottom:12px;padding:6px 12px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);border-radius:6px;font-size:11px;color:#fbbf24;font-weight:700;">
    TEST EMAIL &mdash; variables substituted with sample values
  </div>
  <div style="margin-bottom:20px;">
    <img src="https://www.connectedsteps.in/logo.png" width="40" style="border-radius:50%;vertical-align:middle;" alt="Connected Steps"/>
    <span style="font-size:16px;font-weight:700;color:#fff;margin-left:10px;">Connected Steps</span>
  </div>
  ${greeting}
  <div style="line-height:1.8;color:#ccc;">${personalized}</div>
  <div style="margin-top:28px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.1);font-size:11px;color:#555;">
    Connected Steps &middot; Hyderabad &middot; <a href="https://www.connectedsteps.in" style="color:#e8620a;text-decoration:none;">connectedsteps.in</a>
  </div>
</div>
</body>
</html>`;

  const result = await sendSingleEmail({ to, subject: `[TEST] ${subject}`, html });

  return NextResponse.json({ ok: result.ok, error: result.error ?? null, aws_message_id: result.messageId ?? null });
}
