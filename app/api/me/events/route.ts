import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, USER_SESSION_COOKIE } from "@/lib/admin-auth";

// GET /api/me/events
// Unified API: Returns all events for authenticated user
// Combines: IT Run registrations + other Connected Steps events
export async function GET(req: NextRequest) {
  const userEmail = verifyUserToken(req.cookies.get(USER_SESSION_COOKIE)?.value ?? "");

  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabaseServer();

  // Fetch IT Run registrations for this user
  const { data: itRunRegs, error: itRunErr } = await db
    .from("it_run_registrations")
    .select(`
      id, registration_code, payment_status, registration_status,
      final_price, created_at, updated_at,
      it_run_categories ( id, name, distance_km, color, category_type ),
      it_run_events ( id, slug, title, event_date, venue_name, city ),
      it_run_participants ( first_name, last_name, bib_number )
    `)
    .eq("linked_user_email", userEmail)
    .order("created_at", { ascending: false });

  if (itRunErr) {
    console.error("[me/events] IT Run query error:", itRunErr.message);
  }

  // Fetch other Connected Steps event registrations
  const { data: otherRegs, error: otherErr } = await db
    .from("registrations")
    .select(`
      id, event_id, event_status, payment_status, created_at,
      users ( email ),
      events (
        id, title, event_type, start_date, end_date,
        location, cover_image,
        distance_categories ( category )
      )
    `)
    .eq("user_id", userEmail) // Assuming user_id or email linkage exists
    .order("created_at", { ascending: false })
    .limit(100);

  if (otherErr) {
    console.error("[me/events] Other events query error:", otherErr.message);
  }

  // Format IT Run registrations
  const itRunEvents = (itRunRegs ?? []).map((r: any) => ({
    id: r.id,
    type: "it-run",
    platform: "Connected Steps",
    title: r.it_run_events?.title || "The IT Run",
    event_date: r.it_run_events?.event_date,
    venue: r.it_run_events?.venue_name,
    city: r.it_run_events?.city,
    category: r.it_run_categories?.name,
    category_color: r.it_run_categories?.color || "#e8620a",
    participant_count: r.it_run_participants?.length || 1,
    payment_status: r.payment_status,
    registration_status: r.registration_status,
    registration_code: r.registration_code,
    link: `/it-run/registrations/${r.id}`,
    created_at: r.created_at,
  }));

  // Format other event registrations
  const otherEvents = (otherRegs ?? []).map((r: any) => ({
    id: r.id,
    type: r.events?.event_type || "event",
    platform: "Connected Steps",
    title: r.events?.title,
    event_date: r.events?.start_date,
    venue: r.events?.location,
    payment_status: r.payment_status,
    registration_status: r.event_status,
    link: `/my-events/${r.id}`,
    created_at: r.created_at,
  }));

  // Combine and sort by date
  const allEvents = [...itRunEvents, ...otherEvents].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return NextResponse.json({
    events: allEvents,
    summary: {
      total: allEvents.length,
      it_run: itRunEvents.length,
      other_events: otherEvents.length,
      upcoming: allEvents.filter(e => new Date(e.event_date) > new Date()).length,
    },
  });
}
