import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

// GET /api/it-run/admin/bib-slots
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "bib_collection", "support_desk"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").single<{ id: string }>();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data, error } = await db
    .from("it_run_bib_slots")
    .select("*")
    .eq("event_id", event.id)
    .order("slot_date")
    .order("start_time");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST /api/it-run/admin/bib-slots — create a new slot
export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    slot_date: string; start_time: string; end_time: string;
    location: string; location_address?: string; capacity: number;
  };

  const db = getSupabaseServer();
  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").single<{ id: string }>();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data, error } = await db
    .from("it_run_bib_slots")
    .insert({
      event_id:         event.id,
      slot_date:        body.slot_date,
      start_time:       body.start_time,
      end_time:         body.end_time,
      location_name:    body.location,
      location_address: body.location_address ?? null,
      capacity:         body.capacity,
      booked_count:     0,
      is_active:        true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

// PATCH /api/it-run/admin/bib-slots — toggle active or update capacity
export async function PATCH(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, is_active, capacity } = await req.json() as { id: string; is_active?: boolean; capacity?: number };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db      = getSupabaseServer();
  const updates: Record<string, unknown> = {};
  if (is_active !== undefined) updates.is_active = is_active;
  if (capacity  !== undefined) updates.capacity  = capacity;

  const { data, error } = await db.from("it_run_bib_slots").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
