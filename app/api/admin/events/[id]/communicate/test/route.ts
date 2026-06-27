import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { sendSingleEmail } from "@/lib/email-service";

// POST /api/admin/events/[id]/communicate/test
// Sends a single test email to a specified address so the admin can verify
// template rendering and variable substitution before doing a bulk send.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { to, subject, body } = await req.json() as { to: string; subject: string; body: string };

  if (!to || !subject || !body)
    return NextResponse.json({ error: "to, subject, and body are required" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });

  const db = getSupabaseServer();
  const { data: ev } = await db.from("events").select("title").eq("id", id).single();

  // Apply same variable substitution as bulk send — preview shows exactly what recipients see
  const personalizedBody = body
    .replace(/\{name\}/gi,  "Test Participant")
    .replace(/\{email\}/gi, to)
    .replace(/\{event\}/gi, ev?.title ?? "Event")
    .replace(/\n/g, "<br>");

  const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0a0a0a;color:#f0f0f0;border-radius:8px;">
    <div style="margin-bottom:16px;padding:6px 12px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);border-radius:6px;font-size:11px;color:#fbbf24;font-weight:700;">
      🧪 TEST EMAIL — variables substituted with dummy values
    </div>
    <div style="margin-bottom:20px;">
      <img src="https://www.connectedsteps.in/logo.png" width="40" style="border-radius:50%;vertical-align:middle;"/>
      <span style="font-size:16px;font-weight:700;color:#fff;margin-left:10px;">Connected Steps</span>
    </div>
    <p style="margin:0 0 12px;color:#ccc;">Hi <strong style="color:#fff;">Test Participant</strong>,</p>
    <div style="line-height:1.8;color:#ccc;">${personalizedBody}</div>
    <div style="margin-top:28px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.1);font-size:11px;color:#555;">
      Connected Steps · Hyderabad · <a href="https://www.connectedsteps.in" style="color:#e8620a;text-decoration:none;">connectedsteps.in</a>
    </div>
  </div>`;

  const result = await sendSingleEmail({ to, subject: `[TEST] ${subject}`, html });

  return NextResponse.json({ ok: result.ok, error: result.error ?? null, aws_message_id: result.messageId ?? null });
}
