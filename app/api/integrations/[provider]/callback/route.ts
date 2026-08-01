import { NextRequest, NextResponse } from "next/server";
import { getProvider }       from "@/lib/fitness/providers";
import { upsertIntegration, syncIntegration, loadTokens } from "@/lib/fitness/sync-service";
import type { ProviderSource } from "@/lib/fitness/types";

import { APP_URL } from "@/lib/config";
// GET /api/integrations/[provider]/callback?code=xxx&state=xxx
// OAuth callback — exchanges code for tokens, creates integration, triggers first sync.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: providerId } = await params;
  const { searchParams }         = req.nextUrl;
  const appUrl = APP_URL;
  const profileUrl = `${appUrl}/profile?tab=apps`;

  const code  = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error || !code || !state) {
    return NextResponse.redirect(`${profileUrl}&integration=error&provider=${providerId}`);
  }

  // Decode state → email + timestamp; reject stale states (replay / CSRF)
  let email: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    email = decoded.email;
    if (!email) throw new Error("no email in state");
    const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
    if (!decoded.ts || Date.now() - Number(decoded.ts) > STATE_TTL_MS) {
      throw new Error("state expired");
    }
  } catch {
    return NextResponse.redirect(`${profileUrl}&integration=error&provider=${providerId}`);
  }

  let provider;
  try {
    provider = getProvider(providerId as ProviderSource);
  } catch {
    return NextResponse.redirect(`${profileUrl}&integration=error&provider=${providerId}`);
  }

  // Exchange code for tokens
  const redirectUri = `${appUrl}/api/integrations/${providerId}/callback`;
  let tokens;
  try {
    tokens = await provider.exchangeCode!(code, redirectUri);
  } catch (err) {
    console.error(`[${providerId}] token exchange error:`, err);
    return NextResponse.redirect(`${profileUrl}&integration=error&provider=${providerId}`);
  }

  // Persist integration to DB
  let integrationId: string;
  try {
    integrationId = await upsertIntegration(email, providerId as ProviderSource, tokens);
  } catch (err) {
    console.error(`[${providerId}] upsert error:`, err);
    return NextResponse.redirect(`${profileUrl}&integration=error&provider=${providerId}`);
  }

  // Trigger first sync in background
  const freshTokens = await loadTokens(integrationId);
  if (freshTokens) {
    syncIntegration(
      {
        id:            integrationId,
        userEmail:     email,
        provider:      providerId as ProviderSource,
        status:        "active",
        lastSyncAt:    undefined,
        lastSyncCount: 0,
        totalSynced:   0,
        metadata:      {},
        createdAt:     new Date().toISOString(),
        updatedAt:     new Date().toISOString(),
      },
      freshTokens
    ).then(r => {
      console.log(`[${providerId}] first sync: ${r.imported} imported, ${r.duplicates} dupes`);
    }).catch(e => {
      console.error(`[${providerId}] first sync error:`, e);
    });
  }

  return NextResponse.redirect(
    `${profileUrl}&integration=connected&provider=${providerId}`
  );
}
