import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  signOpsSession,
  OPS_SESSION_COOKIE,
  ROLE_PRIORITY,
  type OpsRole,
} from "@/lib/ops-auth";

/**
 * POST /api/ops/auth/mobile
 * Mobile-specific ops auth — identical validation to /api/ops/auth but returns
 * the signed token in the response body (React Native cannot read httpOnly cookies).
 * Also sets the cookie for browser compatibility.
 * Body: { email, password, event_id }
 */
export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string; event_id?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { email, password, event_id } = body;
  if (!email || !password || !event_id) {
    return NextResponse.json({ error: "email, password and event_id are required" }, { status: 400 });
  }

  const db = getSupabaseServer();

  const { data: user } = await db
    .from("event_portal_users")
    .select("id, email, name, password_hash, is_active")
    .eq("email", email.toLowerCase().trim())
    .single<{ id: string; email: string; name: string; password_hash: string; is_active: boolean }>();

  if (!user || !user.is_active) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const { data: assignments } = await db
    .from("event_portal_assignments")
    .select("role")
    .eq("portal_user_id", user.id)
    .eq("event_id", event_id)
    .eq("is_active", true)
    .returns<{ role: string }[]>();

  if (!assignments || assignments.length === 0) {
    return NextResponse.json({ error: "You are not assigned to this event" }, { status: 403 });
  }

  const assignedRoles = assignments.map(a => a.role);
  const role = (
    ROLE_PRIORITY.find(r => assignedRoles.includes(r)) ?? assignedRoles[0]
  ) as OpsRole;

  const token     = signOpsSession({ uid: user.id, eid: event_id, role, em: user.email, nm: user.name });
  const expiresAt = Math.floor(Date.now() / 1000) + 12 * 60 * 60;

  const res = NextResponse.json({
    success:    true,
    token,         // returned in body so mobile can store it in SecureStore
    expires_at: expiresAt,
    role,
    name:  user.name,
    email: user.email,
  });

  // Also set cookie for browser callers
  res.cookies.set(OPS_SESSION_COOKIE, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   12 * 60 * 60,
    path:     "/",
  });

  return res;
}
