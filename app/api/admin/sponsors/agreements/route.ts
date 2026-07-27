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
  const status   = searchParams.get("status")   ?? undefined;
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit    = 50;
  const offset   = (page - 1) * limit;

  const db = getSupabaseServer();
  let q = db
    .from("sponsor_agreements")
    .select("*, events(title), sponsor_packages(name, price_paise)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (org_id)   q = q.eq("organization_id", org_id) as typeof q;
  if (event_id) q = q.eq("event_id", event_id) as typeof q;
  if (status)   q = q.eq("payment_status", status) as typeof q;

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const agreements = (data ?? []).map((a: Record<string, unknown>) => ({
    ...a,
    agreed_rupees:    paiseToRupees(a.agreed_amount_paise as number ?? 0),
    received_rupees:  paiseToRupees(a.amount_received_paise as number ?? 0),
    outstanding_rupees: paiseToRupees(
      ((a.agreed_amount_paise as number ?? 0) - (a.amount_received_paise as number ?? 0))
    ),
  }));

  return NextResponse.json({ agreements, total: count ?? 0, page, limit });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    organization_id, event_id, package_id, event_sponsor_id,
    sponsor_name, contact_name, contact_email, contact_phone,
    agreed_amount_rupees, invoice_number,
    agreement_date, due_date, notes, recorded_by,
  } = body;

  if (!organization_id || !sponsor_name || !agreed_amount_rupees || !recorded_by) {
    return NextResponse.json({
      error: "organization_id, sponsor_name, agreed_amount_rupees, recorded_by are required",
    }, { status: 400 });
  }

  const agreed_paise = rupeesToPaise(agreed_amount_rupees);
  const db = getSupabaseServer();
  const { data, error } = await db.from("sponsor_agreements").insert({
    organization_id,
    event_id:           event_id ?? null,
    package_id:         package_id ?? null,
    event_sponsor_id:   event_sponsor_id ?? null,
    sponsor_name,
    contact_name:       contact_name ?? null,
    contact_email:      contact_email ?? null,
    contact_phone:      contact_phone ?? null,
    agreed_amount_paise:agreed_paise,
    invoice_number:     invoice_number ?? null,
    payment_status:     "pending",
    amount_received_paise: 0,
    agreement_date:     agreement_date ?? null,
    due_date:           due_date ?? null,
    notes:              notes ?? null,
  }).select().single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  await writeFinancialAudit({
    organization_id,
    event_id: event_id ?? undefined,
    action:       "sponsor.agreement.created",
    actor_email:  recorded_by,
    entity_type:  "sponsor_agreement",
    entity_id:    data.id,
    amount_paise: agreed_paise,
    detail:       { sponsor_name, contact_email },
    ip:           getClientIp(req),
  });

  return NextResponse.json({
    agreement: {
      ...data,
      agreed_rupees:   paiseToRupees(agreed_paise),
      received_rupees: 0,
      outstanding_rupees: paiseToRupees(agreed_paise),
    },
  }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    id, payment_status, amount_received_rupees,
    invoice_number, due_date, notes, recorded_by,
  } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (payment_status        !== undefined) update.payment_status       = payment_status;
  if (amount_received_rupees!== undefined) update.amount_received_paise= rupeesToPaise(amount_received_rupees);
  if (invoice_number        !== undefined) update.invoice_number       = invoice_number;
  if (due_date              !== undefined) update.due_date             = due_date;
  if (notes                 !== undefined) update.notes                = notes;

  const db = getSupabaseServer();
  const { data: existing } = await db.from("sponsor_agreements").select("organization_id, agreed_amount_paise").eq("id", id).single();
  const { data, error } = await db.from("sponsor_agreements").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  if (payment_status === "paid" && existing) {
    await writeFinancialAudit({
      organization_id: existing.organization_id,
      action:       "sponsor.payment.received",
      actor_email:  recorded_by ?? "admin",
      entity_type:  "sponsor_agreement",
      entity_id:    id,
      amount_paise: existing.agreed_amount_paise,
      detail:       { payment_status },
      ip:           getClientIp(req),
    });
  }

  return NextResponse.json({
    agreement: {
      ...data,
      agreed_rupees:     paiseToRupees(data.agreed_amount_paise),
      received_rupees:   paiseToRupees(data.amount_received_paise),
      outstanding_rupees:paiseToRupees(data.agreed_amount_paise - data.amount_received_paise),
    },
  });
}
