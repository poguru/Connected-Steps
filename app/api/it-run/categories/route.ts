import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET /api/it-run/categories
// Returns active categories and event metadata for the IT Run Sprint-2 event.
// The `event` field lets frontends read event_date and registration_closes_at
// from the database instead of hardcoding them.
export async function GET() {
  const db = getSupabaseServer();

  const { data: event } = await db
    .from("it_run_events")
    .select("id,title,event_date,registration_closes_at,venue_name,city,status")
    .eq("slug", "sprint-2")
    .single<{
      id: string; title: string; event_date: string;
      registration_closes_at: string; venue_name: string | null;
      city: string | null; status: string;
    }>();

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data, error } = await db
    .from("it_run_categories")
    .select("id,slug,name,distance_km,category_type,price_rupees,includes_timing,includes_medal,includes_tshirt,includes_certificate,max_participants,current_participants,description,color")
    .eq("event_id", event.id)
    .eq("is_active", true)
    .order("sort_order");

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  return NextResponse.json({
    data,
    event: {
      title:                  event.title,
      event_date:             event.event_date,
      registration_closes_at: event.registration_closes_at,
      venue_name:             event.venue_name,
      city:                   event.city,
      status:                 event.status,
    },
  });
}
