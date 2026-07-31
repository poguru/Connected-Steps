import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { sendSingleEmail } from "@/lib/email-service";

// POST /api/admin/events/[id]/announce/test
// Sends one test email to a specified address to verify the pipeline.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { to: string; subject: string; email_body: string };
  const { to, subject, email_body } = body;

  if (!to?.trim())          return NextResponse.json({ error: "Recipient email required" }, { status: 400 });
  if (!subject?.trim())     return NextResponse.json({ error: "Subject required" },         { status: 400 });
  if (!email_body?.trim())  return NextResponse.json({ error: "Email body required" },      { status: 400 });

  const db = getSupabaseServer();
  const { data: ev } = await db
    .from("events")
    .select("title, start_date, start_time, location, share_slug")
    .eq("id", id)
    .single();

  if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";
  const regLink   = ev.share_slug ? `${appUrl}/events/${ev.share_slug}` : appUrl;
  const dateStr   = ev.start_date
    ? new Date(ev.start_date + "T12:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "";
  const timeStr   = ev.start_time
    ? (() => { const [h, m] = ev.start_time!.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; })()
    : "";

  const rendered = (email_body || "")
    .replace(/\{name\}/gi,          "Test User")
    .replace(/\{event\}/gi,         ev.title)
    .replace(/\{date\}/gi,          dateStr)
    .replace(/\{time\}/gi,          timeStr)
    .replace(/\{location\}/gi,      ev.location)
    .replace(/\{register_link\}/gi, regLink)
    .replace(/\n/g, "<br>");

  const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0a0a0a;color:#f0f0f0;border-radius:8px;">
    <div style="margin-bottom:12px;padding:6px 10px;background:rgba(234,179,8,0.12);border:1px solid rgba(234,179,8,0.3);border-radius:6px;font-size:11px;color:#eab308;font-weight:700;">
      🧪 TEST EMAIL — sent only to ${to}
    </div>
    <div style="margin-bottom:20px;">
      <img src="https://www.connectedsteps.in/logo.png" width="40" style="border-radius:50%;vertical-align:middle;"/>
      <span style="font-size:16px;font-weight:700;color:#fff;margin-left:10px;">Connected Steps</span>
    </div>
    <p style="margin:0 0 12px;color:#ccc;">Hi <strong style="color:#fff;">Test User</strong>,</p>
    <div style="line-height:1.8;color:#ccc;">${rendered}</div>
    <div style="margin-top:20px;">
      <a href="${regLink}" style="display:inline-block;padding:12px 24px;background:#e8620a;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Register Now →</a>
    </div>
    <div style="margin-top:28px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.1);font-size:11px;color:#555;">
      Connected Steps · Hyderabad · <a href="https://www.connectedsteps.in" style="color:#e8620a;text-decoration:none;">connectedsteps.in</a>
    </div>
  </div>`;

  const result = await sendSingleEmail({ to: to.trim(), subject: `[TEST] ${subject}`, html });

  if (!result.ok) {
    console.error("[announce/test] send failed:", result.error, "category:", result.errorCategory);
    return NextResponse.json(
      { error: result.error ?? "Send failed", category: result.errorCategory },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok:      true,
    message: `Test email delivered to ${to} (message ID: ${result.messageId ?? "—"})`,
  });
}
