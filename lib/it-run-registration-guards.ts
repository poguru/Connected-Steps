/**
 * Two checks the registration API makes before it holds any seat or discount:
 *  - a discount code limited to some categories must cover every category in the booking;
 *  - the same runners must not be registered twice while the first booking is still waiting for payment.
 *
 * Pure functions, so the rules can be tested directly. The route supplies the rows.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** How long an unpaid booking with the same lead email and runners blocks a new one */
export const DUPLICATE_WINDOW_MS = 15 * 60 * 1000;

/**
 * The categories in the booking that a discount code does not cover. A code with no category list covers all of them.
 */
export function couponUncoveredCategories(applicableCategoryIds: string[] | null | undefined, categoryIds: string[]): string[] {
  if (!Array.isArray(applicableCategoryIds) || applicableCategoryIds.length === 0) return [];
  return Array.from(new Set(categoryIds)).filter(id => !applicableCategoryIds.includes(id));
}

/**
 * Whether an open, unpaid booking already holds exactly these runners. Compared as sets of phone numbers, so the
 * order the runners were entered in does not matter.
 */
export function isDuplicateOpenRegistration(newMobiles: string[], openBookings: string[][]): boolean {
  const wanted = [...newMobiles].sort().join("|");
  if (wanted === "") return false;
  return openBookings.some(runners => [...runners].sort().join("|") === wanted);
}

/** The runners as one string: their phone numbers, sorted. The same runners always give the same fingerprint. */
export function fingerprintRunners(mobiles: string[]): string {
  return [...mobiles].sort().join("|");
}

/** The database function is missing (migration not applied yet). Other errors are not treated this way. */
function isMissingClaimFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "PGRST202" || /itr_claim_registration/.test(error.message ?? "");
}

export type ClaimResult = "claimed" | "duplicate" | "error";

/**
 * Claims these runners for this lead email, atomically, in the database. Returns "duplicate" when a fresh claim
 * already exists. If the claim function is not in the database yet, the older read-based check is used instead
 * (it can miss two requests that arrive at the same moment). Nothing else changes.
 */
export async function claimRunners(
  db: SupabaseClient,
  eventId: string,
  leadEmail: string,
  mobiles: string[],
): Promise<{ result: ClaimResult; claimed: boolean }> {
  const fingerprint = fingerprintRunners(mobiles);
  const { data, error } = await db.rpc("itr_claim_registration", {
    p_event_id: eventId, p_lead_email: leadEmail, p_fingerprint: fingerprint, p_window_mins: DUPLICATE_WINDOW_MS / 60_000,
  });
  if (!error) {
    // Only an explicit false refuses. Anything else is treated as claimed, because the seat reservation still stops overselling.
    return data === false ? { result: "duplicate", claimed: false } : { result: "claimed", claimed: true };
  }
  if (!isMissingClaimFunction(error)) {
    console.error("[it-run/register] claim failed:", error.code ?? "unknown");
    return { result: "error", claimed: false };
  }
  return readBasedCheck(db, eventId, leadEmail, mobiles);
}

/** Gives back a claim taken by this request, when its registration did not go ahead. */
export async function releaseRunnerClaim(db: SupabaseClient, eventId: string, leadEmail: string, mobiles: string[]): Promise<void> {
  const { error } = await db.rpc("itr_release_claim", {
    p_event_id: eventId, p_lead_email: leadEmail, p_fingerprint: fingerprintRunners(mobiles),
  });
  if (error && !isMissingClaimFunction(error)) console.error("[it-run/register] claim release failed:", error.code ?? "unknown");
}

/** The check used before the claim function existed: an open booking with the same runners. */
async function readBasedCheck(
  db: SupabaseClient,
  eventId: string,
  leadEmail: string,
  mobiles: string[],
): Promise<{ result: ClaimResult; claimed: boolean }> {
  const cutoffIso = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
  const { data: openRegs, error: openErr } = await db
    .from("it_run_registrations")
    .select("id")
    .eq("event_id", eventId)
    .eq("lead_email", leadEmail)
    .in("payment_status", ["pending", "payment_attempted", "failed"])
    .gt("created_at", cutoffIso)
    .returns<Array<{ id: string }>>();
  if (openErr) return { result: "error", claimed: false };
  if (!openRegs || openRegs.length === 0) return { result: "claimed", claimed: false };

  const { data: runners, error: runnersErr } = await db
    .from("it_run_participants")
    .select("registration_id, mobile")
    .in("registration_id", openRegs.map(r => r.id))
    .returns<Array<{ registration_id: string; mobile: string }>>();
  if (runnersErr) return { result: "error", claimed: false };

  const bookings = new Map<string, string[]>();
  for (const row of runners ?? []) {
    const list = bookings.get(row.registration_id) ?? [];
    list.push(row.mobile);
    bookings.set(row.registration_id, list);
  }
  const duplicate = isDuplicateOpenRegistration(mobiles, Array.from(bookings.values()));
  return { result: duplicate ? "duplicate" : "claimed", claimed: false };
}
