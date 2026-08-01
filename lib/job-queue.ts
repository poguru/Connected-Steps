/**
 * Background job queue — backed by Postgres job_queue table.
 *
 * API routes call enqueueJob() (one fast DB INSERT) and return immediately.
 * The job-worker cron claims jobs atomically and processes them with retry.
 *
 * Guarantees:
 *   • Durability    — jobs survive function restarts (they're in Postgres)
 *   • No duplicates — idempotency_key UNIQUE constraint prevents double-queuing
 *   • Retry         — failed jobs are re-queued with exponential backoff
 *   • Dead-letter   — jobs that exhaust max_attempts are marked 'dead'
 */

import { getSupabaseServer } from "@/lib/supabase-server";
import { logger } from "@/lib/logger";

import { APP_URL } from "@/lib/config";
// ── Job type registry ─────────────────────────────────────────────────────────

export type JobType =
  | "invoice_generate"      // Generate Bill of Supply + upload to Storage + email link
  | "event_qr_email"        // Sign QR token + send registration confirmation email
  | "membership_email"      // Send membership activation confirmation email
  | "referral_reward"       // Process referral code → extend memberships for both users
  | "weekly_digest_email"   // Re-deliver weekly digest to one user
  | "bulk_email"            // Send one email from an admin bulk-send batch
  | "bulk_invoice"          // Generate one invoice from an admin backfill batch
  | "certificate_generate"  // (stub) Generate participation certificate PDF
  | "admin_export"          // Generate CSV/ZIP export of admin data
  | "deliver_webhook"       // Execute one outbound webhook delivery attempt
  | "import_csv";           // Process one committed CSV import batch

// Typed payload per job type — worker casts payload to the correct type via switch
export type JobPayloads = {
  invoice_generate: {
    productType:      "event" | "membership" | "training_plan" | "coaching";
    userEmail:        string;
    userName:         string;
    userPhone?:       string;
    productName:      string;
    totalPaidRupees:  number;
    paymentId?:       string;
    orderId?:         string;
    registrationId?:  string;
    membershipId?:    string;
    eventId?:         string;
    eventDate?:       string;
    eventVenue?:      string;
  };

  event_qr_email: {
    registrationId:   string;   // UUID — used for DB idempotency check
    registrationCode: string;   // human-readable code — used for QR signing
    eventId:          string;
    userEmail:        string;
    userName:         string;
    eventTitle:       string;
    startDate:        string;
    startTime:        string | null;
    location:         string;
    distanceCategory: string | null;
  };

  membership_email: {
    userEmail:  string;
    userName:   string;
    planLabel:  string;
    amountINR:  number;
    expiresAt:  string;
    paymentId:  string;
  };

  referral_reward: {
    referralCode:      string;
    referredEmail:     string;
    referredFirstName: string;
  };

  weekly_digest_email: {
    userEmail: string;
    userName:  string;
  };

  bulk_email: {
    to:           string;
    toName:       string;
    subject:      string;
    html:         string;
    campaignId:   string;  // used in idempotency key: bulk_email:{campaignId}:{to}
    emailQueueId?: string; // when set, handler marks the email_queue row delivered/failed
  };

  bulk_invoice: {
    productType:      "event" | "membership";
    userEmail:        string;
    userName:         string;
    productName:      string;
    totalPaidRupees:  number;
    paymentId?:       string;
    orderId?:         string;
    registrationId?:  string;
    eventId?:         string;
    eventDate?:       string;
    eventVenue?:      string;
  };

  certificate_generate: {
    userEmail:   string;
    userName:    string;
    eventId:     string;
    eventTitle:  string;
    finishTime?: string;
  };

  admin_export: {
    exportId:     string;               // admin_exports.id — worker writes status back here
    dataset:      "users" | "memberships" | "registrations" | "referrals";
    format:       "csv" | "zip";
    filters:      Record<string, string>; // arbitrary filter params forwarded to queries
    requestedBy:  string;
  };

  deliver_webhook: {
    delivery_id:     string;   // webhook_delivery_log.id
    subscription_id: string;   // webhook_subscriptions.id
  };

  import_csv: {
    import_id:       string;   // import_jobs.id
    entity_type:     string;
    storage_path:    string;
    event_id?:       string;
  };
};

// ── Row shape returned from Supabase ──────────────────────────────────────────

