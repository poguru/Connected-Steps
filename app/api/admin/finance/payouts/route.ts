import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { writeFinancialAudit, rupeesToPaise, paiseToRupees } from "@/lib/finance-service";
import { getClientIp } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const org_id   = searchParams.get("org_id")   ?? undefined;
  const event_id = searchParams.get("event_id") ?? undefined;
  const status   = searchParams.get("status")   ?? undefined;
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit    = 50;
  const offset   = (page - 1) * limit;

  const db = getSupabaseServer();
  let q = db
    .from("payouts")
    .select("*, events(title)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (org_id)   q = q.eq("organization_id", org_id) as typeof q;
  if (event_id) q = q.eq("event_id", event_id) as typeof q;
  if (status)   q = q.eq("status", status) as typeof q;

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const records = (data ?? []).map((p: Record<string, unknown>) => ({
    ...p,
    amount_rupees: paiseToRupees(p.amount_paise as number ?? 0),
  }));

  return NextResponse.json({ payouts: records, total: count ?? 0, page, limit });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    organization_id, event_id,
    payee_type = "vendor", payee_name, payee_email, payee_phone, payee_account,
    amount_rupees, description, category = "other",
    payment_method = "bank_transfer", notes, paid_by,
  } = body;

  if (!organization_id || !payee_name || !amount_rupees || !description || !paid_by) {
    return NextResponse.json({
      error: "organization_id, payee_name, amount_rupees, description, paid_by are required",
    }, { status: 400 });
  }

  const amount_paise = rupeesToPaise(amount_rupees);
  const db = getSupabaseServer();
  const { data, error } = await db.from("payouts").insert({
    organization_id,
    event_id:       event_id ?? null,
    payee_type,
    payee_name,
    payee_email:    payee_email ?? null,
    payee_phone:    payee_phone ?? null,
    payee_account:  payee_account ?? null,
    amount_paise,
    description,
    category,
    payment_method,
    notes:          notes ?? null,
    paid_by:        paid_by.toLowerCase(),
    status:         "pending",
  }).select().single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  await writeFinancialAudit({
    organization_id,
    event_id: event_id ?? undefined,
    action:       "payout.created",
    actor_email:  paid_by,
    entity_type:  "payout",
    entity_id:    data.id,
    amount_paise,
    detail:       { payee_type, payee_name, category, payment_method },
    ip:           getClientIp(req),
  });

  return NextResponse.json({ payout: { ...data, amount_rupees: paiseToRupees(amount_paise) } }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, status, payment_reference, payment_date, paid_by, notes } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (status             !== undefined) update.status             = status;
  if (payment_reference  !== undefined) update.payment_reference  = payment_reference;
  if (payment_date       !== undefined) update.payment_date       = payment_date;
  if (paid_by            !== undefined) update.paid_by            = paid_by;
  if (notes              !== undefined) update.notes              = notes;

  const db = getSupabaseServer();
  const { data: existing } = await db.from("payouts").select("organization_id, amount_paise").eq("id", id).single();

  const { data, error } = await db.from("payouts").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  if (status === "paid" && existing) {
    await writeFinancialAudit({
      organization_id: existing.organization_id,
      action:      "payout.paid",
      actor_email: paid_by ?? "admin",
      entity_type: "payout",
      entity_id:   id,
      amount_paise:existing.amount_paise,
      detail:      { payment_reference, payment_date },
      ip:          getClientIp(req),
    });
  }

  return NextResponse.json({ payout: data });
}
