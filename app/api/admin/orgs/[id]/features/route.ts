import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  getOrgContext, canAccessOrg, canDo, FEATURE_KEYS,
  writeOrgAudit, actorEmail, type FeatureKey,
} from "@/lib/org-auth";
import { getClientIp } from "@/lib/rate-limit";

type Params = { params: Promise<{ id: string }> };

/** Returns all features for the org, defaulting unset features to enabled=true. */
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessOrg(ctx, id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getSupabaseServer();
  const { data } = await db
    .from("organization_features")
    .select("feature, enabled")
    .eq("organization_id", id);

  const stored: Record<string, boolean> = {};
  (data ?? []).forEach(r => { stored[r.feature] = r.enabled; });

  const features: Record<string, boolean> = {};
  FEATURE_KEYS.forEach(k => { features[k] = stored[k] ?? true; });

  return NextResponse.json({ features });
}

/** Upsert a feature flag. Only org owners can change features. */
export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessOrg(ctx, id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (ctx.type === "org_member" && ctx.role && !canDo(ctx.role, "features:edit")) {
    return NextResponse.json({ error: "Only org owners can change feature flags" }, { status: 403 });
  }

  const { feature, enabled } = await req.json();
  if (!feature || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "feature and enabled (boolean) are required" }, { status: 400 });
  }
  if (!FEATURE_KEYS.includes(feature as FeatureKey)) {
    return NextResponse.json({ error: `Unknown feature: ${feature}` }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { error } = await db
    .from("organization_features")
    .upsert(
      { organization_id: id, feature, enabled, updated_at: new Date().toISOString() },
      { onConflict: "organization_id,feature" },
    );

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  await writeOrgAudit({
    organization_id: id,
    action:          "feature.updated",
    actor_email:     actorEmail(ctx),
    resource_type:   "feature",
    resource_id:     feature,
    detail:          { feature, enabled },
    ip:              getClientIp(req),
  });

  return NextResponse.json({ ok: true, feature, enabled });
}
