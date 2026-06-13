import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseServer } from "@/lib/supabase-server";
import { autoFeedMemberJoined } from "@/lib/auto-feed";
import { processReferral } from "@/lib/referrals";

export async function POST(req: NextRequest) {
  try {
    // phoneVerified is set to true only when the signup form has already gone
    // through the phone OTP step before calling this endpoint.
    const { firstName, lastName, email, phone, goal, location, password, phoneVerified, referralCode } = await req.json();

    if (!email || !password || !firstName || !lastName || !phone) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const phoneDigits = (phone as string).replace(/\D/g, "");
    if (phoneDigits.length !== 10) {
      return NextResponse.json({ error: "Please enter a valid 10-digit mobile number." }, { status: 400 });
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

    // Check if email already registered
    const { data: existing, error: checkError } = await supabaseServer
      .from("users")
      .select("id")
      .eq("email", email.toLowerCase())
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      return NextResponse.json({ error: "DB check failed: " + checkError.message }, { status: 500 });
    }

    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 12);

    const { error } = await supabaseServer.from("users").insert({
      first_name:    firstName,
      last_name:     lastName,
      email:         email.toLowerCase(),
      phone,
      goal,
      location,
      password:      hashed,
      phone_verified: phoneVerified === true,
    });

    if (error) {
      console.error("Register insert error:", error.message);
      return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
    }

    autoFeedMemberJoined(email.toLowerCase(), firstName, lastName, location ?? null)
      .catch(() => {});

    if (referralCode && typeof referralCode === "string") {
      processReferral(referralCode.trim(), email.toLowerCase(), firstName)
        .catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error: " + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
  }
}
