import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach, getAdminEmail } from "@/lib/admin-auth";

// Fields the edit endpoint allows changing — everything else is immutable.
const EDITABLE_FIELDS = new Set([
  "title", "short_description", "description", "event_type", "event_category",
  "cover_image", "banner_image", "gallery_images",
  "start_date", "end_date", "start_time", "end_time",
  "location", "meeting_point", "maps_url",
  "registration_opens_at", "registration_closes_at", "early_bird_ends_at",
  "max_participants", "waiting_list_enabled", "require_login",
  "featured", "approval_required", "collect_tshirt",
  "terms_conditions", "refund_policy", "cancellation_policy",
  "faqs", "highlights",
  "organizer", "organizer_email", "organizer_phone",
  "support_email", "support_phone", "website",
  "visibility",
  "tshirt_size_chart_url",
  "registration_config",
  "whatsapp_community_url",
  "allow_multi_participant",
  "max_per_registration",
]);

// Columns that must be null rather than empty string when blank
const NULLABLE_FIELDS = new Set([
  "short_description", "description", "cover_image", "banner_image",
  "end_date", "start_time", "end_time", "meeting_point", "maps_url",
  "registration_opens_at", "registration_closes_at", "early_bird_ends_at",
  "terms_conditions", "refund_policy", "cancellation_policy",
  "organizer", "organizer_email", "organizer_phone",
  "support_email", "support_phone", "website",
  "tshirt_size_chart_url",
  "whatsapp_community_url",
]);

// Columns that store a local datetime string from <input type="datetime-local">
// and must be converted to a proper ISO 8601 string with timezone for Postgres TIMESTAMPTZ
const TIMESTAMP_FIELDS = new Set([
  "registration_opens_at", "registration_closes_at", "early_bird_ends_at",
]);

function sanitizeValue(key: string, val: unknown): unknown {
  // Convert empty strings to null for nullable fields
  if (NULLABLE_FIELDS.has(key) && val === "") return null;

  // Convert datetime-local strings ("2026-07-26T01:30") to ISO 8601 with UTC offset
  // The input is in IST (UTC+5:30) so append the offset so Postgres stores it correctly
  if (TIMESTAMP_FIELDS.has(key) && typeof val === "string" && val !== "") {
    // datetime-local format: "YYYY-MM-DDTHH:MM" — treat as IST (UTC+5:30)
    return `${val}:00+05:30`;
  }

  return val;
}

// GET /api/admin/events/[id]/edit — return all editable event fields
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const { data: ev, error } = await db
    .from("events")
    .select(`
      id, title, short_description, description, event_type, event_category,
      cover_image, banner_image, gallery_images,
      start_date, end_date, start_time, end_time,
      location, meeting_point, maps_url,
      registration_opens_at, registration_closes_at, early_bird_ends_at,
      max_participants, waiting_list_enabled, require_login,
      terms_conditions, refund_policy, cancellation_policy,
      faqs, highlights,
      organizer, organizer_email, organizer_phone,
      support_email, support_phone, website,
      whatsapp_community_url,
      status, share_slug, visibility, participant_count
    `)
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Confirmed registration count for slot validation UI
  const { count: confirmedCount } = await db
    .from("event_registrations")
    .select("id", { count: "exact", head: true })
    .eq("event_id", id)
    .eq("status", "confirmed");

  return NextResponse.json({ event: ev, confirmed_count: confirmedCount ?? 0 });
}

// PATCH /api/admin/events/[id]/edit — update editable fields + audit log
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json() as { fields: Record<string, unknown>; reason?: string };
  const { fields = {}, reason } = body;

  // Filter to only editable fields and sanitize values
  const updates: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(fields)) {
    if (EDITABLE_FIELDS.has(key)) updates[key] = sanitizeValue(key, val);
  }

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });

  const db = getSupabaseServer();

  // Load current event for diff + validation (fetch all columns so we can diff any field)
  const { data: rawCurrent, error: fetchErr } = await db
    .from("events")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !rawCurrent) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const current = rawCurrent as unknown as Record<string, unknown> & { share_slug?: string; max_participants?: number };

  // Slot count validation: new max_participants must be >= confirmed registrations
  if ("max_participants" in updates && updates.max_participants !== null) {
    const newMax = Number(updates.max_participants);
    if (!Number.isFinite(newMax) || newMax < 1)
      return NextResponse.json({ error: "Slot count must be a positive number" }, { status: 400 });

    const { count: confirmed } = await db
      .from("event_registrations")
      .select("id", { count: "exact", head: true })
      .eq("event_id", id)
      .eq("status", "confirmed");

    const confirmedCount = confirmed ?? 0;
    if (newMax < confirmedCount)
      return NextResponse.json({
        error: `Cannot reduce slots to ${newMax}: ${confirmedCount} confirmed registrations already exist. Minimum allowed is ${confirmedCount}.`,
        confirmed_count: confirmedCount,
      }, { status: 409 });
  }

  // Apply the update
  const { data: updated, error: updateErr } = await db
    .from("events")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (updateErr) {
    console.error("[event-edit] update error:", updateErr.message, "code:", updateErr.code, "details:", updateErr.details);
    return NextResponse.json({ error: `Save failed: ${updateErr.message}` }, { status: 500 });
  }

  // Write audit log entries — one row per changed field
  const changedBy = getAdminEmail(req) ?? "admin";
  const logRows = Object.entries(updates)
    .filter(([key]) => {
      const oldVal = JSON.stringify(current[key] ?? null);
      const newVal = JSON.stringify(updates[key] ?? null);
      return oldVal !== newVal;
    })
    .map(([key]) => ({
      event_id:   id,
      changed_by: changedBy,
      field_name: key,
      old_value:  JSON.stringify(current[key] ?? null),
      new_value:  JSON.stringify(updates[key] ?? null),
      reason:     reason ?? null,
    }));

  if (logRows.length > 0) {
    const { error: logErr } = await db.from("event_change_log").insert(logRows);
    if (logErr) console.error("[event-edit] change-log insert failed:", logErr.message);
  }

  // Revalidate public event page so changes appear immediately
  if (current.share_slug) {
    revalidatePath(`/events/${current.share_slug}`);
  }
  revalidatePath("/");

  return NextResponse.json({ event: updated, changes: logRows.length });
}
