/**
 * Outbound webhook dispatch.
 *
 * Call dispatchWebhookEvent() from any route handler after a business-logic
 * event occurs. It looks up active subscriptions for that org + event type,
 * creates delivery log rows, and enqueues deliver_webhook jobs for the
 * async job worker to execute with retry.
 *
 * Payload signing: HMAC-SHA256 over `${timestamp}.${body}`.
 * Header format:  X-CS-Signature: t=<unix_ms>,sha256=<hex>
 * Replay defence: consumers should reject if abs(now - t) > 300 000 ms.
 */

import crypto from "crypto";
import { getSupabaseServer } from "@/lib/supabase-server";
import { enqueueJob }        from "@/lib/job-queue";
import { logger }            from "@/lib/logger";

// ── Event type registry ───────────────────────────────────────────────────────

export type WebhookEvent =
  | "registration.created"
  | "registration.updated"
  | "registration.cancelled"
  | "payment.succeeded"
  | "payment.failed"
  | "participant.checked_in"
  | "certificate.generated"
  | "refund.completed"
  | "membership.renewed"
  | "membership.expired"
  | "waitlist.promoted"
  | "merchandise.order_created"
  | "merchandise.order_updated";

export const WEBHOOK_EVENTS: WebhookEvent[] = [
  "registration.created",
  "registration.updated",
  "registration.cancelled",
  "payment.succeeded",
  "payment.failed",
  "participant.checked_in",
  "certificate.generated",
  "refund.completed",
  "membership.renewed",
  "membership.expired",
  "waitlist.promoted",
  "merchandise.order_created",
  "merchandise.order_updated",
];

// ── Payload structure ─────────────────────────────────────────────────────────

export interface WebhookPayload {
  id:              string;   // delivery UUID (set when delivery row is created)
  event:           WebhookEvent;
  created_at:      string;   // ISO8601
  organization_id: string;
  api_version:     string;   // "2026-07-28"
  data:            Record<string, unknown>;
}

// ── Signing ───────────────────────────────────────────────────────────────────

export const API_VERSION = "2026-07-28";

/**
 * Signs a webhook payload.
 * Returns the X-CS-Signature header value: `t=<ms>,sha256=<hex>`
 */
export function signWebhookPayload(body: string, secret: string, timestamp?: number): string {
  const t    = timestamp ?? Date.now();
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(`${t}.${body}`)
    .digest("hex");
  return `t=${t},sha256=${hmac}`;
}

/**
 * Verifies a webhook signature. Returns true if valid and within 5 minutes.
 */
