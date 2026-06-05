/**
 * Android Health Connect Provider
 *
 * Health Connect is a native Android API (Android 9+). It cannot be called
 * from a web browser. Integration works as a PUSH model:
 *
 *   1. Your future Android app (React Native / Expo / native) requests
 *      READ_HEALTH_DATA permission for: Steps, Distance, TotalCaloriesBurned,
 *      ExerciseSession.
 *   2. The app reads activities via HealthConnectClient and POSTs them to
 *      POST /api/integrations/native/push  (with the user's auth token).
 *   3. This provider's fetchActivities() is never called directly — it is a
 *      no-op stub so the SyncService can treat all providers uniformly.
 *
 * Required Android permissions (AndroidManifest.xml):
 *   android.permission.health.READ_STEPS
 *   android.permission.health.READ_DISTANCE
 *   android.permission.health.READ_TOTAL_CALORIES_BURNED
 *   android.permission.health.READ_EXERCISE
 */

import type { FitnessProvider, OAuthTokens, ProviderMeta, RawActivity, CsActivityType } from "../types";
import { normaliseActivityType } from "../activity-mapper";

const META: ProviderMeta = {
  id:          "health_connect",
  name:        "Android Health Connect",
  description: "Sync steps, runs and workouts from Android Health Connect",
  icon:        "🤖",
  isNative:    true,    // ← signals the UI to show "Open in App" instead of Connect
  isOAuth:     false,
  isEnabled:   true,
};

// Exercise type IDs from Health Connect SDK
const HC_TYPE_MAP: Record<number, CsActivityType> = {
  56: "run",        // EXERCISE_TYPE_RUNNING
  79: "run",        // EXERCISE_TYPE_RUNNING_TREADMILL
  97: "walk",       // EXERCISE_TYPE_WALKING
  19: "cycling",    // EXERCISE_TYPE_BIKING
  20: "cycling",    // EXERCISE_TYPE_BIKING_STATIONARY
  74: "swimming",   // EXERCISE_TYPE_SWIMMING_OPEN_WATER
  75: "swimming",   // EXERCISE_TYPE_SWIMMING_POOL
  61: "strength",   // EXERCISE_TYPE_STRENGTH_TRAINING
  65: "hiit",       // EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING
  45: "yoga",       // EXERCISE_TYPE_YOGA
};

export class HealthConnectProvider implements FitnessProvider {
  readonly id   = "health_connect" as const;
  readonly meta = META;

  // Native providers don't use OAuth — these are stubs
  buildAuthUrl(_redirectUri: string, _state: string): string {
    return "/profile#connected-apps";  // redirect back to settings
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<OAuthTokens> {
    return { accessToken: "native" };
  }

  async refreshTokens(tokens: OAuthTokens): Promise<OAuthTokens> { return tokens; }
  async revokeTokens(_tokens: OAuthTokens): Promise<void> { /* handled in Android app */ }

  // fetchActivities is not called for native providers.
  // Data arrives via POST /api/integrations/native/push.
  async fetchActivities(_tokens: OAuthTokens, _since: Date): Promise<RawActivity[]> {
    return [];
  }

  mapActivityType(providerType: string): CsActivityType {
    const id = Number(providerType);
    return HC_TYPE_MAP[id] ?? normaliseActivityType(providerType);
  }
}

// ── Expected payload from Android app → /api/integrations/native/push ─────────
// {
//   "source": "health_connect",
//   "activities": [
//     {
//       "externalId": "<exerciseSession.metadata.id>",
//       "providerType": "56",
//       "startedAt": "2026-06-01T06:00:00Z",
//       "durationSecs": 3600,
//       "distanceM": 10000,
//       "calories": 650,
//       "steps": 9800,
//       "avgHeartRate": 152,
//       "rawData": { ... }
//     }
//   ]
// }
