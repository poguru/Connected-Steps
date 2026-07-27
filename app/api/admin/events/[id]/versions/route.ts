import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// Fields captured in each snapshot (everything except id, created_at).
// Participant-affecting rows (registrations, payments) are deliberately excluded.
const SNAPSHOT_COLUMNS = [
  "title", "short_description", "description", "event_type", "event_category",
  "cover_image", "banner_image", "gallery_images",
  "start_date", "end_date", "start_time", "end_time",
  "location", "meeting_point", "maps_url",
  "registration_opens_at", "registration_closes_at", "early_bird_ends_at",
  "max_participants", "waiting_list_enabled", "require_login",
  "terms_conditions", "refund_policy", "cancellation_policy",
  "faqs", "highlights", "organizer", "organizer_email", "organizer_phone",
  "support_email", "support_phone", "website",
  "status", "share_slug", "visibility", "registration_config",
  "distance_categories", "whatsapp_community_url", "route_map_url",
].join(", ");

// GET /api/admin/events/[id]/versions
// Returns the version history for an event (newest first).
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getSupabaseServer();

  const { data, error } = await db
    .from("event_versions")
    .select("id, version_number, label, created_by, created_at, snapshot->title, snapshot->status")
    .eq("event_id", id)
    .order("version_number", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ versions: data ?? [] });
}

// POST /api/admin/events/[id]/versions
// Creates a new checkpoint from the current event state.
// Body: { label?: string, created_by?: string }
export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: event_id } = await params;
  const body = await req.json() as { label?: string; created_by?: string };

  const db = getSupabaseServer();

  // Read current event state
  const { data: ev, error: evErr } = await db
    .from("events")
    .select(SNAPSHOT_COLUMNS)
    .eq("id", event_id)
    .single();

  if (evErr || !ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Determine next version_number
  const { data: maxRow } = await db
    .from("event_versions")
    .select("version_number")
    .eq("event_id", event_id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const version_number = (maxRow?.version_number ?? 0) + 1;

  const { data, error } = await db
    .from("event_versions")
    .insert({
      event_id,
      version_number,
      snapshot: ev,
      label:      body.label?.trim()      || null,
      created_by: body.created_by?.trim() || null,
    })
    .select("id, version_number, label, created_by, created_at")
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ version: data }, { status: 201 });
}
