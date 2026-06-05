import type { FitnessProvider, OAuthTokens, ProviderMeta, RawActivity, CsActivityType } from "../types";
import { normaliseActivityType } from "../activity-mapper";

const BASE    = "https://api.fitbit.com";
const AUTH    = "https://www.fitbit.com/oauth2/authorize";
const TOKEN   = "https://api.fitbit.com/oauth2/token";

// Required scopes
const SCOPES  = ["activity", "heartrate", "profile", "weight"];

const META: ProviderMeta = {
  id:          "fitbit",
  name:        "Fitbit",
  description: "Sync runs, walks and workouts from your Fitbit device",
  icon:        "💪",
  isNative:    false,
  isOAuth:     true,
  isEnabled:   true,
};

// Fitbit activity type → CS type
const FITBIT_TYPE_MAP: Record<string, CsActivityType> = {
  "90009":  "run",       // Running
  "90013":  "run",       // Treadmill
  "90015":  "walk",      // Walking
  "90001":  "cycling",   // Bike
  "90002":  "cycling",   // Spinning
  "90012":  "swimming",  // Swimming
  "90006":  "hiit",      // Interval Workout
  "90011":  "strength",  // Weights
};

export class FitbitProvider implements FitnessProvider {
  readonly id   = "fitbit" as const;
  readonly meta = META;

  // ── OAuth ─────────────────────────────────────────────────────────────────

  buildAuthUrl(redirectUri: string, state: string): string {
    const p = new URLSearchParams({
      client_id:     process.env.FITBIT_CLIENT_ID!,
      response_type: "code",
      scope:         SCOPES.join(" "),
      redirect_uri:  redirectUri,
      state,
    });
    return `${AUTH}?${p}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const creds = Buffer.from(
      `${process.env.FITBIT_CLIENT_ID}:${process.env.FITBIT_CLIENT_SECRET}`
    ).toString("base64");

    const res = await fetch(TOKEN, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${creds}`,
        "Content-Type":  "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type:   "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!res.ok) throw new Error(`Fitbit token exchange failed: ${res.status}`);
    const d = await res.json();
    return {
      accessToken:    d.access_token,
      refreshToken:   d.refresh_token,
      expiresAt:      Math.floor(Date.now() / 1000) + d.expires_in,
      scopes:         (d.scope as string).split(" "),
      externalUserId: d.user_id,
    };
  }

  async refreshTokens(tokens: OAuthTokens): Promise<OAuthTokens> {
    if (!tokens.refreshToken) throw new Error("No refresh token");
    const creds = Buffer.from(
      `${process.env.FITBIT_CLIENT_ID}:${process.env.FITBIT_CLIENT_SECRET}`
    ).toString("base64");

    const res = await fetch(TOKEN, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${creds}`,
        "Content-Type":  "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type:    "refresh_token",
        refresh_token: tokens.refreshToken,
      }),
    });
    if (!res.ok) throw new Error(`Fitbit token refresh failed: ${res.status}`);
    const d = await res.json();
    return {
      accessToken:    d.access_token,
      refreshToken:   d.refresh_token ?? tokens.refreshToken,
      expiresAt:      Math.floor(Date.now() / 1000) + d.expires_in,
      externalUserId: tokens.externalUserId,
      scopes:         tokens.scopes,
    };
  }

  async revokeTokens(tokens: OAuthTokens): Promise<void> {
    const creds = Buffer.from(
      `${process.env.FITBIT_CLIENT_ID}:${process.env.FITBIT_CLIENT_SECRET}`
    ).toString("base64");
    await fetch(`${BASE}/oauth2/revoke`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${creds}`,
        "Content-Type":  "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token: tokens.accessToken }),
    });
  }

  // ── Data fetching ─────────────────────────────────────────────────────────

  async fetchActivities(tokens: OAuthTokens, since: Date): Promise<RawActivity[]> {
    // Ensure token is fresh (caller handles refresh via SyncService)
    const afterDate = since.toISOString().slice(0, 10);

    const res = await fetch(
      `${BASE}/1/user/-/activities/list.json?afterDate=${afterDate}&sort=asc&offset=0&limit=100`,
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } }
    );
    if (!res.ok) throw new Error(`Fitbit activities fetch failed: ${res.status}`);
    const data = await res.json();
    const list: Record<string, unknown>[] = data.activities ?? [];

    return list.map(a => ({
      externalId:   String(a.logId),
      providerType: String(a.activityTypeId ?? a.activityName ?? "other"),
      startedAt:    new Date(`${a.startDate}T${a.startTime}:00`),
      durationSecs: Math.round(Number(a.duration ?? 0) / 1000),
      distanceM:    a.distance
        ? Number(a.distance) * (String(a.distanceUnit) === "Mile" ? 1609.34 : 1000)
        : undefined,
      calories:     a.calories ? Number(a.calories) : undefined,
      steps:        a.steps    ? Number(a.steps)    : undefined,
      rawData:      a,
    }));
  }

  mapActivityType(providerType: string): CsActivityType {
    return FITBIT_TYPE_MAP[providerType] ?? normaliseActivityType(providerType);
  }
}
