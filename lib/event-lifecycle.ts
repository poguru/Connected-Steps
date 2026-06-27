/**
 * Event lifecycle engine — single source of truth for countdown timers
 * and lifecycle state on every event-facing surface.
 *
 * All calculations happen client-side from timestamps already on the page.
 * No server polling. Updates propagate via the countdown component's interval.
 *
 * Lifecycle states (in order):
 *   registration_not_open  → registration_open → registration_closed → event_live → completed
 *
 * IST note:
 *   • start_date / end_date are "YYYY-MM-DD" — interpreted as IST midnight (UTC+05:30)
 *   • start_time / end_time are "HH:MM" — appended to date in IST
 *   • registration_closes_at is a full ISO TIMESTAMPTZ already in UTC — parse directly
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type LifecycleState =
  | "registration_not_open"   // Registration opens in the future
  | "registration_open"       // Accepting registrations right now
  | "registration_closed"     // Registration ended, event hasn't started
  | "event_live"              // Event is currently happening
  | "completed";              // Event has ended

export interface LifecycleEvent {
  start_date:              string;        // "YYYY-MM-DD"
  start_time?:             string | null; // "HH:MM"
  end_date?:               string | null; // "YYYY-MM-DD"
  end_time?:               string | null; // "HH:MM"
  registration_opens_at?:  string | null; // ISO TIMESTAMPTZ (UTC) — optional new field
  registration_closes_at?: string | null; // ISO TIMESTAMPTZ (UTC)
}

export interface LifecycleInfo {
  state:           LifecycleState;
  /** Unix ms of the next state boundary (null when completed) */
  nextTransitionMs: number | null;
  /** Human label for the countdown: "Registration closes in", "Event starts in" … */
  countdownLabel:  string | null;
  /** Whether any countdown should be shown at all */
  showCountdown:   boolean;
  // Convenience flags
  canRegister:     boolean;
  isLive:          boolean;
  isCompleted:     boolean;
}

// ── Badge styling ─────────────────────────────────────────────────────────────

export const LIFECYCLE_BADGE: Record<LifecycleState, {
  text:    string;
  label:   string;
  color:   string;
  bg:      string;
  border:  string;
}> = {
  registration_not_open: {
    text:   "OPENS SOON",
    label:  "Registration Opens Soon",
    color:  "#60a5fa",
    bg:     "rgba(96,165,250,0.10)",
    border: "rgba(96,165,250,0.30)",
  },
  registration_open: {
    text:   "OPEN",
    label:  "Registration Open",
    color:  "#4ade80",
    bg:     "rgba(74,222,128,0.10)",
    border: "rgba(74,222,128,0.30)",
  },
  registration_closed: {
    text:   "REG. CLOSED",
    label:  "Registration Closed",
    color:  "#f87171",
    bg:     "rgba(248,113,113,0.08)",
    border: "rgba(248,113,113,0.25)",
  },
  event_live: {
    text:   "LIVE NOW",
    label:  "Event Live",
    color:  "#a78bfa",
    bg:     "rgba(167,139,250,0.12)",
    border: "rgba(167,139,250,0.30)",
  },
  completed: {
    text:   "COMPLETED",
    label:  "Event Completed",
    color:  "#6b7280",
    bg:     "rgba(107,114,128,0.08)",
    border: "rgba(107,114,128,0.20)",
  },
};

// ── Countdown label per state ─────────────────────────────────────────────────

const COUNTDOWN_LABEL: Record<LifecycleState, string | null> = {
  registration_not_open: "Registration opens in",
  registration_open:     "Registration closes in",
  registration_closed:   "Event starts in",
  event_live:            null,  // no countdown while live
  completed:             null,
};

// ── Core calculator ───────────────────────────────────────────────────────────

/** Convert a date+time in IST to a UTC ms timestamp */
function istMs(date: string, time: string | null | undefined): number {
  const t = (time ?? "00:00").substring(0, 5);
  return new Date(`${date}T${t}:00+05:30`).getTime();
}

/**
 * Compute the current lifecycle state and countdown target for an event.
 * Call this once, then re-call when the countdown reaches zero to
 * advance to the next state.
 */
export function getLifecycle(ev: LifecycleEvent, nowMs?: number): LifecycleInfo {
  const now = nowMs ?? Date.now();

  // ── Boundaries ─────────────────────────────────────────────────────────────
  const endMs   = ev.end_date
    ? istMs(ev.end_date, ev.end_time ?? "23:59")
    : istMs(ev.start_date, "23:59");

  const startMs = istMs(ev.start_date, ev.start_time);

  const closesMs = ev.registration_closes_at
    ? new Date(ev.registration_closes_at).getTime()
    : null;

  const opensMs = ev.registration_opens_at
    ? new Date(ev.registration_opens_at).getTime()
    : null;

  // ── State machine ───────────────────────────────────────────────────────────
  let state: LifecycleState;
  let nextTransitionMs: number | null = null;

  if (now >= endMs) {
    state = "completed";
  } else if (now >= startMs) {
    state = "event_live";
    nextTransitionMs = endMs;
  } else if (closesMs !== null && now >= closesMs) {
    state = "registration_closed";
    nextTransitionMs = startMs;
  } else if (opensMs !== null && now < opensMs) {
    state = "registration_not_open";
    nextTransitionMs = opensMs;
  } else {
    // Registration is open (no opens_at restriction, or opensAt has passed)
    state = "registration_open";
    nextTransitionMs = closesMs ?? startMs;
  }

  const countdownLabel = COUNTDOWN_LABEL[state];
  const showCountdown  = nextTransitionMs !== null && countdownLabel !== null && nextTransitionMs > now;

  return {
    state,
    nextTransitionMs: showCountdown ? nextTransitionMs : null,
    countdownLabel,
    showCountdown,
    canRegister:  state === "registration_open",
    isLive:       state === "event_live",
    isCompleted:  state === "completed",
  };
}

// ── Countdown decomposer ──────────────────────────────────────────────────────

export interface CountdownParts {
  days:    number;
  hours:   number;
  minutes: number;
  seconds: number;
  total:   number;  // remaining ms
}

export function msToCountdown(targetMs: number, nowMs?: number): CountdownParts {
  const now   = nowMs ?? Date.now();
  const total = Math.max(0, targetMs - now);
  const s     = Math.floor(total / 1000);
  return {
    days:    Math.floor(s / 86400),
    hours:   Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    total,
  };
}

// ── Legacy adapter ────────────────────────────────────────────────────────────
// Maps new lifecycle state back to the old EventLifecycleStatus type so
// existing code that uses getEventLifecycleStatus / LIFECYCLE_COLOR continues
// working without changes.

export type LegacyStatus = "UPCOMING" | "REGISTRATION_CLOSED" | "ONGOING" | "COMPLETED";

export function toLegacyStatus(state: LifecycleState): LegacyStatus {
  switch (state) {
    case "registration_not_open":
    case "registration_open":      return "UPCOMING";
    case "registration_closed":    return "REGISTRATION_CLOSED";
    case "event_live":             return "ONGOING";
    case "completed":              return "COMPLETED";
  }
}
