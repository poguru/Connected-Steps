import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

// Fields that cannot be changed via the admin API
const IMMUTABLE = new Set([
  "id", "registration_id", "event_id", "participant_type",
  "created_at",
  // BIB/check-in are managed by dedicated workflows
  "bib_number", "wave", "collection_counter",
]);

function sanitize(v: unknown): unknown {
  if (typeof v !== "string") return v;
  return v.replace(/<[^>]*>/g, "").replace(/javascript:/gi, "").trim();
}

// GET /api/it-run/admin/participants
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "support_desk", "verification_team"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp     = req.nextUrl.searchParams;
  const page   = parseInt(sp.get("page")   ?? "0");
  const limit  = parseInt(sp.get("limit")  ?? "40");
  const search = sp.get("search") ?? "";
  const status = sp.get("status") ?? "";

  const db = getSupabaseServer();
  const { data: event } = await db
    .from("it_run_events").select("id").eq("slug", "sprint-2").single<{ id: string }>();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  let query = db
    .from("it_run_participants")
    .select(`
      id, first_name, last_name, gender, dob, email, mobile, blood_group,
      emergency_name, emergency_phone, company_name, employee_id,
      company_id_url, tshirt_size, medical_conditions, food_preference,
      bib_number, wave, collection_counter, verification_status, participant_type,
      it_run_registrations!inner(
        id, registration_code, payment_status, registration_status,
        it_run_categories(name, color),
        event_id
      ),
      it_run_bib_collections(id, collected_at, counter_name),
      it_run_checkins(id, checked_in_at)
    `, { count: "exact" })
    .eq("it_run_registrations.event_id", event.id);

  if (status) query = query.eq("verification_status", status);

  if (search) {
    query = query.or(
      [
        `first_name.ilike.%${search}%`,
        `last_name.ilike.%${search}%`,
        `email.ilike.%${search}%`,
        `mobile.ilike.%${search}%`,
        `company_name.ilike.%${search}%`,
        `employee_id.ilike.%${search}%`,
        `bib_number.eq.${search}`,
      ].join(",")
    );
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, total: count ?? 0 });
}

// PATCH /api/it-run/admin/participants
// Admin can edit participant personal/contact/company info.
// BIB number, wave, and collection_counter are managed by the BIB workflow.
// All edits are audit-logged with old and new values.
export async function PATCH(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "support_desk"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const { id, ...rest } = body;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Participant id required" }, { status: 400 });
  }

  // Build editable payload
  const editable: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (!IMMUTABLE.has(k)) editable[k] = sanitize(v);
  }

  if (!Object.keys(editable).length) {
    return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
  }

  const db = getSupabaseServer();

  // Fetch current values for audit
  const { data: current } = await db
    .from("it_run_participants")
    .select("*")
    .eq("id", id)
    .single<Record<string, unknown>>();

  if (!current) return NextResponse.json({ error: "Participant not found" }, { status: 404 });

  const oldValues: Record<string, unknown> = {};
  for (const k of Object.keys(editable)) oldValues[k] = current[k] ?? null;

  const { error } = await db
    .from("it_run_participants")
    .update(editable)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit log with full old/new diff
  db.from("it_run_audit_logs").insert({
    actor_email: session.email,
    actor_role:  session.role,
    action:      "edit_participant",
    entity_type: "participant",
    entity_id:   id,
    detail: {
      participant_name: `${current.first_name} ${current.last_name}`,
      updated_fields:   Object.keys(editable),
      old_values:       oldValues,
      new_values:       editable,
    },
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true });
}
