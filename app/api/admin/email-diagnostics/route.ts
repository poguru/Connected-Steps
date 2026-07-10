import { NextRequest, NextResponse } from "next/server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { sendSingleEmail } from "@/lib/email-service";

// POST /api/admin/email-diagnostics
// Sends a test email and returns the full SES/Resend diagnostic response.
// Use this to verify the email pipeline is working before bulk sends.
export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { to } = await req.json();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: "Valid recipient email required in body: { to: 'email@example.com' }" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";
  const from   = `${process.env.ZEPTOMAIL_FROM_NAME ?? "Connected Steps"} <${process.env.ZEPTOMAIL_FROM_EMAIL ?? "info@connectedsteps.in"}>`;

  // Send a minimal test email and capture the full diagnostic response
  const result = await sendSingleEmail({
    to,
    subject: "Connected Steps — Email Delivery Test",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0a0a0a;color:#f0f0f0;border-radius:8px;">
        <div style="font-size:18px;font-weight:700;color:#e8620a;margin-bottom:12px;">✅ Email Pipeline Test</div>
        <p>This is a test email from Connected Steps to verify the email delivery pipeline.</p>
        <p><strong>Sent at:</strong> ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>
        <p><strong>From:</strong> ${from}</p>
        <p><strong>To:</strong> ${to}</p>
        <hr style="border-color:rgba(255,255,255,0.1);margin:16px 0;"/>
        <p style="font-size:12px;color:#666;">If you received this email, the Connected Steps email pipeline is working correctly.</p>
        <a href="${appUrl}" style="color:#e8620a;text-decoration:none;font-size:12px;">${appUrl}</a>
      </div>
    `,
  });

  console.log(`[email-diagnostics] test to=${to} ok=${result.ok} provider=${result.provider} messageId=${result.messageId} error=${result.error}`);

  return NextResponse.json({
    ok:          result.ok,
    to,
    provider:    result.provider    ?? null,
    message_id:  result.messageId  ?? null,
    http_status: result.httpStatus ?? null,
    error:       result.error      ?? null,
    diagnosis: result.ok
      ? `✅ Email accepted by ${result.provider} (messageId: ${result.messageId}). Check ${to} inbox.`
      : `❌ Email failed. Provider: ${result.provider ?? "none"}. Error: ${result.error}. ${
          result.error?.includes("not configured")
            ? "ZEPTOMAIL_API_KEY is not set — add it to Vercel environment variables."
            : result.error?.includes("401") || result.error?.includes("403")
            ? "Invalid API key — check ZEPTOMAIL_API_KEY in Vercel env vars."
            : "Check Vercel function logs for details."
        }`,
    env_check: {
      zeptomail_configured: !!process.env.ZEPTOMAIL_API_KEY,
      zeptomail_from_email: process.env.ZEPTOMAIL_FROM_EMAIL ?? "not set",
      zeptomail_from_name:  process.env.ZEPTOMAIL_FROM_NAME  ?? "not set",
      non_otp_disabled:     process.env.NON_OTP_EMAILS_DISABLED === "true",
    },
  });
}
