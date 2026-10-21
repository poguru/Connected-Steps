/**
 * Registration monitoring for IT Run. A journey is one attempt by one person, identified by a random key the browser
 * creates. Recording never throws and never blocks registration: a failed write is logged and dropped.
 *
 * Holds no personal data: no names, phone numbers, email addresses, OTP values, or request bodies.
 */

import { getSupabaseServer } from "@/lib/supabase-server";
import { fireAlert } from "@/lib/alerting";

/** A journey with no activity for this long, and no completion, is abandoned. */
export const ABANDON_AFTER_MINUTES = 30;
/** A journey with activity in this window, and no completion, is active. */
export const ACTIVE_WINDOW_MINUTES = 5;

/** The stages of the registration funnel, in order. */
export const FUNNEL_STAGES = [
  "landing",
  "category_selected",
  "details_submitted",
  "otp_requested",
  "otp_verified",
  "validation_passed",
  "payment_initiated",
  "payment_succeeded",
  "confirmed",
] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export type JourneyStatus = "active" | "abandoned" | "completed";

/** A journey's status from its times alone. Completed wins; otherwise recent activity means active. */
export function journeyStatus(
  j: { completedAt: string | null; lastActivityAt: string },
  nowMs: number,
): JourneyStatus {
  if (j.completedAt) return "completed";
  const last = Date.parse(j.lastActivityAt);
  if (!Number.isFinite(last)) return "abandoned";
  const minutes = (nowMs - last) / 60_000;
  return minutes > ABANDON_AFTER_MINUTES ? "abandoned" : minutes <= ACTIVE_WINDOW_MINUTES ? "active" : "abandoned";
}

/** The requests whose failures are reported. Only these paths are accepted, so a page cannot write arbitrary names. */
export const MONITORED_ENDPOINTS = [
  "/api/auth/send-otp",
  "/api/auth/complete-event-verify",
  "/api/it-run/register",
  "/api/it-run/coupons/validate",
  "/api/it-run/upload/company-id",
  "/api/it-run/payment/create-order",
  "/api/it-run/payment/verify",
] as const;
export type MonitoredEndpoint = (typeof MONITORED_ENDPOINTS)[number];

/** Failures in the last hour at or above this count send an alert. */
export const ERROR_ALERT_THRESHOLD = 10;
/** An alert is sent at most once per this long, however many failures follow. */
export const ERROR_ALERT_COOLDOWN_MS = 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export function isMonitoredEndpoint(v: unknown): v is MonitoredEndpoint {
  return typeof v === "string" && (MONITORED_ENDPOINTS as readonly string[]).includes(v);
}

/** An HTTP status from a failed request. 0 means no response at all (a network failure). */
export function isReportableStatus(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 599;
}

/**
 * Whether a failure counts toward an alert: no response, a server error, or a rate limit. A 4xx such as a wrong code
 * or an invalid coupon is the visitor's mistake, so it is listed on the dashboard but never alerts.
 */
export function isAlertableFailure(httpStatus: number): boolean {
  return httpStatus === 0 || httpStatus === 429 || httpStatus >= 500;
}

/** Failures per step and status, plus the last hour's total and alertable count. Pure. */
export function summarizeErrors(
  rows: Array<{ endpoint: string; httpStatus: number | null; createdAt: string }>,
  nowMs: number,
) {
  const groups = new Map<string, { endpoint: string; httpStatus: number; count: number }>();
  let lastHour = 0;
  let alertable = 0;
  for (const r of rows) {
    const status = r.httpStatus ?? 0;
    const key = `${r.endpoint} ${status}`;
    const g = groups.get(key) ?? { endpoint: r.endpoint, httpStatus: status, count: 0 };
    g.count++;
    groups.set(key, g);
    const created = Date.parse(r.createdAt);
    if (Number.isFinite(created) && nowMs - created <= HOUR_MS) {
      lastHour++;
      if (isAlertableFailure(status)) alertable++;
    }
  }
  const byEndpoint = [...groups.values()].sort((a, b) => b.count - a.count);
  return { total: rows.length, lastHour, alertable, byEndpoint, alert: alertable >= ERROR_ALERT_THRESHOLD };
}

