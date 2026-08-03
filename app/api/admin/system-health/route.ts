import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET /api/admin/system-health
// Admin-authenticated system health check — richer than /api/health.
// Used exclusively by the admin System Health dashboard (/admin/system-health).

export async function GET(req: NextRequest) {
  if (!await isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db    = getSupabaseServer();
  const start = Date.now();

  const [
    dbProbe,
    jobStats,
    campaignStats,
    cronRecent,
    deadLetters,
    emailCampaigns,
  ] = await Promise.allSettled([

    // ── Database probe ───────────────────────────────────────────────────────
    db.from("cron_runs").select("id").limit(1),

    // ── Job queue breakdown by status ────────────────────────────────────────
    db.from("job_queue")
      .select("status", { count: "estimated" })
      .in("status", ["pending", "processing", "completed", "failed", "dead"])
      .order("status"),

    // ── Email campaign summary ───────────────────────────────────────────────
    db.from("email_campaigns")
      .select("status, total_recipients, sent_count, failed_count, created_at")
      .in("status", ["active", "paused", "completed", "failed"])
      .order("created_at", { ascending: false })
      .limit(10),

    // ── Last 5 cron runs per job ─────────────────────────────────────────────
    db.from("cron_runs")
      .select("job_name, execution_date, status, created_at")
      .order("created_at", { ascending: false })
      .limit(40),

    // ── Dead-letter jobs ─────────────────────────────────────────────────────
    db.from("job_queue")
      .select("id, job_type, last_error, attempts, created_at, updated_at")
      .eq("status", "dead")
      .order("updated_at", { ascending: false })
      .limit(10),

    // ── Active / paused campaigns needing attention ──────────────────────────
    db.from("email_campaigns")
      .select("id, name, status, total_recipients, sent_count, failed_count, created_at, updated_at")
      .in("status", ["active", "paused"])
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);

  const elapsed = Date.now() - start;

  // ── Database ─────────────────────────────────────────────────────────────────
  const dbOk = dbProbe.status === "fulfilled" && !dbProbe.value.error;

  // ── Job queue ─────────────────────────────────────────────────────────────────
  // Job queue uses estimated counts per status — requires a second query
  const jqResult = jobStats.status === "fulfilled" ? jobStats.value.data ?? [] : [];
  const jqCounts: Record<string, number> = {};
  for (const row of jqResult) jqCounts[row.status] = jqCounts[row.status] ?? 0;

  // Accurate pending/dead counts
  const [pendingRes, deadRes] = await Promise.all([
    db.from("job_queue").select("*", { count: "exact", head: true }).eq("status", "pending"),
    db.from("job_queue").select("*", { count: "exact", head: true }).eq("status", "dead"),
  ]);
  jqCounts.pending     = pendingRes.count  ?? 0;
  jqCounts.dead        = deadRes.count     ?? 0;

  const [processingRes, failedRes] = await Promise.all([
    db.from("job_queue").select("*", { count: "exact", head: true }).eq("status", "running"),
    db.from("job_queue").select("*", { count: "exact", head: true }).eq("status", "failed"),
  ]);
  jqCounts.processing  = processingRes.count ?? 0;
  jqCounts.failed      = failedRes.count     ?? 0;

  // ── Throughput & operational metrics (Phase 4-8) ─────────────────────────────
  const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const oneDayAgo  = new Date(Date.now() - 86_400_000).toISOString();

  const [jobThroughput, emailThroughput, failedWebhookCount] = await Promise.allSettled([
    db.from("job_queue").select("*", { count: "exact", head: true })
      .eq("status", "done").gte("completed_at", oneHourAgo),
    db.from("email_queue").select("*", { count: "exact", head: true })
      .eq("status", "delivered").gte("sent_at", oneHourAgo),
    db.from("webhook_delivery_log").select("*", { count: "exact", head: true })
      .in("status", ["failed", "dead"]).gte("created_at", oneDayAgo),
  ]);

  const throughput = {
    jobs_last_hour:      jobThroughput.status      === "fulfilled" ? (jobThroughput.value.count      ?? 0) : 0,
    emails_last_hour:    emailThroughput.status    === "fulfilled" ? (emailThroughput.value.count    ?? 0) : 0,
    failed_webhooks_24h: failedWebhookCount.status === "fulfilled" ? (failedWebhookCount.value.count ?? 0) : 0,
  };

  // ── Email / WhatsApp env config ───────────────────────────────────────────────
  const emailConfigured = !!process.env.ZEPTOMAIL_API_KEY;
  const waConfigured    = !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

  // ── Cron runs — last execution per job ───────────────────────────────────────
  const cronRows = cronRecent.status === "fulfilled" ? (cronRecent.value.data ?? []) : [];
  const lastCronByJob: Record<string, { date: string; status: string; ran_at: string }> = {};
  for (const row of cronRows) {
    if (!lastCronByJob[row.job_name]) {
      lastCronByJob[row.job_name] = {
        date:   row.execution_date,
        status: row.status ?? "unknown",
        ran_at: row.created_at,
      };
    }
  }

  // ── Dead letters ──────────────────────────────────────────────────────────────
  const deadJobs = deadLetters.status === "fulfilled" ? (deadLetters.value.data ?? []) : [];

  // ── Active campaigns ──────────────────────────────────────────────────────────
  const activeCampaigns = emailCampaigns.status === "fulfilled" ? (emailCampaigns.value.data ?? []) : [];

  // ── Recent campaigns (summary) ────────────────────────────────────────────────
  const recentCampaigns = campaignStats.status === "fulfilled" ? (campaignStats.value.data ?? []) : [];

  // ── Storage probe (lightweight) ───────────────────────────────────────────────
  const storageConfigured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

  // ── Overall health score ──────────────────────────────────────────────────────
  const issues: string[] = [];
  if (!dbOk)            issues.push("Database unreachable");
  if (!emailConfigured) issues.push("Email provider not configured");
  if (jqCounts.dead > 0) issues.push(`${jqCounts.dead} dead job(s) need attention`);

  return NextResponse.json({
    ok:      issues.length === 0,
    ts:      new Date().toISOString(),
    elapsed: elapsed,
    issues,
    components: {
      database:  { ok: dbOk,                label: "PostgreSQL",   detail: dbOk ? "Connected" : "Unreachable" },
      email:     { ok: emailConfigured,      label: "ZeptoMail",   detail: emailConfigured ? "Configured" : "Missing API key" },
      whatsapp:  { ok: waConfigured,         label: "WhatsApp",    detail: waConfigured ? "Configured" : "Missing token/phone" },
      storage:   { ok: storageConfigured,    label: "Supabase Storage", detail: storageConfigured ? "Configured" : "Missing env" },
      cache:     { ok: true,                 label: "Redis Cache",  detail: process.env.UPSTASH_REDIS_REST_URL ? "Configured" : "Not configured (optional)" },
      razorpay:  { ok: !!process.env.RAZORPAY_KEY_ID, label: "Razorpay", detail: process.env.RAZORPAY_KEY_ID ? "Configured" : "Missing key" },
    },
    job_queue: {
      pending:    jqCounts.pending    ?? 0,
      processing: jqCounts.processing ?? 0,
      failed:     jqCounts.failed     ?? 0,
      dead:       jqCounts.dead       ?? 0,
    },
    dead_jobs:        deadJobs,
    cron_last_run:    lastCronByJob,
    active_campaigns: activeCampaigns,
    recent_campaigns: recentCampaigns,
    throughput,
    disaster_recovery: {
      pitr_enabled_note: "PITR is enabled in Supabase dashboard under Project Settings → Database → Point in Time Recovery. Target RPO ≤ 1 min, RTO ≤ 30 min. PITR status cannot be queried via API — verify in the Supabase dashboard.",
      recovery_steps:    "1. Open Supabase dashboard → Database → Backups. 2. Choose a restore point. 3. Click Restore. 4. Update NEXT_PUBLIC_SUPABASE_URL + service-role key if the restored project has a new URL. 5. Redeploy on Vercel.",
    },
    version:     process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
  });
}
