import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { sendEmail, sendWhatsAppOTP } from "@/lib/notify";

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function otpEmailHTML(name: string, code: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Your OTP – Connected Steps</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <tr><td style="background:#0a0a0a;padding:24px 40px;text-align:center;">
        <div style="font-size:20px;font-weight:700;color:#fff;">Connected Steps</div>
        <div style="font-size:10px;color:#e8620a;letter-spacing:0.12em;text-transform:uppercase;margin-top:4px;">Your Goal, Our Plan</div>
      </td></tr>
      <tr><td style="height:3px;background:#e8620a;"></td></tr>
      <tr><td style="padding:40px;">
        <p style="margin:0 0 8px;font-size:15px;color:#444;">Hi <strong>${name}</strong>,</p>
        <p style="margin:0 0 28px;font-size:14px;color:#666;line-height:1.6;">Use the code below to verify your email address. It expires in 10 minutes.</p>
        <div style="text-align:center;margin:0 0 32px;">
          <div style="display:inline-block;background:#0a0a0a;border-radius:10px;padding:20px 40px;">
            <div style="font-size:36px;font-weight:800;color:#e8620a;letter-spacing:0.25em;">${code}</div>
          </div>
        </div>
        <p style="margin:0;font-size:12px;color:#aaa;text-align:center;">Do not share this OTP with anyone. Connected Steps will never ask for it.</p>
      </td></tr>
      <tr><td style="background:#f9f9f9;border-top:1px solid #e5e5e5;padding:16px 40px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#aaa;">Connected Steps · Hyderabad, India</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// POST /api/auth/send-otp
// Body: { type: "email" | "phone", value: string, name?: string, purpose: "register" | "login" | "change_email" }
// purpose "register"     → rejects if already registered
// purpose "login"        → rejects if no account found
// purpose "change_email" → rejects if already taken by another account (same as register)
export async function POST(req: NextRequest) {
  try {
    const { type, value, name, purpose = "register" } = await req.json();

    if (!type || !value) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    if (type !== "email" && type !== "phone") return NextResponse.json({ error: "Invalid type" }, { status: 400 });

    const db = getSupabaseServer();
    const identifier = type === "email" ? (value as string).toLowerCase().trim() : (value as string).trim();

    // ── Existence check ───────────────────────────────────────────────────────
    if (type === "email") {
      const { data: existing } = await db.from("users").select("id").eq("email", identifier).single();
      if ((purpose === "register" || purpose === "change_email") && existing) {
        return NextResponse.json({ error: "This email is already in use by another account." }, { status: 409 });
      }
      if (purpose === "login" && !existing) {
        return NextResponse.json({ error: "No account found with this email." }, { status: 404 });
      }
    } else {
      const { data: existing } = await db.from("users").select("id").eq("phone", identifier).single();
      if (purpose === "register" && existing) {
        return NextResponse.json({ error: "An account with this phone number already exists." }, { status: 409 });
      }
      if (purpose === "login" && !existing) {
        return NextResponse.json({ error: "No account found with this phone number." }, { status: 404 });
      }
    }

    // ── Generate & store OTP ──────────────────────────────────────────────────
    const code      = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

    await db.from("otp_verifications").delete().eq("identifier", identifier).eq("type", type);
    const { error: insertErr } = await db.from("otp_verifications").insert({
      identifier,
      type,
      code,
      expires_at: expiresAt,
      verified: false,
    });
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

    // ── Send ──────────────────────────────────────────────────────────────────
    const displayName = (name as string | undefined)?.trim() || "there";
    if (type === "email") {
      await sendEmail(
        identifier,
        displayName,
        "Your Connected Steps verification code",
        otpEmailHTML(displayName, code)
      );
    } else {
      await sendWhatsAppOTP(identifier, displayName, code);
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
