import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { paiseToRupees, rupeesToPaise, writeFinancialAudit } from "@/lib/finance-service";
import { getClientIp } from "@/lib/rate-limit";

const VALID_STATUSES = ["pending","confirmed","packed","dispatched","delivered","cancelled"] as const;

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const org_id   = searchParams.get("org_id")   ?? undefined;
  const event_id = searchParams.get("event_id") ?? undefined;
  const status   = searchParams.get("status")   ?? undefined;
  const q_email  = searchParams.get("q")        ?? undefined;
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit    = 50;
  const offset   = (page - 1) * limit;

  const db = getSupabaseServer();
  let q = db
    .from("merchandise_orders")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (org_id)   q = q.eq("organization_id", org_id) as typeof q;
  if (event_id) q = q.eq("event_id", event_id) as typeof q;
  if (status)   q = q.eq("status", status) as typeof q;
  if (q_email)  q = q.ilike("user_email", `%${q_email}%`) as typeof q;

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const orders = (data ?? []).map((o: Record<string, unknown>) => ({
    ...o,
    total_rupees:    paiseToRupees(o.total_paise as number ?? 0),
    subtotal_rupees: paiseToRupees(o.subtotal_paise as number ?? 0),
    gst_rupees:      paiseToRupees(o.gst_paise as number ?? 0),
  }));

  return NextResponse.json({ orders, total: count ?? 0, page, limit });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    organization_id, event_id, registration_id,
    user_email, user_name, user_phone,
    items, fulfillment_type = "pickup_at_event",
    shipping_address, notes, payment_id,
    recorded_by,
  } = body;

  if (!organization_id || !user_email || !user_name || !items?.length || !recorded_by) {
    return NextResponse.json({ error: "organization_id, user_email, user_name, items, recorded_by are required" }, { status: 400 });
  }

  // Calculate totals from items
  let subtotal = 0;
  let gst_total = 0;
  for (const item of items) {
    const line = item.qty * item.unit_price_paise;
    const gst  = Math.round(line * (item.gst_pct ?? 0) / 100);
    subtotal   += line;
    gst_total  += gst;
    item.line_total_paise = line + gst;
    item.gst_paise = gst;
  }
  const total = subtotal + gst_total;

  const db = getSupabaseServer();
  const { data, error } = await db.from("merchandise_orders").insert({
    organization_id,
    event_id:        event_id ?? null,
    registration_id: registration_id ?? null,
    user_email:      user_email.toLowerCase(),
    user_name,
    user_phone:      user_phone ?? null,
    items,
    subtotal_paise:  subtotal,
    gst_paise:       gst_total,
    total_paise:     total,
    status:          "pending",
    fulfillment_type,
    shipping_address:shipping_address ?? null,
    notes:           notes ?? null,
    payment_status:  payment_id ? "paid" : "pending",
    payment_id:      payment_id ?? null,
  }).select().single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Reserve stock for each variant (RPC handles atomic increment)
  for (const item of items) {
    if (item.variant_id) {
      try { await db.rpc("increment_variant_reserved", { v_id: item.variant_id, qty: item.qty }); } catch { /* non-fatal */ }
    }
  }

  await writeFinancialAudit({
    organization_id,
    event_id: event_id ?? undefined,
    action:       "merchandise.order.created",
    actor_email:  recorded_by,
    entity_type:  "merchandise_order",
    entity_id:    data.id,
    amount_paise: total,
    detail:       { user_email, items: items.length, fulfillment_type },
    ip:           getClientIp(req),
  });

  return NextResponse.json({
    order: {
      ...data,
      total_rupees:    paiseToRupees(total),
      subtotal_rupees: paiseToRupees(subtotal),
      gst_rupees:      paiseToRupees(gst_total),
    },
  }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, status, tracking_number, notes, payment_status } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (status         !== undefined) update.status          = status;
  if (tracking_number!== undefined) update.tracking_number = tracking_number;
  if (notes          !== undefined) update.notes           = notes;
  if (payment_status !== undefined) update.payment_status  = payment_status;

  const db = getSupabaseServer();
  const { data, error } = await db.from("merchandise_orders").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const updatedData = data as Record<string, unknown>;
  const orderItems  = updatedData.items as Array<{ variant_id?: string; qty: number }> ?? [];

  if (status === "delivered" && updatedData.payment_status === "paid") {
    for (const item of orderItems) {
      if (item.variant_id) {
        try { await db.rpc("confirm_variant_sold", { v_id: item.variant_id, qty: item.qty }); } catch { /* non-fatal */ }
      }
    }
  } else if (status === "cancelled") {
    for (const item of orderItems) {
      if (item.variant_id) {
        try { await db.rpc("release_variant_reserved", { v_id: item.variant_id, qty: item.qty }); } catch { /* non-fatal */ }
      }
    }
  }

  return NextResponse.json({ order: data });
}
