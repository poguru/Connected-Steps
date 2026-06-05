// ── Auth ──────────────────────────────────────────────────────────────────────

export interface CSUser {
  email:     string;
  firstName: string;
  lastName:  string;
  phone:     string;
  goal:      string;
  location:  string;
  photo:     string | null;
}

// ── Health activity (canonical CS format) ─────────────────────────────────────

export type ActivityType =
  | "run" | "walk" | "cycling" | "swimming"
  | "strength" | "yoga" | "hiit" | "other";

export type HealthSource = "health_connect" | "apple_health";

export interface HealthActivity {
  externalId:      string;
  providerType:    string;   // raw type from the OS
  activityType:    ActivityType;
  startedAt:       string;   // ISO string
  durationSecs?:   number;
  distanceM?:      number;
  calories?:       number;
  avgHeartRate?:   number;
  steps?:          number;
  elevationGainM?: number;
}

// ── Sync state ────────────────────────────────────────────────────────────────

export type SyncStatus = "idle" | "requesting" | "fetching" | "uploading" | "done" | "error";

export interface SyncState {
  status:    SyncStatus;
  imported:  number;
  message:   string;
  error?:    string;
}

// ── API responses ─────────────────────────────────────────────────────────────

export interface PushResponse {
  success:    boolean;
  imported:   number;
  duplicates: number;
  message:    string;
}
