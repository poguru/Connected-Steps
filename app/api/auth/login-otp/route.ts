import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { signCoachToken, signUserToken, USER_SESSION_COOKIE, USER_TOKEN_TTL } from "@/lib/admin-auth";

// POST /api/auth/login-otp
// Body: { identifier: string, code: string }
// identifier can be email or phone number
export async function POST(req: NextRequest) {
  try {
    const { identifier, code } = await req.json();

    if (!identifier || !code) {
      return NextResponse.json({ error: "Missing identifier or code." }, { status: 400 });
    }

    const db       = getSupabaseServer();
    const val      = (identifier as string).trim();
    const isEmail  = val.includes("@");
    const type     = isEmail ? "email" : "phone";
    const id       = isEmail ? val.toLowerCase() : val;

    // ── Verify OTP ────────────────────────────────────────────────────────────
    const { data: otp } = await db
      .from("otp_verifications")
      .select("*")
      .eq("identifier", id)
      .eq("type", type)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!otp)                                     return NextResponse.json({ error: "OTP not found. Please request a new one." }, { status: 400 });
    if (otp.verified)                             return NextResponse.json({ error: "OTP already used. Please request a new one." }, { status: 400 });
    if (new Date(otp.expires_at) < new Date())    return NextResponse.json({ error: "OTP has expired. Please request a new one." }, { status: 400 });
    if (otp.code !== String(code).trim())         return NextResponse.json({ error: "Incorrect OTP. Please try again." }, { status: 400 });

    // Mark verified
    await db.from("otp_verifications").update({ verified: true }).eq("id", otp.id);

    // ── Find user ─────────────────────────────────────────────────────────────
    const { data: rows } = isEmail
      ? await db.from("users").select("*").eq("email", id).limit(1)
      : await db.from("users").select("*").eq("phone", id).limit(1);

    const user = rows?.[0] ?? null;
    if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });

    // Consistent with password login — deactivated accounts cannot log in via any method
    if (user.is_active === false) {
      return NextResponse.json({ error: "Your account has been deactivated. Please contact support." }, { status: 403 });
    }

    const role       = user.role ?? "user";
    const coachToken = role === "coach" ? signCoachToken(user.email) : undefined;
    const userToken  = signUserToken(user.email);

    const res = NextResponse.json({
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

    res.cookies.set(USER_SESSION_COOKIE, userToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      path:     "/",
      maxAge:   USER_TOKEN_TTL,
    });

    return res;
  } catch (e: unknown) {
    console.error("[login-otp] unhandled error:", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
