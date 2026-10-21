/**
 * Registration monitoring for IT Run. A journey is one attempt by one person, identified by a random key the browser
 * creates. Recording never throws and never blocks registration: a failed write is logged and dropped.
 *
 * Holds no personal data: no names, phone numbers, email addresses, OTP values, or request bodies.
 */

import { getSupabaseServer } from "@/lib/supabase-server";

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
