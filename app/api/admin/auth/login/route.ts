import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseServer } from "@/lib/supabase-server";
import { signCoachToken, COOKIE_NAME } from "@/lib/admin-auth";
import { getClientIp, isRateLimited, recordFailure, MAX_FAILURES } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    // Rate limit by IP before touching the database or running bcrypt.
    const ip  = getClientIp(req);
    const key = `coachlogin:${ip}`;

    if (await isRateLimited(key)) {
      console.warn(`[rate-limit] BLOCKED IP=${ip} — exceeded ${MAX_FAILURES} failed coach-login attempts`);
      return NextResponse.json(
        { error: "Too many failed attempts. Try again in 15 minutes." },
        { status: 429 },
      );
    }

    const db = getSupabaseServer();

    // Must be a registered user with role = 'coach'
    const { data: user } = await db
      .from("users")
      .select("email, password, role")
      .eq("email", email.toLowerCase().trim())
      .eq("role", "coach")
      .single();

    if (!user) {
      const count = await recordFailure(key);
      console.warn(`[rate-limit] FAILED coach-login (unknown email) IP=${ip} attempt=${count}/${MAX_FAILURES}`);
      return NextResponse.json({ error: "No coach account found for this email." }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      const count = await recordFailure(key);
      console.warn(`[rate-limit] FAILED coach-login email=${user.email} IP=${ip} attempt=${count}/${MAX_FAILURES}`);
      return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
    }

    const token = signCoachToken(user.email);

    const res = NextResponse.json({ ok: true, email: user.email });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   60 * 60 * 24 * 30, // 30 days
      path:     "/",
    });
    return res;
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