/**
 * Counts this event's alertable failures in the last hour and sends an alert when they reach the threshold. The
 * alert names the count only, never a message or a person. Never throws.
 */
export async function checkFailureAlert(eventId: string | null): Promise<void> {
  try {
    if (!eventId) return;
    const since = new Date(Date.now() - HOUR_MS).toISOString();
    const { count, error } = await getSupabaseServer()
      .from("registration_journey_events")
      .select("id, registration_journeys!inner(event_id)", { count: "exact", head: true })
      .eq("event_type", "error")
      .eq("registration_journeys.event_id", eventId)
      .gte("created_at", since)
      .or("http_status.eq.0,http_status.eq.429,http_status.gte.500");
    if (error || count === null || count < ERROR_ALERT_THRESHOLD) return;

    await fireAlert({
      level: "warning",
      key: "it_run_registration_failures",
      title: `${count} registration request failures in the last hour`,
      body: "Requests failed with no response, a server error or a rate limit. Failed steps are listed on the IT Run admin monitoring page.",
      cooldownMs: ERROR_ALERT_COOLDOWN_MS,
    });
  } catch {
    /* alerting must never affect the registration request */
  }
}

/** A browser-made key: 16 to 64 letters and digits, with nothing that identifies a person. */
export function isValidJourneyKey(key: unknown): key is string {
  return typeof key === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(key);
}

export interface JourneyEventInput {
  journeyKey: string;
  eventId: string | null;
  eventType: "stage_reached" | "error" | "otp_request" | "otp_verify" | "payment";
  stage?: FunnelStage;
  errorCode?: string;
  httpStatus?: number;
  endpoint?: string;
  durationMs?: number;
  correlationId?: string;
  /** Makes a retried request record once. Use a value that is stable for the same real event. */
  idempotencyKey?: string;
}

/** Records one journey event. Returns true when it was stored. Never throws. */
export async function recordJourneyEvent(input: JourneyEventInput): Promise<boolean> {
  try {
    if (!isValidJourneyKey(input.journeyKey)) return false;
    const db = getSupabaseServer();
    const nowIso = new Date().toISOString();

    const { data: journey, error: upErr } = await db
      .from("registration_journeys")
      .upsert(
        {
          journey_key: input.journeyKey,
          event_id: input.eventId,
          last_activity_at: nowIso,
          ...(input.stage ? { current_stage: input.stage } : {}),
        },
        { onConflict: "journey_key" },
      )
      .select("id")
      .single<{ id: string }>();
    if (upErr || !journey) {
      console.error(JSON.stringify({ src: "it-run-monitoring", outcome: "journey_write_failed" }));
      return false;
    }

    const { error: evErr } = await db.from("registration_journey_events").insert({
      journey_id: journey.id,
      event_type: input.eventType,
      stage: input.stage ?? null,
      error_code: input.errorCode ?? null,
      http_status: input.httpStatus ?? null,
      endpoint: input.endpoint ?? null,
      duration_ms: input.durationMs ?? null,
      correlation_id: input.correlationId ?? null,
      idempotency_key: input.idempotencyKey ?? null,
    });
    // A repeated idempotency key is a duplicate, which is fine
    if (evErr && evErr.code !== "23505") {
      console.error(JSON.stringify({ src: "it-run-monitoring", outcome: "event_write_failed" }));
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** The counts shown on the admin summary, from journeys already read. Pure, so it can be tested. */
export function summarizeJourneys(
  journeys: Array<{ completedAt: string | null; lastActivityAt: string; currentStage: string }>,
  nowMs: number,
) {
  const counts = { total: journeys.length, active: 0, abandoned: 0, completed: 0 };
  const byStage: Record<string, number> = {};
  for (const j of journeys) {
    counts[journeyStatus({ completedAt: j.completedAt, lastActivityAt: j.lastActivityAt }, nowMs)]++;
    byStage[j.currentStage] = (byStage[j.currentStage] ?? 0) + 1;
  }
  const conversion = counts.total === 0 ? null : Math.round((counts.completed / counts.total) * 1000) / 10;
  return { ...counts, conversionPercent: conversion, byStage };
}
