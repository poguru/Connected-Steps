import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/events/[id]/stats
// THE single source of truth for all event statistics.
// Calls event_stats() and event_raceday_stats() RPCs — single-pass SQL aggregations.
// Every dashboard page (Overview, Analytics, Race Day, Finance) consumes this endpoint.
// Cache-Control: 30s max-age so rapid page navigations stay consistent.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const [
    { data: ev,         error: evErr },
    { data: coreStats,  error: coreErr },
    { data: raceDayRaw },
    { data: races },
    { data: results },
    { data: commHist },
    { data: emailQueue },
  ] = await Promise.all([
    db.from("events")
      .select("id, title, status, start_date, start_time, end_date, end_time, location, max_participants, participant_count, price, cover_image, registration_closes_at, distance_categories, share_slug")
      .eq("id", id)
      .single(),

    // Core registrations stats — single-pass aggregation
    db.rpc("event_stats", { p_event_id: id }),

    // Optional race-day columns — safe even if phase-3 migration not yet applied
    db.rpc("event_raceday_stats", { p_event_id: id }),

    db.from("event_races").select("id, name, distance, price, max_slots, status, gun_time, flag_off_time, report_time").eq("event_id", id).order("display_order"),

    db.from("event_results").select("id, status").eq("event_id", id),

    db.from("event_comm_history")
      .select("id, sent_at, subject, sent, failed, status, channel, recipients, batch_id, recipient_filter")
      .eq("event_id", id)
      .order("sent_at", { ascending: false })
      .limit(20),

    db.from("email_queue")
      .select("status")
      .eq("event_id", id),
  ]);

  if (evErr)   return NextResponse.json({ error: evErr.message },  { status: 500 });
  if (coreErr) return NextResponse.json({ error: coreErr.message }, { status: 500 });

  const stats    = (coreStats  as Record<string, number | object> | null) ?? {};
  const raceDay  = (raceDayRaw as Record<string, number> | null) ?? {};
  const allResults = results ?? [];
  const hist       = commHist ?? [];
  const queue      = emailQueue ?? [];

  // Merge raceday optional stats into core
  const confirmed  = (stats.confirmed  as number) ?? 0;
  const maxCap     = ev?.max_participants ?? null;

  // Campaign email delivery from queue table
  const qDelivered = queue.filter(r => r.status === "delivered").length;
  const qFailed    = queue.filter(r => r.status === "failed").length;
  const qQueued    = queue.filter(r => r.status === "queued").length;

  const response = NextResponse.json({
    event:    ev,
    stats: {
      // Core counts (always accurate — from event_stats RPC)
      total:             (stats.total           as number) ?? 0,
      confirmed,
      cancelled:         (stats.cancelled       as number) ?? 0,
      pending:           (stats.pending         as number) ?? 0,
      paid:              (stats.paid            as number) ?? 0,
      free:              (stats.free            as number) ?? 0,
      checked_in:        (stats.checked_in      as number) ?? 0,

      // Race-day optional (from event_raceday_stats RPC)
      bib_collected:     raceDay.bib_collected  ?? 0,
      breakfast:         raceDay.breakfast      ?? 0,
      certificates:      raceDay.certificates   ?? 0,

      // Revenue
      revenue_collected: (stats.revenue_collected as number) ?? 0,
      revenue_pending:   (stats.revenue_pending   as number) ?? 0,
      avg_per_paid:      (stats.avg_per_paid      as number) ?? 0,

      // Email — transactional (confirmation emails, per-registration)
      email_sent:        (stats.email_sent   as number) ?? 0,
      email_failed:      (stats.email_failed as number) ?? 0,
      email_none:        (stats.email_none   as number) ?? 0,

      // Email — bulk campaigns
      campaign_delivered: qDelivered,
      campaign_failed:    qFailed,
      campaign_queued:    qQueued,
      campaigns:          hist.length,

      // Capacity
      capacity_max:       maxCap,
      capacity_filled:    confirmed,
      capacity_remaining: maxCap !== null ? Math.max(0, maxCap - confirmed) : null,
      capacity_pct:       maxCap && maxCap > 0 ? Math.round((confirmed / maxCap) * 100) : null,

      // Results
      finishers:          allResults.filter(r => r.status === "finisher").length,
      dnf:                allResults.filter(r => r.status === "dnf").length,
      dns:                allResults.filter(r => r.status === "dns").length,

      // Breakdown by category and timeline — from event_stats RPC
      by_category: (stats.by_category as object) ?? {},
      timeline:    (stats.timeline    as object[]) ?? [],

      computed_at: (stats.computed_at as unknown as string),
    },
    races:        races ?? [],
    recent_comms: hist.slice(0, 5),
  });

  // Cache for 30 seconds — consistent across tabs, avoids thrashing Supabase
  response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
  return response;
}
