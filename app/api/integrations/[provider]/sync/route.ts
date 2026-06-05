import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer }   from "@/lib/supabase-server";
import { getProvider }         from "@/lib/fitness/providers";
import { syncIntegration, loadTokens, saveTokens } from "@/lib/fitness/sync-service";
import type { ProviderSource } from "@/lib/fitness/types";

// POST /api/integrations/[provider]/sync
// Manually triggers a sync. Also refreshes tokens if near expiry.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: providerId } = await params;
  const { email }                = await req.json();

  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const db = getSupabaseServer();

  const { data: row } = await db
    .from("user_integrations")
    .select("*")
    .eq("user_email", email.toLowerCase())
    .eq("provider", providerId)
    .single();

  if (!row) return NextResponse.json({ error: "Integration not found" }, { status: 404 });
  if (row.status === "revoked") return NextResponse.json({ error: "Integration is disconnected" }, { status: 400 });

  const provider = getProvider(providerId as ProviderSource);

  // Load and optionally refresh tokens
  let tokens = await loadTokens(row.id);
  if (!tokens) return NextResponse.json({ error: "No tokens stored" }, { status: 400 });

  // Refresh if token expires within 5 minutes
  if (
    tokens.expiresAt &&
    tokens.expiresAt < Math.floor(Date.now() / 1000) + 300 &&
    provider.refreshTokens
  ) {
    try {
      tokens = await provider.refreshTokens(tokens);
      await saveTokens(row.id, tokens);
    } catch (e) {
      console.error(`[${providerId}] token refresh failed:`, e);
      return NextResponse.json({ error: "Token refresh failed — please reconnect" }, { status: 401 });
    }
  }

  const integration = {
    id:            row.id,
    userEmail:     row.user_email,
    provider:      row.provider as ProviderSource,
    status:        row.status,
    lastSyncAt:    row.last_sync_at ?? undefined,
    lastSyncCount: row.last_sync_count ?? 0,
    totalSynced:   row.total_synced   ?? 0,
    errorMessage:  row.error_message  ?? undefined,
    metadata:      row.metadata       ?? {},
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  };

  const result = await syncIntegration(integration, tokens);

  return NextResponse.json({
    success:    true,
    imported:   result.imported,
    duplicates: result.duplicates,
    errors:     result.errors,
    message:    result.imported > 0
      ? `🎉 ${result.imported} ${result.imported === 1 ? "activity" : "activities"} imported successfully.`
      : "Already up to date — no new activities found.",
  });
}
