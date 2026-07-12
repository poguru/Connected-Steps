import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseServer } from "@/lib/supabase-server";
import { signCoachToken, signUserToken, verifyUserToken, USER_SESSION_COOKIE, USER_TOKEN_TTL } from "@/lib/admin-auth";
import { isRateLimited, recordFailure, getClientIp } from "@/lib/rate-limit";

/**
 * POST /api/auth/verify-phone-otp
 *
 * Verifies a 6-digit phone OTP sent via /api/auth/send-phone-otp.
 *
 * Body: { phone, code, purpose }
 *
 * purpose values:
 *   "register"     — verify from otp_verifications; returns { success, verified }
 *                    (client then calls /api/auth/register with phoneVerified=true)
 *   "login"        — verify from users.otp_hash; returns user tokens
 *   "verify_phone" — requires x-user-token; marks phone_verified=true in users table
 *
 * Security:
 *   - Max 5 wrong attempts per 15-minute window before lockout
 *   - OTP deleted from storage immediately after successful verification
 *   - bcrypt compare for login/verify_phone purposes
 */

const MAX_ATTEMPTS = 5;

function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10)                              return digits;
  if (digits.length === 12 && digits.startsWith("91"))  return digits.slice(2);
  if (digits.length === 13 && digits.startsWith("091")) return digits.slice(3);
  return digits;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone: rawPhone, code, purpose = "register" } = body as {
      phone:    string;
      code:     string;
      purpose?: "register" | "login" | "verify_phone";
    };

    if (!rawPhone || !code) {
      return NextResponse.json({ error: "Missing phone or code." }, { status: 400 });
    }

    const phone      = normalisePhone(String(rawPhone));
    const codeStr    = String(code).trim();
    const ip         = getClientIp(req);
    const rateLimKey = `verify-phone-otp:${ip}:${phone}`;

    if (await isRateLimited(rateLimKey, MAX_ATTEMPTS)) {
      return NextResponse.json(
        { error: "Too many incorrect attempts. Please request a new code and try again." },
        { status: 429, headers: { "Retry-After": "900" } },
      );
    }

    const db = getSupabaseServer();

    // ════════════════════════════════════════════════════════════════════
    // REGISTER — OTP stored in otp_verifications (plaintext)
    // ════════════════════════════════════════════════════════════════════
    if (purpose === "register") {
      const { data: record, error: fetchErr } = await db
        .from("otp_verifications")
        .select("id, code, expires_at, verified")
        .eq("identifier", phone)
        .eq("type", "phone")
        .maybeSingle();

      if (fetchErr || !record) {
        await recordFailure(rateLimKey);
        return NextResponse.json({ error: "OTP not found. Please request a new one." }, { status: 400 });
      }
      if (record.verified) {
        return NextResponse.json({ error: "OTP already used. Please request a new one." }, { status: 400 });
      }
      if (new Date(record.expires_at as string) < new Date()) {
        return NextResponse.json({ error: "OTP expired. Please request a new one." }, { status: 400 });
      }
      if ((record.code as string) !== codeStr) {
        await recordFailure(rateLimKey);
        return NextResponse.json({ error: "Incorrect OTP. Please try again." }, { status: 400 });
      }

      // Mark verified — registration endpoint reads this to confirm phone ownership
      await db.from("otp_verifications").update({ verified: true }).eq("id", record.id);
      console.log(`[verify-phone-otp] register verified phone=${phone}`);
      return NextResponse.json({ success: true, verified: true });
    }

    // ════════════════════════════════════════════════════════════════════
    // LOGIN — OTP stored in users.otp_hash (bcrypt)
    // ════════════════════════════════════════════════════════════════════
    if (purpose === "login") {
      const { data: user } = await db
        .from("users")
        .select("*")
        .eq("phone", phone)
        .maybeSingle();

      if (!user) {
        await recordFailure(rateLimKey);
        return NextResponse.json({ error: "No account found with this phone number." }, { status: 404 });
      }
      if (user.is_active === false) {
        return NextResponse.json({ error: "Your account has been deactivated. Please contact support." }, { status: 403 });
      }
      if (!user.otp_hash) {
        return NextResponse.json({ error: "OTP not found. Please request a new one." }, { status: 400 });
      }

      // Brute-force guard using users.otp_attempts
      const attempts = (user.otp_attempts as number) ?? 0;
      if (attempts >= MAX_ATTEMPTS) {
        return NextResponse.json(
          { error: "Too many incorrect attempts. Please request a new code." },
          { status: 429 },
        );
      }
      if (user.otp_expires_at && new Date(user.otp_expires_at as string) < new Date()) {
        return NextResponse.json({ error: "OTP expired. Please request a new one." }, { status: 400 });
      }

      const match = await bcrypt.compare(codeStr, user.otp_hash as string);
      if (!match) {
        // Increment attempts
        await db.from("users")
          .update({ otp_attempts: attempts + 1 })
          .eq("email", user.email as string);
        await recordFailure(rateLimKey);
        const remaining = MAX_ATTEMPTS - attempts - 1;
        return NextResponse.json(
          { error: remaining > 0 ? `Incorrect OTP. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` : "Too many incorrect attempts. Please request a new code." },
          { status: 400 },
        );
      }

      // Clear OTP fields after successful verification
      await db.from("users").update({
        otp_hash:         null,
        otp_expires_at:   null,
        otp_attempts:     0,
      }).eq("email", user.email as string);

      const role       = (user.role as string) ?? "user";
      const coachToken = role === "coach" ? signCoachToken(user.email as string) : undefined;
      const userToken  = signUserToken(user.email as string);

      console.log(`[verify-phone-otp] login verified phone=${phone} user=${user.email}`);
      const res = NextResponse.json({
        success: true,
        requiresPhoneVerification: !(user.phone_verified as boolean),
        user: {
          firstName:    user.first_name,
          lastName:     user.last_name,
          email:        user.email,
          phone:        user.phone,
          goal:         user.goal,
          location:     user.location,
          photo:        user.photo ?? null,
          role,
          phone_verified: user.phone_verified ?? false,
          coachToken,
          userToken,
        },
      });

      res.cookies.set(USER_SESSION_COOKIE, userToken, {
        httpOnly: true,
        secure:   process.env.NODE_ENV === "production",
        sameSite: "lax",
        path:     "/",
        maxAge:   USER_TOKEN_TTL,
      });

      return res;
    }

    // ════════════════════════════════════════════════════════════════════
    // VERIFY_PHONE — marks phone_verified=true for logged-in user
    // ════════════════════════════════════════════════════════════════════
    if (purpose === "verify_phone") {
      const tokenEmail = verifyUserToken(req.headers.get("x-user-token") ?? "");
      if (!tokenEmail) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
      }

      const { data: user } = await db
        .from("users")
        .select("email, otp_hash, otp_expires_at, otp_attempts, phone_verified")
        .eq("email", tokenEmail.toLowerCase())
        .maybeSingle();

      if (!user) {
        return NextResponse.json({ error: "User not found." }, { status: 404 });
      }
      if (!user.otp_hash) {
        return NextResponse.json({ error: "OTP not found. Please request a new one." }, { status: 400 });
      }

      const attempts = (user.otp_attempts as number) ?? 0;
      if (attempts >= MAX_ATTEMPTS) {
        return NextResponse.json(
          { error: "Too many incorrect attempts. Please request a new code." },
          { status: 429 },
        );
      }
      if (user.otp_expires_at && new Date(user.otp_expires_at as string) < new Date()) {
        return NextResponse.json({ error: "OTP expired. Please request a new one." }, { status: 400 });
      }

      const match = await bcrypt.compare(codeStr, user.otp_hash as string);
      if (!match) {
        await db.from("users")
          .update({ otp_attempts: attempts + 1 })
          .eq("email", user.email as string);
        await recordFailure(rateLimKey);
        const remaining = MAX_ATTEMPTS - attempts - 1;
        return NextResponse.json(
          { error: remaining > 0 ? `Incorrect OTP. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` : "Too many incorrect attempts. Please request a new code." },
          { status: 400 },
        );
      }

      // Set phone_verified + phone_verified_at, clear OTP fields
      await db.from("users").update({
        phone_verified:    true,
        phone_verified_at: new Date().toISOString(),
        otp_hash:          null,
        otp_expires_at:    null,
        otp_attempts:      0,
        // Also update phone to the normalised form
        phone,
      }).eq("email", user.email as string);

      console.log(`[verify-phone-otp] verify_phone success user=${user.email} phone=${phone}`);
      return NextResponse.json({ success: true, phone_verified: true });
    }

    return NextResponse.json({ error: "Invalid purpose." }, { status: 400 });
  } catch (e: unknown) {
    console.error("[verify-phone-otp] unhandled error:", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
