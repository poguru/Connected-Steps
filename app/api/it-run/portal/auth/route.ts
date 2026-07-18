import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { signPortalSession, verifyPassword, verifyPortalSession, PORTAL_SESSION_COOKIE, type PortalRole } from "@/lib/it-run-auth";

// POST /api/it-run/portal/auth  — login
// DELETE /api/it-run/portal/auth — logout
export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json() as { email: string; password: string };
    if (!email || !password) return NextResponse.json({ error: "Email and password required" }, { status: 400 });

    const db = getSupabaseServer();

    const { data: user } = await db
      .from("it_run_portal_users")
      .select("id,email,name,role,password_hash,is_active")
      .ilike("email", email.trim())
      .single<{ id: string; email: string; name: string; role: PortalRole; password_hash: string; is_active: boolean }>();

    if (!user || !user.is_active) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    if (!verifyPassword(password, user.password_hash)) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = signPortalSession(user.email, user.role);
    const res   = NextResponse.json({ ok: true, name: user.name, role: user.role });
    res.cookies.set(PORTAL_SESSION_COOKIE, token, {
      httpOnly:  true,
      sameSite:  "lax",
      path:      "/",
      maxAge:    8 * 60 * 60,
      secure:    process.env.NODE_ENV === "production",
    });
    return res;
  } catch (e: unknown) {
    console.error("[it-run/portal/auth] login error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// GET /api/it-run/portal/auth — return current session info (for admin layout)
export async function GET(req: NextRequest) {
  const session = verifyPortalSession(req.cookies.get(PORTAL_SESSION_COOKIE)?.value ?? "");
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({ authenticated: true, email: session.email, role: session.role, name: session.email.split("@")[0] });
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PORTAL_SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
