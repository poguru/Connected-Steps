import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

// GET /api/it-run/admin/event-settings
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data: event, error } = await db
    .from("it_run_events")
    .select("*")
    .eq("slug", "sprint-2")
    .single();

  if (error || !event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  return NextResponse.json({ event });
}

// PATCH /api/it-run/admin/event-settings
// Slug is NOT editable — it anchors public URLs and participant QR tokens.
export async function PATCH(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  // Strip immutable fields
  const { id: _id, slug: _slug, created_at: _ca, ...editable } = body;
  void _id; void _slug; void _ca;

  if (!Object.keys(editable).length) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { data: ev, error } = await db
    .from("it_run_events")
    .update(editable)
    .eq("slug", "sprint-2")
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  db.from("it_run_audit_logs").insert({
    event_id:    ev?.id ?? null,
    actor_email: session.email,
    actor_role:  session.role,
    action:      "update_event",
    entity_type: "event",
    entity_id:   "sprint-2",
    detail:      { updated_fields: Object.keys(editable) },
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true });
}
