import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { signAdminSession, verifyAdminSession, ADMIN_SESSION_COOKIE } from "@/lib/admin-auth";
import { isRateLimited, recordFailure, getClientIp } from "@/lib/rate-limit";

const COOKIE_OPTS = {
  httpOnly:  true,
  secure:    process.env.NODE_ENV === "production",
  sameSite:  "lax" as const,
  path:      "/",
  maxAge:    30 * 24 * 60 * 60, // 30 days — prevents silent expiry mid-session
};

// GET — check whether a valid admin session cookie exists.
// Also re-issues a fresh cookie on each valid call (sliding session window)
// so the 30-day TTL is reset every time the admin loads an admin page,
// preventing silent expiry during normal daily use.
export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (token && verifyAdminSession(token)) {
    const res = NextResponse.json({ ok: true });
    // Sliding window: re-issue a fresh 30-day token on every valid auth check
    res.cookies.set(ADMIN_SESSION_COOKIE, signAdminSession(), COOKIE_OPTS);
    return res;
  }
  return NextResponse.json({ ok: false }, { status: 401 });
}

// POST — validate email+password, issue httpOnly session cookie
export async function POST(req: NextRequest) {
  const ip  = getClientIp(req);
  const key = `admin-login:${ip}`;

  if (await isRateLimited(key)) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again in 15 minutes." },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  try {
    const { email, password } = await req.json();

    const adminPw    = process.env.ADMIN_PASSWORD ?? "";
    const adminEmail = process.env.ADMIN_EMAIL;

    // Timing-safe password comparison — always compare same-length buffers
    const validPw = adminPw.length > 0 &&
      password?.length === adminPw.length &&
      crypto.timingSafeEqual(Buffer.from(password as string), Buffer.from(adminPw));

    if (!validPw) {
      await recordFailure(key);
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // If ADMIN_EMAIL is configured, require it to match
    if (adminEmail && (!email || (email as string).toLowerCase().trim() !== adminEmail.toLowerCase())) {
      await recordFailure(key);
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = signAdminSession();
    const res   = NextResponse.json({ ok: true });
    res.cookies.set(ADMIN_SESSION_COOKIE, token, COOKIE_OPTS);
    return res;
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE — clear the admin session cookie (logout)
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ADMIN_SESSION_COOKIE);
  return res;
}
