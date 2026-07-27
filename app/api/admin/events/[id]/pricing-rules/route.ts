import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

const VALID_RULE_TYPES    = ["group", "corporate", "tiered", "referral"] as const;
const VALID_DISCOUNT_TYPES = ["flat", "percent"] as const;

// GET /api/admin/events/[id]/pricing-rules
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const { data, error } = await db
    .from("event_pricing_rules")
    .select("id, rule_type, label, description, discount_type, discount_value, min_participants, max_uses, uses_count, valid_from, valid_until, is_active, created_at")
    .eq("event_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ rules: data ?? [] });
}

// POST /api/admin/events/[id]/pricing-rules
// Body: { rule_type, label, discount_type, discount_value, min_participants?, max_uses?, valid_from?, valid_until?, description? }
export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: event_id } = await params;
  const body = await req.json() as Record<string, unknown>;

  if (!body.label || typeof body.label !== "string") {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }
  if (!VALID_RULE_TYPES.includes(body.rule_type as typeof VALID_RULE_TYPES[number])) {
    return NextResponse.json({ error: `rule_type must be one of: ${VALID_RULE_TYPES.join(", ")}` }, { status: 400 });
  }
  if (!VALID_DISCOUNT_TYPES.includes(body.discount_type as typeof VALID_DISCOUNT_TYPES[number])) {
    return NextResponse.json({ error: `discount_type must be 'flat' or 'percent'` }, { status: 400 });
  }
  const discountValue = Number(body.discount_value);
  if (isNaN(discountValue) || discountValue < 0) {
    return NextResponse.json({ error: "discount_value must be a non-negative number" }, { status: 400 });
  }
  if (body.discount_type === "percent" && discountValue > 100) {
    return NextResponse.json({ error: "percent discount cannot exceed 100" }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { data: ev } = await db.from("events").select("id").eq("id", event_id).single();
  if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data, error } = await db
    .from("event_pricing_rules")
    .insert({
      event_id,
      rule_type:       body.rule_type,
      label:           String(body.label).trim(),
      description:     body.description  ? String(body.description).trim()  : null,
      discount_type:   body.discount_type,
      discount_value:  discountValue,
      min_participants:body.min_participants ? Number(body.min_participants) : null,
      max_uses:        body.max_uses        ? Number(body.max_uses)         : null,
      valid_from:      body.valid_from      ? String(body.valid_from)       : null,
      valid_until:     body.valid_until     ? String(body.valid_until)      : null,
      is_active:       body.is_active !== false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Database error: " + error.message }, { status: 500 });
  return NextResponse.json({ rule: data }, { status: 201 });
}

// PATCH /api/admin/events/[id]/pricing-rules
// Body must include id. Partial update.
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: event_id } = await params;
  const body = await req.json() as Record<string, unknown>;
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = getSupabaseServer();
  const allowed: Record<string, unknown> = {};

  if (body.label           !== undefined) allowed.label           = String(body.label).trim();
  if (body.description     !== undefined) allowed.description     = body.description ? String(body.description).trim() : null;
  if (body.is_active       !== undefined) allowed.is_active       = body.is_active === true;
  if (body.min_participants !== undefined) allowed.min_participants = body.min_participants ? Number(body.min_participants) : null;
  if (body.max_uses        !== undefined) allowed.max_uses        = body.max_uses ? Number(body.max_uses) : null;
  if (body.valid_from      !== undefined) allowed.valid_from      = body.valid_from  ? String(body.valid_from)  : null;
  if (body.valid_until     !== undefined) allowed.valid_until     = body.valid_until ? String(body.valid_until) : null;
  if (body.discount_value  !== undefined) {
    const v = Number(body.discount_value);
    if (!isNaN(v) && v >= 0) allowed.discount_value = v;
  }
  if (body.discount_type !== undefined && VALID_DISCOUNT_TYPES.includes(body.discount_type as typeof VALID_DISCOUNT_TYPES[number])) {
    allowed.discount_type = body.discount_type;
  }

  if (Object.keys(allowed).length === 0) return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });

  const { data, error } = await db
    .from("event_pricing_rules")
    .update(allowed)
    .eq("id", String(body.id))
    .eq("event_id", event_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  return NextResponse.json({ rule: data });
}

// DELETE /api/admin/events/[id]/pricing-rules
// Body: { id }
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: event_id } = await params;
  const body = await req.json() as { id?: string };
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = getSupabaseServer();
  const { error } = await db
    .from("event_pricing_rules")
    .delete()
    .eq("id", body.id)
    .eq("event_id", event_id);

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
