import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

// These fields determine registration logic and public URL routing.
// Changing them would break existing registrations or deep links.
const IMMUTABLE = new Set(["id", "event_id", "slug", "category_type"]);

// Changing these affects live registrations or capacity — require confirm:true
const CRITICAL = new Set(["price_rupees", "max_participants"]);

function sanitize(val: unknown): unknown {
  if (typeof val !== "string") return val;
  return val.replace(/<[^>]*>/g, "").replace(/javascript:/gi, "").trim();
}

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
// Body: { id, confirm?, ...editableFields }
// Slug and category_type are locked — they anchor registration FK lookups and public URLs.
// Price changes never touch historical registrations (base_price/final_price are
// stored per-registration at booking time — they are never recalculated).
export async function PATCH(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const { id, confirm, ...rest } = body;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Category id required" }, { status: 400 });
  }

  // Strip immutable fields
  const editable: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (!IMMUTABLE.has(k)) editable[k] = typeof v === "string" ? sanitize(v) : v;
  }

  if (!Object.keys(editable).length) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const db = getSupabaseServer();

  // Fetch current values — needed for validation, confirmation, and audit
  const { data: current } = await db
    .from("it_run_categories")
    .select("*")
    .eq("id", id)
    .single<Record<string, unknown>>();

  if (!current) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  // Validate: capacity cannot be reduced below current registrations
  if ("max_participants" in editable && editable.max_participants !== null) {
    const newCap = Number(editable.max_participants);
    const curReg = Number(current.current_participants ?? 0);
    if (newCap < curReg) {
      return NextResponse.json(
        { error: `Cannot reduce capacity to ${newCap} — ${curReg} registrations already exist for this category.` },
        { status: 400 },
      );
    }
  }

  // Check which critical fields are changing
  const criticalChanged = Object.keys(editable).filter(k => CRITICAL.has(k) && editable[k] !== current[k]);
  if (criticalChanged.length > 0 && !confirm) {
    const details: Record<string, { old: unknown; new: unknown }> = {};
    for (const k of criticalChanged) details[k] = { old: current[k], new: editable[k] };
    return NextResponse.json(
      { needsConfirm: true, criticalFields: criticalChanged, details },
      { status: 409 },
    );
  }

  // Capture old values for audit
  const oldValues: Record<string, unknown> = {};
  for (const k of Object.keys(editable)) oldValues[k] = current[k] ?? null;

  // Perform the update
  const { data: updated, error } = await db
    .from("it_run_categories")
    .update(editable)
    .eq("id", id)
    .select("id, name, event_id")
    .single<{ id: string; name: string; event_id: string }>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  db.from("it_run_audit_logs").insert({
    event_id:    updated?.event_id ?? null,
    actor_email: session.email,
    actor_role:  session.role,
    action:      "update_category",
    entity_type: "category",
    entity_id:   id,
    detail: {
      name:           updated?.name,
      updated_fields: Object.keys(editable),
      old_values:     oldValues,
      new_values:     editable,
    },
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true });
}
