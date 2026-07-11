import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// POST /api/events/waitlist â€” public endpoint to join waitlist for a sold-out event
export async function POST(req: NextRequest) {
  try {
    const { event_id, name, email, phone, distance_category, notes } =
      await req.json() as { event_id: string; name: string; email: string; phone?: string; distance_category?: string; notes?: string };

    if (!event_id || !name?.trim() || !email?.trim())
      return NextResponse.json({ error: "event_id, name, and email are required" }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });

    const db = getSupabaseServer();

    // Verify event is published and at capacity (waitlist only makes sense for full events)
    const { data: ev } = await db
      .from("events")
      .select("id, title, max_participants, participant_count, status")
      .eq("id", event_id)
      .eq("status", "published")
      .single();

    if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    const isFull = ev.max_participants !== null && (ev.participant_count ?? 0) >= ev.max_participants;
    if (!isFull) return NextResponse.json({ error: "Event still has spots â€” please register directly" }, { status: 400 });

    // Check already registered
    const { data: existing } = await db
      .from("event_registrations")
      .select("id")
      .eq("event_id", event_id)
      .eq("user_email", email.toLowerCase().trim())
      .maybeSingle();
    if (existing) return NextResponse.json({ error: "You are already registered for this event" }, { status: 400 });

    // Check already on waitlist
    const { data: onList } = await db
      .from("event_waitlist")
      .select("id, position")
      .eq("event_id", event_id)
      .eq("user_email", email.toLowerCase().trim())
      .eq("status", "waiting")
      .maybeSingle();
    if (onList) return NextResponse.json({ already: true, position: onList.position, message: `You are already on the waitlist at position #${onList.position}` });

    // Add to waitlist
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
      message:  `You're on the waitlist at position #${entry?.position}. We'll notify you if a spot opens up.`,
    });
  } catch (e) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
