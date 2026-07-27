import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/communication/stats
// Returns aggregated communication stats across all events for the last 30 days.
// Drives the global Communication Center dashboard.
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff24h = new Date(Date.now() -       24 * 60 * 60 * 1000).toISOString();

  const [
    emailRowsRes,
    waStatsRes,
    queueNowRes,
    campaignsRes,
    scheduledRes,
    jobsRes,
  ] = await Promise.all([
    // Email delivery stats (last 30 days, from email_queue)
    db.from("email_queue")
      .select("status, delivered_at, opened_at, clicked_at, bounce_type, sent_at")
      .gte("created_at", cutoff30d),

    // WhatsApp stats (last 30 days, from wa_message_log)
    db.from("wa_message_log")
      .select("status, sent_at")
      .gte("sent_at", cutoff30d),

    // Current email queue backlog (any status except delivered)
    db.from("email_queue")
      .select("status")
      .in("status", ["queued", "sending", "failed"]),

    // Campaign count (last 30 days, from event_comm_history)
    db.from("event_comm_history")
      .select("id, channel", { count: "exact" })
      .gte("sent_at", cutoff30d)
      .not("status", "eq", "cancelled"),

    // Scheduled campaigns waiting to be sent
    db.from("event_comm_history")
      .select("id", { count: "exact", head: true })
      .eq("status", "scheduled"),

    // Job queue health
    db.from("job_queue")
      .select("status")
      .in("status", ["pending", "dead"]),
  ]);

  // ── Email aggregates ──────────────────────────────────────────────────────
  const emailRows = emailRowsRes.data ?? [];
  const total30d     = emailRows.length;
  const delivered30d = emailRows.filter(r => r.status === "delivered").length;
  const opened30d    = emailRows.filter(r => r.opened_at).length;
  const clicked30d   = emailRows.filter(r => r.clicked_at).length;
  const failed30d    = emailRows.filter(r => r.status === "failed").length;
  const bounced30d   = emailRows.filter(r => r.bounce_type).length;

  // 24-hour window
  const email24h = emailRows.filter(r => (r.sent_at ?? "") >= cutoff24h);
  const sent24h    = email24h.length;
  const failed24h  = email24h.filter(r => r.status === "failed").length;

  // Live queue
  const queueRows = queueNowRes.data ?? [];
  const queuedNow  = queueRows.filter(r => r.status === "queued").length;
  const sendingNow = queueRows.filter(r => r.status === "sending").length;
  const failedNow  = queueRows.filter(r => r.status === "failed").length;

  // ── WhatsApp aggregates ───────────────────────────────────────────────────
  const waRows = waStatsRes.data ?? [];
  const waTotal30d    = waRows.length;
  const waSent30d     = waRows.filter(r => r.status !== "failed").length;
  const waDelivered30d = waRows.filter(r => r.status === "delivered" || r.status === "read").length;
  const waRead30d     = waRows.filter(r => r.status === "read").length;
  const waFailed30d   = waRows.filter(r => r.status === "failed").length;
  const wa24h         = waRows.filter(r => r.sent_at >= cutoff24h);
  const waFailed24h   = wa24h.filter(r => r.status === "failed").length;

  // ── Campaign aggregates ───────────────────────────────────────────────────
  const campaigns = campaignsRes.data ?? [];
  const campaigns30d     = campaigns.length;
  const emailCampaigns   = campaigns.filter(c => c.channel === "email").length;
  const waCampaigns      = campaigns.filter(c => c.channel === "whatsapp").length;
  const scheduledCount   = scheduledRes.count ?? 0;

  // ── Job queue health ──────────────────────────────────────────────────────
  const jobs      = jobsRes.data ?? [];
  const pendingJobs = jobs.filter(j => j.status === "pending").length;
  const deadJobs    = jobs.filter(j => j.status === "dead").length;

  // ── Rates ─────────────────────────────────────────────────────────────────
  const deliveryRate = total30d > 0 ? Math.round((delivered30d / total30d) * 100) : null;
  const openRate     = delivered30d > 0 ? Math.round((opened30d / delivered30d) * 100) : null;
  const clickRate    = opened30d > 0 ? Math.round((clicked30d / opened30d) * 100) : null;
  const failureRate  = total30d > 0 ? Math.round((failed30d / total30d) * 100) : null;
  const waDeliveryRate = waTotal30d > 0 ? Math.round((waDelivered30d / waTotal30d) * 100) : null;

  return NextResponse.json({
    email: {
      total_30d:     total30d,
      delivered_30d: delivered30d,
      opened_30d:    opened30d,
      clicked_30d:   clicked30d,
      failed_30d:    failed30d,
      bounced_30d:   bounced30d,
      sent_24h:      sent24h,
      failed_24h:    failed24h,
      delivery_rate: deliveryRate,
      open_rate:     openRate,
      click_rate:    clickRate,
      failure_rate:  failureRate,
      queue: {
        queued:  queuedNow,
        sending: sendingNow,
        failed:  failedNow,
      },
    },
    whatsapp: {
      total_30d:     waTotal30d,
      sent_30d:      waSent30d,
      delivered_30d: waDelivered30d,
      read_30d:      waRead30d,
      failed_30d:    waFailed30d,
      failed_24h:    waFailed24h,
      delivery_rate: waDeliveryRate,
    },
    campaigns: {
      total_30d:  campaigns30d,
      email:      emailCampaigns,
      whatsapp:   waCampaigns,
      scheduled:  scheduledCount,
    },
    system: {
      pending_jobs: pendingJobs,
      dead_jobs:    deadJobs,
    },
    as_of: new Date().toISOString(),
  });
}
