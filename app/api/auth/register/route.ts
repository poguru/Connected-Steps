import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const { firstName, lastName, email, phone, goal, location, password } = await req.json();

    if (!email || !password || !firstName || !lastName) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const db = getSupabaseServer();

    // Require verified email OTP
    const { data: emailOtp } = await db
      .from("otp_verifications")
      .select("id")
      .eq("identifier", email.toLowerCase())
      .eq("type", "email")
      .eq("verified", true)
      .single();

    if (!emailOtp) {
      return NextResponse.json({ error: "Email not verified. Please complete OTP verification." }, { status: 400 });
    }

    // Require verified mobile OTP
    const { data: mobileOtp } = await db
      .from("otp_verifications")
      .select("id")
      .eq("identifier", phone)
      .eq("type", "mobile")
      .eq("verified", true)
      .single();

    if (!mobileOtp) {
      return NextResponse.json({ error: "Mobile not verified. Please complete OTP verification." }, { status: 400 });
    }

    // Check if email already registered
    const { data: existing, error: checkError } = await db
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

    const { error } = await db.from("users").insert({
      first_name: firstName,
      last_name:  lastName,
      email:      email.toLowerCase(),
      phone,
      goal,
      location,
      password:   hashed,
    });

    if (error) {
      return NextResponse.json({ error: "Insert failed: " + error.message }, { status: 500 });
    }

    // Clean up used OTPs
    await db.from("otp_verifications")
      .delete()
      .in("id", [emailOtp.id, mobileOtp.id]);

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error: " + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
  }
}
