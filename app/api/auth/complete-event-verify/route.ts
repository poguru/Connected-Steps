/**
 * POST /api/auth/complete-event-verify
 *
 * Atomic OTP verification + login-or-create for the event registration flow.
 * Replaces the two-step "verify-otp then login-otp" pattern with a single
 * call that handles both new and existing users.
 *
 * Body (step 1 — OTP only):
 *   { email: string, code: string }
 *
 * Body (step 2 — profile for new users):
 *   { email: string, code: string, name: string, mobile: string }
 *
 * Responses:
 *   { needs_profile: true }                              — new user, collect name+mobile
 *   { success: true, userToken, user: { ... } }          — authenticated (new or existing)
 *   { error: string }  (4xx)                             — failure
 *
 * Security:
 *  - Rate-limited per IP + email (5 attempts / 15 min)
 *  - Re-submission with name+mobile requires the SAME correct OTP code
 *  - Does not confirm whether an email exists to external callers
 */
import { NextRequest, NextResponse }                    from "next/server";
import bcrypt                                           from "bcryptjs";
import crypto                                           from "crypto";
import { getSupabaseServer }                            from "@/lib/supabase-server";
import { signUserToken, USER_SESSION_COOKIE, USER_TOKEN_TTL } from "@/lib/admin-auth";
import { isRateLimited, recordFailure, getClientIp }   from "@/lib/rate-limit";
import { sendEmail, welcomeEmailHTML }                  from "@/lib/notify";

const GRACE_MS = 15 * 60 * 1000; // 15 min grace after OTP expiry for profile re-submit

function makeSession(res: NextResponse, userToken: string): NextResponse {
  res.cookies.set(USER_SESSION_COOKIE, userToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   USER_TOKEN_TTL,
  });
  return res;
}

