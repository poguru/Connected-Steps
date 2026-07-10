import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseServer } from "@/lib/supabase-server";
import { signCoachToken, signUserToken } from "@/lib/admin-auth";
import { isRateLimited, recordFailure, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // Parse body first so identifier is available for the per-account rate-limit key.
  const body       = await req.json().catch(() => ({})) as Record<string, unknown>;
  const identifier = body.identifier as string | undefined;
  const password   = body.password   as string | undefined;

  const ip  = getClientIp(req);
  // Per-account key prevents one account's failures from blocking another account.
  const key = `login:${ip}:${String(identifier ?? "").toLowerCase().trim()}`;

  if (await isRateLimited(key)) {
    return NextResponse.json(
      { error: "Too many failed login attempts. Please try again in 15 minutes." },
      { status: 429, headers: { "Retry-After": "900" } }
    );
  }

  if (!identifier || !password) {
    return NextResponse.json({ error: "Please enter your email or phone number and password." }, { status: 400 });
  }

  const supabaseServer = getSupabaseServer();

  const val = identifier.trim();

  // Try phone first (primary identity), then email as fallback.
  // Phone: accept raw 10-digit or +91/91 prefix.
  const phoneDigits = val.replace(/\D/g, "");
  const phone10 = phoneDigits.length === 12 && phoneDigits.startsWith("91")
    ? phoneDigits.slice(2)
    : phoneDigits.length === 13 && phoneDigits.startsWith("091")
      ? phoneDigits.slice(3)
      : phoneDigits;
  const byPhone = phone10.length === 10
    ? await supabaseServer.from("users").select("*").eq("phone", phone10).limit(1)
    : { data: [] };
  const byEmail = await supabaseServer.from("users").select("*").eq("email", val.toLowerCase()).limit(1);
  const user = byPhone.data?.[0] ?? byEmail.data?.[0] ?? null;

  if (!user) {
    await recordFailure(key);
    return NextResponse.json({ error: "Invalid credentials. Please check and try again." }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    await recordFailure(key);
    return NextResponse.json({ error: "Invalid credentials. Please check and try again." }, { status: 401 });
  }

  if (user.is_active === false) {
    return NextResponse.json({ error: "Your account has been deactivated. Please contact support." }, { status: 403 });
  }

  const role       = user.role ?? "user";
  const coachToken = role === "coach" ? signCoachToken(user.email) : undefined;
  const userToken  = signUserToken(user.email);

  // phone_verified may be null on old rows before the migration runs.
  const phoneVerified = user.phone_verified ?? false;
  // Prompt the user to verify their phone if they don't have one verified yet.
  // We do NOT block login — existing users must not be locked out.
  const requiresPhoneVerification = !phoneVerified;

  return NextResponse.json({
    success: true,
    requiresPhoneVerification,
    user: {
      firstName:     user.first_name,
      lastName:      user.last_name,
      email:         user.email,
      phone:         user.phone,
      goal:          user.goal,
      location:      user.location,
      photo:         user.photo ?? null,
      role,
      phone_verified: phoneVerified,
      coachToken,
      userToken,
    },
  });
}
