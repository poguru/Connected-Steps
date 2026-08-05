import { NextRequest, NextResponse, after } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// POST /api/events/waitlist -- public endpoint to join waitlist for a sold-out event/category
export async function POST(req: NextRequest) {
  try {
    const { event_id, name, email, phone, distance_category, notes } =
      await req.json() as { event_id: string; name: string; email: string; phone?: string; distance_category?: string; notes?: string };

    if (!event_id || !name?.trim() || !email?.trim())
      return NextResponse.json({ error: "event_id, name, and email are required" }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });

    const db = getSupabaseServer();

    after(async () => {
      const { error } = await db.rpc("release_expired_slots");
      if (error) console.error("[waitlist] release_expired_slots failed:", error.message);
    });

    // Verify event is published
    const { data: ev } = await db
      .from("events")
      .select("id, title, max_participants, participant_count, status")
      .eq("id", event_id)
      .eq("status", "published")
      .single();

    if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    // ── Capacity check: per-category or event-wide ────────────────────────────
    let isFull = false;
    let categoryLabel = "";

    if (distance_category) {
      // Check if the specific race category is full
      const { data: race } = await db
        .from("event_races")
        .select("id, max_slots, name")
        .eq("event_id", event_id)
        .eq("distance", distance_category)
        .maybeSingle();

      if (race?.max_slots) {
        // Count confirmed registrations for this category
        const { count } = await db
          .from("event_registrations")
          .select("*", { count: "exact", head: true })
          .eq("event_id", event_id)
          .eq("distance_category", distance_category)
          .neq("status", "cancelled")
          .in("payment_status", ["paid", "free"]);

        isFull = (count ?? 0) >= race.max_slots;
        categoryLabel = ` for the ${race.name ?? distance_category} category`;
      } else {
        // Race has no per-race cap — fall back to event-level
        isFull = ev.max_participants !== null && (ev.participant_count ?? 0) >= ev.max_participants;
      }
    } else {
      // No category — event-level check
      isFull = ev.max_participants !== null && (ev.participant_count ?? 0) >= ev.max_participants;
    }

    if (!isFull) {
      return NextResponse.json({ error: `Spots are still available${categoryLabel} — please register directly` }, { status: 400 });
    }

    // ── Block already-confirmed registrants ───────────────────────────────────
    // Only block users with a CONFIRMED registration (paid/free, not cancelled).
    // Pending/abandoned rows must not block waitlist enrollment.
    const { data: existing } = await db
      .from("event_registrations")
      .select("id, payment_status, status, distance_category")
      .eq("event_id", event_id)
      .eq("user_email", email.toLowerCase().trim())
      .neq("status", "cancelled")
      .in("payment_status", ["paid", "free"])
      .maybeSingle();

    if (existing) {
      const sameCategory = !distance_category || existing.distance_category === distance_category;
      if (sameCategory) {
        return NextResponse.json({ error: "You are already registered for this event" }, { status: 400 });
      }
    }

    // ── Check already on waitlist for this category ───────────────────────────
    const wlQuery = db
      .from("event_waitlist")
      .select("id, position")
      .eq("event_id", event_id)
      .eq("user_email", email.toLowerCase().trim())
      .eq("status", "waiting");

    // Match on category: both null or both equal
    const { data: onList } = distance_category
      ? await wlQuery.eq("distance_category", distance_category).maybeSingle()
      : await wlQuery.is("distance_category", null).maybeSingle();

    if (onList) {
      return NextResponse.json({
        already: true,
        position: onList.position,
        message: `You are already on the waitlist${categoryLabel} at position #${onList.position}`,
      });
    }

    // ── Add to waitlist ───────────────────────────────────────────────────────
    const { data: entry, error } = await db
      .from("event_waitlist")
      .insert({
        event_id,
        user_email:        email.toLowerCase().trim(),
        user_name:         name.trim(),
        phone:             phone ?? null,
        distance_category: distance_category ?? null,
        notes:             notes ?? null,
      })
      .select("position")
      .single();

    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

    return NextResponse.json({
      success:  true,
      position: entry?.position,
      message:  `You're on the waitlist${categoryLabel} at position #${entry?.position}. We'll notify you if a spot opens up.`,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
