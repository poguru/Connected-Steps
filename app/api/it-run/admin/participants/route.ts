import { checkPersonName, checkBibName, normalizeName } from "@/lib/it-run-name-validation";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, getClientIp } from "@/lib/it-run-auth";
import { participantCategoryMap, categoryOfParticipant, type ParticipantCategory } from "@/lib/it-run-participant-category";
import {
  normalizeIndianPhone, emergencyMatchesMobile, parseCalendarDate, todayInIST, validateDateOfBirth, formatCalendarDate,
} from "@/lib/it-run-validation";

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
      bib_number, wave, collection_counter, verification_status, participant_type, category_id, cancelled_at, cancelled_reason,
      it_run_registrations!inner(
        id, registration_code, payment_status, registration_status,
        it_run_categories(name, color),
        event_id
      ),
      it_run_bib_collections(id),
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

  // Normalize PostgREST null nested arrays to prevent .length crashes in the UI
  // Each participant's own category (a booking can hold several). Rows without one use the registration's.
  const categories = await participantCategoryMap(db, (data ?? []).map(p => (p as Record<string, unknown>).category_id as string | null).filter((id): id is string => !!id));
  const normalized = (data ?? []).map((p: Record<string, unknown>) => ({
    ...p,
    participant_category: categoryOfParticipant(
      p.category_id as string | null,
      categories,
      ((p.it_run_registrations as { it_run_categories?: ParticipantCategory | null } | null)?.it_run_categories) ?? null,
    ),
    it_run_bib_collections: (p.it_run_bib_collections as unknown[] | null) ?? [],
    it_run_checkins:        (p.it_run_checkins        as unknown[] | null) ?? [],
  }));

  return NextResponse.json({ data: normalized, total: count ?? 0 });
}

// PATCH /api/it-run/admin/participants
// Admin can edit participant personal/contact/company info.
// verification_team: may only update verification_status.
// support_desk: cannot update verification_status.
// BIB number, wave, and collection_counter are managed by the BIB workflow.
// All edits are audit-logged with old and new values.
export async function PATCH(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "support_desk", "verification_team"]);
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

  // Name fields follow the same policy as registration. Invalid names are refused, never saved.
  const nameFields: Array<[string, string, "person" | "bib"]> = [
    ["first_name", "first name", "person"],
    ["last_name", "last name", "person"],
    ["emergency_name", "emergency contact name", "person"],
    ["bib_name", "BIB name", "bib"],
  ];
  for (const [column, label, kind] of nameFields) {
    if (!(column in editable)) continue;
    // An emergency contact may be cleared (children do not need one); any name that is set must be valid
    if (column === "emergency_name" && (editable[column] === null || editable[column] === "")) {
      editable[column] = null;
      continue;
    }
    const result = kind === "bib" ? checkBibName(editable[column]) : checkPersonName(editable[column], label);
    if (!result.ok) {
      return NextResponse.json({ error: result.message, field: column }, { status: 400 });
    }
    editable[column] = kind === "bib" ? normalizeName(result.value).toUpperCase() : result.value;
  }

  // verification_team may only update verification_status
  if (session.role === "verification_team") {
    const forbidden = Object.keys(editable).filter(k => k !== "verification_status");
    if (forbidden.length > 0) {
      return NextResponse.json({ error: "Verification team may only update verification_status" }, { status: 403 });
    }
  }

  // support_desk cannot update verification_status
  if (session.role === "support_desk" && "verification_status" in editable) {
    return NextResponse.json({ error: "Support desk cannot change verification status" }, { status: 403 });
  }

  const db = getSupabaseServer();

  // Fetch current values for audit
  const { data: current } = await db
    .from("it_run_participants")
    .select("*")
    .eq("id", id)
    .single<Record<string, unknown>>();

  if (!current) return NextResponse.json({ error: "Participant not found" }, { status: 404 });

  // Contact and date rules are the registration rules, so an admin edit cannot store what registration refuses
  if ("mobile" in editable) {
    const mobile = normalizeIndianPhone(editable.mobile);
    if (!mobile) return NextResponse.json({ error: "valid 10-digit mobile number is required", field: "mobile" }, { status: 400 });
    editable.mobile = mobile;
  }
  if ("emergency_phone" in editable && editable.emergency_phone !== null && editable.emergency_phone !== "") {
    const emergency = normalizeIndianPhone(editable.emergency_phone);
    if (!emergency) return NextResponse.json({ error: "valid 10-digit emergency contact phone is required", field: "emergency_phone" }, { status: 400 });
    editable.emergency_phone = emergency;
  }
  if ("mobile" in editable || "emergency_phone" in editable) {
    const mobile = "mobile" in editable ? editable.mobile : current.mobile;
    const emergency = "emergency_phone" in editable ? editable.emergency_phone : current.emergency_phone;
    if (emergencyMatchesMobile(mobile, emergency)) {
      return NextResponse.json({ error: "emergency contact number must be different from the mobile number", field: "emergency_phone" }, { status: 400 });
    }
  }
  if ("dob" in editable) {
    // The same age rules as registration: adults 18+ and child-category children 5 to 10, on the event date.
    // A child is a participant stored with the child role.
    const { data: event } = await db
      .from("it_run_events")
      .select("event_date")
      .eq("id", current.event_id as string)
      .maybeSingle<{ event_date: string }>();
    const eventDate = parseCalendarDate(event?.event_date);
    if (!eventDate) {
      return NextResponse.json({ error: "Event date is unavailable. Please try again later." }, { status: 503 });
    }
    const check = validateDateOfBirth(editable.dob, {
      isChild: current.participant_type === "child",
      eventDate,
      today: todayInIST(),
    });
    if (!check.ok) return NextResponse.json({ error: check.message, field: "dob" }, { status: 400 });
    editable.dob = formatCalendarDate(check.dob);
  }

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
    ip:          getClientIp(req),
    detail: {
      participant_name: `${current.first_name} ${current.last_name}`,
      updated_fields:   Object.keys(editable),
      old_values:       oldValues,
      new_values:       editable,
    },
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true });
}
