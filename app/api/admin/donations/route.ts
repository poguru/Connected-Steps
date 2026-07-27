import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { paiseToRupees, rupeesToPaise, writeFinancialAudit } from "@/lib/finance-service";
import { getClientIp } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const org_id   = searchParams.get("org_id")   ?? undefined;
  const event_id = searchParams.get("event_id") ?? undefined;
  const campaign = searchParams.get("campaign") ?? undefined;
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit    = 50;
  const offset   = (page - 1) * limit;

  const db = getSupabaseServer();
  let q = db
    .from("donations")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (org_id)   q = q.eq("organization_id", org_id) as typeof q;
  if (event_id) q = q.eq("event_id", event_id) as typeof q;
  if (campaign) q = q.eq("campaign", campaign) as typeof q;

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const donations = (data ?? []).map((d: Record<string, unknown>) => ({
    ...d,
    amount_rupees: paiseToRupees(d.amount_paise as number ?? 0),
  }));

  // Aggregate totals
  let total_paise = 0;
  for (const d of data ?? []) total_paise += (d as Record<string,number>).amount_paise ?? 0;

  return NextResponse.json({
    donations,
    total_records: count ?? 0,
    total_rupees:  paiseToRupees(total_paise),
    page,
    limit,
  });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    organization_id, event_id, registration_id,
    user_email, user_name, phone,
    amount_rupees, campaign = "general", beneficiary,
    payment_id, payment_method = "razorpay",
    notes, recorded_by,
  } = body;

  if (!organization_id || !user_email || !user_name || !amount_rupees || !recorded_by) {
    return NextResponse.json({ error: "organization_id, user_email, user_name, amount_rupees, recorded_by are required" }, { status: 400 });
  }

  const amount_paise = rupeesToPaise(amount_rupees);
  const db = getSupabaseServer();

  // Generate tax receipt number: DON-YYYYMM-XXXXX
  const now = new Date();
  const prefix = `DON-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { count } = await db.from("donations").select("id", { count: "exact", head: true })
    .gte("created_at", `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
  const tax_receipt_number = `${prefix}-${String((count ?? 0) + 1).padStart(5, "0")}`;

  const { data, error } = await db.from("donations").insert({
    organization_id,
    event_id:          event_id ?? null,
    registration_id:   registration_id ?? null,
    user_email:        user_email.toLowerCase(),
    user_name,
    phone:             phone ?? null,
    amount_paise,
    campaign,
    beneficiary:       beneficiary ?? null,
    payment_id:        payment_id ?? null,
    payment_method,
    tax_receipt_number,
    notes:             notes ?? null,
  }).select().single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  await writeFinancialAudit({
    organization_id,
    event_id: event_id ?? undefined,
    action:       "donation.received",
    actor_email:  recorded_by,
    entity_type:  "donation",
    entity_id:    data.id,
    amount_paise,
    detail:       { user_email, campaign, payment_method, tax_receipt_number },
    ip:           getClientIp(req),
  });

  return NextResponse.json({
    donation: { ...data, amount_rupees: paiseToRupees(amount_paise) },
  }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, tax_receipt_sent, notes } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (tax_receipt_sent !== undefined) update.tax_receipt_sent = tax_receipt_sent;
  if (notes            !== undefined) update.notes            = notes;

  const db = getSupabaseServer();
  const { data, error } = await db.from("donations").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  return NextResponse.json({ donation: data });
}
