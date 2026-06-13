import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";
import { isRateLimited, recordFailure, getClientIp } from "@/lib/rate-limit";

/**
 * POST /api/auth/verify-phone
 *
 * Called after the user has already sent a phone OTP. This route:
 *   1. Validates the OTP against otp_verifications.
 *   2. Sets users.phone_verified = true (and updates phone if changed).
 *   3. Returns updated user data so the client can refresh localStorage.
 *
 * Body:
 *   { email, phone, code, purpose }
 *   purpose = "verify_phone"  → user is verifying their existing phone
 *   purpose = "change_phone"  → user is switching to a new phone number
 *
 * Auth: x-user-token header required (user must be logged in).
 *
 * Security:
 *   - Tokens are validated (user can only update their own record)
 *   - OTP is single-use and expires in 5 minutes
 *   - Max 5 incorrect attempts per 15-min window (via the shared rate limiter)
 */
export async function POST(req: NextRequest) {
  try {
    const { email, phone, code, purpose = "verify_phone" } = await req.json();

    if (!email || !phone || !code) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    // ── Auth: must be the account owner ──────────────────────────────────────
    const tokenEmail = verifyUserToken(req.headers.get("x-user-token") ?? "");
    if (!tokenEmail || tokenEmail.toLowerCase() !== (email as string).toLowerCase()) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const normalizedPhone = (phone as string).trim();

    // ── OTP verification rate limit ───────────────────────────────────────────
    const ip  = getClientIp(req);
    const key = `otp-verify:${ip}:${normalizedPhone}`;
    if (isRateLimited(key)) {
      return NextResponse.json(
        { error: "Too many verification attempts. Please request a new code and try again." },
        { status: 429, headers: { "Retry-After": "900" } }
      );
    }

    const db = getSupabaseServer();

    // ── Look up the OTP record ────────────────────────────────────────────────
    const { data: otpRecord, error: otpErr } = await db
      .from("otp_verifications")
      .select("id, code, expires_at, verified")
      .eq("identifier", normalizedPhone)
      .eq("type",       "phone")
      .single();

    if (otpErr || !otpRecord) {
      recordFailure(key);
      return NextResponse.json({ error: "OTP not found. Please request a new code." }, { status: 400 });
    }
    if (otpRecord.verified) {
      return NextResponse.json({ error: "This OTP has already been used." }, { status: 400 });
    }
    if (new Date(otpRecord.expires_at) < new Date()) {
      return NextResponse.json({ error: "OTP expired. Please request a new one." }, { status: 400 });
    }
    if (otpRecord.code !== String(code).trim()) {
      recordFailure(key);
      return NextResponse.json({ error: "Incorrect OTP. Please try again." }, { status: 400 });
    }

    // ── Mark OTP used ─────────────────────────────────────────────────────────
    await db.from("otp_verifications").update({ verified: true }).eq("id", otpRecord.id);

    // ── Update user: set phone + phone_verified ───────────────────────────────
    // For change_phone: also update the phone number itself.
    const updatePayload: Record<string, unknown> = { phone_verified: true };
    if (purpose === "change_phone") {
      updatePayload.phone = normalizedPhone;
    }

    const { error: updateErr } = await db
      .from("users")
      .update(updatePayload)
      .eq("email", (email as string).toLowerCase().trim());

    if (updateErr) {
      return NextResponse.json({ error: "Failed to update account: " + updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success:       true,
      phone:         normalizedPhone,
      phone_verified: true,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
