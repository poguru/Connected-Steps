import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET /api/events/rsvp?event_id=...&email=...  — check if already registered
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get("event_id");
  const email   = req.nextUrl.searchParams.get("email");
  if (!eventId || !email) return NextResponse.json({ registered: false });

  const db = getSupabaseServer();
  const { data } = await db
    .from("event_rsvp")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_email", email.toLowerCase().trim())
    .single();

  return NextResponse.json({ registered: !!data });
}

// POST /api/events/rsvp  — register { event_id, email }
export async function POST(req: NextRequest) {
  const { event_id, email } = await req.json();
  if (!event_id || !email) {
    return NextResponse.json({ error: "event_id and email are required." }, { status: 400 });
  }

  const db = getSupabaseServer();

  // Verify user exists
  const { data: user } = await db
    .from("users")
    .select("email, first_name, last_name")
    .eq("email", email.toLowerCase().trim())
    .single();
  if (!user) {
    return NextResponse.json({ error: "Account not found. Please sign up first." }, { status: 404 });
  }

  // Verify event exists and is published
  const { data: event } = await db
    .from("events")
    .select("id, title, start_date, start_time, location, status")
    .eq("id", event_id)
    .single();
  if (!event || event.status !== "published") {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  // Upsert — idempotent
  const { error } = await db.from("event_rsvp").upsert({
    event_id,
    user_email: user.email,
    user_name:  `${user.first_name} ${user.last_name}`.trim(),
  }, { onConflict: "event_id,user_email" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, event });
}
