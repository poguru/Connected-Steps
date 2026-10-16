import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, getClientIp } from "@/lib/it-run-auth";
import { normalizeCounterLabel } from "@/lib/it-run-bib-counters";

// GET /api/it-run/admin/bib-counters
// Event admins see every counter. Collection staff see only the enabled ones, to choose from at the desk.
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "bib_collection"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").single<{ id: string }>();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  let query = db
    .from("it_run_bib_counters")
    .select("id, label, is_enabled, sort_order")
    .eq("event_id", event.id)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (session.role !== "event_admin") query = query.eq("is_enabled", true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ counters: data ?? [] });
}

// POST /api/it-run/admin/bib-counters — create a counter. Body: { label }
export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { label?: unknown };
  const label = normalizeCounterLabel(body.label);
  if (!label.ok) return NextResponse.json({ error: label.message }, { status: 400 });

  const db = getSupabaseServer();
  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").single<{ id: string }>();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data: created, error } = await db
    .from("it_run_bib_counters")
    .insert({ event_id: event.id, label: label.label })
    .select("id, label, is_enabled, sort_order")
    .single();
  if (error?.code === "23505") {
    return NextResponse.json({ error: "A counter with this label already exists." }, { status: 409 });
  }
  if (error || !created) return NextResponse.json({ error: "Could not create the counter" }, { status: 500 });

  db.from("it_run_audit_logs").insert({
    event_id: event.id, actor_email: session.email, actor_role: session.role,
    action: "bib_counter_created", entity_type: "bib_counter", entity_id: created.id,
    ip: getClientIp(req), detail: { label: label.label },
  }).then(() => {}, () => {});

  return NextResponse.json({ counter: created });
}

// PATCH /api/it-run/admin/bib-counters — rename or enable/disable. Body: { id, label?, is_enabled? }
export async function PATCH(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { id?: unknown; label?: unknown; is_enabled?: unknown };
  if (typeof body.id !== "string" || body.id.length === 0) {
    return NextResponse.json({ error: "Counter id is required" }, { status: 400 });
  }

  const changes: { label?: string; is_enabled?: boolean; updated_at: string } = { updated_at: new Date().toISOString() };
  if (body.label !== undefined) {
    const label = normalizeCounterLabel(body.label);
    if (!label.ok) return NextResponse.json({ error: label.message }, { status: 400 });
    changes.label = label.label;
  }
  if (body.is_enabled !== undefined) {
    if (typeof body.is_enabled !== "boolean") return NextResponse.json({ error: "is_enabled must be true or false" }, { status: 400 });
    changes.is_enabled = body.is_enabled;
  }
  if (changes.label === undefined && changes.is_enabled === undefined) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").single<{ id: string }>();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data: updated, error } = await db
    .from("it_run_bib_counters")
    .update(changes)
    .eq("id", body.id)
    .eq("event_id", event.id)
    .select("id, label, is_enabled, sort_order")
    .maybeSingle();
  if (error?.code === "23505") {
    return NextResponse.json({ error: "A counter with this label already exists." }, { status: 409 });
  }
  if (error) return NextResponse.json({ error: "Could not update the counter" }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Counter not found" }, { status: 404 });

  db.from("it_run_audit_logs").insert({
    event_id: event.id, actor_email: session.email, actor_role: session.role,
    action: changes.is_enabled !== undefined ? (changes.is_enabled ? "bib_counter_enabled" : "bib_counter_disabled") : "bib_counter_renamed",
    entity_type: "bib_counter", entity_id: body.id, ip: getClientIp(req),
    detail: { label: updated.label, is_enabled: updated.is_enabled },
  }).then(() => {}, () => {});

  return NextResponse.json({ counter: updated });
}
