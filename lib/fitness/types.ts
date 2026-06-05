// ─────────────────────────────────────────────────────────────────────────────
// Connected Steps — Fitness Integration Type System
// ─────────────────────────────────────────────────────────────────────────────

// ── Activity types ────────────────────────────────────────────────────────────

export type CsActivityType =
  | "run"
  | "walk"
  | "cycling"
  | "swimming"
  | "strength"
  | "yoga"
  | "hiit"
  | "other";

export type ProviderSource =
  | "health_connect"
  | "apple_health"
  | "garmin"
  | "fitbit"
  | "strava"
  | "coros"
  | "polar"
  | "manual";

export type IntegrationStatus = "pending" | "active" | "paused" | "error" | "revoked";

// ── OAuth tokens (web providers) ──────────────────────────────────────────────

export interface OAuthTokens {
  accessToken:    string;
  refreshToken?:  string;
  expiresAt?:     number;   // unix seconds
  scopes?:        string[];
  externalUserId?: string;
}

// ── Raw activity from any provider (before mapping) ───────────────────────────

export interface RawActivity {
  externalId:      string;
  providerType:    string;          // provider-specific type string
  startedAt:       Date;
  durationSecs?:   number;
  distanceM?:      number;
  avgPaceSecsKm?:  number;
  calories?:       number;
  avgHeartRate?:   number;
  steps?:          number;
  elevationGainM?: number;
  rawData?:        Record<string, unknown>;
}

// ── Mapped activity (CS canonical format) ─────────────────────────────────────

export interface CsActivity extends RawActivity {
  activityType: CsActivityType;
  csPoints:     number;
}

// ── Sync result returned after each sync run ──────────────────────────────────

export interface SyncResult {
  provider:    ProviderSource;
  imported:    number;
  duplicates:  number;
  errors:      number;
  startedAt:   Date;
  completedAt: Date;
}

// ── Integration record (matches user_integrations table) ──────────────────────

export interface UserIntegration {
  id:             string;
  userEmail:      string;
  provider:       ProviderSource;
  status:         IntegrationStatus;
  lastSyncAt?:    string;
  lastSyncCount:  number;
  totalSynced:    number;
  errorMessage?:  string;
  metadata:       Record<string, unknown>;
  createdAt:      string;
  updatedAt:      string;
}

// ── Provider metadata (displayed in UI) ──────────────────────────────────────

export interface ProviderMeta {
  id:          ProviderSource;
  name:        string;
  description: string;
  icon:        string;
  isNative:    boolean;    // requires iOS/Android app
  isOAuth:     boolean;    // uses web OAuth flow
  isEnabled:   boolean;    // available for connection
  comingSoon?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// FitnessProvider — the core abstraction interface
// Every provider (Garmin, Fitbit, HealthKit, Health Connect…) implements this.
// Business logic (sync, dedup, point calculation) never depends on provider.
// ─────────────────────────────────────────────────────────────────────────────

export interface FitnessProvider {
  // ── Identity ────────────────────────────────────────────────────────────────
  readonly id:          ProviderSource;
  readonly meta:        ProviderMeta;

  // ── OAuth flow (web providers only — isOAuth = true) ────────────────────────
  buildAuthUrl?(redirectUri: string, state: string): string | Promise<string>;
  exchangeCode?(code: string, redirectUri: string): Promise<OAuthTokens>;
  refreshTokens?(tokens: OAuthTokens): Promise<OAuthTokens>;
  revokeTokens?(tokens: OAuthTokens): Promise<void>;

  // ── Data fetching (all providers) ───────────────────────────────────────────
  // OAuth providers: tokens from DB.
  // Native providers: tokens = {} (data is pushed to /api/integrations/native/push).
  fetchActivities(tokens: OAuthTokens, since: Date, until?: Date): Promise<RawActivity[]>;

  // ── Type mapping ─────────────────────────────────────────────────────────────
  mapActivityType(providerType: string): CsActivityType;
}
