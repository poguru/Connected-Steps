import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseServer } from "@/lib/supabase-server";
import { signCoachToken, signUserToken } from "@/lib/admin-auth";
import { isRateLimited, recordFailure, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip  = getClientIp(req);
  const key = `login:${ip}`;

  if (isRateLimited(key)) {
    return NextResponse.json(
      { error: "Too many failed login attempts. Please try again in 15 minutes." },
      { status: 429, headers: { "Retry-After": "900" } }
    );
  }

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
    recordFailure(key);
    return NextResponse.json({ error: "Invalid credentials. Please check and try again." }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    recordFailure(key);
    return NextResponse.json({ error: "Invalid credentials. Please check and try again." }, { status: 401 });
  }

  if (user.is_active === false) {
    return NextResponse.json({ error: "Your account has been deactivated. Please contact support." }, { status: 403 });
  }

  const role       = user.role ?? "user";
  const coachToken = role === "coach" ? signCoachToken(user.email) : undefined;
  const userToken  = signUserToken(user.email);

  return NextResponse.json({
    success: true,
    user: {
      firstName:  user.first_name,
      lastName:   user.last_name,
      email:      user.email,
      phone:      user.phone,
      goal:       user.goal,
      location:   user.location,
      photo:      user.photo ?? null,
      role,
      coachToken,
      userToken,
    },
  });
}
