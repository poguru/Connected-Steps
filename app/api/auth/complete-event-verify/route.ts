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
 *   { email: string, code: string, name: string, mobile?: string }
 *
 * Responses:
 *   { needs_profile: true }                              — new user, collect name (mobile optional)
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
    // CRITICAL: Look up user by normalized (lowercase) email
    // Try both exact match (.eq) and case-insensitive (.ilike) to handle all scenarios
    console.log(`[complete-event-verify] LOOKUP START - emailNorm="${emailNorm}", otp.identifier="${otp.identifier}"`);

    // Exact match lookup
    const { data: exactUser, error: exactError } = await db
      .from("users")
      .select("id, first_name, last_name, email, phone, goal, location, photo, role, is_active, email_verified")
      .eq("email", emailNorm)
      .maybeSingle();

    console.log(`[complete-event-verify] exact lookup (emailNorm="${emailNorm}"): found=${!!exactUser}, error=${exactError?.code || "none"}`);
    if (exactError) {
      console.error(`[complete-event-verify] exact lookup error details:`, exactError);
    }
    if (exactUser) {
      console.log(`[complete-event-verify] ✓ exact match found: id=${exactUser.id}, stored_email=${exactUser.email}`);
    }

    // Case-insensitive fallback
    let user = exactUser;
    let userError = exactError;

    if (!user && !userError) {
      console.log(`[complete-event-verify] exact match failed, trying ilike: "${emailNorm}"`);
      const { data: ilikeUser, error: ilikeError } = await db
        .from("users")
        .select("id, first_name, last_name, email, phone, goal, location, photo, role, is_active, email_verified")
        .ilike("email", emailNorm)
        .maybeSingle();

      console.log(`[complete-event-verify] ilike lookup (emailNorm="${emailNorm}"): found=${!!ilikeUser}, error=${ilikeError?.code || "none"}`);
      if (ilikeError) {
        console.error(`[complete-event-verify] ilike lookup error details:`, ilikeError);
      }
      if (ilikeUser) {
        console.log(`[complete-event-verify] ✓ ilike match found: id=${ilikeUser.id}, stored_email=${ilikeUser.email}`);
      }

      user = ilikeUser;
      userError = ilikeError;
    }

    if (userError) {
      console.error("[complete-event-verify] user lookup error:", userError.message, userError.code);
      // If lookup fails, still allow account creation (don't block the flow)
      console.log(`[complete-event-verify] treating as new user due to lookup error: ${emailNorm}`);
    } else if (user) {
      console.log(`[complete-event-verify] ✅ existing user found: email=${emailNorm}, stored_email=${user.email}, user_id=${user.id}`);
    } else {
      console.log(`[complete-event-verify] ❌ NO USER FOUND for email: ${emailNorm}`);

      // Diagnostic: search for users with similar email pattern to understand database state
      console.log(`[complete-event-verify] DIAGNOSTIC: Searching for similar emails...`);
      const { data: allMatches, error: diagError } = await db
        .from("users")
        .select("id, email, first_name, last_name")
        .ilike("email", `%${emailNorm.split("@")[0]}%`)
        .limit(5);

      if (diagError) {
        console.error(`[complete-event-verify] diagnostic query error:`, diagError);
      }

      if (allMatches && allMatches.length > 0) {
        console.log(`[complete-event-verify] DIAGNOSTIC: Found ${allMatches.length} similar users in DB with username "${emailNorm.split("@")[0]}":`);
        allMatches.forEach(m => {
          console.log(`  - ${m.first_name} ${m.last_name}: email="${m.email}" (matches search? ${m.email.toLowerCase() === emailNorm})`);
        });
      } else {
        console.log(`[complete-event-verify] DIAGNOSTIC: No users found with username pattern: ${emailNorm.split("@")[0]}`);
      }

      // Also try fetching by exact email domain to see all users with that domain
      const emailDomain = emailNorm.split("@")[1];
      console.log(`[complete-event-verify] DIAGNOSTIC: Searching for any users with domain "${emailDomain}"...`);
      const { data: domainMatches } = await db
        .from("users")
        .select("id, email, first_name, last_name")
        .ilike("email", `%@${emailDomain}`)
        .limit(5);

      if (domainMatches && domainMatches.length > 0) {
        console.log(`[complete-event-verify] DIAGNOSTIC: Found ${domainMatches.length} users with domain "${emailDomain}":`);
        domainMatches.forEach(m => {
          console.log(`  - ${m.first_name} ${m.last_name}: email="${m.email}" (matches ${emailNorm}? ${m.email.toLowerCase() === emailNorm})`);
        });
      }
    }

    if (user) {
      // ── Existing user: create session ─────────────────────────────────────
      console.log(`[complete-event-verify] authenticating existing user: ${user.id}`);

      if (user.is_active === false) {
        console.log(`[complete-event-verify] account deactivated: ${emailNorm}`);
        return NextResponse.json(
          { error: "Your account has been deactivated. Please contact support." },
          { status: 403 },
        );
      }

      // Return authenticated session with user profile
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
    console.log(`[complete-event-verify] no user found by email=${emailNorm}, needs_profile=${!name}`);

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

      // Check mobile not already linked — SAFETY CHECK to detect if account exists
      const { data: existingPhone, error: phoneError } = await db
        .from("users")
        .select("id, email, first_name, last_name")
        .eq("phone", normalized)
        .maybeSingle();

      if (phoneError) {
        console.error("[complete-event-verify] phone lookup error:", phoneError.message, phoneError.code);
        return NextResponse.json({ error: "Account lookup failed. Please try again." }, { status: 500 });
      }

      if (existingPhone) {
        // CRITICAL: Account exists by phone but not found by email
        // This indicates either:
        // 1. Different email than what's stored (user changed email externally?)
        // 2. Email normalization mismatch
        // 3. Account created with phone-only, now trying to verify with email
        console.error(
          `[complete-event-verify] IDENTITY CONFLICT: email=${emailNorm} not found, but phone=${normalized} belongs to user_id=${existingPhone.id} email=${existingPhone.email}. This indicates email mismatch or multiple accounts.`
        );

        return NextResponse.json(
          { error: "This mobile number is already linked to a different account. Please use a different number or sign in to your existing account." },
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
      // Use null (not "") when no mobile is provided.
      // PostgreSQL UNIQUE constraints treat NULL as distinct — multiple phone-less
      // accounts can coexist. "" caused a UNIQUE violation for every user after
      // the first. Requires migration 20260813000001 (DROP NOT NULL on phone).
      phone:          phone10 ?? null,
      password:       tempHash,
      email_verified: true,
      phone_verified: false,
    });

    if (insertErr) {
      // 23505 = unique_violation — two possible causes:
      //   (a) email race: another request created the same account concurrently
      //   (b) phone collision: phone10 is non-null and another account holds it
      if (insertErr.code === "23505") {
        const { data: raceUser } = await db
          .from("users")
          .select("id, first_name, last_name, email, phone, goal, location, photo, role")
          .eq("email", emailNorm)
          .maybeSingle();
        if (raceUser) {
          // Case (a): concurrent request already created the account — return session
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
        // Case (b): UNIQUE violation on a non-email column (phone race)
        console.error("[complete-event-verify] 23505 but user not found by email — phone race or schema issue. detail=%s", insertErr.details);
        return NextResponse.json(
          { error: "This mobile number is already linked to another account. Please use a different number or sign in." },
          { status: 409 },
        );
      }

      // 23502 = NOT NULL violation — migration 20260813000001 not yet applied
      if (insertErr.code === "23502") {
        console.error("[complete-event-verify] NOT NULL violation — run migration 20260813000001 to make phone nullable. detail=%s", insertErr.details);
        return NextResponse.json({ error: "Account creation failed. Please try again." }, { status: 500 });
      }

      console.error("[complete-event-verify] insert error code=%s msg=%s detail=%s", insertErr.code, insertErr.message, insertErr.details);
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
