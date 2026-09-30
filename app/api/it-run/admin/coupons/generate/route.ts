import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, getClientIp } from "@/lib/it-run-auth";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous O/0/I/1

function makeCode(prefix: string, len = 6): string {
  const bytes = randomBytes(len);
  let s = prefix.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  for (let i = 0; i < len; i++) s += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  return s;
}

// POST /api/it-run/admin/coupons/generate
// Generates a batch of unique coupon codes and inserts them.
export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;

  const prefix   = (typeof body.prefix === "string" ? body.prefix : "CS-").toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const quantity = Number(body.quantity);
  if (!quantity || quantity < 1 || quantity > 1000 || !Number.isInteger(quantity))
    return NextResponse.json({ error: "quantity must be a positive integer ≤ 1000" }, { status: 400 });

  const dtype = body.discount_type;
  if (dtype !== "flat" && dtype !== "percent")
    return NextResponse.json({ error: "discount_type must be flat or percent" }, { status: 400 });

  const dval = Number(body.discount_value);
  if (!dval || dval <= 0) return NextResponse.json({ error: "discount_value must be positive" }, { status: 400 });
  if (dtype === "percent" && dval > 100) return NextResponse.json({ error: "percent discount cannot exceed 100" }, { status: 400 });

  const maxPerCoupon = body.max_uses_per_coupon ? Number(body.max_uses_per_coupon) : 1;
  if (maxPerCoupon < 1) return NextResponse.json({ error: "max_uses_per_coupon must be ≥ 1" }, { status: 400 });

  const db = getSupabaseServer();
  const { data: event } = await db
    .from("it_run_events").select("id").eq("slug", "sprint-2").single<{ id: string }>();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Generate codes — check against existing ones to avoid collisions
  const generated = new Set<string>();
  while (generated.size < quantity) generated.add(makeCode(prefix));

  const candidateArr = Array.from(generated);

  // Remove any codes that already exist for this event
  const { data: existing } = await db
    .from("it_run_coupons")
    .select("code")
    .eq("event_id", event.id)
    .in("code", candidateArr);

  const existingSet = new Set((existing ?? []).map((r: { code: string }) => r.code));
  let available = candidateArr.filter(c => !existingSet.has(c));

  // Fill any gap from collisions
  for (let i = 0; available.length < quantity && i < 5000; i++) {
    const c = makeCode(prefix);
    if (!existingSet.has(c) && !generated.has(c)) { available.push(c); generated.add(c); }
  }
  available = available.slice(0, quantity);

  if (available.length < quantity)
    return NextResponse.json({ error: "Could not generate enough unique codes — try a different prefix" }, { status: 500 });

  const commonFields = {
    event_id:                event.id,
    coupon_type:             "unique" as const,
    discount_type:           dtype as "flat" | "percent",
    discount_value:          dval,
    max_uses:                maxPerCoupon,
    use_count:               0,
    is_active:               true,
    valid_from:              body.valid_from  ? String(body.valid_from)  : null,
    expires_at:              body.expires_at  ? String(body.expires_at)  : null,
    applicable_category_ids: Array.isArray(body.applicable_category_ids) && body.applicable_category_ids.length > 0
                             ? body.applicable_category_ids as string[]
                             : null,
    description:             body.description ? String(body.description) : null,
  };

  const rows = available.map(code => ({ ...commonFields, code }));

  // Batch insert in chunks of 200 to stay within payload limits
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await db.from("it_run_coupons").insert(chunk);
    if (error) {
      if (inserted === 0) return NextResponse.json({ error: error.message }, { status: 500 });
      break; // partial success — report what was inserted
    }
    inserted += chunk.length;
  }

  void db.from("it_run_audit_logs").insert({
    event_id: event.id, actor_email: session.email, actor_role: session.role,
    action: "generate_coupons", entity_type: "coupon", entity_id: null,
    ip: getClientIp(req),
    detail: {
      prefix, quantity_requested: quantity, quantity_inserted: inserted,
      discount_type: dtype, discount_value: dval, max_per_coupon: maxPerCoupon,
    },
  });

  return NextResponse.json({ generated: inserted });
}
