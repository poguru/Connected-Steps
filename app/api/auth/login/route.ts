import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const { identifier, password } = await req.json();

  if (!identifier || !password) {
    return NextResponse.json({ error: "Please enter your email or phone number and password." }, { status: 400 });
  }

  const supabaseServer = getSupabaseServer();

  const isPhone = /^\+?[\d\s\-()]{7,15}$/.test(identifier.trim());

  const { data: user, error } = await supabaseServer
    .from("users")
    .select("*")
    .eq(isPhone ? "phone" : "email", isPhone ? identifier.trim() : identifier.toLowerCase())
    .single();

  if (error || !user) {
    return NextResponse.json({ error: "Invalid credentials. Please check and try again." }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return NextResponse.json({ error: "Invalid credentials. Please check and try again." }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    user: {
      firstName: user.first_name,
      lastName:  user.last_name,
      email:     user.email,
      phone:     user.phone,
      goal:      user.goal,
      location:  user.location,
      photo:     null,
    },
  });
}
