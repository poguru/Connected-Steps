import { NextRequest, NextResponse } from "next/server";
import { signAdminSession, verifyAdminSession, ADMIN_SESSION_COOKIE } from "@/lib/admin-auth";

const COOKIE_OPTS = {
  httpOnly:  true,
  secure:    process.env.NODE_ENV === "production",
  sameSite:  "lax" as const,
  path:      "/",
  maxAge:    8 * 60 * 60, // 8 hours
};

// GET — check whether a valid admin session cookie exists
export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (token && verifyAdminSession(token)) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false }, { status: 401 });
}

// POST — validate password, issue httpOnly session cookie
export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
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
