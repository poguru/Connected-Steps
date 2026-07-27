import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/events/[id]/route-maps
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("event_route_maps")
    .select("id, event_id, race_id, name, file_url, file_type, file_size, version, is_active, display_order, created_at")
    .eq("event_id", eventId)
    .order("display_order", { ascending: true })
    .order("created_at",    { ascending: true });

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ route_maps: data ?? [] });
}

// POST /api/admin/events/[id]/route-maps
// Body: { name, file_url, file_type, file_size, race_id? }
// Creates a new route map row after file has been uploaded via /upload.
export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;

  const body = await req.json() as {
    name: string; file_url: string; file_type: string;
    file_size?: number; race_id?: string | null;
  };

  if (!body.name?.trim())     return NextResponse.json({ error: "name is required" },     { status: 400 });
  if (!body.file_url?.trim()) return NextResponse.json({ error: "file_url is required" }, { status: 400 });
  if (!["image","pdf","gpx"].includes(body.file_type))
    return NextResponse.json({ error: "Invalid file_type" }, { status: 400 });

  const db = getSupabaseServer();

  // Set display_order to current max + 1
  const { data: maxRow } = await db
    .from("event_route_maps")
    .select("display_order")
    .eq("event_id", eventId)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const display_order = (maxRow?.display_order ?? -1) + 1;

  const { data, error } = await db
    .from("event_route_maps")
    .insert({
      event_id:      eventId,
      race_id:       body.race_id ?? null,
      name:          body.name.trim(),
      file_url:      body.file_url,
      file_type:     body.file_type,
      file_size:     body.file_size ?? null,
      display_order,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ route_map: data });
}

// PATCH /api/admin/events/[id]/route-maps
// Body: { id, ...fields } — update name, is_active, display_order, race_id, or replace file
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;

  const body = await req.json() as Record<string, unknown>;
  const { id: mapId, ...rest } = body;
  if (!mapId) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const allowed: Record<string, unknown> = {};
  for (const k of ["name", "is_active", "display_order", "race_id", "file_url", "file_type", "file_size"]) {
    if (k in rest) allowed[k] = rest[k];
  }
  // When replacing file, increment version
  if ("file_url" in rest) {
    const db2 = getSupabaseServer();
    const { data: cur } = await db2.from("event_route_maps").select("version").eq("id", mapId).single();
    allowed.version = (cur?.version ?? 1) + 1;
  }
  if (Object.keys(allowed).length === 0)
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("event_route_maps")
    .update(allowed)
    .eq("id", mapId)
    .eq("event_id", eventId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ route_map: data });
}

// DELETE /api/admin/events/[id]/route-maps
// Body: { id }
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;

  const body  = await req.json() as { id?: string };
  const mapId = body.id;
  if (!mapId) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = getSupabaseServer();
  const { error } = await db
    .from("event_route_maps")
    .delete()
    .eq("id", mapId)
    .eq("event_id", eventId);

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
