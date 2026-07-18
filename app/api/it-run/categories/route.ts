import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET /api/it-run/categories
// Returns active categories for the IT Run Sprint-2 event.
export async function GET() {
  const db = getSupabaseServer();

  const { data: event } = await db
    .from("it_run_events")
    .select("id")
    .eq("slug", "sprint-2")
    .single();

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data, error } = await db
    .from("it_run_categories")
    .select("id,slug,name,distance_km,category_type,price_rupees,includes_timing,includes_medal,includes_tshirt,includes_certificate,max_participants,current_participants,description,color")
    .eq("event_id", event.id)
    .eq("is_active", true)
    .order("sort_order");

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  return NextResponse.json({ data });
}