export function verifyWebhookSignature(
  body:      string,
  header:    string,
  secret:    string,
  toleranceMs = 300_000,
): boolean {
  const parts = Object.fromEntries(header.split(",").map(s => s.split("=")));
  const t      = parseInt(parts["t"] ?? "0", 10);
  const sig    = parts["sha256"] ?? "";
  if (!t || !sig) return false;
  if (Math.abs(Date.now() - t) > toleranceMs) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${t}.${body}`)
    .digest("hex");
  if (expected.length !== sig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"));
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

/**
 * Find all active subscriptions for org + event, create delivery rows,
 * and enqueue delivery jobs. Returns number of subscriptions triggered.
 *
 * Safe to call from any route handler — never throws, only logs.
 */
export async function dispatchWebhookEvent(
  organization_id: string,
  event:           WebhookEvent,
  data:            Record<string, unknown>,
): Promise<number> {
  try {
    const db = getSupabaseServer();

    // Find subscriptions that match this event
    const { data: subs, error: subErr } = await db
      .from("webhook_subscriptions")
      .select("id, url, events, signing_secret, max_attempts")
      .eq("organization_id", organization_id)
      .eq("is_active", true)
      .contains("events", [event]);

    if (subErr || !subs?.length) return 0;

    const deliveries: Record<string, unknown>[] = [];
    const now = new Date().toISOString();

    for (const sub of subs) {
      const deliveryId    = crypto.randomUUID();
      const basePayload: WebhookPayload = {
        id:              deliveryId,
        event,
        created_at:      now,
        organization_id,
        api_version:     API_VERSION,
        data,
      };
      const bodyStr    = JSON.stringify(basePayload);
      const payloadHash = crypto.createHash("sha256").update(bodyStr).digest("hex");

      deliveries.push({
        id:              deliveryId,
        subscription_id: sub.id,
        organization_id,
        event_type:      event,
        payload:         basePayload,
        payload_hash:    payloadHash,
        status:          "pending",
        max_attempts:    sub.max_attempts ?? 5,
      });
    }

    if (!deliveries.length) return 0;

    const { data: inserted, error: insErr } = await db
      .from("webhook_delivery_log")
      .insert(deliveries)
      .select("id, subscription_id");

    if (insErr) {
      logger.error("webhook-dispatch", "Failed to insert delivery rows", { error: insErr.message });
      return 0;
    }

    // Enqueue deliver_webhook jobs for each delivery
    for (const row of (inserted ?? [])) {
      await enqueueJob("deliver_webhook", {
        delivery_id:     row.id as string,
        subscription_id: row.subscription_id as string,
      }, {
        idempotencyKey: `wh:${row.id as string}`,
        priority:       5,
        maxAttempts:    1,  // job worker does the outer retry; the delivery row tracks inner retries
      });
    }

    return deliveries.length;
  } catch (e) {
    logger.error("webhook-dispatch", "dispatchWebhookEvent error", { event, organization_id, error: String(e) });
    return 0;
  }
}

// ── Delivery executor (called by job worker) ──────────────────────────────────

/**
 * Executes one webhook delivery attempt.
 * Updates delivery log with result.
 * Throws if transient failure so job worker retries the job.
 */
export async function executeWebhookDelivery(deliveryId: string): Promise<void> {
  const db = getSupabaseServer();

  const { data: delivery, error: fetchErr } = await db
    .from("webhook_delivery_log")
    .select(`
      id, payload, attempts, max_attempts, status,
      subscription_id,
      webhook_subscriptions!inner(url, signing_secret, timeout_seconds)
    `)
    .eq("id", deliveryId)
    .single();

  if (fetchErr || !delivery) {
    logger.warn("webhook-dispatch", "Delivery not found", { deliveryId });
    return;
  }

  // Already completed — idempotent
  if (delivery.status === "success") return;

  const sub     = (delivery as Record<string, unknown>)["webhook_subscriptions"] as {
    url: string; signing_secret: string; timeout_seconds: number;
  };
  const bodyStr = JSON.stringify(delivery.payload);
  const sig     = signWebhookPayload(bodyStr, sub.signing_secret);
  const timeout = (sub.timeout_seconds ?? 30) * 1_000;

  let statusCode = 0;
  let responseBody = "";
  let success = false;

  try {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(sub.url, {
      method:  "POST",
      headers: {
        "Content-Type":        "application/json",
        "X-CS-Signature":      sig,
        "X-CS-Delivery":       deliveryId,
        "X-CS-Event":          (delivery.payload as WebhookPayload).event,
        "X-CS-API-Version":    API_VERSION,
        "User-Agent":          "ConnectedSteps-Webhooks/1.0",
      },
      body: bodyStr,
      signal: controller.signal,
    });

    clearTimeout(timer);
    statusCode   = res.status;
    responseBody = (await res.text()).slice(0, 2000);
    success      = res.status >= 200 && res.status < 300;
  } catch (e) {
    responseBody = e instanceof Error ? e.message : String(e);
  }

  const attempts    = ((delivery.attempts as number) ?? 0) + 1;
  const maxAttempts = (delivery.max_attempts as number) ?? 5;
  const isDead      = !success && attempts >= maxAttempts;
  const backoffMs   = success ? 0 : Math.min(attempts * 5 * 60_000, 3_600_000);

  await db.from("webhook_delivery_log").update({
    status:             success ? "success" : isDead ? "dead" : "failed",
    attempts,
    last_attempt_at:    new Date().toISOString(),
    last_status_code:   statusCode || null,
    last_response_body: responseBody || null,
    last_error:         success ? null : responseBody,
    completed_at:       success || isDead ? new Date().toISOString() : null,
    next_attempt_at:    success || isDead ? null : new Date(Date.now() + backoffMs).toISOString(),
  }).eq("id", deliveryId);

  if (!success && !isDead) {
    // Throw so the job worker sees it as a transient failure and schedules a retry
    throw new Error(`Webhook delivery failed with HTTP ${statusCode}: ${responseBody.slice(0, 200)}`);
  }
}
