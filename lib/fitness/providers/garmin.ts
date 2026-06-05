import type { FitnessProvider, OAuthTokens, ProviderMeta, RawActivity, CsActivityType } from "../types";
import { normaliseActivityType } from "../activity-mapper";
import { createHmac, createHash } from "crypto";

// Garmin Connect uses OAuth 1.0a
const REQUEST_TOKEN_URL = "https://connectapi.garmin.com/oauth-service/oauth/request_token";
const ACCESS_TOKEN_URL  = "https://connectapi.garmin.com/oauth-service/oauth/access_token";
const AUTHORIZE_URL     = "https://connect.garmin.com/oauthConfirm";
const ACTIVITIES_URL    = "https://connectapi.garmin.com/activity-service/activity/search/activities";

const META: ProviderMeta = {
  id:          "garmin",
  name:        "Garmin Connect",
  description: "Sync activities from your Garmin GPS device",
  icon:        "⌚",
  isNative:    false,
  isOAuth:     true,
  isEnabled:   true,
};

const GARMIN_TYPE_MAP: Record<string, CsActivityType> = {
  "running":            "run",
  "treadmill_running":  "run",
  "trail_running":      "run",
  "cycling":            "cycling",
  "mountain_biking":    "cycling",
  "indoor_cycling":     "cycling",
  "walking":            "walk",
  "hiking":             "walk",
  "swimming":           "swimming",
  "open_water_swimming":"swimming",
  "strength_training":  "strength",
  "yoga":               "yoga",
  "hiit":               "hiit",
};

// ── OAuth 1.0a signing ────────────────────────────────────────────────────────

function percentEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/!/g,  "%21").replace(/'/g,  "%27")
    .replace(/\(/g, "%28").replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

function oauthSign(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret = ""
): string {
  const sorted = Object.keys(params).sort().map(k =>
    `${percentEncode(k)}=${percentEncode(params[k])}`
  ).join("&");

  const base = [method.toUpperCase(), percentEncode(url), percentEncode(sorted)].join("&");
  const key  = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return createHmac("sha1", key).update(base).digest("base64");
}

function oauthHeader(
  method: string,
  url: string,
  extra: Record<string, string> = {},
  tokenSecret = "",
  token = ""
): string {
  const ts    = String(Math.floor(Date.now() / 1000));
  const nonce = createHash("md5").update(Math.random().toString()).digest("hex");
  const ck    = process.env.GARMIN_CONSUMER_KEY!;
  const cs    = process.env.GARMIN_CONSUMER_SECRET!;

  const params: Record<string, string> = {
    oauth_consumer_key:     ck,
    oauth_nonce:            nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp:        ts,
    oauth_version:          "1.0",
    ...extra,
  };
  if (token) params.oauth_token = token;

  params.oauth_signature = oauthSign(method, url, params, cs, tokenSecret);

  const parts = Object.keys(params)
    .filter(k => k.startsWith("oauth_"))
    .map(k => `${percentEncode(k)}="${percentEncode(params[k])}"`)
    .join(", ");

  return `OAuth ${parts}`;
}

export class GarminProvider implements FitnessProvider {
  readonly id   = "garmin" as const;
  readonly meta = META;

  // ── Step 1: Get a request token, return auth URL ──────────────────────────

  async buildAuthUrl(redirectUri: string, state: string): Promise<string> {
    const res = await fetch(REQUEST_TOKEN_URL, {
      method: "POST",
      headers: { Authorization: oauthHeader("POST", REQUEST_TOKEN_URL, { oauth_callback: redirectUri }) },
    });
    if (!res.ok) throw new Error(`Garmin request token failed: ${res.status}`);
    const body   = await res.text();
    const params = new URLSearchParams(body);
    const reqToken = params.get("oauth_token") ?? "";
    // Encode state in the callback via oauth_token — retrieve from DB in callback
    return `${AUTHORIZE_URL}?oauth_token=${reqToken}&state=${encodeURIComponent(state)}`;
  }

  // ── Step 2: Exchange request token + verifier for access token ────────────

  async exchangeCode(verifier: string, _redirectUri: string, requestToken?: string, requestTokenSecret?: string): Promise<OAuthTokens> {
    const rt = requestToken       ?? "";
    const rs = requestTokenSecret ?? "";

    const res = await fetch(ACCESS_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: oauthHeader("POST", ACCESS_TOKEN_URL, { oauth_verifier: verifier }, rs, rt),
      },
    });
    if (!res.ok) throw new Error(`Garmin access token failed: ${res.status}`);
    const body   = await res.text();
    const params = new URLSearchParams(body);

    return {
      accessToken:    params.get("oauth_token")!,
      refreshToken:   params.get("oauth_token_secret")!,  // stored as refreshToken for convenience
      externalUserId: params.get("x_oauth_user_id") ?? undefined,
    };
  }

  // Garmin OAuth 1.0a tokens don't expire — no refresh needed
  async refreshTokens(tokens: OAuthTokens): Promise<OAuthTokens> { return tokens; }

  async revokeTokens(_tokens: OAuthTokens): Promise<void> {
    // Garmin Connect does not expose a revoke endpoint — user removes from their Garmin settings
  }

  // ── Fetch activities ──────────────────────────────────────────────────────

  async fetchActivities(tokens: OAuthTokens, since: Date): Promise<RawActivity[]> {
    const start  = Math.floor(since.getTime() / 1000);
    const url    = `${ACTIVITIES_URL}?start=0&limit=100&startDate=${start}`;
    const secret = tokens.refreshToken ?? "";  // stored as refreshToken
    const token  = tokens.accessToken;

    const res = await fetch(url, {
      headers: { Authorization: oauthHeader("GET", url, {}, secret, token) },
    });
    if (!res.ok) throw new Error(`Garmin activities fetch failed: ${res.status}`);
    const data: Record<string, unknown>[] = await res.json();

    return data.map(a => ({
      externalId:   String(a.activityId),
      providerType: String((a.activityType as Record<string, unknown>)?.typeKey ?? "other"),
      startedAt:    new Date(Number(a.beginTimestamp) * 1000),
      durationSecs: a.duration ? Math.round(Number(a.duration)) : undefined,
      distanceM:    a.distance ? Number(a.distance) : undefined,
      calories:     a.calories ? Number(a.calories) : undefined,
      avgHeartRate: a.averageHR ? Number(a.averageHR) : undefined,
      elevationGainM: a.elevationGain ? Number(a.elevationGain) : undefined,
      steps:        a.steps ? Number(a.steps) : undefined,
      rawData:      a,
    }));
  }

  mapActivityType(providerType: string): CsActivityType {
    return GARMIN_TYPE_MAP[providerType] ?? normaliseActivityType(providerType);
  }
}
