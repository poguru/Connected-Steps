import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

export interface OpsMetrics {
  total_regs:           number;
  confirmed:            number;
  pending_payment:      number;
  cancelled:            number;
  waitlist_count:       number;
  remaining_slots:      number | null;
  checked_in:           number;
  tshirt_issued:        number;
  breakfast_issued:     number;
  medals_issued:        number;
  bib_collected:        number;
  certificates_issued:  number;
  revenue_collected:    number;
  coupons_used:         number;
  volunteers_assigned:  number;
}

export interface OpsAlert {
  id:       string;
  severity: "info" | "warning" | "critical";
  type:     string;
  message:  string;
}

export interface OpsHealthFactor {
  label:  string;
  score:  number;
  detail: string;
}

export interface OpsResponse {
  event: {
    id: string; title: string; status: string;
    start_date: string | null; start_time: string | null;
    location: string | null; max_participants: number | null;
    share_slug: string | null;
  };
  metrics:      OpsMetrics;
  health:       { score: number; status: "green" | "amber" | "red"; factors: OpsHealthFactor[] };
  alerts:       OpsAlert[];
  pending_jobs: number;
  email_queue:  { queued: number; failed: number; dead: number };
  as_of:        string;
}

// GET /api/admin/events/[id]/ops
// Single aggregated endpoint for the Command Center.
// Runs all DB queries in parallel; returns in ~100-200ms for events with <10k rows.
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const db = getSupabaseServer();

  const [
    evRes,
    regsRes,
    partsRes,
    waitlistRes,
    volunteersRes,
    jobsRes,
    emailQueueRes,
  ] = await Promise.all([
    db.from("events")
      .select("id, title, status, start_date, start_time, end_date, location, max_participants, share_slug")
      .eq("id", eventId)
      .single(),

    // Lightweight registration aggregate — payment/status/coupon columns only
    db.from("event_registrations")
      .select("status, payment_status, final_price, coupon_code")
      .eq("event_id", eventId),

    // Participant service counts in a single pass
    db.from("event_participants")
      .select("checked_in_at, tshirt_issued, breakfast_availed, medal_issued, bib_collected_at, certificate_issued")
      .eq("event_id", eventId)
      .neq("status", "cancelled"),

    // Waitlist count
    db.from("event_waitlist")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", "waiting"),

    // Volunteer assignments count
    db.from("event_portal_user_assignments")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId),

    // Job queue health
    db.from("job_queue")
      .select("status")
      .in("status", ["pending", "dead"]),

    // Email queue health
    db.from("email_queue")
      .select("status")
      .eq("event_id", eventId)
      .in("status", ["queued", "failed"]),
  ]);

  if (evRes.error || !evRes.data) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const ev   = evRes.data;
  const regs = regsRes.data ?? [];
  const parts = partsRes.data ?? [];

  // ── Registration aggregates ────────────────────────────────────────────────
  const confirmed     = regs.filter(r => r.status === "confirmed").length;
  const cancelled     = regs.filter(r => r.status === "cancelled").length;
  const pendingPay    = regs.filter(r => ["pending_payment", "pending"].includes(r.status ?? "")).length;
  const paid          = regs.filter(r => r.payment_status === "paid").length;
  const couponsUsed   = regs.filter(r => r.coupon_code).length;
  const revenue       = regs.filter(r => r.payment_status === "paid").reduce((s, r) => s + (r.final_price ?? 0), 0);
  const totalRegs     = regs.length;

  const maxCap        = ev.max_participants ?? null;
  const remaining     = maxCap !== null ? Math.max(0, maxCap - confirmed) : null;
  const waitlistCount = waitlistRes.count ?? 0;

  // ── Participant service aggregates ─────────────────────────────────────────
  const checkedIn     = parts.filter(p => p.checked_in_at).length;
  const tshirtIssued  = parts.filter(p => p.tshirt_issued).length;
  const breakfastIss  = parts.filter(p => p.breakfast_availed).length;
  const medalsIssued  = parts.filter(p => p.medal_issued).length;
  const bibCollected  = parts.filter(p => p.bib_collected_at).length;
  const certsIssued   = parts.filter(p => p.certificate_issued).length;
  const totalParts    = parts.length;

  const volunteersAssigned = volunteersRes.count ?? 0;

  // ── Queue health ──────────────────────────────────────────────────────────
  const jobs      = jobsRes.data ?? [];
  const pendingJobs = jobs.filter(j => j.status === "pending").length;
  const deadJobs    = jobs.filter(j => j.status === "dead").length;

  const emailQ      = emailQueueRes.data ?? [];
  const emailQueued = emailQ.filter(e => e.status === "queued").length;
  const emailFailed = emailQ.filter(e => e.status === "failed").length;

  // ── Health score ──────────────────────────────────────────────────────────
  const factors: OpsHealthFactor[] = [];
  let totalWeight = 0;
  let weightedScore = 0;

  function addFactor(label: string, score: number, weight: number, detail: string) {
    factors.push({ label, score, detail });
    totalWeight   += weight;
    weightedScore += score * weight;
  }

  // Factor 1: Registration funnel (confirmed / total)
  if (totalRegs > 0) {
    const rate = Math.round((confirmed / totalRegs) * 100);
    addFactor("Registration Completion", rate, 20, `${confirmed}/${totalRegs} confirmed (${rate}%)`);
  } else {
    addFactor("Registration Completion", 100, 20, "No registrations yet");
  }

  // Factor 2: Payment success (paid / (paid + pendingPay))
  const payTotal = paid + pendingPay;
  if (payTotal > 0) {
    const rate = Math.round((paid / payTotal) * 100);
    addFactor("Payment Success", rate, 20, `${paid}/${payTotal} paid (${rate}%)`);
  } else {
    addFactor("Payment Success", 100, 20, "No paid registrations");
  }

  // Factor 3: Check-in rate (relevant on event day; use confirmed as denominator)
  if (confirmed > 0) {
    const rate = Math.round((checkedIn / confirmed) * 100);
    const score = checkedIn === 0 ? 80 : rate; // 0 check-ins before event day is fine
    addFactor("Check-in Progress", score, 20, `${checkedIn}/${confirmed} checked in (${rate}%)`);
  } else {
    addFactor("Check-in Progress", 100, 20, "No confirmed registrations");
  }

  // Factor 4: Job queue health
  const queueScore = pendingJobs < 50 && deadJobs === 0 ? 100 : deadJobs > 0 ? 40 : pendingJobs > 200 ? 50 : 75;
  addFactor("Job Queue", queueScore, 15, deadJobs > 0 ? `${deadJobs} dead jobs — needs attention` : `${pendingJobs} pending`);

  // Factor 5: Email queue
  const emailScore = emailFailed === 0 ? 100 : emailFailed > 50 ? 40 : emailFailed > 10 ? 70 : 85;
  addFactor("Email Delivery", emailScore, 15, emailFailed > 0 ? `${emailFailed} failed emails` : "All clear");

  // Factor 6: Volunteer coverage
  const volScore = volunteersAssigned >= 3 ? 100 : volunteersAssigned > 0 ? 70 : 40;
  addFactor("Volunteer Coverage", volScore, 10, `${volunteersAssigned} volunteer assignment(s)`);

  const healthScore  = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 100;
  const healthStatus: "green" | "amber" | "red" = healthScore >= 75 ? "green" : healthScore >= 50 ? "amber" : "red";

  // ── Auto-alerts ──────────────────────────────────────────────────────────
  const alerts: OpsAlert[] = [];
  let alertId = 0;
  const mk = (severity: OpsAlert["severity"], type: string, message: string): OpsAlert =>
    ({ id: String(++alertId), severity, type, message });

  if (remaining !== null && remaining <= 0) {
    alerts.push(mk("warning", "capacity_full", `Event is full — ${confirmed} confirmed, ${waitlistCount} on waitlist`));
  }
  if (remaining !== null && remaining > 0 && remaining <= 10) {
    alerts.push(mk("info", "capacity_low", `Only ${remaining} slot(s) remaining`));
  }
  if (pendingPay > 0 && totalRegs > 0 && pendingPay / totalRegs > 0.15) {
    alerts.push(mk("warning", "payment_failures", `${pendingPay} registrations pending payment (${Math.round(pendingPay / totalRegs * 100)}%)`));
  }
  if (waitlistCount > 20) {
    alerts.push(mk("info", "waitlist_growth", `${waitlistCount} participants on waitlist`));
  }
  if (emailFailed > 5) {
    alerts.push(mk(emailFailed > 50 ? "critical" : "warning", "email_failures", `${emailFailed} failed emails in queue`));
  }
  if (deadJobs > 0) {
    alerts.push(mk("critical", "dead_jobs", `${deadJobs} dead background job(s) — check admin logs`));
  }
  if (pendingJobs > 200) {
    alerts.push(mk("warning", "queue_backlog", `${pendingJobs} jobs pending in background queue`));
  }
  if (volunteersAssigned === 0 && confirmed > 0) {
    alerts.push(mk("warning", "no_volunteers", "No volunteers assigned — ops portal will be empty"));
  }

  const metrics: OpsMetrics = {
    total_regs:          totalRegs,
    confirmed,
    pending_payment:     pendingPay,
    cancelled,
    waitlist_count:      waitlistCount,
    remaining_slots:     remaining,
    checked_in:          checkedIn,
    tshirt_issued:       tshirtIssued,
    breakfast_issued:    breakfastIss,
    medals_issued:       medalsIssued,
    bib_collected:       bibCollected,
    certificates_issued: certsIssued,
    revenue_collected:   revenue,
    coupons_used:        couponsUsed,
    volunteers_assigned: volunteersAssigned,
  };

  const response: OpsResponse = {
    event: {
      id:               ev.id,
      title:            ev.title ?? "",
      status:           ev.status ?? "draft",
      start_date:       ev.start_date ?? null,
      start_time:       ev.start_time ?? null,
      location:         ev.location ?? null,
      max_participants: ev.max_participants ?? null,
      share_slug:       ev.share_slug ?? null,
    },
    metrics,
    health:       { score: healthScore, status: healthStatus, factors },
    alerts,
    pending_jobs: pendingJobs,
    email_queue:  { queued: emailQueued, failed: emailFailed, dead: deadJobs },
    as_of:        new Date().toISOString(),
  };

  return NextResponse.json(response);
}
