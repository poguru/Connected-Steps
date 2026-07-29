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
      id, role, is_active, created_at, notes, shift_start, shift_end,
      event_portal_users ( id, email, name, is_active, phone )
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
// Body A: { assignment_id, new_role }                       — change role
// Body B: { assignment_id, notes?, shift_start?, shift_end? } — update shift/notes
export async function PUT(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const adminEmail = getAdminEmail(req) ?? "admin";
  const body = await req.json().catch(() => ({})) as {
    assignment_id?: string;
    new_role?: string;
    notes?: string | null;
    shift_start?: string | null;
    shift_end?: string | null;
  };
  const { assignment_id } = body;

  if (!assignment_id)
    return NextResponse.json({ error: "assignment_id is required" }, { status: 400 });

  const db = getSupabaseServer();

  // ── Path B: notes / shift update ─────────────────────────────────────────
  if (body.new_role === undefined && (body.notes !== undefined || body.shift_start !== undefined || body.shift_end !== undefined)) {
    const patch: Record<string, unknown> = {};
    if (body.notes       !== undefined) patch.notes       = body.notes       ?? null;
    if (body.shift_start !== undefined) patch.shift_start = body.shift_start ?? null;
    if (body.shift_end   !== undefined) patch.shift_end   = body.shift_end   ?? null;

    const { error: patchErr } = await db
      .from("event_portal_assignments")
      .update(patch)
      .eq("id", assignment_id)
      .eq("event_id", eventId);

    if (patchErr) return NextResponse.json({ error: patchErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── Path A: role change ───────────────────────────────────────────────────
  const { new_role } = body;
  if (!new_role)
    return NextResponse.json({ error: "new_role is required for a role change" }, { status: 400 });
  if (!Object.keys(OPS_ROLE_LABELS).includes(new_role))
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });

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

  await db.from("audit_logs").insert({
    action:      "portal_role_change",
    actor_email: adminEmail,
    target:      userEmail,
    detail: { assignment_id, event_id: eventId, old_role: oldRole, new_role, user_email: userEmail },
  });

  return NextResponse.json({ ok: true });
}

// PATCH /api/admin/events/[id]/portal-users
// Body A: { portal_user_id, password } — reset password
// Body B: { portal_user_id, phone }    — update phone number
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await params; // consume params
  const body = await req.json().catch(() => ({})) as {
    portal_user_id?: string;
    password?: string;
    phone?: string | null;
  };

  if (!body.portal_user_id)
    return NextResponse.json({ error: "portal_user_id is required" }, { status: 400 });

  const db = getSupabaseServer();

  // Path B: phone update
  if (body.phone !== undefined) {
    const { error } = await db
      .from("event_portal_users")
      .update({ phone: body.phone ?? null })
      .eq("id", body.portal_user_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Path A: password reset
  if (!body.password || body.password.length < 8) {
    return NextResponse.json({ error: "password (min 8 chars) or phone is required" }, { status: 400 });
  }
  const password_hash = await bcrypt.hash(body.password, 10);
  const { error } = await db
    .from("event_portal_users")
    .update({ password_hash })
    .eq("id", body.portal_user_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
