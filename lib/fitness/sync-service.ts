import { getSupabaseServer } from "@/lib/supabase-server";
import { mapActivity } from "./activity-mapper";
import { getProvider }  from "./providers";
import type { OAuthTokens, ProviderSource, SyncResult, UserIntegration } from "./types";

const FIRST_SYNC_DAYS  = 30;   // import this many days on first sync
const BATCH_SIZE       = 50;   // upsert in batches to avoid payload limits

// ── Core sync orchestrator ────────────────────────────────────────────────────

export async function syncIntegration(
  integration: UserIntegration,
  tokens: OAuthTokens
): Promise<SyncResult> {
  const started = new Date();
  const db      = getSupabaseServer();
  const provider = getProvider(integration.provider);

  // Determine the sync window
  const since = integration.lastSyncAt
    ? new Date(integration.lastSyncAt)
    : new Date(Date.now() - FIRST_SYNC_DAYS * 86400_000);

  // Fetch raw activities from the provider
  let rawActivities;
  try {
    rawActivities = await provider.fetchActivities(tokens, since);
  } catch (err: unknown) {
    await markError(integration.id, String(err));
    return { provider: integration.provider, imported: 0, duplicates: 0, errors: 1, startedAt: started, completedAt: new Date() };
  }

  if (rawActivities.length === 0) {
    await markSynced(integration.id, 0, 0);
    return { provider: integration.provider, imported: 0, duplicates: 0, errors: 0, startedAt: started, completedAt: new Date() };
  }

  // Map to CS format
  const mapped = rawActivities.map(r => mapActivity(r));

  // Build upsert rows
  const rows = mapped.map(a => ({
    user_email:       integration.userEmail,
    source:           integration.provider,
    external_id:      a.externalId,
    activity_type:    a.activityType,
    started_at:       a.startedAt.toISOString(),
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

  // Batch upsert with dedup on (user_email, source, external_id)
  let imported   = 0;
  let duplicates = 0;
  let errors     = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { data, error } = await db
      .from("synced_activities")
      .upsert(batch, {
        onConflict:        "user_email,source,external_id",
        ignoreDuplicates:  true,
      })
      .select("id");

    if (error) {
      console.error(`Sync batch error (${integration.provider}):`, error.message);
      errors += batch.length;
    } else {
      // Rows returned = actually inserted (ignoreDuplicates skips existing)
      const inserted = (data ?? []).length;
      imported   += inserted;
      duplicates += batch.length - inserted;
    }
  }

  await markSynced(integration.id, imported, imported + (await getTotalSynced(integration.id)));
  return { provider: integration.provider, imported, duplicates, errors, startedAt: started, completedAt: new Date() };
}

// ── Database helpers ──────────────────────────────────────────────────────────

async function markSynced(id: string, lastSyncCount: number, totalSynced: number) {
  const db = getSupabaseServer();
  await db.from("user_integrations").update({
    status:          "active",
    last_sync_at:    new Date().toISOString(),
    last_sync_count: lastSyncCount,
    total_synced:    totalSynced,
    error_message:   null,
  }).eq("id", id);
}

async function markError(id: string, message: string) {
  const db = getSupabaseServer();
  await db.from("user_integrations").update({
    status:        "error",
    error_message: message.slice(0, 500),
  }).eq("id", id);
}

async function getTotalSynced(integrationId: string): Promise<number> {
  const db = getSupabaseServer();
  const { data } = await db
    .from("user_integrations")
    .select("total_synced")
    .eq("id", integrationId)
    .single();
  return data?.total_synced ?? 0;
}

// ── Load tokens from DB for a given integration ───────────────────────────────

export async function loadTokens(integrationId: string): Promise<OAuthTokens | null> {
  const db = getSupabaseServer();
  const { data } = await db
    .from("user_integrations")
    .select("access_token, refresh_token, token_expires_at, scopes, external_user_id")
    .eq("id", integrationId)
    .single();

  if (!data?.access_token) return null;
  return {
    accessToken:    data.access_token,
    refreshToken:   data.refresh_token  ?? undefined,
    expiresAt:      data.token_expires_at
      ? Math.floor(new Date(data.token_expires_at).getTime() / 1000)
      : undefined,
    scopes:         data.scopes ?? [],
    externalUserId: data.external_user_id ?? undefined,
  };
}

// ── Save tokens back to DB (after refresh) ───────────────────────────────────

export async function saveTokens(integrationId: string, tokens: OAuthTokens) {
  const db = getSupabaseServer();
  await db.from("user_integrations").update({
    access_token:     tokens.accessToken,
    refresh_token:    tokens.refreshToken ?? null,
    token_expires_at: tokens.expiresAt
      ? new Date(tokens.expiresAt * 1000).toISOString()
      : null,
    external_user_id: tokens.externalUserId ?? null,
    status:           "active",
    error_message:    null,
  }).eq("id", integrationId);
}

// ── Get or create integration row ─────────────────────────────────────────────

export async function upsertIntegration(
  userEmail:  string,
  provider:   ProviderSource,
  tokens:     OAuthTokens,
): Promise<string> {
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("user_integrations")
    .upsert({
      user_email:       userEmail,
      provider,
      status:           "active",
      access_token:     tokens.accessToken,
      refresh_token:    tokens.refreshToken   ?? null,
      token_expires_at: tokens.expiresAt
        ? new Date(tokens.expiresAt * 1000).toISOString()
        : null,
      external_user_id: tokens.externalUserId ?? null,
      scopes:           tokens.scopes         ?? [],
    }, {
      onConflict: "user_email,provider",
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to upsert integration");
  return data.id;
}
