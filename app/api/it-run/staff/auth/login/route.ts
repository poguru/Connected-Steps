import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyPassword, encodeStaffSession, createStaffSessionCookie, getClientIp } from "@/lib/staff-auth";

// POST /api/it-run/staff/auth/login
// Staff login: email + password → session cookie + JWT
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string; password?: string; eventSlug?: string };
    const { email, password, eventSlug } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    if (!eventSlug) {
      return NextResponse.json({ error: "Event slug required" }, { status: 400 });
    }

    const db = getSupabaseServer();

    // Resolve event
    const { data: event } = await db
      .from("it_run_events")
      .select("id")
      .eq("slug", eventSlug)
      .single<{ id: string }>();

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Fetch staff user
    const { data: staff } = await db
      .from("it_run_staff")
      .select(
        `
        id, email, full_name, role, status, password_hash, password_salt,
        event_id
      `,
      )
      .eq("event_id", event.id)
      .ilike("email", email)
      .maybeSingle<{
        id: string;
        email: string;
        full_name: string;
        role: string;
        status: string;
        password_hash: string;
        password_salt: string;
        event_id: string;
      }>();

    if (!staff) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    if (staff.status !== "active") {
      return NextResponse.json(
        { error: "Staff account is not active" },
        { status: 403 },
      );
    }

    // Verify password
    const salt = Buffer.from(staff.password_salt, "base64");
    if (!verifyPassword(password, staff.password_hash, salt)) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Fetch permissions from role
    const { data: rolePerms } = await db
      .from("it_run_staff_roles")
      .select("permissions")
      .eq("event_id", event.id)
      .eq("role_name", staff.role)
      .maybeSingle<{ permissions: string[] }>();

    const permissions = rolePerms?.permissions ?? [];

    // Create session (8-hour TTL)
    const now = Math.floor(Date.now() / 1000);
    const session = {
      staffId: staff.id,
      email: staff.email,
      fullName: staff.full_name,
      eventId: event.id,
      role: staff.role,
      permissions,
      status: "active" as const,
      exp: now + 8 * 3600,
    };

    // Log login
    db.from("it_run_staff_activity_log")
      .insert({
        event_id: event.id,
        staff_id: staff.id,
        action: "login",
        status: "success",
        ip_address: getClientIp(req),
        user_agent: req.headers.get("user-agent"),
      })
      .then(() => {}, () => {});

    // Update last_login_at
    db.from("it_run_staff")
      .update({
        last_login_at: new Date().toISOString(),
        last_login_ip: getClientIp(req),
      })
      .eq("id", staff.id)
      .then(() => {}, () => {});

    // Create response with session cookie
    const res = NextResponse.json({
      ok: true,
      session: {
        staffId: session.staffId,
        email: session.email,
        fullName: session.fullName,
        role: session.role,
        permissions: session.permissions,
      },
    });

    res.headers.set("Set-Cookie", createStaffSessionCookie(session));

    return res;
  } catch (e: unknown) {
    console.error("[staff/auth/login] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
