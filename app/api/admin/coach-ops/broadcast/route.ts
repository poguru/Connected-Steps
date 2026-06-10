import { NextRequest, NextResponse } from "next/server";
import { isAdminOrCoach } from "@/lib/admin-auth";

interface Recipient { email: string; name: string; phone?: string }

function personalise(msg: string, name: string) {
  return msg.replace(/\{\{name\}\}/gi, name.split(" ")[0] || "there");
}

function normalisePhone(p: string) {
  const d = p.replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 12 && d.startsWith("91")) return d;
  return d;
}

function emailHtml(body: string) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <tr><td style="background:#0a0a0a;padding:20px 32px;">
        <div style="font-size:18px;font-weight:700;color:#fff;">Connected Steps</div>
        <div style="font-size:10px;color:#e8620a;letter-spacing:0.12em;text-transform:uppercase;margin-top:3px;">Your Goal, Our Plan</div>
      </td></tr>
      <tr><td style="height:3px;background:#e8620a;"></td></tr>
      <tr><td style="padding:28px 32px;">
        <p style="margin:0 0 20px;font-size:14px;color:#444;line-height:1.7;white-space:pre-line;">${body}</p>
        <a href="https://www.connectedsteps.in/dashboard" style="display:inline-block;padding:11px 28px;background:#e8620a;color:#fff;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;">Open Dashboard →</a>
      </td></tr>
      <tr><td style="background:#f9f9f9;border-top:1px solid #e5e5e5;padding:14px 32px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#aaa;">Connected Steps · Hyderabad, India</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { channel, subject, message, recipients } = await req.json().catch(() => ({} as {
    channel: "email" | "whatsapp"; subject?: string; message: string; recipients: Recipient[];
  }));

  if (!message?.trim() || !Array.isArray(recipients) || recipients.length === 0)
    return NextResponse.json({ error: "message and recipients required" }, { status: 400 });

  const results = { sent: 0, failed: 0, skipped: 0 };

  if (channel === "email") {
    const key  = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL ?? "Connected Steps <noreply@connectedsteps.in>";
    if (!key) return NextResponse.json({ error: "Resend not configured" }, { status: 500 });

    const BATCH = 100;
    for (let i = 0; i < recipients.length; i += BATCH) {
      const chunk = recipients.slice(i, i + BATCH);
      const batch = chunk.map(r => ({
        from,
        to:      [r.email],
        subject: subject?.trim() || "Message from Connected Steps",
        html:    emailHtml(personalise(message, r.name)),
      }));
      try {
        const res = await fetch("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify(batch),
        });
        if (res.ok) results.sent += batch.length;
        else        results.failed += batch.length;
      } catch { results.failed += batch.length; }
    }

  } else if (channel === "whatsapp") {
    const authKey    = process.env.MSG91_AUTH_KEY;
    const fromNumber = process.env.MSG91_WHATSAPP_NUMBER;
    if (!authKey || !fromNumber) return NextResponse.json({ error: "WhatsApp not configured" }, { status: 500 });

    for (const r of recipients) {
      if (!r.phone?.trim()) { results.skipped++; continue; }
      const to  = normalisePhone(r.phone);
      const txt = personalise(message, r.name);
      try {
        const res = await fetch("https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/", {
          method: "POST",
          headers: { authkey: authKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            integrated_number: fromNumber,
            content_type: "text",
            payload: { messaging_product: "whatsapp", to, type: "text", text: { body: txt } },
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && !data.hasError) results.sent++;
        else results.failed++;
      } catch { results.failed++; }
    }
  } else {
    return NextResponse.json({ error: "channel must be email or whatsapp" }, { status: 400 });
  }

  return NextResponse.json(results);
}
