import { NextRequest, NextResponse } from "next/server";
import { verifyUserToken } from "@/lib/admin-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * GET /api/auth/me
 *
 * Returns the authenticated user's profile. Used by NativeShell to validate a
 * cookie-only session without reading the httpOnly cookie from client JS.
 *
 * The middleware injects cs_user_session as x-user-token before this handler
 * runs, so standard verifyUserToken() works here without any special handling.
 */
export async function GET(req: NextRequest) {
  const token = req.headers.get("x-user-token");
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const email = verifyUserToken(token);
  if (!email) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  const db = getSupabaseServer();
  const { data: user } = await db
    .from("users")
    .select("first_name, last_name, email, phone, goal, location, photo, role, is_active")
    .eq("email", email)
    .maybeSingle();

  if (!user || user.is_active === false) {
    return NextResponse.json({ error: "Account not found or deactivated" }, { status: 401 });
  }

  return NextResponse.json({
    email:     user.email,
    firstName: user.first_name,
    lastName:  user.last_name,
    phone:     user.phone,
    goal:      user.goal,
    location:  user.location,
    photo:     user.photo ?? null,
    role:      user.role ?? "user",
  });
}
