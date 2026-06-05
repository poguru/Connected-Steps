/**
 * Apple HealthKit service (iOS only)
 * Uses: react-native-health
 * Min iOS: 9.3. Apple Watch workouts sync automatically via HealthKit.
 */
import AppleHealthKit, {
  type HealthKitPermissions,
  type HealthValue,
  type HealthActivity as HKActivity,
} from "react-native-health";
import { Platform } from "react-native";
import type { HealthActivity, ActivityType } from "../types";
import { FIRST_SYNC_DAYS } from "../config";

// ── Permissions ───────────────────────────────────────────────────────────────

const PERMISSIONS: HealthKitPermissions = {
  permissions: {
    read: [
      AppleHealthKit.Constants.Permissions.StepCount,
      AppleHealthKit.Constants.Permissions.DistanceWalkingRunning,
      AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
      AppleHealthKit.Constants.Permissions.HeartRate,
      AppleHealthKit.Constants.Permissions.Workout,
      AppleHealthKit.Constants.Permissions.EnergyConsumed,
      AppleHealthKit.Constants.Permissions.DistanceCycling,
      AppleHealthKit.Constants.Permissions.FlightsClimbed,
    ],
    write: [],
  },
};

// ── HKWorkoutActivityType mapping ─────────────────────────────────────────────
// https://developer.apple.com/documentation/healthkit/hkworkoutactivitytype

const HK_TYPE_MAP: Record<string, ActivityType> = {
  "Running":                   "run",
  "Walking":                   "walk",
  "Hiking":                    "walk",
  "Cycling":                   "cycling",
  "Swimming":                  "swimming",
  "SwimmingOpenWater":         "swimming",
  "TraditionalStrengthTraining": "strength",
  "FunctionalStrengthTraining":  "strength",
  "CrossTraining":              "strength",
  "Yoga":                      "yoga",
  "HighIntensityIntervalTraining": "hiit",
  "CrossCountrySkiing":        "other",
  "Other":                     "other",
};

// ── Public API ────────────────────────────────────────────────────────────────

export function isAvailable(): boolean {
  return Platform.OS === "ios";
}

export async function initAndRequestPermissions(): Promise<boolean> {
  if (!isAvailable()) return false;
  return new Promise(resolve => {
    AppleHealthKit.initHealthKit(PERMISSIONS, err => {
      if (err) {
        console.error("[HealthKit] init failed:", err);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

export async function fetchActivities(since?: Date): Promise<HealthActivity[]> {
  if (!isAvailable()) return [];

  const startDate = since ?? new Date(Date.now() - FIRST_SYNC_DAYS * 86400_000);
  const options   = {
    startDate: startDate.toISOString(),
    endDate:   new Date().toISOString(),
    type:      "Workout" as const,
  };

  const workouts = await getWorkouts(options);

  return Promise.all(
    workouts.map(async workout => {
      const start       = new Date(workout.start);
      const end         = new Date(workout.end);
      const durationSecs = Math.round((end.getTime() - start.getTime()) / 1000);
      const activityType = HK_TYPE_MAP[workout.activityName ?? "Other"] ?? "other";

      // Fetch steps and HR for this workout window
      const [steps, avgHR] = await Promise.all([
        getSteps(workout.start, workout.end),
        getAvgHeartRate(workout.start, workout.end),
      ]);

      const distanceM    = (workout.distance ?? 0) * 1000;  // km → m
      const avgPaceSecsKm =
        activityType === "run" && distanceM > 0
          ? Math.round(durationSecs / (distanceM / 1000))
          : undefined;

      return {
        externalId:    workout.id ?? `hk-${start.getTime()}`,
        providerType:  workout.activityName ?? "Other",
        activityType,
        startedAt:     workout.start,
        durationSecs,
        distanceM:     distanceM > 0 ? distanceM           : undefined,
        calories:      workout.calories > 0 ? Math.round(workout.calories) : undefined,
        avgHeartRate:  avgHR  ?? undefined,
        steps:         steps  ?? undefined,
        avgPaceSecsKm,
      } satisfies HealthActivity;
    })
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWorkouts(options: { startDate: string; endDate: string }): Promise<HKActivity[]> {
  return new Promise((resolve, reject) => {
    AppleHealthKit.getSamples(
      { ...options, type: "Workout" },
      (err, results) => {
        if (err) reject(err);
        else resolve((results ?? []) as unknown as HKActivity[]);
      }
    );
  });
}

function getSteps(startDate: string, endDate: string): Promise<number | null> {
  return new Promise(resolve => {
    AppleHealthKit.getStepCount(
      { startDate, endDate },
      (err, result) => resolve(err ? null : (result?.value ?? null))
    );
  });
}

function getAvgHeartRate(startDate: string, endDate: string): Promise<number | null> {
  return new Promise(resolve => {
    AppleHealthKit.getHeartRateSamples(
      { startDate, endDate, ascending: false, limit: 100 },
      (err, results: HealthValue[]) => {
        if (err || !results?.length) { resolve(null); return; }
        const avg = results.reduce((s, r) => s + r.value, 0) / results.length;
        resolve(Math.round(avg));
      }
    );
  });
}
