import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const { identifier, password } = await req.json();

  if (!identifier || !password) {
    return NextResponse.json({ error: "Please enter your email or phone number and password." }, { status: 400 });
  }

  const supabaseServer = getSupabaseServer();

  const val = identifier.trim();

  // Try email first, then phone — use limit(1) to handle any duplicate rows gracefully
  const byEmail = await supabaseServer.from("users").select("*").eq("email", val.toLowerCase()).limit(1);
  const byPhone = await supabaseServer.from("users").select("*").eq("phone", val).limit(1);
  const user = byEmail.data?.[0] ?? byPhone.data?.[0] ?? null;

  if (!user) {
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
      photo:     user.photo ?? null,
    },
  });
}
