import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/communication/recent
// Returns recent campaigns from event_comm_history joined with events, newest first.
// Supports ?limit= (default 50) and ?event_id= filter.
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit    = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);
  const eventId  = searchParams.get("event_id");
  const channel  = searchParams.get("channel");
  const status   = searchParams.get("status");

  const db = getSupabaseServer();

  let q = db
    .from("event_comm_history")
    .select(`
      id, event_id, channel, status, recipient_filter, sent_at, scheduled_for,
      batch_id, subject, message, recipient_count,
      delivered_count, failed_count, opened_count,
      events!inner (title, slug)
    `)
    .order("sent_at", { ascending: false, nullsFirst: false })
    .order("scheduled_for", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (eventId) q = q.eq("event_id", eventId);
  if (channel)  q = q.eq("channel", channel);
  if (status)   q = q.eq("status", status);

  const { data, error } = await q;

  if (error) {
    console.error("[comm/recent] query error:", error.message);
    return NextResponse.json({ error: "Failed to load campaigns" }, { status: 500 });
  }

  // Normalize — events join is !inner so it's always present
  const campaigns = (data ?? []).map(row => {
    const ev = Array.isArray(row.events) ? row.events[0] : row.events;
    return {
      id:               row.id,
      event_id:         row.event_id,
      event_title:      ev?.title ?? null,
      event_slug:       ev?.slug  ?? null,
      channel:          row.channel,
      status:           row.status,
      subject:          row.subject,
      message:          row.message,
      recipient_filter: row.recipient_filter,
      recipient_count:  row.recipient_count ?? null,
      delivered_count:  row.delivered_count ?? null,
      failed_count:     row.failed_count    ?? null,
      opened_count:     row.opened_count    ?? null,
      batch_id:         row.batch_id,
      sent_at:          row.sent_at,
      scheduled_for:    row.scheduled_for,
    };
  });

  return NextResponse.json({ campaigns, total: campaigns.length });
}
