import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseServer } from "@/lib/supabase-server";
import { autoFeedMemberJoined } from "@/lib/auto-feed";
import { getOrCreateCode, processReferral } from "@/lib/referrals";
import { enqueueJob } from "@/lib/job-queue";
import { sendEmail, welcomeEmailHTML, adminNewUserEmailHTML } from "@/lib/notify";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // Rate limit registrations per IP to prevent bulk account creation / enumeration
  const ip  = getClientIp(req);
  const key = `register:${ip}`;
  if (await isRateLimited(key, 10)) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again in 15 minutes." },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  try {
    // phoneVerified: legacy field kept for backward compatibility (feature-flagged WA OTP path).
    // emailVerified: new primary verification mechanism.
    const { firstName, lastName, email, phone, goal, location, password, phoneVerified, referralCode, dob } = await req.json();

    // email is now required; phone is optional contact information
    if (!password || !firstName || !lastName || !email) {
      return NextResponse.json({ error: "Full name, email address, and password are required." }, { status: 400 });
    }

    // DOB validation
    if (!dob) {
      return NextResponse.json({ error: "Date of Birth is required." }, { status: 400 });
    }
    const dobDate = new Date((dob as string) + "T12:00:00");
    if (isNaN(dobDate.getTime()) || dobDate >= new Date()) {
      return NextResponse.json({ error: "Please provide a valid date of birth." }, { status: 400 });
    }
    const ageCutoff = new Date();
    ageCutoff.setFullYear(ageCutoff.getFullYear() - 13);
    if (dobDate > ageCutoff) {
      return NextResponse.json({ error: "You must be at least 13 years old to register." }, { status: 400 });
    }
    const birthDay   = dobDate.getDate();
    const birthMonth = dobDate.getMonth() + 1;

    // Normalise phone to 10 digits (optional — only validate if provided)
    const phoneDigits = phone ? (phone as string).replace(/\D/g, "") : "";
    const phone10 = phoneDigits.length === 12 && phoneDigits.startsWith("91")
      ? phoneDigits.slice(2)
      : phoneDigits.length === 13 && phoneDigits.startsWith("091")
        ? phoneDigits.slice(3)
        : phoneDigits;
    if (phone10 && (phone10.length !== 10 || !/^[6-9]\d{9}$/.test(phone10))) {
      return NextResponse.json({ error: "Please enter a valid 10-digit Indian mobile number." }, { status: 400 });
    }

    // Server-side password strength validation (mirrors client-side rules)
    if ((password as string).length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    if (!/[A-Z]/.test(password as string)) {
      return NextResponse.json({ error: "Password must contain at least one uppercase letter." }, { status: 400 });
    }
    if (!/[0-9]/.test(password as string)) {
      return NextResponse.json({ error: "Password must contain at least one number." }, { status: 400 });
    }

    const supabaseServer = getSupabaseServer();

    const emailNorm = (email as string).trim().toLowerCase();

    // ── Email verification check (primary verification) ───────────────────────
    // Confirm the email was verified via the link sent before step 3.
    const { data: verifiedToken } = await supabaseServer
      .from("email_verification_tokens")
      .select("id, expires_at")
      .eq("email", emailNorm)
      .eq("verified", true)
      .maybeSingle();

    if (!verifiedToken) {
      return NextResponse.json({ error: "Please verify your email address before creating your account." }, { status: 400 });
    }
    if (new Date(verifiedToken.expires_at) < new Date()) {
      return NextResponse.json({ error: "Your email verification has expired. Please restart the sign-up process." }, { status: 400 });
    }

    // ── Legacy WhatsApp OTP check (feature-flagged) ───────────────────────────
    // WA_OTP_ENABLED env var re-enables this path when WhatsApp OTP is turned back on.
    let confirmedPhoneVerified = false;
    if (process.env.WA_OTP_ENABLED === "true" && phoneVerified === true && phone10) {
      const { data: otpRecord } = await supabaseServer
        .from("otp_verifications")
        .select("verified, expires_at")
        .eq("identifier", phone10)
        .eq("type", "phone")
        .maybeSingle();

      if (otpRecord?.verified) {
        confirmedPhoneVerified = true;
        await supabaseServer
          .from("otp_verifications")
          .delete()
          .eq("identifier", phone10)
          .eq("type", "phone");
      }
    }

    // ── Duplicate checks ──────────────────────────────────────────────────────
    if (phone10) {
      const { data: existingPhone } = await supabaseServer
        .from("users")
        .select("id")
        .eq("phone", phone10)
        .maybeSingle();
      if (existingPhone) {
        return NextResponse.json({ error: "An account with this mobile number already exists." }, { status: 409 });
      }
    }

    const { data: existingEmail, error: checkError } = await supabaseServer
      .from("users")
      .select("id")
      .eq("email", emailNorm)
      .single();
    if (checkError && checkError.code !== "PGRST116") {
      console.error("[register] email check error:", checkError.message);
      return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
    }
    if (existingEmail) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 12);

    const registeredAt = new Date().toISOString();

    const { error } = await supabaseServer.from("users").insert({
      first_name:         firstName,
      last_name:          lastName,
      email:              emailNorm,
      phone:              phone10 || null,
      goal,
      location,
      password:           hashed,
      email_verified:     true,
      phone_verified:     confirmedPhoneVerified,
      phone_verified_at:  confirmedPhoneVerified ? new Date().toISOString() : null,
      date_of_birth:      dob,
      birth_day:          birthDay,
      birth_month:        birthMonth,
    });

    if (error) {
      console.error("Register insert error:", error.message);
      return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
    }

    // Clean up the used verification token
    await supabaseServer.from("email_verification_tokens").delete().eq("email", emailNorm);

    const userEmail = emailNorm;

    autoFeedMemberJoined(userEmail, firstName, lastName, location ?? null).catch(() => {});
    getOrCreateCode(userEmail).catch(() => {});

    if (referralCode && typeof referralCode === "string" && userEmail) {
      const referralPayload = {
        referralCode:      (referralCode as string).trim(),
        referredEmail:     userEmail,
        referredFirstName: firstName,
      };
      await enqueueJob("referral_reward", referralPayload, { idempotencyKey: `referral_reward:${userEmail}` });
      void processReferral(referralPayload.referralCode, referralPayload.referredEmail, referralPayload.referredFirstName).catch(console.error);
    }

    // Welcome email
    sendEmail(
      userEmail, firstName,
      "Welcome to Connected Steps! 🎉",
      welcomeEmailHTML(firstName),
    ).catch(() => {});

    // Admin notification
    sendEmail(
      "info@connectedsteps.in", "Connected Steps Admin",
      `New Registration: ${firstName} ${lastName}`,
      adminNewUserEmailHTML({
        firstName, lastName,
        email:        userEmail,
        phone:        phone10 || "(no phone)",
        dob:          dob ?? null,
        location:     location ?? null,
        referralCode: referralCode ?? null,
        registeredAt,
      }),
    ).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    console.error("[register] unexpected error:", e);
    return NextResponse.json({ error: "An error occurred, please try again." }, { status: 500 });
  }
}
