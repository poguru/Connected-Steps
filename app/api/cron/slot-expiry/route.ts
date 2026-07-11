import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// Cron: /api/cron/slot-expiry â€” runs every 30 minutes via Vercel cron.
// Releases event registration slots that have been held in 'pending_payment'
// status past their expiry window (default 30 minutes) so they can be claimed
// by other participants.
export async function GET() {
  try {
    const db = getSupabaseServer();

    // release_expired_slots() is defined in 20260626000007_event_slot_protection.sql
    // It marks pending_payment registrations older than the slot TTL as 'expired'
    // and decrements the participant_count cache on the events table.
    const { data, error } = await db.rpc("release_expired_slots");

    if (error) {
      console.error("[slot-expiry] RPC error:", error.message);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const released = (data as number | null) ?? 0;
    console.log(`[slot-expiry] Released ${released} expired slots`);

    return NextResponse.json({ ok: true, released, ts: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
