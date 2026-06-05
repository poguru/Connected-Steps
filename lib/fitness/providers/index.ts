/**
 * Provider registry — add future providers here (Coros, Polar, Whoop…)
 * without touching any business logic.
 */
import type { FitnessProvider, ProviderSource } from "../types";
import { FitbitProvider }        from "./fitbit";
import { GarminProvider }        from "./garmin";
import { HealthConnectProvider } from "./health-connect";
import { AppleHealthProvider }   from "./apple-health";

// ── Registry ──────────────────────────────────────────────────────────────────

const REGISTRY: Record<ProviderSource, FitnessProvider> = {
  fitbit:         new FitbitProvider(),
  garmin:         new GarminProvider(),
  health_connect: new HealthConnectProvider(),
  apple_health:   new AppleHealthProvider(),
  // ← Add future providers here: coros, polar, strava, whoop, etc.
  strava:         null as unknown as FitnessProvider,   // existing Strava flow kept separate
  coros:          null as unknown as FitnessProvider,   // coming soon
  polar:          null as unknown as FitnessProvider,   // coming soon
  manual:         null as unknown as FitnessProvider,   // no sync needed
};

export function getProvider(id: ProviderSource): FitnessProvider {
  const p = REGISTRY[id];
  if (!p) throw new Error(`Provider "${id}" is not registered or not yet implemented.`);
  return p;
}

export function getAllProviders(): FitnessProvider[] {
  return Object.values(REGISTRY).filter(Boolean);
}

export function getEnabledOAuthProviders(): FitnessProvider[] {
  return getAllProviders().filter(p => p.meta.isOAuth && p.meta.isEnabled);
}

export function getEnabledNativeProviders(): FitnessProvider[] {
  return getAllProviders().filter(p => p.meta.isNative && p.meta.isEnabled);
}
