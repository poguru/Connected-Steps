import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getProvider }       from "@/lib/fitness/providers";
import { loadTokens }        from "@/lib/fitness/sync-service";
import type { ProviderSource } from "@/lib/fitness/types";

// DELETE /api/integrations/[provider]/disconnect
// Revokes tokens with the provider, marks integration as revoked.

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: providerId } = await params;
  const { email }                = await req.json();

  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const db = getSupabaseServer();

  // Find the integration
  const { data: integration } = await db
    .from("user_integrations")
    .select("id")
    .eq("user_email", email.toLowerCase())
    .eq("provider", providerId)
    .single();

  if (!integration) {
    return NextResponse.json({ error: "Integration not found" }, { status: 404 });
  }

  // Try to revoke tokens with the provider
  try {
    const provider = getProvider(providerId as ProviderSource);
    const tokens   = await loadTokens(integration.id);
    if (tokens && provider.revokeTokens) {
      await provider.revokeTokens(tokens);
    }
  } catch (e) {
    console.warn(`[${providerId}] revoke warning:`, e);
    // Continue even if revocation fails — still remove from DB
  }

  // Mark as revoked
  await db.from("user_integrations").update({
    status:        "revoked",
    access_token:  null,
    refresh_token: null,
    error_message: null,
  }).eq("id", integration.id);

  return NextResponse.json({ success: true });
}
