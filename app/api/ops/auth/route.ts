import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  signOpsSession,
  getOpsSession,
  OPS_SESSION_COOKIE,
  ROLE_PRIORITY,
  type OpsRole,
} from "@/lib/ops-auth";
import { isRateLimited, recordFailure, getClientIp } from "@/lib/rate-limit";

// POST /api/ops/auth
// Body: { email, password, event_id }
// Sets ops_session httpOnly cookie on success.
export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string; event_id?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { email, password, event_id } = body;
  if (!email || !password || !event_id) {
    return NextResponse.json({ error: "email, password and event_id are required" }, { status: 400 });
  }

  // Brute-force protection: 5 failures per 15 minutes per IP + email combo
  const ip      = getClientIp(req);
  const rlKey   = `ops-auth:${ip}:${email.toLowerCase().trim()}`;
  const blocked = await isRateLimited(rlKey);
  if (blocked) {
    return NextResponse.json(
      { error: "Too many failed login attempts. Please try again in 15 minutes." },
      { status: 429 }
    );
  }

  const db = getSupabaseServer();

  const { data: user } = await db
    .from("event_portal_users")
    .select("id, email, name, password_hash, is_active")
    .eq("email", email.toLowerCase().trim())
    .single<{ id: string; email: string; name: string; password_hash: string; is_active: boolean }>();

  if (!user || !user.is_active) {
    await recordFailure(rlKey);
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) {
    await recordFailure(rlKey);
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

  // Pick highest-priority role when user has multiple assignments for this event
  const assignedRoles = assignments.map(a => a.role);
  const role = (
    ROLE_PRIORITY.find(r => assignedRoles.includes(r)) ?? assignedRoles[0]
  ) as OpsRole;

  const token = signOpsSession({ uid: user.id, eid: event_id, role, em: user.email, nm: user.name });

  const res = NextResponse.json({ success: true, role, name: user.name, email: user.email });
  res.cookies.set(OPS_SESSION_COOKIE, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   12 * 60 * 60,
    path:     "/",
  });
  return res;
}

// DELETE /api/ops/auth — logout
export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(OPS_SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}

// GET /api/ops/auth — return current session data (used by portal pages on mount)
export async function GET(req: NextRequest) {
  const session = getOpsSession(req);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json({
    uid:   session.uid,
    eid:   session.eid,
    role:  session.role,
    email: session.em,
    name:  session.nm,
  });
}
