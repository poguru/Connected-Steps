import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/events/[id]/analytics
// Returns detailed analytics for a single event — registration funnel,
// revenue breakdown, race distribution, check-in + breakfast rates.
// All computed on-demand from existing tables.

export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const db = getSupabaseServer();

  // Step 1: Core queries.
  // event_participants is the authoritative source for all race-day service columns
  // (checked_in_at, bib_collected_at, breakfast_availed). The ops scan route writes
  // these to event_participants only — event_registrations is never updated.
  const [evRes, coreRegsRes, resultsRes, participantsRes] = await Promise.all([
    db.from("events").select("title, start_date, max_participants, participant_count").eq("id", eventId).single(),
    db.from("event_registrations")
      .select("id, payment_status, final_price, status, created_at, distance_category, email_status")
      .eq("event_id", eventId),
    db.from("event_results")
      .select("status, finish_time, overall_position, distance_category")
      .eq("event_id", eventId),
    db.from("event_participants")
      .select("registration_id, checked_in_at, bib_collected_at, breakfast_availed, tshirt_issued")
      .eq("event_id", eventId)
      .neq("status", "cancelled"),
  ]);

  if (coreRegsRes.error) console.error("[analytics] core regs failed:", coreRegsRes.error.message);
  if (resultsRes.error)  console.error("[analytics] results failed:",   resultsRes.error.message);

  const ev           = evRes.data;
  const regs         = coreRegsRes.data ?? [];
  const results      = resultsRes.data ?? [];
  const participants = participantsRes.data ?? [];

  // Step 2: Optional certificate column (phase5 migration). Fall back to 0 on error.
  const certRegsRes = await db.from("event_registrations")
    .select("certificate_generated_at")
    .eq("event_id", eventId)
    .not("certificate_generated_at", "is", null);

  const certRegs = certRegsRes.error ? [] : (certRegsRes.data ?? []);

  // Race-day counts from event_participants (authoritative)
  const bibCollected          = participants.filter(p => p.bib_collected_at).length;
  const breakfastIssued       = participants.filter(p => p.breakfast_availed).length;
  const certificatesGenerated = certRegs.length;

  // Set of registration IDs whose participant has checked in — used for by_race breakdown
  const checkedInRegIds = new Set(participants.filter(p => p.checked_in_at).map(p => p.registration_id));

  // ── Registration funnel ───────────────────────────────────────────────────
  const total       = regs.length;
  const confirmed   = regs.filter(r => r.status === "confirmed").length;
  const paid        = regs.filter(r => r.payment_status === "paid").length;
  const free        = regs.filter(r => r.payment_status === "free").length;
  const pending     = regs.filter(r => r.payment_status === "pending").length;
  const cancelled   = regs.filter(r => r.status === "cancelled").length;

  // ── Revenue ───────────────────────────────────────────────────────────────
  const revenue = regs
    .filter(r => r.payment_status === "paid")
    .reduce((s, r) => s + (r.final_price ?? 0), 0);

  // ── Race day progression ──────────────────────────────────────────────────
  const checkedIn = participants.filter(p => p.checked_in_at).length;
  const finishers = results.filter(r => r.status === "finisher").length;
  // bibCollected, breakfastIssued, certificatesGenerated — from step 2 queries above

  const checkInRate     = confirmed > 0 ? Math.round((checkedIn / confirmed)       * 100) : 0;
  const bibRate         = confirmed > 0 ? Math.round((bibCollected / confirmed)    * 100) : 0;
  const breakfastRate   = checkedIn > 0 ? Math.round((breakfastIssued / checkedIn) * 100) : 0;
  const finisherRate    = checkedIn > 0 ? Math.round((finishers / checkedIn)       * 100) : 0;
  const certRate        = finishers > 0 ? Math.round((certificatesGenerated / finishers) * 100) : 0;

  // ── Email delivery ────────────────────────────────────────────────────────
  const emailSent   = regs.filter(r => r.email_status === "sent").length;
  const emailFailed = regs.filter(r => r.email_status === "failed").length;
  const emailNone   = regs.filter(r => !r.email_status).length;
  const emailRate   = confirmed > 0 ? Math.round((emailSent / confirmed) * 100) : 0;

  // ── Race distribution ─────────────────────────────────────────────────────
  const byRace: Record<string, { total: number; paid: number; revenue: number; checked_in: number; finishers: number }> = {};
  for (const r of regs) {
    const cat = r.distance_category ?? "Unspecified";
    if (!byRace[cat]) byRace[cat] = { total: 0, paid: 0, revenue: 0, checked_in: 0, finishers: 0 };
    byRace[cat].total++;
    if (r.payment_status === "paid") { byRace[cat].paid++; byRace[cat].revenue += r.final_price ?? 0; }
    if (checkedInRegIds.has(r.id)) byRace[cat].checked_in++;
  }
  for (const r of results) {
    const cat = r.distance_category ?? "Unspecified";
    if (byRace[cat] && r.status === "finisher") byRace[cat].finishers++;
  }

  // ── Registrations over time (daily) ──────────────────────────────────────
  const dailyCounts: Record<string, number> = {};
  for (const r of regs) {
    const day = r.created_at.slice(0, 10);
    dailyCounts[day] = (dailyCounts[day] ?? 0) + 1;
  }
  const registrationTimeline = Object.entries(dailyCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  // ── Weekly registration cohorts with check-in conversion ─────────────────
  // Groups registrations by ISO week; shows how many from each cohort checked in.
  const weeklyGroups: Record<string, { registered: number; checkin: number; paid: number; cancelled: number }> = {};
  const checkinByRegId = new Map(participants.map(p => [p.registration_id, Boolean(p.checked_in_at)]));

  for (const r of regs) {
    const d    = new Date(r.created_at);
    // Monday-based week start
    const day  = d.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    const mon  = new Date(d); mon.setDate(d.getDate() + diff); mon.setHours(0, 0, 0, 0);
    const week = mon.toISOString().slice(0, 10);
    if (!weeklyGroups[week]) weeklyGroups[week] = { registered: 0, checkin: 0, paid: 0, cancelled: 0 };
    weeklyGroups[week].registered++;
    if (r.payment_status === "paid" || r.payment_status === "free") weeklyGroups[week].paid++;
    if (r.status === "cancelled") weeklyGroups[week].cancelled++;
    if (checkinByRegId.get(r.id)) weeklyGroups[week].checkin++;
  }
  const cohortWeeks = Object.entries(weeklyGroups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, v]) => ({
      week,
      registered: v.registered,
      paid:       v.paid,
      checkin:    v.checkin,
      cancelled:  v.cancelled,
      paid_pct:   v.registered > 0 ? Math.round(v.paid / v.registered * 100) : 0,
      checkin_pct: v.paid > 0 ? Math.round(v.checkin / v.paid * 100) : 0,
    }));

  // ── Capacity utilisation ──────────────────────────────────────────────────
  const capacity     = ev?.max_participants ?? null;
  const capacityUsed = capacity ? Math.round((confirmed / capacity) * 100) : null;

  return NextResponse.json({
    event: { title: ev?.title, start_date: ev?.start_date, capacity, participant_count: ev?.participant_count },

    funnel: { total, confirmed, paid, free, pending, cancelled },
    revenue: { total: revenue, avg_per_participant: paid > 0 ? Math.round(revenue / paid) : 0 },
    capacity: { max: capacity, used: confirmed, pct: capacityUsed },

    race_day: {
      checked_in:    { count: checkedIn,       pct: checkInRate },
      bib_collected: { count: bibCollected,     pct: bibRate },
      breakfast:     { count: breakfastIssued,  pct: breakfastRate },
      finishers:     { count: finishers,         pct: finisherRate },
      certificates:  { count: certificatesGenerated, pct: certRate },
    },

    email: {
      sent:   emailSent,
      failed: emailFailed,
      none:   emailNone,
      rate:   emailRate,
    },

    by_race: byRace,
    registration_timeline: registrationTimeline,
    cohort_weeks: cohortWeeks,
    tshirt_issued: participants.filter(p => p.tshirt_issued).length,
  });
}
