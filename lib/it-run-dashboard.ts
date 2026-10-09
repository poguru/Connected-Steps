/**
 * Participant dashboard response contract (shared by the API route and the dashboard page).
 *
 * The API returns one of:
 *   200 { reg, participants, bibSlots }        — all arrays are arrays (possibly empty)
 *   404 { error, code: "NOT_FOUND" }           — no registration for this code
 *   500 { error, code: "SERVER_ERROR" }        — a query failed; nothing was changed
 *
 * The page validates the shape before rendering, so a malformed payload becomes a
 * recoverable error instead of a render-time TypeError.
 */

export type DashboardFailureKind =
  | "NOT_FOUND" | "SERVER_ERROR" | "INVALID_RESPONSE" | "NETWORK"
  | "AUTH_REQUIRED" | "EXPIRED_LINK" | "INVALID_LINK";

export const DASHBOARD_FAILURE_MESSAGES: Record<DashboardFailureKind, string> = {
  NOT_FOUND: "We couldn't find a registration associated with this link.",
  SERVER_ERROR: "We couldn't load your dashboard right now. Your registration has not been changed. Please try again.",
  INVALID_RESPONSE: "We couldn't load your dashboard right now. Your registration has not been changed. Please try again.",
  NETWORK: "We couldn't load your dashboard right now. Check your connection and try again.",
  AUTH_REQUIRED: "Please sign in to view your registration.",
  EXPIRED_LINK: "This link has expired. Please sign in to view your registration.",
  INVALID_LINK: "This participant link is invalid. Please open the latest email or sign in to Connected Steps.",
};

export interface DashboardPayload {
  reg: Record<string, unknown> & {
    id: string;
    registration_code: string;
    payment_status: string;
    registration_status: string;
  };
  participants: Array<Record<string, unknown> & {
    id: string;
    first_name: string;
    last_name: string;
    it_run_bib_bookings: unknown[];
    it_run_bib_collections: unknown[];
    it_run_checkins: unknown[];
  }>;
  bibSlots: Array<Record<string, unknown> & { id: string }>;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/** True only when every field the dashboard renders from is present with the right type. */
export function isDashboardPayload(value: unknown): value is DashboardPayload {
  if (!isObject(value)) return false;
  const { reg, participants, bibSlots } = value;

  if (!isObject(reg)) return false;
  if (!isNonEmptyString(reg.id) || !isNonEmptyString(reg.registration_code)) return false;
  if (!isNonEmptyString(reg.payment_status) || !isNonEmptyString(reg.registration_status)) return false;

  if (!Array.isArray(participants)) return false;
  for (const p of participants) {
    if (!isObject(p) || !isNonEmptyString(p.id)) return false;
    if (typeof p.first_name !== "string" || typeof p.last_name !== "string") return false;
    // Nested to-many relations must be arrays; the server normalizes null to [].
    if (!Array.isArray(p.it_run_bib_bookings) || !Array.isArray(p.it_run_bib_collections) || !Array.isArray(p.it_run_checkins)) return false;
  }

  if (!Array.isArray(bibSlots)) return false;
  return bibSlots.every(s => isObject(s) && isNonEmptyString(s.id));
}

/** Maps an API failure (HTTP status + parsed body) to a participant-facing failure kind. */
export function classifyDashboardFailure(status: number, body: unknown): DashboardFailureKind {
  const code = isObject(body) && typeof body.code === "string" ? body.code : null;
  if (status === 401 || code === "AUTH_REQUIRED") return "AUTH_REQUIRED";
  if (status === 410 || code === "EXPIRED_LINK") return "EXPIRED_LINK";
  if (code === "INVALID_LINK") return "INVALID_LINK";
  if (status === 404 || code === "NOT_FOUND") return "NOT_FOUND";
  if (status >= 500 || code === "SERVER_ERROR") return "SERVER_ERROR";
  return "INVALID_RESPONSE";
}