export interface JobRow {
  id:              string;
  job_type:        string;
  payload:         Record<string, unknown>;
  status:          string;
  priority:        number;
  attempts:        number;
  max_attempts:    number;
  last_error:      string | null;
  idempotency_key: string | null;
  claimed_at:      string | null;
  completed_at:    string | null;
  created_at:      string;
  run_after:       string;
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface EnqueueOptions {
  /** Prevents duplicate jobs — silently ignored if key already exists. */
  idempotencyKey?: string;
  /** Higher numbers run first. Default 0. Transactional = 10, bulk = -5. */
  priority?: number;
  /** Seconds before the job becomes eligible. Default 0 (run immediately). */
  delaySeconds?: number;
  /** Max attempts before marking dead. Default 3. */
  maxAttempts?: number;
}

// ── enqueueJob ────────────────────────────────────────────────────────────────

/**
 * Insert a background job. Returns the new job id, or null if:
 *   • A duplicate idempotency_key exists (not an error — expected dedup)
 *   • The DB insert fails (error is logged; caller should not retry)
 *
 * The insert is fast (single row write) — always await it before returning
 * the HTTP response so the job is durable before the function exits.
 */
export async function enqueueJob<T extends JobType>(
  type:    T,
  payload: JobPayloads[T],
  opts:    EnqueueOptions = {},
): Promise<string | null> {
  const db = getSupabaseServer();
  const runAfter = opts.delaySeconds
    ? new Date(Date.now() + opts.delaySeconds * 1000).toISOString()
    : new Date().toISOString();

  const { data, error } = await db
    .from("job_queue")
    .insert({
      job_type:        type,
      payload:         payload as Record<string, unknown>,
      priority:        opts.priority    ?? 0,
      run_after:       runAfter,
      max_attempts:    opts.maxAttempts ?? 3,
      idempotency_key: opts.idempotencyKey ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return null;  // duplicate idempotency key — expected
    logger.error("job-queue", "Enqueue failed", { type, idempotencyKey: opts.idempotencyKey, code: error.code, error: error.message });
    return null;
  }

  // Self-trigger the worker immediately so jobs process in real-time rather than
  // waiting for the daily cron sweep (Vercel Hobby plan only allows once-daily crons).
  // Fire-and-forget — the daily cron is the fallback for any failures here.
  const appUrl = APP_URL;
  const cronSecret = process.env.CRON_SECRET;
  if (appUrl && cronSecret) {
    fetch(`${appUrl}/api/cron/job-worker`, {
      headers: { authorization: `Bearer ${cronSecret}` },
    }).catch(() => {});
  }

  return (data as { id: string }).id;
}

// ── State transitions (called by worker after each job) ───────────────────────

export async function completeJob(id: string): Promise<void> {
  const db = getSupabaseServer();
  await db.from("job_queue")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", id);
}

/**
 * Mark a job failed.
 * • attempts < max_attempts → status = 'pending' with exponential backoff
 * • attempts >= max_attempts → status = 'dead' (dead-letter, no more retries)
 *
 * Backoff: 5 min × attempts, capped at 60 min.
 */
export async function failJob(
  id:           string,
  errorMessage: string,
  attempts:     number,
  maxAttempts:  number,
): Promise<void> {
  const db      = getSupabaseServer();
  const isDead  = attempts >= maxAttempts;
  const backoff = isDead ? 0 : Math.min(attempts * 5 * 60, 3600);  // seconds

  await db.from("job_queue").update({
    status:     isDead ? "dead" : "pending",
    last_error: errorMessage.slice(0, 2000),
    run_after:  new Date(Date.now() + backoff * 1000).toISOString(),
  }).eq("id", id);
}

// ── Claim (called by worker) ───────────────────────────────────────────────────

/**
 * Atomically claim up to `limit` pending jobs via the claim_next_jobs RPC.
 * The RPC uses FOR UPDATE SKIP LOCKED — safe for concurrent workers.
 */
export async function claimNextJobs(limit = 15): Promise<JobRow[]> {
  const db = getSupabaseServer();
  const { data, error } = await db.rpc("claim_next_jobs", { p_limit: limit });
  if (error) {
    logger.error("job-queue", "claim_next_jobs RPC error", { code: error.code, error: error.message });
    return [];
  }
  return (data as JobRow[]) ?? [];
}
