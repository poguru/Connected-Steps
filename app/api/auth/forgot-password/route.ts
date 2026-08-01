import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import crypto from "crypto";
import { isRateLimited, recordFailure, getClientIp } from "@/lib/rate-limit";

import { APP_URL } from "@/lib/config";
export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 attempts per IP per 15 minutes — prevents reset email spam
    const ip  = getClientIp(req);
    const key = `forgot-password:${ip}`;
    if (await isRateLimited(key)) {
      return NextResponse.json({ error: "Too many requests. Please wait 15 minutes before trying again." }, { status: 429, headers: { "Retry-After": "900" } });
    }
    await recordFailure(key); // intentional: count every request, not just failures

    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });

    const db = getSupabaseServer();

    // Check user exists
    const { data: users } = await db.from("users").select("email").eq("email", email.toLowerCase().trim()).limit(1);
    if (!users || users.length === 0) {
      return NextResponse.json({ error: "No account found with this email address." }, { status: 404 });
    }

    // Generate token
    const token = crypto.randomBytes(32).toString("hex");
    const expires_at = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1 hour

    // Delete any existing tokens for this email
    await db.from("password_resets").delete().eq("email", email.toLowerCase().trim());

    // Store token
    await db.from("password_resets").insert({ email: email.toLowerCase().trim(), token, expires_at });

    const appUrl = APP_URL;
    if (!appUrl) {
      console.error("[forgot-password] NEXT_PUBLIC_APP_URL not set — reset link will be broken");
    }
    const resetUrl = `${appUrl ?? "https://www.connectedsteps.in"}/auth/reset-password?token=${token}`;

    const { sendSingleEmail } = await import("@/lib/email-service");
    const emailResult = await sendSingleEmail({
      to:      email.toLowerCase().trim(),
      subject: "Reset your Connected Steps password",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#111;color:#fff;border-radius:8px;">
          <h2 style="color:#e8620a;margin-bottom:8px;">Reset your password</h2>
          <p style="color:#aaa;margin-bottom:24px;">Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
          <a href="${resetUrl}" style="display:inline-block;padding:12px 28px;background:#e8620a;color:#fff;border-radius:4px;text-decoration:none;font-weight:600;">
            Reset Password
          </a>
          <p style="color:#666;font-size:12px;margin-top:24px;">If you didn't request this, you can safely ignore this email.</p>
          <p style="color:#444;font-size:11px;margin-top:8px;">Or copy this link: ${resetUrl}</p>
        </div>
      `,
    });

    if (!emailResult.ok) {
      console.error("[forgot-password] email failed:", emailResult.error);
      return NextResponse.json({ error: "Failed to send email. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    console.error("Forgot password error:", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
