import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });

    const db = getSupabaseServer();

    // Check user exists
    const { data: users } = await db.from("users").select("email").eq("email", email.toLowerCase().trim()).limit(1);
    if (!users || users.length === 0) {
      // Return success anyway to avoid email enumeration
      return NextResponse.json({ success: true });
    }

    // Generate token
    const token = crypto.randomBytes(32).toString("hex");
    const expires_at = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1 hour

    // Delete any existing tokens for this email
    await db.from("password_resets").delete().eq("email", email.toLowerCase().trim());

    // Store token
    await db.from("password_resets").insert({ email: email.toLowerCase().trim(), token, expires_at });

    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/reset-password?token=${token}`;

    // Send email via Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? "Connected Steps <noreply@connectedsteps.com>",
        to: [email.toLowerCase().trim()],
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
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text();
      console.error("Resend error:", err);
      return NextResponse.json({ error: "Failed to send email. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    console.error("Forgot password error:", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