export async function POST(req: NextRequest) {
  try {
    const { email, code, name, mobile } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: "Missing email or code." }, { status: 400 });
    }

    const ip        = getClientIp(req);
    const emailNorm = (email as string).toLowerCase().trim();

    // ── Rate limit OTP attempts ───────────────────────────────────────────────
    const rateLimitKey = `event-verify:${ip}:${emailNorm}`;
    if (await isRateLimited(rateLimitKey)) {
      return NextResponse.json(
        { error: "Too many verification attempts. Please wait 15 minutes before trying again." },
        { status: 429, headers: { "Retry-After": "900" } },
      );
    }

    const db = getSupabaseServer();

    // ── Look up OTP ───────────────────────────────────────────────────────────
    const { data: otp } = await db
      .from("otp_verifications")
      .select("id, code, expires_at, verified")
      .eq("identifier", emailNorm)
      .eq("type", "email")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!otp) {
      await recordFailure(rateLimitKey);
      return NextResponse.json({ error: "OTP not found. Please request a new one." }, { status: 400 });
    }

    const submittedCode = String(code).trim();

    if (otp.verified) {
      // Re-submission (name+mobile form) — still require the correct code
      // and a reasonable grace window after original expiry
      if (otp.code !== submittedCode) {
        await recordFailure(rateLimitKey);
        return NextResponse.json({ error: "Invalid code. Please start again." }, { status: 400 });
      }
      if (new Date(otp.expires_at).getTime() + GRACE_MS < Date.now()) {
        return NextResponse.json({ error: "Session expired. Please request a new verification code." }, { status: 400 });
      }
    } else {
      // First-time verification
      if (new Date(otp.expires_at) < new Date()) {
        return NextResponse.json({ error: "OTP has expired. Please request a new one." }, { status: 400 });
      }
      if (otp.code !== submittedCode) {
        await recordFailure(rateLimitKey);
        return NextResponse.json({ error: "Incorrect OTP. Please try again." }, { status: 400 });
      }
      await db.from("otp_verifications").update({ verified: true }).eq("id", otp.id);
    }

    // ── Look up user ──────────────────────────────────────────────────────────
    const { data: user } = await db
      .from("users")
      .select("id, first_name, last_name, email, phone, goal, location, photo, role, is_active")
      .eq("email", emailNorm)
      .maybeSingle();

    if (user) {
      // ── Existing user: create session ─────────────────────────────────────
      if (user.is_active === false) {
        return NextResponse.json(
          { error: "Your account has been deactivated. Please contact support." },
          { status: 403 },
        );
      }

      const userToken = signUserToken(user.email);
      const res = makeSession(
        NextResponse.json({
          success:   true,
          userToken,
          user: {
            firstName: user.first_name,
            lastName:  user.last_name,
            email:     user.email,
            phone:     user.phone,
            goal:      user.goal      ?? null,
            location:  user.location  ?? null,
            photo:     user.photo     ?? null,
            role:      user.role      ?? "user",
          },
        }),
        userToken,
      );
      return res;
    }

    // ── New user ──────────────────────────────────────────────────────────────
    if (!name) {
      // OTP verified — ask the client to collect name (mobile is optional)
      return NextResponse.json({ needs_profile: true });
    }

    let phone10: string | null = null;
    if (mobile) {
      // Validate mobile (Indian 10-digit) — only if provided
      const phoneDigits = (mobile as string).replace(/\D/g, "");
      const normalized =
        phoneDigits.length === 12 && phoneDigits.startsWith("91") ? phoneDigits.slice(2)
        : phoneDigits.length === 13 && phoneDigits.startsWith("091") ? phoneDigits.slice(3)
        : phoneDigits;

      if (normalized.length !== 10 || !/^[6-9]\d{9}$/.test(normalized)) {
        return NextResponse.json(
          { error: "Please enter a valid 10-digit Indian mobile number." },
          { status: 400 },
        );
      }

      // Check mobile not already linked
      const { data: existingPhone } = await db
        .from("users")
        .select("id")
        .eq("phone", normalized)
        .maybeSingle();

      if (existingPhone) {
        return NextResponse.json(
          { error: "This mobile number is linked to another account. Please use a different number or sign in." },
          { status: 409 },
        );
      }

      phone10 = normalized;
    }

    // Split full name into first / last
    const nameTrimmed = (name as string).trim();
    const spaceIdx    = nameTrimmed.indexOf(" ");
    const firstName   = spaceIdx > 0 ? nameTrimmed.slice(0, spaceIdx) : nameTrimmed;
    const lastName    = spaceIdx > 0 ? nameTrimmed.slice(spaceIdx + 1).trim() : "";

    // Generate a placeholder password — user can set a real one via forgot-password.
    // We don't store a usable plaintext; login via OTP or password-reset is the path.
    const tempHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);

    const { error: insertErr } = await db.from("users").insert({
      first_name:     firstName,
      last_name:      lastName,
      email:          emailNorm,
      phone:          phone10,
      password:       tempHash,
      email_verified: true,
      phone_verified: false,
    });

    if (insertErr) {
      // Race: another request created the same account between our check and insert
      if (insertErr.code === "23505") {
        const { data: raceUser } = await db
          .from("users")
          .select("id, first_name, last_name, email, phone, goal, location, photo, role")
          .eq("email", emailNorm)
          .maybeSingle();
        if (raceUser) {
          const userToken = signUserToken(raceUser.email);
          return makeSession(
            NextResponse.json({
              success:   true,
              userToken,
              user: {
                firstName: raceUser.first_name,
                lastName:  raceUser.last_name,
                email:     raceUser.email,
                phone:     raceUser.phone,
                goal:      raceUser.goal     ?? null,
                location:  raceUser.location ?? null,
                photo:     raceUser.photo    ?? null,
                role:      raceUser.role     ?? "user",
              },
            }),
            userToken,
          );
        }
      }
      console.error("[complete-event-verify] insert error:", insertErr);
      return NextResponse.json({ error: "Account creation failed. Please try again." }, { status: 500 });
    }

    // Fire-and-forget welcome email
    sendEmail(
      emailNorm, firstName,
      "Welcome to Connected Steps! 🎉",
      welcomeEmailHTML(firstName),
    ).catch(() => {});

    const userToken = signUserToken(emailNorm);
    return makeSession(
      NextResponse.json({
        success:   true,
        userToken,
        user: {
          firstName,
          lastName,
          email:    emailNorm,
          phone:    phone10,
          goal:     null,
          location: null,
          photo:    null,
          role:     "user",
        },
      }),
      userToken,
    );
  } catch (e: unknown) {
    console.error("[complete-event-verify] unhandled error:", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
