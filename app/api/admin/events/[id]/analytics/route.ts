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

  // Step 1: Always-safe core query — uses only columns that exist in the base schema.
  // Deliberately avoids columns added by optional migrations (phase3 BIB, phase5 certs).
  // This ensures funnel + revenue + email stats always work.
  const [evRes, coreRegsRes, resultsRes] = await Promise.all([
    db.from("events").select("title, start_date, max_participants, participant_count").eq("id", eventId).single(),
    db.from("event_registrations")
      .select("payment_status, final_price, status, created_at, distance_category, email_status, checked_in_at")
      .eq("event_id", eventId),
    db.from("event_results")
      .select("status, finish_time, overall_position, distance_category")
      .eq("event_id", eventId),
  ]);

  if (coreRegsRes.error) console.error("[analytics] core regs failed:", coreRegsRes.error.message);
  if (resultsRes.error)  console.error("[analytics] results failed:",   resultsRes.error.message);

  const ev      = evRes.data;
  const regs    = coreRegsRes.data ?? [];
  const results = resultsRes.data ?? [];

  // Step 2: Optional race-day / certificate columns — added by phase3 & phase5 migrations.
  // If the migration hasn't run these queries return an error; we fall back to 0.
  const [raceRegsRes, certRegsRes] = await Promise.all([
    db.from("event_registrations")
      .select("bib_collected_at, breakfast_availed")
      .eq("event_id", eventId),
    db.from("event_registrations")
      .select("certificate_generated_at")
      .eq("event_id", eventId)
      .not("certificate_generated_at", "is", null),
  ]);

  const raceRegs = raceRegsRes.data  ?? [];
  const certRegs = certRegsRes.error ? [] : (certRegsRes.data ?? []);

  // Build combined view for race-day analytics
  const bibCollected        = raceRegs.filter(r => r.bib_collected_at).length;
  const breakfastIssued     = raceRegs.filter(r => r.breakfast_availed).length;
  const certificatesGenerated = certRegs.length;

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
  const checkedIn = regs.filter(r => r.checked_in_at).length;
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
    if (r.checked_in_at) byRace[cat].checked_in++;
  }
  for (const r of results) {
    const cat = r.distance_category ?? "Unspecified";
    if (byRace[cat] && r.status === "finisher") byRace[cat].finishers++;
  }

  // ── Registrations over time (daily, last 30 days or since event created) ──
  const dailyCounts: Record<string, number> = {};
  for (const r of regs) {
    const day = r.created_at.slice(0, 10);
    dailyCounts[day] = (dailyCounts[day] ?? 0) + 1;
  }
  const registrationTimeline = Object.entries(dailyCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

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
  });
}
