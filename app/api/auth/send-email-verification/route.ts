import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/notify";

function verificationEmailHTML(name: string, verifyUrl: string): string {
  return `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#0a0a0a;color:#f0f0f0;border-radius:8px;">
  <div style="margin-bottom:24px;">
    <img src="https://www.connectedsteps.in/logo.png" width="40" style="border-radius:50%;vertical-align:middle;"/>
    <span style="font-size:16px;font-weight:700;color:#fff;margin-left:10px;">Connected Steps</span>
  </div>
  <p style="margin:0 0 12px;color:#ccc;">Hi <strong style="color:#fff;">${name}</strong>,</p>
  <p style="margin:0 0 20px;color:#ccc;line-height:1.7;">
    Welcome to Connected Steps! Please verify your email address to complete your registration and start your running journey with us.
  </p>
  <div style="text-align:center;margin:28px 0;">
    <a href="${verifyUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#e8620a,#ff8c42);color:#fff;border-radius:999px;text-decoration:none;font-weight:700;font-size:15px;">
      Verify Email Address →
    </a>
  </div>
  <p style="margin:0 0 8px;font-size:12px;color:#666;text-align:center;">
    If the button doesn't work, copy and paste this link into your browser:
  </p>
  <p style="margin:0 0 24px;font-size:11px;color:#555;text-align:center;word-break:break-all;">${verifyUrl}</p>
  <p style="margin:0 0 24px;font-size:12px;color:#666;text-align:center;">This link expires in 24 hours.</p>
  <div style="margin-top:28px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.1);font-size:11px;color:#555;text-align:center;">
    Connected Steps · Hyderabad · <a href="https://www.connectedsteps.in" style="color:#e8620a;text-decoration:none;">connectedsteps.in</a><br>
    If you didn't create this account, you can safely ignore this email.
  </div>
</div>`;
}

export async function POST(req: NextRequest) {
  const ip  = getClientIp(req);
  const key = `send-email-verif:${ip}`;
  if (await isRateLimited(key, 10)) {
    return NextResponse.json({ error: "Too many attempts. Please try again in 15 minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, string>;
  const email = (body.email ?? "").trim().toLowerCase();
  const name  = (body.name  ?? "").trim() || "Runner";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }

  const db = getSupabaseServer();

  // Check if email already has a verified account
  const { data: existing } = await db
    .from("users")
    .select("id, email_verified")
    .eq("email", email)
    .maybeSingle();

  if (existing?.email_verified) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  // If a verified, unexpired token already exists, don't destroy it — the user just needs to
  // complete the registration form. Returning already_verified lets the form skip re-verification.
  const { data: existingVerified } = await db
    .from("email_verification_tokens")
    .select("id")
    .eq("email", email)
    .eq("verified", true)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (existingVerified) {
    return NextResponse.json({ sent: true, already_verified: true });
  }

  // Generate a token: store SHA-256 hash in DB, send plain UUID in the link
  const plainToken = randomUUID();
  const tokenHash  = createHash("sha256").update(plainToken).digest("hex");
  const expiresAt  = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h

  // Delete any existing tokens for this email before inserting a new one
  const { error: deleteErr } = await db.from("email_verification_tokens").delete().eq("email", email);
  if (deleteErr) {
    console.error("[send-email-verification] delete error:", deleteErr.message, deleteErr.code);
  }

  const { error: insertErr } = await db.from("email_verification_tokens").insert({
    email,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  if (insertErr) {
    console.error("[send-email-verification] insert error:", insertErr.message, insertErr.code);
    return NextResponse.json({ error: "Failed to send verification email. Please try again." }, { status: 500 });
  }

  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";
  const verifyUrl = `${appUrl}/verify-email?token=${plainToken}`;

  const result = await sendEmail(
    email, name,
    "Verify your Connected Steps account",
    verificationEmailHTML(name, verifyUrl),
    true, // treat as OTP/transactional — never suppressed
  );

  if (!result.ok) {
    console.error("[send-email-verification] email error:", result.error);
    return NextResponse.json({ error: "Failed to send verification email. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ sent: true });
}
