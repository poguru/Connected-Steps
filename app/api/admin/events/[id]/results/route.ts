import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/events/[id]/results
// Returns all results for an event, sorted by overall_position.
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const sp  = req.nextUrl.searchParams;
  const cat = sp.get("category") ?? "";
  const db  = getSupabaseServer();

  let q = db
    .from("event_results")
    .select("*")
    .eq("event_id", eventId)
    .order("overall_position", { ascending: true, nullsFirst: false })
    .order("gun_time_secs",    { ascending: true, nullsFirst: false });

  if (cat) q = q.eq("distance_category", cat) as typeof q;

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const results   = data ?? [];
  const finishers = results.filter(r => r.status === "finisher").length;
  const dnf       = results.filter(r => r.status === "dnf").length;
  const dns       = results.filter(r => r.status === "dns").length;

  return NextResponse.json({ results, summary: { total: results.length, finishers, dnf, dns } });
}

// POST /api/admin/events/[id]/results
// Creates or updates a single result.
export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const body = await req.json() as Record<string, unknown>;
  const db   = getSupabaseServer();

  const {
    user_email, user_name, registration_code, distance_category, bib_number,
    finish_time, gun_time_secs, chip_time_secs, pace,
    overall_position, category_position, status = "finisher", notes,
  } = body;

  if (!user_email || !user_name) {
    return NextResponse.json({ error: "user_email and user_name are required" }, { status: 400 });
  }

  // Lookup registration_id if not provided but registration_code is known
  let registrationId = (body.registration_id as string | null) ?? null;
  if (!registrationId && registration_code) {
    const { data: reg } = await db
      .from("event_registrations")
      .select("id")
      .eq("registration_code", String(registration_code))
      .eq("event_id", eventId)
      .maybeSingle();
    registrationId = reg?.id ?? null;
  }

  const { data, error } = await db
    .from("event_results")
    .upsert({
      event_id:          eventId,
      registration_id:   registrationId,
      registration_code: registration_code ? String(registration_code) : null,
      user_email:        String(user_email).toLowerCase().trim(),
      user_name:         String(user_name).trim(),
      distance_category: distance_category ? String(distance_category) : null,
      bib_number:        bib_number ? String(bib_number) : null,
      finish_time:       finish_time ? String(finish_time) : null,
      gun_time_secs:     gun_time_secs ? Number(gun_time_secs) : null,
      chip_time_secs:    chip_time_secs ? Number(chip_time_secs) : null,
      pace:              pace ? String(pace) : null,
      overall_position:  overall_position ? Number(overall_position) : null,
      category_position: category_position ? Number(category_position) : null,
      status:            String(status),
      notes:             notes ? String(notes) : null,
      updated_at:        new Date().toISOString(),
    }, { onConflict: "event_id,user_email" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ result: data }, { status: 201 });
}

// PATCH /api/admin/events/[id]/results  — update one result, body must include id
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const body = await req.json() as Record<string, unknown>;
  const { id: resultId, ...fields } = body;
  if (!resultId) return NextResponse.json({ error: "id required" }, { status: 400 });

  const allowed: Record<string, unknown> = {};
  const keys = ["finish_time","gun_time_secs","chip_time_secs","pace","overall_position","category_position","status","notes","distance_category","bib_number"];
  for (const k of keys) { if (k in fields) allowed[k] = fields[k]; }
  allowed.updated_at = new Date().toISOString();

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("event_results")
    .update(allowed)
    .eq("id", String(resultId))
    .eq("event_id", eventId)
    .select().single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ result: data });
}

// DELETE /api/admin/events/[id]/results  — body must include id
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const { id: resultId } = await req.json() as { id?: string };
  if (!resultId) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = getSupabaseServer();
  const { error } = await db.from("event_results").delete().eq("id", resultId).eq("event_id", eventId);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
