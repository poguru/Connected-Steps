import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET /api/it-run/categories
// Returns active categories and full event content for the IT Run Sprint-2 event.
// All fields are admin-editable — frontends must not hardcode them.
export async function GET() {
  const db = getSupabaseServer();

  const { data: event } = await db
    .from("it_run_events")
    .select([
      "id", "title", "subtitle", "tagline",
      "event_date", "report_time", "flag_off_time",
      "venue_name", "venue_address", "city", "maps_url",
      "registration_opens_at", "registration_closes_at", "status",
      "description", "hero_content", "event_highlights",
      "important_instructions", "contact_email", "contact_phone",
      "bib_collection_info", "race_day_info",
    ].join(","))
    .eq("slug", "sprint-2")
    .single<{
      id: string; title: string; subtitle: string | null; tagline: string | null;
      event_date: string; report_time: string | null; flag_off_time: string | null;
      venue_name: string | null; venue_address: string | null;
      city: string | null; maps_url: string | null;
      registration_opens_at: string | null; registration_closes_at: string | null;
      status: string;
      description: string | null; hero_content: string | null;
      event_highlights: string[] | null; important_instructions: string | null;
      contact_email: string | null; contact_phone: string | null;
      bib_collection_info: string | null; race_day_info: string | null;
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
      subtitle:               event.subtitle,
      tagline:                event.tagline,
      event_date:             event.event_date,
      report_time:            event.report_time,
      flag_off_time:          event.flag_off_time,
      venue_name:             event.venue_name,
      venue_address:          event.venue_address,
      city:                   event.city,
      maps_url:               event.maps_url,
      registration_opens_at:  event.registration_opens_at,
      registration_closes_at: event.registration_closes_at,
      status:                 event.status,
      description:            event.description,
      hero_content:           event.hero_content,
      event_highlights:       event.event_highlights,
      important_instructions: event.important_instructions,
      contact_email:          event.contact_email,
      contact_phone:          event.contact_phone,
      bib_collection_info:    event.bib_collection_info,
      race_day_info:          event.race_day_info,
    },
  });
}
