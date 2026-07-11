import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/events/[id]/collection-centers
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;
  const db = getSupabaseServer();

  const { data, error } = await db
    .from("bib_collection_centers")
    .select(`*, bib_collection_slots(id, slot_date, start_time, end_time, capacity, booked_count, status)`)
    .eq("event_id", eventId)
    .order("display_order", { ascending: true });

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ centers: data ?? [] });
}

// POST /api/admin/events/[id]/collection-centers
export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;
  const body = await req.json() as Record<string, unknown>;

  const { name, address, maps_url, contact_name, contact_phone, notes, display_order = 0 } = body;
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("bib_collection_centers")
    .insert({ event_id: eventId, name: String(name).trim(), address: address ? String(address) : null, maps_url: maps_url ? String(maps_url) : null, contact_name: contact_name ? String(contact_name) : null, contact_phone: contact_phone ? String(contact_phone) : null, notes: notes ? String(notes) : null, display_order: Number(display_order) || 0 })
    .select().single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ center: data }, { status: 201 });
}

// PATCH /api/admin/events/[id]/collection-centers  Body must include id
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;
  const body = await req.json() as Record<string, unknown>;
  const { id: centerId, ...fields } = body;
  if (!centerId) return NextResponse.json({ error: "id required" }, { status: 400 });

  const allowed: Record<string, unknown> = {};
  for (const k of ["name","address","maps_url","contact_name","contact_phone","notes","status","display_order"]) {
    if (k in fields) allowed[k] = fields[k];
  }

  const db = getSupabaseServer();
  const { data, error } = await db.from("bib_collection_centers").update(allowed).eq("id", String(centerId)).eq("event_id", eventId).select().single();
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ center: data });
}

// DELETE /api/admin/events/[id]/collection-centers  Body must include id
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;
  const { id: centerId } = await req.json() as { id?: string };
  if (!centerId) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = getSupabaseServer();
  const { error } = await db.from("bib_collection_centers").delete().eq("id", centerId).eq("event_id", eventId);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
