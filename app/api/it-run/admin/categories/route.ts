import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

// GET /api/it-run/admin/categories
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data: event } = await db
    .from("it_run_events")
    .select("id")
    .eq("slug", "sprint-2")
    .single();

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data: categories, error } = await db
    .from("it_run_categories")
    .select("*")
    .eq("event_id", event.id)
    .order("sort_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ categories });
}

// PATCH /api/it-run/admin/categories
// Body: { id, ...fields }
// Protected fields: id, event_id, slug, category_type are NOT editable.
// Slug and category_type determine registration logic; changing them would break existing registrations.
export async function PATCH(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const { id } = body;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Category id required" }, { status: 400 });
  }

  const { id: _id, event_id: _eid, slug: _slug, category_type: _ct, ...editable } = body;
  void _id; void _eid; void _slug; void _ct;

  if (!Object.keys(editable).length) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { data: cat, error } = await db
    .from("it_run_categories")
    .update(editable)
    .eq("id", id)
    .select("id, name")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  db.from("it_run_audit_logs").insert({
    actor_email: session.email,
    actor_role:  session.role,
    action:      "update_category",
    entity_type: "category",
    entity_id:   id,
    detail:      { name: cat?.name, updated_fields: Object.keys(editable) },
  }).then(() => {}).catch(() => {});

  return NextResponse.json({ ok: true });
}
