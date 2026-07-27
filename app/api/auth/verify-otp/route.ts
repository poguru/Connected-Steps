/**
 * OTP SYSTEM A — Verify endpoint for the unified email + phone OTP flow.
 *
 * Used by: app/profile/page.tsx (verify email change, verify phone change)
 *          Reads from the `otp_verifications` table (plaintext comparison).
 *
 * DO NOT merge with System B (verify-phone-otp).
 * System B handles authentication (login/register) and reads from
 * `users.otp_hash` using bcrypt for its login/verify_phone purposes.
 * Merging would collapse two distinct security models into one.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isRateLimited, recordFailure, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const { type, value, code, email, purpose } = await req.json();

    // Support both legacy {type,value,code} and newer {email,code,purpose} shapes
    const identifier = email
      ? (email as string).toLowerCase().trim()
      : type === "email"
        ? (value as string).toLowerCase().trim()
        : (value as string)?.trim();

    if (!identifier || !code) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Rate limit per identifier (not just IP) to prevent account-targeted brute force
    const ip  = getClientIp(req);
    const key = `otp-verify:${ip}:${identifier}`;

    if (await isRateLimited(key)) {
      return NextResponse.json(
        { error: "Too many verification attempts. Please request a new code and try again." },
        { status: 429, headers: { "Retry-After": "900" } }
      );
    }

    const db = getSupabaseServer();
    const resolvedType = (type as string | undefined) ?? "email";

    const { data, error } = await db
      .from("otp_verifications")
      .select("id, code, expires_at, verified")
      .eq("identifier", identifier)
      .eq("type", resolvedType)
      .single();

    if (error || !data) {
      await recordFailure(key);
      return NextResponse.json({ error: "OTP not found. Please request a new one." }, { status: 400 });
    }
    if (data.verified) {
      return NextResponse.json({ error: "OTP already used." }, { status: 400 });
    }
    if (new Date(data.expires_at) < new Date()) {
      return NextResponse.json({ error: "OTP expired. Please request a new one." }, { status: 400 });
    }
    if (data.code !== String(code).trim()) {
      await recordFailure(key);
      return NextResponse.json({ error: "Incorrect OTP. Please try again." }, { status: 400 });
    }

    await db.from("otp_verifications").update({ verified: true }).eq("id", data.id);
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    console.error("[verify-otp] unhandled error:", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
