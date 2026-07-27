import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  signOrgMemberSession, ORG_SESSION_COOKIE, verifyOrgMemberSession,
  type OrgRole,
} from "@/lib/org-auth";
import { getClientIp, isRateLimited, recordFailure, MAX_FAILURES } from "@/lib/rate-limit";

/**
 * POST — org member login.
 * Body: { email, password, org_id }
 * On success: sets cs_org_session cookie and returns { ok, email, org_id, role }.
 */
export async function POST(req: NextRequest) {
  try {
    const { email, password, org_id } = await req.json();
    if (!email || !password || !org_id) {
      return NextResponse.json({ error: "email, password, and org_id are required" }, { status: 400 });
    }

    const ip  = getClientIp(req);
    const key = `orglogin:${ip}`;

    if (await isRateLimited(key)) {
      return NextResponse.json(
        { error: "Too many failed attempts. Try again in 15 minutes." },
        { status: 429 },
      );
    }

    const db = getSupabaseServer();

    // Verify user credentials (users table, bcrypt password)
    const { data: user } = await db
      .from("users")
      .select("email, password")
      .eq("email", email.toLowerCase().trim())
      .single();

    if (!user?.password) {
      await recordFailure(key);
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      const count = await recordFailure(key);
      console.warn(`[org-auth] FAILED login email=${user.email} IP=${ip} attempt=${count}/${MAX_FAILURES}`);
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Verify membership in the requested org
    const { data: member } = await db
      .from("organization_members")
      .select("role, is_active")
      .eq("organization_id", org_id)
      .eq("user_email", user.email)
      .single();

    if (!member?.is_active) {
      return NextResponse.json({ error: "No active membership in this organization" }, { status: 403 });
    }

    // Verify org itself is active
    const { data: org } = await db
      .from("organizations")
      .select("name, is_active")
      .eq("id", org_id)
      .single();

    if (!org?.is_active) {
      return NextResponse.json({ error: "Organization is inactive" }, { status: 403 });
    }

    const token = signOrgMemberSession(user.email, org_id, member.role as OrgRole);

    const res = NextResponse.json({
      ok:     true,
      email:  user.email,
      org_id,
      role:   member.role,
      org_name: org.name,
    });

    res.cookies.set(ORG_SESSION_COOKIE, token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   60 * 60 * 24 * 30,
      path:     "/",
    });

    return res;
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** DELETE — org member logout. Clears cs_org_session cookie. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ORG_SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}

/** GET — verify org session, returns current context. */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(ORG_SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ authenticated: false }, { status: 401 });

  const session = verifyOrgMemberSession(token);
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 });

  // Verify membership still active
  const db = getSupabaseServer();
  const [memberRes, orgRes] = await Promise.all([
    db.from("organization_members")
      .select("role, is_active")
      .eq("organization_id", session.org_id)
      .eq("user_email", session.email)
      .single(),
    db.from("organizations")
      .select("id, name, slug, logo_url, primary_color, plan")
      .eq("id", session.org_id)
      .single(),
  ]);

  if (!memberRes.data?.is_active) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    email:         session.email,
    org_id:        session.org_id,
    role:          memberRes.data.role,
    org:           orgRes.data,
  });
}
