import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, getClientIp } from "@/lib/it-run-auth";

// Fields that may never change once a coupon has been redeemed —
// changing them would alter the meaning of historical payment records.
const LOCKED_AFTER_USE = new Set(["code", "discount_type", "discount_value", "min_amount"]);

async function getEvent(db: ReturnType<typeof getSupabaseServer>) {
  const { data } = await db
    .from("it_run_events")
    .select("id")
    .eq("slug", "sprint-2")
    .single<{ id: string }>();
  return data;
}

function sane(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return v.replace(/<[^>]*>/g, "").trim() || null;
}

// GET /api/it-run/admin/coupons
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "support_desk"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db    = getSupabaseServer();
  const event = await getEvent(db);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data, error } = await db
    .from("it_run_coupons")
    .select("*")
    .eq("event_id", event.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST /api/it-run/admin/coupons — create coupon
export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;

  const code = sane(body.code)?.toUpperCase();
  if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 });

  const dtype = body.discount_type;
  if (dtype !== "flat" && dtype !== "percent")
    return NextResponse.json({ error: "discount_type must be flat or percent" }, { status: 400 });

  const dval = Number(body.discount_value);
  if (!dval || dval <= 0) return NextResponse.json({ error: "discount_value must be positive" }, { status: 400 });
  if (dtype === "percent" && dval > 100) return NextResponse.json({ error: "percent discount cannot exceed 100" }, { status: 400 });

  const ctype = body.coupon_type === "unique" ? "unique" : "generic";

  const db    = getSupabaseServer();
  const event = await getEvent(db);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data, error } = await db
    .from("it_run_coupons")
    .insert({
      event_id:                event.id,
      code,
      coupon_type:             ctype,
      discount_type:           dtype,
      discount_value:          dval,
      min_amount:              body.min_amount ? Number(body.min_amount) : null,
      max_uses:                body.max_uses   ? Number(body.max_uses)   : null,
      valid_from:              body.valid_from  ? String(body.valid_from)  : null,
      expires_at:              body.expires_at  ? String(body.expires_at)  : null,
      applicable_category_ids: Array.isArray(body.applicable_category_ids) && body.applicable_category_ids.length > 0
                               ? body.applicable_category_ids as string[]
                               : null,
      description:             sane(body.description ?? null),
      is_active:               true,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Coupon code already exists" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  void db.from("it_run_audit_logs").insert({
    event_id: event.id, actor_email: session.email, actor_role: session.role,
    action: "create_coupon", entity_type: "coupon",
    entity_id: (data as Record<string, string>)?.id ?? code,
    ip: getClientIp(req),
    detail: { code, coupon_type: ctype, discount_type: dtype, discount_value: dval, max_uses: body.max_uses ?? null },
  });

  return NextResponse.json({ data }, { status: 201 });
}

