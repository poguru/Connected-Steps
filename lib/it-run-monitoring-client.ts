"use client";

/**
 * Browser side of registration monitoring. Creates a random journey key for this browser (not tied to a person) and
 * reports stages. Reporting is best effort: it never throws and never delays the registration page.
 */

import type { FunnelStage } from "@/lib/it-run-monitoring";

const KEY_STORAGE = "it_run_journey_key";

function randomKey(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(36).padStart(2, "0")).join("").slice(0, 24);
}

/** This browser's journey key. Kept in local storage; a blocked storage gives a fresh key each page load. */
export function getJourneyKey(): string {
  try {
    const existing = localStorage.getItem(KEY_STORAGE);
    if (existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing)) return existing;
    const fresh = randomKey();
    localStorage.setItem(KEY_STORAGE, fresh);
    return fresh;
  } catch {
    return randomKey();
  }
}

/** Reports that this journey reached a stage. Fire and forget. */
export function reportStage(stage: FunnelStage): void {
  try {
    void fetch("/api/it-run/monitoring/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ journeyKey: getJourneyKey(), stage }),
      keepalive: true,
    }).catch(() => { /* monitoring must never affect the page */ });
  } catch {
    /* ignore */
  }
}
