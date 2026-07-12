import { NextResponse } from "next/server";
import { USER_SESSION_COOKIE } from "@/lib/admin-auth";

/**
 * POST /api/auth/logout
 *
 * Clears the httpOnly session cookie. Called by logout handlers so the
 * cookie (which JS cannot touch directly) is properly removed server-side.
 */
export async function POST() {
  const res = NextResponse.json({ success: true });

  res.cookies.set(USER_SESSION_COOKIE, "", {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   0,
  });

  // Also clear the legacy non-httpOnly cookie if present
  res.cookies.set("cs_auth", "", {
    httpOnly: false,
    sameSite: "lax",
    path:     "/",
    maxAge:   0,
  });

  return res;
}
