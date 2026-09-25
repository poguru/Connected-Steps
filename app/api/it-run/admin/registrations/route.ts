import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

// Fields that can never be changed via the admin API
const IMMUTABLE_REG = new Set([
  "id", "event_id", "category_id", "registration_code",
  "lead_email", "base_price", "discount_amount", "final_price",
  "payment_status", "razorpay_order_id", "razorpay_payment_id",
  "qr_token", "coupon_id", "created_at", "updated_at",
  "participant_count", "confirmation_email_sent_at",
]);

// GET /api/it-run/admin/registrations
// Supports searching across registration AND participant fields.
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "support_desk"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp              = req.nextUrl.searchParams;
  const page            = Math.max(0, parseInt(sp.get("page")  ?? "0", 10));
  const limit           = Math.min(100, Math.max(10, parseInt(sp.get("limit") ?? "30", 10)));
  const paymentStatus   = sp.get("payment_status") ?? "";
  const regStatus       = sp.get("registration_status") ?? "";
  const categoryId      = sp.get("category_id") ?? "";
  const search          = sp.get("search")?.trim() ?? "";

  const db = getSupabaseServer();

  const { data: event } = await db
    .from("it_run_events")
    .select("id")
    .eq("slug", "sprint-2")
    .single();

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Step 1: If search term is provided, find matching registration IDs via participants
  // (covers: participant name, mobile, company_name, employee_id)
  let participantRegIds: string[] | null = null;
  if (search) {
    const { data: matchParts } = await db
      .from("it_run_participants")
      .select("registration_id")
      .eq("event_id", event.id)
      .or([
        `first_name.ilike.%${search}%`,
        `last_name.ilike.%${search}%`,
        `mobile.ilike.%${search}%`,
        `company_name.ilike.%${search}%`,
        `employee_id.ilike.%${search}%`,
      ].join(","));
    participantRegIds = (matchParts ?? []).map(p => p.registration_id as string);
  }

  // Step 2: Build registration query
  let q = db
    .from("it_run_registrations")
    .select(`
      id, registration_code, lead_email, participant_count,
      base_price, discount_amount, final_price, payment_status,
      registration_status, cancelled_reason, cancelled_at, admin_notes,
      created_at, updated_at,
      it_run_categories ( id, name, distance_km, category_type, color ),
      it_run_coupons ( code, discount_type, discount_value ),
      it_run_participants (
        id, participant_type, first_name, last_name, gender, dob,
        email, mobile, blood_group, emergency_name, emergency_phone,
        company_name, employee_id, company_id_url,
        tshirt_size, medical_conditions, food_preference,
        bib_number, wave, collection_counter, verification_status,
        it_run_bib_collections ( id, collected_at, counter_name ),
        it_run_checkins ( id, checked_in_at )
      )
    `, { count: "exact" })
    .eq("event_id", event.id);

  if (paymentStatus)  q = q.eq("payment_status", paymentStatus);
  if (regStatus)      q = q.eq("registration_status", regStatus);
  if (categoryId)     q = q.eq("category_id", categoryId);

  if (search) {
    const orParts: string[] = [
      `registration_code.ilike.%${search}%`,
      `lead_email.ilike.%${search}%`,
    ];
    if (participantRegIds && participantRegIds.length > 0) {
      orParts.push(`id.in.(${participantRegIds.join(",")})`);
    }
    q = q.or(orParts.join(","));
  }

  const { data, count, error } = await q
    .order("created_at", { ascending: false })
    .range(page * limit, page * limit + limit - 1);

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  return NextResponse.json({ data, total: count ?? 0, page, limit });
}

// PATCH /api/it-run/admin/registrations
// Allowed changes: registration_status (cancel), admin_notes.
// Cancelling a paid registration requires confirm:true.
export async function PATCH(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const { id, confirm, ...rest } = body;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Registration id required" }, { status: 400 });
  }

  const db = getSupabaseServer();

  // Fetch current registration
  const { data: current } = await db
    .from("it_run_registrations")
    .select("id, registration_code, payment_status, registration_status, admin_notes, cancelled_reason")
    .eq("id", id)
    .single<{
      id: string; registration_code: string; payment_status: string;
      registration_status: string; admin_notes: string | null; cancelled_reason: string | null;
    }>();

  if (!current) return NextResponse.json({ error: "Registration not found" }, { status: 404 });

  // Build editable payload — strip all immutable fields
  const editable: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (!IMMUTABLE_REG.has(k)) editable[k] = v;
  }

  if (!Object.keys(editable).length) {
    return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
  }

  // Guard: cancelling a paid registration requires explicit confirmation
  if (editable.registration_status === "cancelled" &&
      current.payment_status === "paid" &&
      !confirm) {
    return NextResponse.json(
      {
        needsConfirm: true,
        message:      `This is a PAID registration (${current.registration_code}). Cancelling it will not issue a refund automatically. Confirm to proceed.`,
        code:         current.registration_code,
        paymentStatus: current.payment_status,
      },
      { status: 409 },
    );
  }

  // Guard: cannot re-activate a cancelled registration directly (use explicit active)
  // This is allowed but logged clearly.

  // Stamp cancelled_at when cancelling
  if (editable.registration_status === "cancelled" && current.registration_status !== "cancelled") {
    editable.cancelled_at = new Date().toISOString();
    if (!editable.cancelled_reason) editable.cancelled_reason = "Cancelled by admin";
  }

  // Clear cancel fields when re-activating
  if (editable.registration_status === "active") {
    editable.cancelled_at     = null;
    editable.cancelled_reason = null;
  }

  const oldValues: Record<string, unknown> = {};
  for (const k of Object.keys(editable)) {
    oldValues[k] = (current as unknown as Record<string, unknown>)[k] ?? null;
  }

  const { error } = await db
    .from("it_run_registrations")
    .update(editable)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit log
  db.from("it_run_audit_logs").insert({
    actor_email: session.email,
    actor_role:  session.role,
    action:      editable.registration_status === "cancelled" ? "cancel_registration" : "update_registration",
    entity_type: "registration",
    entity_id:   current.registration_code,
    detail: {
      updated_fields: Object.keys(editable),
      old_values:     oldValues,
      new_values:     editable,
    },
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true });
}
