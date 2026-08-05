import type { Metadata } from "next";
import { getSupabaseServer } from "@/lib/supabase-server";
import EventsClient from "@/components/events/EventsClient";

export const metadata: Metadata = {
  title: "Events | Connected Steps",
  description: "Discover upcoming running, cycling, training, and community events from Connected Steps in Hyderabad.",
  alternates: { canonical: "/events" },
};

export const revalidate = 60;

interface Event {
  id: string; title: string; description: string | null;
  event_type: string; cover_image: string | null;
  start_date: string; start_time: string | null;
  end_date: string | null; end_time: string | null;
  registration_closes_at: string | null;
  distance_categories:    string[] | null;
  location: string; price: number; featured: boolean;
  max_participants: number | null; participant_count: number | null; share_slug: string | null;
}

async function getEvents(): Promise<Event[]> {
  try {
    const db      = getSupabaseServer();
    const istNow  = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const today   = istNow.toISOString().split("T")[0];
    const nowTime = istNow.toTimeString().split(" ")[0].substring(0, 5);

    const { data } = await db
      .from("events")
      .select("id, title, description, event_type, cover_image, start_date, start_time, end_date, end_time, registration_closes_at, distance_categories, location, price, featured, max_participants, participant_count, share_slug")
      .eq("status", "published")
      .or(
        `end_date.gt.${today},` +
        `and(end_date.eq.${today},end_time.gt.${nowTime}),` +
        `and(end_date.eq.${today},end_time.is.null),` +
        `and(end_date.is.null,start_date.gte.${today})`
      )
      .order("featured", { ascending: false })
      .order("start_date",  { ascending: true });
    const events = (data ?? []) as Event[];
    if (events.length === 0) return events;

    // Correct price from event_races — events.price may be stale vs actual race prices
    const eventIds = events.map(e => e.id);
    const { data: races } = await db
      .from("event_races")
      .select("event_id, price")
      .in("event_id", eventIds)
      .eq("status", "active");
    const minPriceMap: Record<string, number> = {};
    for (const race of (races ?? [])) {
      const eid = race.event_id as string;
      const p   = race.price as number;
      if (minPriceMap[eid] === undefined || p < minPriceMap[eid]) minPriceMap[eid] = p;
    }
    return events.map(e => ({ ...e, price: minPriceMap[e.id] ?? e.price }));
  } catch {
    return [];
  }
}

export default async function EventsPage() {
  const events = await getEvents();
  return <EventsClient events={events} />;
}