// PATCH /api/it-run/admin/coupons — edit coupon or toggle active
// If coupon has been used (use_count > 0), code/discount_type/discount_value/min_amount are locked.
export async function PATCH(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const { id } = body;
  if (!id || typeof id !== "string") return NextResponse.json({ error: "id required" }, { status: 400 });

  const db    = getSupabaseServer();
  const event = await getEvent(db);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // IDOR guard + fetch current state
  const { data: current } = await db
    .from("it_run_coupons")
    .select("*")
    .eq("id", id)
    .eq("event_id", event.id)
    .single<Record<string, unknown>>();

  if (!current) return NextResponse.json({ error: "Coupon not found" }, { status: 404 });

  const useCount = Number(current.use_count ?? 0);
  const hasBeenUsed = useCount > 0;

  const updates: Record<string, unknown> = {};

  // Fields that are always editable
  if (body.is_active !== undefined)       updates.is_active    = Boolean(body.is_active);
  if (body.description !== undefined)     updates.description  = sane(body.description ?? null);
  if (body.valid_from !== undefined)      updates.valid_from   = body.valid_from ? String(body.valid_from) : null;
  if (body.expires_at !== undefined)      updates.expires_at   = body.expires_at ? String(body.expires_at) : null;
  if (body.applicable_category_ids !== undefined) {
    updates.applicable_category_ids = Array.isArray(body.applicable_category_ids) && body.applicable_category_ids.length > 0
      ? body.applicable_category_ids as string[]
      : null;
  }
  if (body.max_uses !== undefined) {
    const newMax = body.max_uses === null ? null : Number(body.max_uses);
    if (newMax !== null && newMax < useCount)
      return NextResponse.json({ error: `max_uses cannot be less than current use count of ${useCount}` }, { status: 400 });
    updates.max_uses = newMax;
  }

  // Fields locked after first redemption
  if (!hasBeenUsed) {
    if (body.code !== undefined) {
      const newCode = sane(body.code)?.toUpperCase();
      if (!newCode) return NextResponse.json({ error: "code is required" }, { status: 400 });
      updates.code = newCode;
    }
    if (body.discount_type !== undefined) {
      if (body.discount_type !== "flat" && body.discount_type !== "percent")
        return NextResponse.json({ error: "discount_type must be flat or percent" }, { status: 400 });
      updates.discount_type = body.discount_type;
    }
    if (body.discount_value !== undefined) {
      const dv = Number(body.discount_value);
      if (!dv || dv <= 0) return NextResponse.json({ error: "discount_value must be positive" }, { status: 400 });
      const effectiveDtype = (updates.discount_type ?? current.discount_type) as string;
      if (effectiveDtype === "percent" && dv > 100)
        return NextResponse.json({ error: "percent discount cannot exceed 100" }, { status: 400 });
      updates.discount_value = dv;
    }
    if (body.min_amount !== undefined) updates.min_amount = body.min_amount ? Number(body.min_amount) : null;
  } else {
    // Silently block locked fields — caller should check 'hasBeenUsed' before sending them
    for (const field of LOCKED_AFTER_USE) {
      if (body[field] !== undefined && body[field] !== current[field]) {
        return NextResponse.json(
          { error: `Cannot change '${field}' — this coupon has already been used ${useCount} time${useCount !== 1 ? "s" : ""}.` },
          { status: 400 },
        );
      }
    }
  }

  if (!Object.keys(updates).length)
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  const old: Record<string, unknown> = {};
  for (const k of Object.keys(updates)) old[k] = current[k] ?? null;

  const { data, error } = await db
    .from("it_run_coupons").update(updates).eq("id", id).select().single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Coupon code already exists" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  void db.from("it_run_audit_logs").insert({
    event_id: event.id, actor_email: session.email, actor_role: session.role,
    action: "update_coupon", entity_type: "coupon", entity_id: id,
    ip: getClientIp(req),
    detail: { code: current.code, updated_fields: Object.keys(updates), old_values: old, new_values: updates },
  });

  return NextResponse.json({ data });
}

// DELETE /api/it-run/admin/coupons
// Safe deletion: only allowed when use_count === 0 (never redeemed).
export async function DELETE(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db    = getSupabaseServer();
  const event = await getEvent(db);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // IDOR guard
  const { data: coupon } = await db
    .from("it_run_coupons")
    .select("id, code, use_count")
    .eq("id", id)
    .eq("event_id", event.id)
    .single<{ id: string; code: string; use_count: number }>();

  if (!coupon) return NextResponse.json({ error: "Coupon not found" }, { status: 404 });

  if ((coupon.use_count ?? 0) > 0)
    return NextResponse.json(
      { error: `This coupon has been used ${coupon.use_count} time${coupon.use_count !== 1 ? "s" : ""} and cannot be deleted. You can disable it instead.` },
      { status: 409 },
    );

  const { error } = await db.from("it_run_coupons").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  void db.from("it_run_audit_logs").insert({
    event_id: event.id, actor_email: session.email, actor_role: session.role,
    action: "delete_coupon", entity_type: "coupon", entity_id: id,
    ip: getClientIp(req),
    detail: { code: coupon.code },
  });

  return NextResponse.json({ ok: true });
}
