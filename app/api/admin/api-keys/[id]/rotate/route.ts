import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, canAccessOrg, writeOrgAudit, actorEmail } from "@/lib/org-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { rotateApiKey } from "@/lib/api-key";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getSupabaseServer();
  const { data: existing } = await db.from("api_keys").select("organization_id, name").eq("id", id).eq("is_active", true).single();
  if (!existing) return NextResponse.json({ error: "API key not found or already revoked" }, { status: 404 });
  if (!canAccessOrg(ctx, existing.organization_id as string)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await rotateApiKey(id, actorEmail(ctx));
  if (!result) return NextResponse.json({ error: "Rotation failed" }, { status: 500 });

  await writeOrgAudit({
    organization_id: existing.organization_id as string,
    action:          "api_key.rotated",
    actor_email:     actorEmail(ctx),
    resource_type:   "api_key",
    resource_id:     result.record.id,
    detail:          { rotated_from: id, name: existing.name },
  });

  return NextResponse.json({
    data: { ...result.record, raw_key: result.rawKey },
    warning: "The old key is now revoked. Store the new key securely — it will not be shown again.",
  });
}
