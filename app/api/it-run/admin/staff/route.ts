import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, hashPassword, PORTAL_ROLES } from "@/lib/it-run-auth";
import type { PortalRole } from "@/lib/it-run-auth";

// GET /api/it-run/admin/staff
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data: staff, error } = await db
    .from("it_run_portal_users")
    .select("id, email, name, role, is_active, created_at")
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ staff });
}

// POST /api/it-run/admin/staff — create portal user
export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email, name, role, password } = await req.json() as {
    email: string; name: string; role: PortalRole; password: string;
  };

  if (!email || !name || !role || !password) {
    return NextResponse.json({ error: "email, name, role and password are required" }, { status: 400 });
  }
  if (!(PORTAL_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { error } = await db.from("it_run_portal_users").insert({
    email:         email.toLowerCase().trim(),
    name:          name.trim(),
    role,
    password_hash: hashPassword(password),
    is_active:     true,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  db.from("it_run_audit_logs").insert({
    actor_email: session.email,
    actor_role:  session.role,
    action:      "create_staff",
    entity_type: "staff",
    entity_id:   email.toLowerCase().trim(),
    detail:      { name, role },
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true });
}

// PATCH /api/it-run/admin/staff — update portal user
// Body: { id, name?, role?, is_active?, password? }
export async function PATCH(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, name, role, is_active, password } = await req.json() as {
    id: string; name?: string; role?: PortalRole;
    is_active?: boolean; password?: string;
  };

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = getSupabaseServer();

  // Safety: admin cannot deactivate their own account
  const { data: target } = await db
    .from("it_run_portal_users")
    .select("email")
    .eq("id", id)
    .single<{ email: string }>();

  if (target?.email.toLowerCase() === session.email.toLowerCase() && is_active === false) {
    return NextResponse.json({ error: "Cannot deactivate your own account" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (name      !== undefined) updates.name      = name.trim();
  if (is_active !== undefined) updates.is_active = is_active;
  if (role      !== undefined) {
    if (!(PORTAL_ROLES as readonly string[]).includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    updates.role = role;
  }
  if (password !== undefined) {
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    updates.password_hash = hashPassword(password);
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { error } = await db.from("it_run_portal_users").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const action = password !== undefined ? "reset_staff_password"
    : is_active === false ? "deactivate_staff"
    : is_active === true  ? "activate_staff"
    : "update_staff";

  db.from("it_run_audit_logs").insert({
    actor_email: session.email,
    actor_role:  session.role,
    action,
    entity_type: "staff",
    entity_id:   id,
    detail:      { updated_fields: Object.keys(updates).filter(k => k !== "password_hash") },
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true });
}
