import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-auth";

// POST /api/admin/auth/logout — clear the admin session cookie
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
