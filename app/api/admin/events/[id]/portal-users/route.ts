import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach, getAdminEmail } from "@/lib/admin-auth";
import bcrypt from "bcryptjs";
import type { OpsRole } from "@/lib/ops-auth";
import { OPS_ROLE_LABELS } from "@/lib/ops-auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/events/[id]/portal-users
// Returns all portal users who have an assignment for this event.
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const db = getSupabaseServer();

  const { data: assignments, error } = await db
    .from("event_portal_assignments")
    .select(`
      id, role, is_active, created_at,
      event_portal_users ( id, email, name, is_active )
    `)
    .eq("event_id", eventId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ assignments: assignments ?? [] });
}

// POST /api/admin/events/[id]/portal-users
// Body: { email, name, password?, role }
// Creates a new portal user (if not exists) and assigns them to this event.
export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const body = await req.json().catch(() => ({})) as {
    email?: string; name?: string; password?: string; role?: string;
  };

  const email = body.email?.toLowerCase().trim();
  const name  = body.name?.trim();
  const role  = body.role as OpsRole | undefined;

  if (!email || !name || !role) {
    return NextResponse.json({ error: "email, name, and role are required" }, { status: 400 });
  }
  if (!Object.keys(OPS_ROLE_LABELS).includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const db = getSupabaseServer();

  // Find or create portal user
  let { data: user } = await db
    .from("event_portal_users")
    .select("id, email, name, is_active")
    .eq("email", email)
    .maybeSingle();

  if (!user) {
    if (!body.password || body.password.length < 8) {
      return NextResponse.json({ error: "Password (min 8 chars) is required for new users" }, { status: 400 });
    }
    const password_hash = await bcrypt.hash(body.password, 10);
    const { data: created, error: createErr } = await db
      .from("event_portal_users")
      .insert({ email, name, password_hash, is_active: true })
      .select("id, email, name, is_active")
      .single();
    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 });
    user = created;
  }

  // Check for existing active assignment with this role
  const { data: existing } = await db
    .from("event_portal_assignments")
    .select("id")
    .eq("portal_user_id", user!.id)
    .eq("event_id", eventId)
    .eq("role", role)
    .maybeSingle();

  if (existing) {
    // Re-activate if it was deactivated
    await db.from("event_portal_assignments").update({ is_active: true }).eq("id", existing.id);
    return NextResponse.json({ ok: true, user, assignment_id: existing.id });
  }

  const { data: assignment, error: assignErr } = await db
    .from("event_portal_assignments")
    .insert({ portal_user_id: user!.id, event_id: eventId, role, is_active: true })
    .select("id")
    .single();

  if (assignErr) return NextResponse.json({ error: assignErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, user, assignment_id: assignment.id });
}

// DELETE /api/admin/events/[id]/portal-users?assignment_id=...
// Removes (deactivates) an assignment.
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const assignmentId = req.nextUrl.searchParams.get("assignment_id");
  if (!assignmentId) return NextResponse.json({ error: "assignment_id required" }, { status: 400 });

  const db = getSupabaseServer();
  const { error } = await db
    .from("event_portal_assignments")
    .update({ is_active: false })
    .eq("id", assignmentId)
    .eq("event_id", eventId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// PUT /api/admin/events/[id]/portal-users
// Body: { assignment_id, new_role } — change the role on an existing assignment
export async function PUT(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const adminEmail = getAdminEmail(req) ?? "admin";
  const body = await req.json().catch(() => ({})) as { assignment_id?: string; new_role?: string };
  const { assignment_id, new_role } = body;

  if (!assignment_id || !new_role)
    return NextResponse.json({ error: "assignment_id and new_role are required" }, { status: 400 });
  if (!Object.keys(OPS_ROLE_LABELS).includes(new_role))
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const db = getSupabaseServer();

  // Fetch current assignment to compare and audit
  const { data: current, error: fetchErr } = await db
    .from("event_portal_assignments")
    .select("id, role, portal_user_id, event_portal_users(email, name)")
    .eq("id", assignment_id)
    .eq("event_id", eventId)
    .eq("is_active", true)
    .maybeSingle();

  if (fetchErr || !current)
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });

  const oldRole   = current.role as string;
  const userEmail = (current.event_portal_users as unknown as { email: string } | null)?.email ?? "unknown";

  if (oldRole === new_role)
    return NextResponse.json({ ok: true, message: "No change" });

  // Prevent duplicate role on the same user+event
  const { data: dup } = await db
    .from("event_portal_assignments")
    .select("id")
    .eq("portal_user_id", current.portal_user_id as string)
    .eq("event_id", eventId)
    .eq("role", new_role)
    .eq("is_active", true)
    .neq("id", assignment_id)
    .maybeSingle();

  if (dup)
    return NextResponse.json({ error: "This user already has that role for this event" }, { status: 409 });

  const { error: updateErr } = await db
    .from("event_portal_assignments")
    .update({ role: new_role })
    .eq("id", assignment_id)
    .eq("event_id", eventId);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Audit trail
  await db.from("audit_logs").insert({
    action:      "portal_role_change",
    actor_email: adminEmail,
    target:      userEmail,
    detail: {
      assignment_id,
      event_id:   eventId,
      old_role:   oldRole,
      new_role,
      user_email: userEmail,
    },
  });

  return NextResponse.json({ ok: true });
}

// PATCH /api/admin/events/[id]/portal-users
// Body: { portal_user_id, password } — reset password for a portal user
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await params; // consume params
  const body = await req.json().catch(() => ({})) as { portal_user_id?: string; password?: string };
  if (!body.portal_user_id || !body.password || body.password.length < 8) {
    return NextResponse.json({ error: "portal_user_id and password (min 8 chars) are required" }, { status: 400 });
  }

  const db = getSupabaseServer();
  const password_hash = await bcrypt.hash(body.password, 10);
  const { error } = await db
    .from("event_portal_users")
    .update({ password_hash })
    .eq("id", body.portal_user_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
