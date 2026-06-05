import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer }   from "@/lib/supabase-server";
import { getProvider }         from "@/lib/fitness/providers";
import { mapActivity }         from "@/lib/fitness/activity-mapper";
import { upsertIntegration }   from "@/lib/fitness/sync-service";
import type { ProviderSource, RawActivity } from "@/lib/fitness/types";

/**
 * POST /api/integrations/native/push
 *
 * Receives activity data pushed from the Connected Steps iOS or Android app.
 * The mobile app reads from HealthKit / Health Connect and posts here.
 *
 * Body:
 * {
 *   "email":  "user@example.com",
 *   "source": "apple_health" | "health_connect",
 *   "activities": [ { externalId, providerType, startedAt, durationSecs, ... } ]
 * }
 *
 * Authentication: X-CS-Native-Token header must match NATIVE_PUSH_SECRET env var.
 */

const BATCH_SIZE = 50;

export async function POST(req: NextRequest) {
  // Authenticate the native app
  const token = req.headers.get("x-cs-native-token");
  if (!token || token !== process.env.NATIVE_PUSH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email, source, activities } = await req.json() as {
    email:      string;
    source:     ProviderSource;
    activities: RawActivity[];
  };

  if (!email || !source || !Array.isArray(activities)) {
    return NextResponse.json({ error: "email, source, activities[] required" }, { status: 400 });
  }

  const provider = getProvider(source);
  if (!provider.meta.isNative) {
    return NextResponse.json({ error: "Provider is not a native provider" }, { status: 400 });
  }

  const db = getSupabaseServer();

  // Ensure integration row exists
  await upsertIntegration(email, source, { accessToken: "native" });

  // Map activities
  const mapped = activities.map(r => mapActivity(r));

  const rows = mapped.map(a => ({
    user_email:       email.toLowerCase(),
    source,
    external_id:      a.externalId,
    activity_type:    a.activityType,
    started_at:       new Date(a.startedAt).toISOString(),
    duration_secs:    a.durationSecs   ?? null,
    distance_m:       a.distanceM      ?? null,
    avg_pace_secs_km: a.avgPaceSecsKm  ?? null,
    calories:         a.calories       ?? null,
    avg_heart_rate:   a.avgHeartRate   ?? null,
    steps:            a.steps          ?? null,
    elevation_gain_m: a.elevationGainM ?? null,
    cs_points:        a.csPoints,
    raw_data:         a.rawData        ?? {},
    synced_at:        new Date().toISOString(),
  }));

  let imported   = 0;
  let duplicates = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { data } = await db
      .from("synced_activities")
      .upsert(batch, {
        onConflict:       "user_email,source,external_id",
        ignoreDuplicates: true,
      })
      .select("id");

    const inserted = (data ?? []).length;
    imported   += inserted;
    duplicates += batch.length - inserted;
  }

  // Update integration stats
  const { data: integration } = await db
    .from("user_integrations")
    .select("id, total_synced")
    .eq("user_email", email.toLowerCase())
    .eq("provider", source)
    .single();

  if (integration) {
    await db.from("user_integrations").update({
      status:          "active",
      last_sync_at:    new Date().toISOString(),
      last_sync_count: imported,
      total_synced:    (integration.total_synced ?? 0) + imported,
      error_message:   null,
    }).eq("id", integration.id);
  }

  return NextResponse.json({
    success:    true,
    imported,
    duplicates,
    message: imported > 0
      ? `🎉 ${imported} ${imported === 1 ? "activity" : "activities"} imported successfully.`
      : "Already up to date.",
  });
}
