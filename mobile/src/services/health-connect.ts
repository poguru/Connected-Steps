/**
 * Android Health Connect service
 * Uses: react-native-health-connect
 * Min SDK: Android 9 (API 28). Full Health Connect: Android 14 (API 34).
 */
import {
  initialize,
  requestPermission,
  readRecords,
  getSdkStatus,
  SdkAvailabilityStatus,
  type ExerciseSessionRecord,
  type StepsRecord,
  type DistanceRecord,
  type TotalCaloriesBurnedRecord,
  type HeartRateRecord,
} from "react-native-health-connect";
import type { HealthActivity, ActivityType } from "../types";
import { FIRST_SYNC_DAYS } from "../config";

// ── Permissions to request ────────────────────────────────────────────────────

const PERMISSIONS = [
  { accessType: "read" as const, recordType: "ExerciseSession"       },
  { accessType: "read" as const, recordType: "Steps"                 },
  { accessType: "read" as const, recordType: "Distance"              },
  { accessType: "read" as const, recordType: "TotalCaloriesBurned"   },
  { accessType: "read" as const, recordType: "HeartRate"             },
  { accessType: "read" as const, recordType: "ActiveCaloriesBurned"  },
] as const;

// ── Exercise type mapping ─────────────────────────────────────────────────────
// https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/ExerciseSessionRecord.Companion

const EXERCISE_TYPE_MAP: Record<number, ActivityType> = {
  56: "run",       // EXERCISE_TYPE_RUNNING
  79: "run",       // EXERCISE_TYPE_RUNNING_TREADMILL
  97: "walk",      // EXERCISE_TYPE_WALKING
  19: "cycling",   // EXERCISE_TYPE_BIKING
  20: "cycling",   // EXERCISE_TYPE_BIKING_STATIONARY
  74: "swimming",  // EXERCISE_TYPE_SWIMMING_OPEN_WATER
  75: "swimming",  // EXERCISE_TYPE_SWIMMING_POOL
  61: "strength",  // EXERCISE_TYPE_STRENGTH_TRAINING
  65: "hiit",      // EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING
  45: "yoga",      // EXERCISE_TYPE_YOGA
};

// ── Public API ────────────────────────────────────────────────────────────────

export async function isAvailable(): Promise<boolean> {
  try {
    const status = await getSdkStatus();
    return status === SdkAvailabilityStatus.SDK_AVAILABLE;
  } catch {
    return false;
  }
}

export async function initAndRequestPermissions(): Promise<boolean> {
  try {
    const initialised = await initialize();
    if (!initialised) return false;
    const granted = await requestPermission(PERMISSIONS as never);
    // At least ExerciseSession must be granted
    return granted.some((g: { recordType: string; accessType: string }) =>
      g.recordType === "ExerciseSession" && g.accessType === "read"
    );
  } catch (e) {
    console.error("[HealthConnect] permission request failed:", e);
    return false;
  }
}

export async function fetchActivities(since?: Date): Promise<HealthActivity[]> {
  const startDate = since ?? new Date(Date.now() - FIRST_SYNC_DAYS * 86400_000);
  const endDate   = new Date();

  const timeRangeFilter = {
    operator:  "between" as const,
    startTime: startDate.toISOString(),
    endTime:   endDate.toISOString(),
  };

  // Fetch exercise sessions (primary data source)
  const { records: sessions } = await readRecords("ExerciseSession", { timeRangeFilter });

  // Fetch supporting data for enrichment
  const [stepsRes, distRes, calRes, hrRes] = await Promise.allSettled([
    readRecords("Steps",               { timeRangeFilter }),
    readRecords("Distance",            { timeRangeFilter }),
    readRecords("TotalCaloriesBurned", { timeRangeFilter }),
    readRecords("HeartRate",           { timeRangeFilter }),
  ]);

  const steps   = stepsRes.status   === "fulfilled" ? stepsRes.value.records   : [];
  const dists   = distRes.status    === "fulfilled" ? distRes.value.records    : [];
  const cals    = calRes.status     === "fulfilled" ? calRes.value.records     : [];
  const hrs     = hrRes.status      === "fulfilled" ? hrRes.value.records      : [];

  return (sessions as ExerciseSessionRecord[]).map(session => {
    const sessionStart = new Date(session.startTime).getTime();
    const sessionEnd   = new Date(session.endTime).getTime();

    // Find matching sub-records within this session's time window
    const sessionSteps = (steps as StepsRecord[])
      .filter(s => overlaps(s.startTime, s.endTime, session.startTime, session.endTime))
      .reduce((sum, s) => sum + s.count, 0);

    const sessionDist = (dists as DistanceRecord[])
      .filter(d => overlaps(d.startTime, d.endTime, session.startTime, session.endTime))
      .reduce((sum, d) => sum + (d.distance?.inMeters ?? 0), 0);

    const sessionCal = (cals as TotalCaloriesBurnedRecord[])
      .filter(c => overlaps(c.startTime, c.endTime, session.startTime, session.endTime))
      .reduce((sum, c) => sum + (c.energy?.inKilocalories ?? 0), 0);

    const hrSamples = (hrs as HeartRateRecord[])
      .filter(h => overlaps(h.startTime, h.endTime, session.startTime, session.endTime))
      .flatMap(h => h.samples.map((s: { beatsPerMinute: number }) => s.beatsPerMinute));

    const avgHR = hrSamples.length
      ? Math.round(hrSamples.reduce((a, b) => a + b, 0) / hrSamples.length)
      : undefined;

    const durationSecs = Math.round((sessionEnd - sessionStart) / 1000);
    const exerciseType = session.exerciseType ?? 0;
    const activityType = EXERCISE_TYPE_MAP[exerciseType] ?? "other";

    // Derive pace for runs
    const avgPaceSecsKm =
      activityType === "run" && sessionDist > 0
        ? Math.round(durationSecs / (sessionDist / 1000))
        : undefined;

    return {
      externalId:    session.metadata?.id ?? `hc-${sessionStart}`,
      providerType:  String(exerciseType),
      activityType,
      startedAt:     session.startTime,
      durationSecs,
      distanceM:     sessionDist > 0       ? sessionDist        : undefined,
      calories:      sessionCal  > 0       ? Math.round(sessionCal) : undefined,
      avgHeartRate:  avgHR,
      steps:         sessionSteps > 0      ? sessionSteps       : undefined,
      avgPaceSecsKm,
    } satisfies HealthActivity;
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function overlaps(
  aStart: string, aEnd: string,
  bStart: string, bEnd: string
): boolean {
  return (
    new Date(aStart).getTime() < new Date(bEnd).getTime() &&
    new Date(aEnd).getTime()   > new Date(bStart).getTime()
  );
}
