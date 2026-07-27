import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getOrgContext, canAccessOrg, canDo, writeOrgAudit, actorEmail } from "@/lib/org-auth";
import { getClientIp } from "@/lib/rate-limit";

type Params = { params: Promise<{ id: string }> };

/** GET all settings for an org (merged: org row + organization_settings KV). */
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessOrg(ctx, id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (ctx.type === "org_member" && ctx.role && !canDo(ctx.role, "settings:read")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const db = getSupabaseServer();
  const [orgRes, kvRes] = await Promise.all([
    db.from("organizations").select(
      "id, name, slug, logo_url, favicon_url, primary_color, secondary_color, domain, " +
      "timezone, currency, contact_email, contact_phone, support_email, support_phone, " +
      "wa_number, gst_number, company_name, billing_address, website, instagram_url, " +
      "facebook_url, twitter_url, linkedin_url, privacy_policy, terms_of_service, refund_policy, " +
      "plan, plan_status, plan_limits, is_active"
    ).eq("id", id).single(),
    db.from("organization_settings").select("key, value").eq("organization_id", id),
  ]);

  if (orgRes.error || !orgRes.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const kv: Record<string, string | null> = {};
  (kvRes.data ?? []).forEach(r => { kv[r.key] = r.value; });

  return NextResponse.json({ org: orgRes.data, settings: kv });
}

/** PUT — upsert a single key-value setting OR update org fields. */
export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessOrg(ctx, id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (ctx.type === "org_member" && ctx.role && !canDo(ctx.role, "settings:edit")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = await req.json();
  const db   = getSupabaseServer();

  // If body has a "key" field it's a KV setting upsert; otherwise it's an org field patch
  if (body.key !== undefined) {
    const { key, value } = body;
    const { error } = await db
      .from("organization_settings")
      .upsert({ organization_id: id, key, value: String(value ?? ""), updated_at: new Date().toISOString() }, { onConflict: "organization_id,key" });
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

    await writeOrgAudit({
      organization_id: id, action: "settings.updated",
      actor_email: actorEmail(ctx), detail: { key },
      ip: getClientIp(req),
    });
    return NextResponse.json({ ok: true });
  }

  // Patch org fields (branding, contact, policies, etc.)
  const ALLOWED_FIELDS = [
    "name","logo_url","favicon_url","primary_color","secondary_color","domain","timezone",
    "currency","contact_email","contact_phone","support_email","support_phone","wa_number",
    "gst_number","company_name","billing_address","website","instagram_url","facebook_url",
    "twitter_url","linkedin_url","privacy_policy","terms_of_service","refund_policy",
  ];
  const update: Record<string, unknown> = {};
  for (const f of ALLOWED_FIELDS) {
    if (body[f] !== undefined) update[f] = body[f];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
  }

  const { data, error } = await db
    .from("organizations")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  await writeOrgAudit({
    organization_id: id, action: "org.settings_updated",
    actor_email: actorEmail(ctx), detail: { fields: Object.keys(update) },
    ip: getClientIp(req),
  });

  return NextResponse.json({ org: data });
}
