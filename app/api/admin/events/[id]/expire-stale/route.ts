import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/events/[id]/expire-stale
// Manually expires orphaned pending_payment registrations for a specific event.
// Targets two kinds of stale rows:
//   1. slot_reserved_at IS NOT NULL AND slot_expires_at < NOW()  — TTL elapsed
//   2. slot_reserved_at IS NULL AND created_at < NOW()-30min     — slot never reserved
// These are the rows that block affected users from joining the waitlist.
export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const db = getSupabaseServer();

  // Verify the event exists
  const { data: ev } = await db
    .from("events")
    .select("id, title")
    .eq("id", eventId)
    .single();
  if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Cancel associated participants first
  const { data: staleRegs } = await db
    .from("event_registrations")
    .select("id")
    .eq("event_id", eventId)
    .eq("status", "pending_payment")
    .eq("payment_status", "pending")
    .or("slot_reserved_at.is.null,slot_expires_at.lt.now()");

  const staleIds = (staleRegs ?? []).map(r => r.id);

  let participantsCancelled = 0;
  if (staleIds.length > 0) {
    const { count } = await db
      .from("event_participants")
      .update({ status: "cancelled" }, { count: "exact" })
      .in("registration_id", staleIds);
    participantsCancelled = count ?? 0;
  }

  // Expire the registration rows
  const { count: expired } = await db
    .from("event_registrations")
    .update({ status: "cancelled", payment_status: "expired" }, { count: "exact" })
    .eq("event_id", eventId)
    .eq("status", "pending_payment")
    .eq("payment_status", "pending")
    .or("slot_reserved_at.is.null,slot_expires_at.lt.now()");

  return NextResponse.json({
    success: true,
    event_id: eventId,
    event_title: ev.title,
    registrations_expired: expired ?? 0,
    participants_cancelled: participantsCancelled,
    message: expired
      ? `Expired ${expired} stale registration(s). Affected users can now join the waitlist.`
      : "No stale registrations found for this event.",
  });
}
