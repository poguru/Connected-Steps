/**
 * Apple HealthKit Provider
 *
 * HealthKit is a native iOS-only API. It cannot be accessed from a web
 * browser or Safari. Integration works via a PUSH model identical to
 * Health Connect:
 *
 *   1. Your future iOS app requests HealthKit authorisation for:
 *        HKQuantityTypeIdentifierDistanceWalkingRunning
 *        HKQuantityTypeIdentifierActiveEnergyBurned
 *        HKQuantityTypeIdentifierStepCount
 *        HKWorkoutType
 *   2. The app reads workouts via HKWorkout and POSTs them to
 *      POST /api/integrations/native/push.
 *
 * Required Info.plist keys:
 *   NSHealthShareUsageDescription
 *   NSHealthUpdateUsageDescription
 */

import type { FitnessProvider, OAuthTokens, ProviderMeta, RawActivity, CsActivityType } from "../types";
import { normaliseActivityType } from "../activity-mapper";

const META: ProviderMeta = {
  id:          "apple_health",
  name:        "Apple Health",
  description: "Sync runs and workouts from Apple Health (iPhone/Apple Watch)",
  icon:        "🍎",
  isNative:    true,
  isOAuth:     false,
  isEnabled:   true,
};

// HKWorkoutActivityType values from HealthKit SDK
const HK_TYPE_MAP: Record<number, CsActivityType> = {
  37: "run",       // HKWorkoutActivityTypeRunning
  1:  "cycling",   // HKWorkoutActivityTypeCycling
  52: "walk",      // HKWorkoutActivityTypeWalking
  46: "swimming",  // HKWorkoutActivityTypeSwimming
  20: "strength",  // HKWorkoutActivityTypeFunctionalStrengthTraining
  19: "strength",  // HKWorkoutActivityTypeTraditionalStrengthTraining
  57: "yoga",      // HKWorkoutActivityTypeYoga
  39: "hiit",      // HKWorkoutActivityTypeHighIntensityIntervalTraining
};

export class AppleHealthProvider implements FitnessProvider {
  readonly id   = "apple_health" as const;
  readonly meta = META;

  buildAuthUrl(_redirectUri: string, _state: string): string {
    return "/profile#connected-apps";
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<OAuthTokens> {
    return { accessToken: "native" };
  }

  async refreshTokens(tokens: OAuthTokens): Promise<OAuthTokens> { return tokens; }
  async revokeTokens(_tokens: OAuthTokens): Promise<void> { /* handled in iOS app */ }

  async fetchActivities(_tokens: OAuthTokens, _since: Date): Promise<RawActivity[]> {
    return [];
  }

  mapActivityType(providerType: string): CsActivityType {
    const id = Number(providerType);
    return HK_TYPE_MAP[id] ?? normaliseActivityType(providerType);
  }
}

// ── Expected payload from iOS app → /api/integrations/native/push ─────────────
// {
//   "source": "apple_health",
//   "activities": [
//     {
//       "externalId": "<HKWorkout.uuid>",
//       "providerType": "37",
//       "startedAt": "2026-06-01T06:00:00Z",
//       "durationSecs": 3600,
//       "distanceM": 10000,
//       "calories": 620,
//       "steps": 9400,
//       "avgHeartRate": 148,
//       "rawData": { ... }
//     }
//   ]
// }
