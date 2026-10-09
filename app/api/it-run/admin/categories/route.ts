import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, getClientIp } from "@/lib/it-run-auth";

// These fields determine registration logic and public URL routing.
// Changing them would break existing registrations or deep links.
// live_registered_count is server-computed — never written to DB.
const IMMUTABLE = new Set(["id", "event_id", "slug", "category_type", "live_registered_count"]);

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

  if (error) return NextResponse.json({ error: "Could not load categories. Please try again." }, { status: 500 });

  // Count actual active registrations per category (not the stale current_participants counter,
  // which is never decremented when an admin cancels a registration).
  const { data: regRows } = await db
    .from("it_run_registrations")
    .select("category_id")
    .eq("event_id", event.id)
    .eq("registration_status", "active")
    .in("payment_status", ["paid", "free", "pending"]);

  const liveCountMap: Record<string, number> = {};
  for (const r of (regRows ?? [])) {
    liveCountMap[r.category_id] = (liveCountMap[r.category_id] ?? 0) + 1;
  }

  const categoriesWithCount = (categories ?? []).map(c => ({
    ...c,
    live_registered_count: liveCountMap[c.id] ?? 0,
  }));

  return NextResponse.json({ categories: categoriesWithCount });
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

  // Numeric fields: validate here so bad input is refused, not stored
  if ("distance_km" in editable) {
    const raw = editable.distance_km;
    const n = raw === null || raw === "" ? null : Number(raw);
    if (n !== null && (!Number.isFinite(n) || n <= 0 || n > 100)) {
      return NextResponse.json({ error: "Distance must be between 0 and 100 km." }, { status: 400 });
    }
    editable.distance_km = n;
  }
  if ("price_rupees" in editable) {
    const n = Number(editable.price_rupees);
    if (!Number.isInteger(n) || n < 0 || n > 100000) {
      return NextResponse.json({ error: "Price must be a whole number of rupees between 0 and 100000." }, { status: 400 });
    }
    editable.price_rupees = n;
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

  // Validate: capacity cannot be reduced below actual active registrations
  // (use live count from registrations table — current_participants is stale for admin-cancelled regs)
  if ("max_participants" in editable && editable.max_participants !== null) {
    const newCap = Number(editable.max_participants);
    const { count: liveCount } = await db
      .from("it_run_registrations")
      .select("id", { count: "exact", head: true })
      .eq("category_id", id)
      .eq("registration_status", "active")
      .in("payment_status", ["paid", "free", "pending"]);
    const curReg = liveCount ?? 0;
    if (newCap < curReg) {
      return NextResponse.json(
        { error: `Cannot reduce capacity to ${newCap} — ${curReg} active registrations already exist for this category.` },
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

  if (error) return NextResponse.json({ error: "Could not save the category. Please try again." }, { status: 500 });

  // Public pages are static shells that fetch categories; refresh their cached HTML as well
  revalidatePath("/it-run");
  revalidatePath("/it-run/register");

  db.from("it_run_audit_logs").insert({
    event_id:    updated?.event_id ?? null,
    actor_email: session.email,
    actor_role:  session.role,
    action:      "update_category",
    entity_type: "category",
    entity_id:   id,
    ip:          getClientIp(req),
    detail: {
      name:           updated?.name,
      updated_fields: Object.keys(editable),
      old_values:     oldValues,
      new_values:     editable,
    },
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true });
}
