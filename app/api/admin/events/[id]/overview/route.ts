import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/events/[id]/overview
// Single endpoint for the Event Hub overview dashboard.
// Avoids the paginated-list anti-pattern that caused all stats to show 0.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const [
    { data: ev,     error: evErr },
    { data: regs,   error: regErr },
    { data: races },
    { data: history },
    { data: emailQ },
  ] = await Promise.all([
    db.from("events")
      .select("id, title, status, start_date, start_time, end_date, end_time, location, max_participants, price, cover_image, registration_closes_at, distance_categories, featured, share_slug")
      .eq("id", id)
      .single(),

    // Only select the columns needed for aggregation — lightweight even for 1000+ registrations
    db.from("event_registrations")
      .select("payment_status, status, checked_in_at, final_price")
      .eq("event_id", id),

    db.from("event_races")
      .select("id, name, distance, price, max_slots, status, gun_time, flag_off_time, report_time")
      .eq("event_id", id)
      .order("distance"),

    // Last 20 communication campaigns for email stats
    db.from("event_comm_history")
      .select("sent, failed, status, sent_at, subject, channel, recipients")
      .eq("event_id", id)
      .order("sent_at", { ascending: false })
      .limit(20),

    // Latest batch delivery summary from email_queue
    db.from("email_queue")
      .select("status")
      .eq("event_id", id),
  ]);

  if (evErr) return NextResponse.json({ error: evErr.message }, { status: 500 });
  if (regErr) return NextResponse.json({ error: regErr.message }, { status: 500 });

  // ── Compute registration stats from raw rows (accurate, no pagination gaps) ──
  const all = regs ?? [];

  const confirmed  = all.filter(r => r.status === "confirmed").length;
  const cancelled  = all.filter(r => r.status === "cancelled").length;
  const pending    = all.filter(r => ["pending_payment", "pending"].includes(r.status ?? "")).length;
  const paid       = all.filter(r => r.payment_status === "paid").length;
  const free       = all.filter(r => r.payment_status === "free").length;
  const checkedIn  = all.filter(r => r.checked_in_at != null).length;
  const total      = all.length;
  const active     = total - cancelled;

  const revenue        = all.filter(r => r.payment_status === "paid").reduce((s, r) => s + (r.final_price ?? 0), 0);
  const pendingRevenue = all.filter(r => r.payment_status === "pending").reduce((s, r) => s + (r.final_price ?? 0), 0);

  // ── Email stats ────────────────────────────────────────────────────────────
  const hist           = history ?? [];
  const emailSent      = hist.reduce((s, h) => s + (h.sent    ?? 0), 0);
  const emailFailed    = hist.reduce((s, h) => s + (h.failed  ?? 0), 0);

  // From the queue table (per-email accuracy)
  const queueRows      = emailQ ?? [];
  const qDelivered     = queueRows.filter(r => r.status === "delivered").length;
  const qFailed        = queueRows.filter(r => r.status === "failed").length;
  const qQueued        = queueRows.filter(r => r.status === "queued").length;

  // ── Capacity ────────────────────────────────────────────────────────────────
  const maxCap   = ev?.max_participants ?? null;
  const remaining = maxCap !== null ? Math.max(0, maxCap - active) : null;

  return NextResponse.json({
    event: ev,
    registrations: { total, confirmed, pending, cancelled, paid, free, checked_in: checkedIn, active },
    capacity:      { max: maxCap, filled: active, remaining },
    revenue:       { collected: revenue, pending: pendingRevenue },
    emails: {
      campaigns:  hist.length,
      sent:       Math.max(emailSent, qDelivered),
      failed:     Math.max(emailFailed, qFailed),
      queued:     qQueued,
      delivered:  qDelivered,
    },
    races:        races ?? [],
    recent_comms: hist.slice(0, 5),
  });
}
