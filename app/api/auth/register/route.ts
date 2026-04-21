import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const { firstName, lastName, email, phone, goal, location, password } = await req.json();

  if (!email || !password || !firstName || !lastName) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  // Check if email already registered
  const { data: existing, error: checkError } = await supabaseServer
    .from("users")
    .select("id")
    .eq("email", email.toLowerCase())
    .single();

  if (checkError && checkError.code !== "PGRST116") {
    console.error("Supabase check error:", checkError);
    return NextResponse.json({ error: "Database connection failed: " + checkError.message }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const hashed = await bcrypt.hash(password, 12);

  const { error } = await supabaseServer.from("users").insert({
    first_name: firstName,
    last_name:  lastName,
    email:      email.toLowerCase(),
    phone,
    goal,
    location,
    password:   hashed,
  });

  if (error) {
    console.error("Supabase insert error:", error);
    return NextResponse.json({ error: error.message || "Registration failed. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
