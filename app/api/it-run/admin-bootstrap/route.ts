/**
 * ONE-TIME admin bootstrap — bypasses password, issues a session directly.
 * Visit /it-run/admin/bootstrap in the browser to use the form.
 * DELETE THIS FILE after logging in and setting your password via the staff page.
 */
import { NextRequest, NextResponse }                               from "next/server";
import { signPortalSession, hashPassword, PORTAL_SESSION_COOKIE } from "@/lib/it-run-auth";
import { getSupabaseServer }                                       from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const { bootstrapKey, email, name, password } = await req.json() as {
      bootstrapKey: string;
      email:        string;
      name:         string;
      password:     string;
    };

    const expectedKey = process.env.COACH_TOKEN_SECRET ?? process.env.ADMIN_PASSWORD;
    if (!expectedKey || bootstrapKey !== expectedKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!email || !name || !password) {
      return NextResponse.json({ error: "email, name, password required" }, { status: 400 });
    }

    const db = getSupabaseServer();

    // Store a fresh hash using the server's own SECRET() so login works going forward
    const passwordHash = hashPassword(password);
    const { error: upsertErr } = await db
      .from("it_run_portal_users")
      .upsert(
        { email: email.toLowerCase().trim(), name, role: "super_admin", password_hash: passwordHash, is_active: true },
        { onConflict: "email" },
      );
    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    // Issue a session cookie so the browser is logged in immediately
    const token = signPortalSession(email.toLowerCase().trim(), "super_admin");
    const res   = NextResponse.json({ ok: true, redirect: "/it-run/admin" });
    res.cookies.set(PORTAL_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path:     "/",
      maxAge:   8 * 60 * 60,
      secure:   true,
    });
    return res;
  } catch (e: unknown) {
    console.error("[admin-bootstrap] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
