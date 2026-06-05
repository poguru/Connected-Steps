import type { CsActivity, CsActivityType, RawActivity } from "./types";

// ── Activity type normalisation ───────────────────────────────────────────────
// Maps each provider's raw type strings to CS canonical types.

const TYPE_MAP: Record<string, CsActivityType> = {
  // Runs
  running:              "run",
  run:                  "run",
  treadmill_running:    "run",
  trail_running:        "run",
  virtual_run:          "run",
  "Running":            "run",
  "RUNNING":            "run",

  // Walks
  walking:              "walk",
  walk:                 "walk",
  hiking:               "walk",
  "Walking":            "walk",
  "WALKING":            "walk",

  // Cycling
  cycling:              "cycling",
  ride:                 "cycling",
  virtual_ride:         "cycling",
  indoor_cycling:       "cycling",
  mountain_biking:      "cycling",
  "Cycling":            "cycling",
  "BIKING":             "cycling",

  // Swimming
  swimming:             "swimming",
  open_water_swimming:  "swimming",
  pool_swimming:        "swimming",
  "Swimming":           "swimming",

  // Strength
  weight_training:      "strength",
  strength_training:    "strength",
  crossfit:             "strength",
  "Strength":           "strength",
  "STRENGTH_TRAINING":  "strength",
  "WeightTraining":     "strength",

  // Yoga
  yoga:                 "yoga",
  pilates:              "yoga",
  "Yoga":               "yoga",
  "YOGA":               "yoga",

  // HIIT
  hiit:                 "hiit",
  interval_workout:     "hiit",
  "HIIT":               "hiit",
  "HighIntensityIntervalTraining": "hiit",
};

export function normaliseActivityType(providerType: string): CsActivityType {
  return TYPE_MAP[providerType] ?? TYPE_MAP[providerType.toLowerCase()] ?? "other";
}

// ── CS points calculation ─────────────────────────────────────────────────────
// Mirrors the logic in Dashboard.tsx calcActivityPoints, extended for all types.

export function calculateCsPoints(type: CsActivityType, distanceM: number, durationSecs: number): number {
  if (type === "run") {
    const km = distanceM / 1000;
    let pts  = km;                               // 1 pt per km
    if      (km >= 42.2) pts += 20;             // marathon bonus
    else if (km >= 21.2) pts += 15;             // half bonus
    else if (km >= 15)   pts += 10;
    else if (km >= 10)   pts += 7;
    else if (km >= 5)    pts += 5;
    return Math.round(pts);
  }

  if (type === "walk") {
    const km = distanceM / 1000;
    return Math.round(km * 0.5);                // 0.5 pt per km
  }

  if (type === "cycling") {
    const km = distanceM / 1000;
    return Math.round(km * 0.3);                // 0.3 pt per km
  }

  // Time-based types (strength, yoga, hiit, swimming, other)
  const mins = durationSecs / 60;
  let pts = Math.floor(mins / 15) * 3;          // 3 pts per 15 min
  if (mins > 30) pts += Math.floor((mins - 30) / 30) * 3;
  return pts;
}

// ── Map a raw provider activity to CS canonical format ────────────────────────

export function mapActivity(raw: RawActivity, providerType?: string): CsActivity {
  const activityType = normaliseActivityType(raw.providerType ?? providerType ?? "other");
  const csPoints     = calculateCsPoints(
    activityType,
    raw.distanceM      ?? 0,
    raw.durationSecs   ?? 0,
  );
  return { ...raw, activityType, csPoints };
}
