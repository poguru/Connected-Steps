/**
 * Proactive alerting — Phase 4 Part 4.
 *
 * Sends operational alerts when the platform crosses health thresholds.
 * All delivery is fire-and-forget; errors are logged but never thrown so
 * callers never fail because of an alerting side-effect.
 *
 * Alert channel: POST to ALERT_WEBHOOK_URL (Slack / Discord / n8n / generic).
 * Cooldown: each alert key is rate-limited via app_settings so a single
 * flapping condition doesn't flood the channel.
 *
 * Conditions wired in job-worker and email-sender:
 *   dead_jobs          — any job exhausted retries          (critical, 30 min cooldown)
 *   queue_backlog      — pending job count > 500            (warning,  60 min cooldown)
 *   campaign_failures  — batch failure rate > 20%           (warning,  4 h cooldown per batch)
 */

import { getSupabaseServer } from "@/lib/supabase-server";
import { logger } from "@/lib/logger";

export type AlertLevel = "warning" | "critical";

export interface AlertOpts {
  level:       AlertLevel;
  key:         string;       // dedup key — one active alert per key per cooldown window
  title:       string;
  body:        string;
  cooldownMs?: number;       // default 30 min
}

// ── Thresholds ────────────────────────────────────────────────────────────────

export const ALERT = {
  QUEUE_BACKLOG_THRESHOLD:    500,    // pending jobs
  CAMPAIGN_FAILURE_THRESHOLD: 0.20,  // 20% failure rate
  DEAD_JOB_COOLDOWN_MS:       30 * 60 * 1000,   // 30 min
  QUEUE_BACKLOG_COOLDOWN_MS:  60 * 60 * 1000,   // 1 h
  CAMPAIGN_COOLDOWN_MS:       4  * 60 * 60 * 1000, // 4 h
};

// ── fireAlert ─────────────────────────────────────────────────────────────────

/**
 * Dispatch an alert unless the cooldown for `key` is still active.
 * The cooldown timestamp is persisted in app_settings so it survives
 * across serverless invocations (unlike in-memory maps).
 */
export async function fireAlert(opts: AlertOpts): Promise<void> {
  const { level, key, title, body, cooldownMs = ALERT.DEAD_JOB_COOLDOWN_MS } = opts;

  try {
    const db         = getSupabaseServer();
    const settingKey = `alert_last_fired:${key}`;

    // ── Cooldown check ────────────────────────────────────────────────────────
    const { data: existing } = await db
      .from("app_settings")
      .select("updated_at")
      .eq("key", settingKey)
      .maybeSingle();

    if (existing?.updated_at) {
      const age = Date.now() - new Date(existing.updated_at).getTime();
      if (age < cooldownMs) return;   // still within cooldown window
    }

    // Mark fired BEFORE sending — prevents concurrent invocations from
    // both passing the cooldown check and double-firing.
    await db.from("app_settings").upsert(
      { key: settingKey, value: new Date().toISOString() },
      { onConflict: "key" },
    );

    // ── Dispatch ──────────────────────────────────────────────────────────────
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;
    if (webhookUrl) {
      await postWebhook(webhookUrl, level, title, body);
    }

    logger.warn("alerting", "Alert fired", { key, level, title });
  } catch (e) {
    // Never let alerting failures affect the caller
    logger.error("alerting", "Alert dispatch error", {
      key,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

// ── checkQueueHealth ──────────────────────────────────────────────────────────

/**
 * Check job_queue for dead-letter jobs and backlog. Call from the job-worker
 * after each run. Fires at most once per cooldown window per condition.
 */
export async function checkQueueHealth(): Promise<void> {
  try {
    const db = getSupabaseServer();

    const [deadRes, pendingRes] = await Promise.all([
      db.from("job_queue").select("*", { count: "exact", head: true }).eq("status", "dead"),
      db.from("job_queue").select("*", { count: "exact", head: true }).eq("status", "pending"),
    ]);

    const deadCount    = deadRes.count    ?? 0;
    const pendingCount = pendingRes.count ?? 0;

    if (deadCount > 0) {
      await fireAlert({
        level:       "critical",
        key:         "dead_jobs",
        title:       `${deadCount} dead-letter job(s) need manual review`,
        body:        `${deadCount} job(s) have exhausted all retry attempts and are stuck in status='dead'. `
                   + `Open /admin/system-health to inspect and replay or discard them.`,
        cooldownMs:  ALERT.DEAD_JOB_COOLDOWN_MS,
      });
    }

    if (pendingCount > ALERT.QUEUE_BACKLOG_THRESHOLD) {
      await fireAlert({
        level:       "warning",
        key:         "queue_backlog",
        title:       `Job queue backlog: ${pendingCount} pending jobs`,
        body:        `The job_queue has ${pendingCount} pending jobs (threshold: ${ALERT.QUEUE_BACKLOG_THRESHOLD}). `
                   + `The self-triggering worker should drain this within minutes. `
                   + `If the count stays high, check /admin/system-health → Queue.`,
        cooldownMs:  ALERT.QUEUE_BACKLOG_COOLDOWN_MS,
      });
    }
  } catch (e) {
    logger.error("alerting", "checkQueueHealth error", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

// ── checkCampaignHealth ───────────────────────────────────────────────────────

/**
 * Alert if a campaign's failure rate exceeds the threshold.
 * Call from email-sender after completing a batch.
 */
export async function checkCampaignHealth(opts: {
  batchId:   string;
  delivered: number;
  failed:    number;
  total:     number;
}): Promise<void> {
  const { batchId, delivered, failed, total } = opts;
  if (total === 0 || failed === 0) return;

  const failureRate = failed / total;
  if (failureRate < ALERT.CAMPAIGN_FAILURE_THRESHOLD) return;

  await fireAlert({
    level:      "warning",
    key:        `campaign_failures:${batchId}`,
    title:      `Campaign failure rate ${Math.round(failureRate * 100)}% — batch ${batchId.slice(0, 8)}`,
    body:       `${failed} of ${total} emails failed (${delivered} delivered). `
              + `Check /admin/system-health → Campaigns and inspect the batch for permanent bounces.`,
    cooldownMs: ALERT.CAMPAIGN_COOLDOWN_MS,
  });
}

// ── Webhook delivery ──────────────────────────────────────────────────────────

async function postWebhook(
  url:   string,
  level: AlertLevel,
  title: string,
  body:  string,
): Promise<void> {
  const emoji = level === "critical" ? "🔴" : "🟡";

  // Slack-compatible payload (also accepted by Discord, n8n, Make.com, etc.)
  const payload = {
    text: `${emoji} *[Connected Steps] ${title}*`,
    attachments: [
      {
        color:  level === "critical" ? "danger" : "warning",
        title,
        text:   body,
        footer: "Connected Steps Ops",
        ts:     Math.floor(Date.now() / 1000),
      },
    ],
  };

  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
    signal:  AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    throw new Error(`Webhook POST failed: HTTP ${res.status}`);
  }
}
