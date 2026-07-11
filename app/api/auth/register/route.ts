import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseServer } from "@/lib/supabase-server";
import { autoFeedMemberJoined } from "@/lib/auto-feed";
import { getOrCreateCode, processReferral } from "@/lib/referrals";
import { enqueueJob } from "@/lib/job-queue";
import { sendEmail, welcomeEmailHTML, adminNewUserEmailHTML } from "@/lib/notify";

export async function POST(req: NextRequest) {
  try {
    // phoneVerified: true signals that the client completed the WhatsApp OTP step.
    // The server re-checks otp_verifications to prevent spoofing.
    const { firstName, lastName, email, phone, goal, location, password, phoneVerified, referralCode, dob } = await req.json();

    // phone is required; email is optional (users log in via phone)
    if (!password || !firstName || !lastName || !phone) {
      return NextResponse.json({ error: "Full name, mobile number, and password are required." }, { status: 400 });
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

    // Normalise phone to 10 digits
    const phoneDigits = (phone as string).replace(/\D/g, "");
    const phone10 = phoneDigits.length === 12 && phoneDigits.startsWith("91")
      ? phoneDigits.slice(2)
      : phoneDigits.length === 13 && phoneDigits.startsWith("091")
        ? phoneDigits.slice(3)
        : phoneDigits;
    if (phone10.length !== 10 || !/^[6-9]\d{9}$/.test(phone10)) {
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

    // ── Server-side phone OTP verification check ──────────────────────────────
    // When phoneVerified=true, confirm the OTP was actually verified in the DB.
    // This prevents the client from bypassing the OTP step by sending phoneVerified:true.
    let confirmedPhoneVerified = false;
    if (phoneVerified === true) {
      const { data: otpRecord } = await supabaseServer
        .from("otp_verifications")
        .select("verified, expires_at")
        .eq("identifier", phone10)
        .eq("type", "phone")
        .maybeSingle();

      if (otpRecord?.verified) {
        confirmedPhoneVerified = true;
        // Clean up the OTP record now that the account is being created
        await supabaseServer
          .from("otp_verifications")
          .delete()
          .eq("identifier", phone10)
          .eq("type", "phone");
      }
      // If OTP record not found or not verified, proceed but mark phone_verified=false
    }

    // ── Duplicate checks ──────────────────────────────────────────────────────
    const { data: existingPhone } = await supabaseServer
      .from("users")
      .select("id")
      .eq("phone", phone10)
      .maybeSingle();
    if (existingPhone) {
      return NextResponse.json({ error: "An account with this mobile number already exists." }, { status: 409 });
    }

    if (email) {
      const { data: existingEmail, error: checkError } = await supabaseServer
        .from("users")
        .select("id")
        .eq("email", (email as string).toLowerCase())
        .single();
      if (checkError && checkError.code !== "PGRST116") {
        return NextResponse.json({ error: "DB check failed: " + checkError.message }, { status: 500 });
      }
      if (existingEmail) {
        return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
      }
    }

    const hashed = await bcrypt.hash(password, 12);

    const registeredAt = new Date().toISOString();

    const { error } = await supabaseServer.from("users").insert({
      first_name:         firstName,
      last_name:          lastName,
      email:              email ? (email as string).toLowerCase() : null,
      phone:              phone10,
      goal,
      location,
      password:           hashed,
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

    const userEmail = email ? (email as string).toLowerCase() : null;

    if (userEmail) {
      autoFeedMemberJoined(userEmail, firstName, lastName, location ?? null).catch(() => {});
      getOrCreateCode(userEmail).catch(() => {});
    }

    if (referralCode && typeof referralCode === "string" && userEmail) {
      const referralPayload = {
        referralCode:      (referralCode as string).trim(),
        referredEmail:     userEmail,
        referredFirstName: firstName,
      };
      await enqueueJob("referral_reward", referralPayload, { idempotencyKey: `referral_reward:${userEmail}` });
      void processReferral(referralPayload.referralCode, referralPayload.referredEmail, referralPayload.referredFirstName).catch(console.error);
    }

    // Welcome email (only if email provided)
    if (userEmail) {
      sendEmail(
        userEmail, firstName,
        "Welcome to Connected Steps! 🎉",
        welcomeEmailHTML(firstName),
      ).catch(() => {});
    }

    // Admin notification
    sendEmail(
      "info@connectedsteps.in", "Connected Steps Admin",
      `New Registration: ${firstName} ${lastName}`,
      adminNewUserEmailHTML({
        firstName, lastName,
        email:        userEmail ?? "(no email)",
        phone:        phone10,
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
