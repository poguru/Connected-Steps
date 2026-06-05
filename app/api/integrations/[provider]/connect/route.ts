import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/fitness/providers";
import type { ProviderSource } from "@/lib/fitness/types";

// POST /api/integrations/[provider]/connect
// Returns the OAuth authorization URL for web providers.
// For native providers, returns instructions instead.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: providerId } = await params;
  const { email } = await req.json();

  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  let provider;
  try {
    provider = getProvider(providerId as ProviderSource);
  } catch {
    return NextResponse.json({ error: `Unknown provider: ${providerId}` }, { status: 400 });
  }

  if (provider.meta.isNative) {
    return NextResponse.json({
      type:         "native",
      providerId,
      instructions: `Download the Connected Steps mobile app and connect ${provider.meta.name} from within the app.`,
    });
  }

  if (!provider.buildAuthUrl) {
    return NextResponse.json({ error: "Provider does not support OAuth" }, { status: 400 });
  }

  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";
  const redirectUri = `${appUrl}/api/integrations/${providerId}/callback`;

  // State carries the user's email so callback can link the integration
  const state = Buffer.from(JSON.stringify({ email, ts: Date.now() })).toString("base64url");

  const authUrl = typeof provider.buildAuthUrl === "function" && provider.meta.id !== "garmin"
    ? provider.buildAuthUrl(redirectUri, state)
    : await (provider.buildAuthUrl as (r: string, s: string) => Promise<string> | string)(redirectUri, state);

  return NextResponse.json({ type: "oauth", authUrl });
}
