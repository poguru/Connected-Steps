import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string; code: string }> };

// PATCH /api/admin/events/[id]/registrations/[code]/category
// Body: { new_category, changed_by? }
//
// Changes the distance_category for a registration + all its event_participants.
// Computes the price differential against the current race price (not what was paid).
// Records the change in category_change_log for audit.
//
// Returns: { ok, old_category, new_category, old_price, new_price, differential, cumulative_differential }
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId, code: registrationCode } = await params;
  const body = await req.json() as { new_category?: string; changed_by?: string };

  if (!body.new_category?.trim()) {
    return NextResponse.json({ error: "new_category is required" }, { status: 400 });
  }
  const newCategory = body.new_category.trim();
  const changedBy   = body.changed_by?.trim() ?? "admin";

  const db = getSupabaseServer();

  // ── 1. Fetch the current registration ─────────────────────────────────────
  const { data: reg, error: regErr } = await db
    .from("event_registrations")
    .select("id, distance_category, original_price, final_price, price_differential, category_change_log, status, payment_status")
    .eq("registration_code", registrationCode)
    .eq("event_id", eventId)
    .single();

  if (regErr || !reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  if (reg.status === "cancelled") return NextResponse.json({ error: "Cannot change category for a cancelled registration" }, { status: 400 });

  const oldCategory = reg.distance_category ?? null;
  if (oldCategory === newCategory) return NextResponse.json({ error: "New category is the same as the current category" }, { status: 400 });

  // ── 2. Fetch event + races ────────────────────────────────────────────────
  const [{ data: ev }, { data: races }] = await Promise.all([
    db.from("events").select("id, title, price, distance_categories").eq("id", eventId).single(),
    db.from("event_races").select("id, distance, price, early_bird_price").eq("event_id", eventId).eq("status", "active"),
  ]);

  if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Validate that the new category is valid for this event
  const validCategories = (ev.distance_categories as string[] | null) ?? [];
  if (validCategories.length > 0 && !validCategories.includes(newCategory)) {
    return NextResponse.json({ error: `"${newCategory}" is not a valid category for this event. Valid: ${validCategories.join(", ")}` }, { status: 400 });
  }

  // ── 3. Determine old and new race prices ──────────────────────────────────
  const oldRace = races?.find(r => r.distance === oldCategory) ?? null;
  const newRace = races?.find(r => r.distance === newCategory) ?? null;

  // Use regular price (no early bird) for admin category changes — early bird was at registration time
  const oldPrice = oldRace?.price ?? ev.price;
  const newPrice = newRace?.price ?? ev.price;

  const changeDifferential     = newPrice - oldPrice;
  const cumulativeDifferential = (reg.price_differential as number ?? 0) + changeDifferential;

  // ── 4. Build change log entry ─────────────────────────────────────────────
  const existingLog = (reg.category_change_log as unknown[]) ?? [];
  const logEntry = {
    from:          oldCategory,
    to:            newCategory,
    from_price:    oldPrice,
    to_price:      newPrice,
    differential:  changeDifferential,
    changed_at:    new Date().toISOString(),
    changed_by:    changedBy,
  };

  // ── 5. Update event_registrations ─────────────────────────────────────────
  const { error: updateErr } = await db
    .from("event_registrations")
    .update({
      distance_category:    newCategory,
      race_id:              newRace?.id ?? null,
      price_differential:   cumulativeDifferential,
      category_change_log:  [...existingLog, logEntry],
      category_changed_at:  new Date().toISOString(),
      category_changed_by:  changedBy,
    })
    .eq("registration_code", registrationCode)
    .eq("event_id", eventId);

  if (updateErr) return NextResponse.json({ error: "Database error updating registration" }, { status: 500 });

  // ── 6. Update event_participants ──────────────────────────────────────────
  await db
    .from("event_participants")
    .update({ distance_category: newCategory })
    .eq("registration_id", reg.id)
    .neq("status", "cancelled");

  return NextResponse.json({
    ok:                     true,
    old_category:           oldCategory,
    new_category:           newCategory,
    old_price:              oldPrice,
    new_price:              newPrice,
    differential:           changeDifferential,
    cumulative_differential: cumulativeDifferential,
  });
}
