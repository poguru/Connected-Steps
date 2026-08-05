import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const db = getSupabaseServer();

  const [evRes, racesRes] = await Promise.all([
    db
      .from("events")
      .select("id, participant_count, max_participants")
      .eq("id", eventId)
      .maybeSingle(),
    db
      .from("event_races")
      .select("id, name, distance, slot_reserved, max_slots")
      .eq("event_id", eventId)
      .eq("status", "active")
      .order("display_order"),
  ]);

  if (!evRes.data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      participant_count: (evRes.data.participant_count ?? 0) as number,
      max_participants:  (evRes.data.max_participants  ?? null) as number | null,
      races: (racesRes.data ?? []).map(r => ({
        race_id:       r.id             as string,
        name:          r.name           as string,
        distance:      r.distance       as string,
        slot_reserved: (r.slot_reserved ?? 0)   as number,
        max_slots:     (r.max_slots     ?? null) as number | null,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
