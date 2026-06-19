export type EventLifecycleStatus =
  | "UPCOMING"
  | "REGISTRATION_CLOSED"
  | "ONGOING"
  | "COMPLETED";

export interface EventForStatus {
  start_date:              string;        // "YYYY-MM-DD"
  start_time?:             string | null; // "HH:MM" or "HH:MM:SS"
  end_date?:               string | null; // "YYYY-MM-DD"
  end_time?:               string | null; // "HH:MM" or "HH:MM:SS"
  registration_closes_at?: string | null; // ISO TIMESTAMPTZ (UTC)
}

// Parse a date + optional time as an IST (UTC+05:30) instant
function istDatetime(dateStr: string, timeStr: string | null | undefined): Date {
  const t = (timeStr ?? "00:00").substring(0, 5);
  return new Date(`${dateStr}T${t}:00+05:30`);
}

export function getEventLifecycleStatus(ev: EventForStatus): EventLifecycleStatus {
  const now = new Date();

  // Event ends at end_date+end_time; default to start_date 23:59 IST if no end set
  const endAt = ev.end_date
    ? istDatetime(ev.end_date, ev.end_time ?? "23:59")
    : istDatetime(ev.start_date, "23:59");

  if (now >= endAt) return "COMPLETED";

  const startAt = istDatetime(ev.start_date, ev.start_time);
  if (now >= startAt) return "ONGOING";

  if (ev.registration_closes_at && now >= new Date(ev.registration_closes_at)) {
    return "REGISTRATION_CLOSED";
  }

  return "UPCOMING";
}

export const LIFECYCLE_LABEL: Record<EventLifecycleStatus, string> = {
  UPCOMING:              "Upcoming",
  REGISTRATION_CLOSED:   "Reg. Closed",
  ONGOING:               "Ongoing",
  COMPLETED:             "Completed",
};

export const LIFECYCLE_COLOR: Record<EventLifecycleStatus, { text: string; bg: string; border: string }> = {
  UPCOMING:            { text: "#4ade80", bg: "rgba(74,222,128,0.10)", border: "rgba(74,222,128,0.30)" },
  REGISTRATION_CLOSED: { text: "#f87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.25)" },
  ONGOING:             { text: "#e8620a", bg: "rgba(232,98,10,0.12)",   border: "rgba(232,98,10,0.30)"  },
  COMPLETED:           { text: "#6b7280", bg: "rgba(107,114,128,0.08)", border: "rgba(107,114,128,0.20)" },
};
