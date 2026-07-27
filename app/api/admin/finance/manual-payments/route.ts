import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { writeFinancialAudit, rupeesToPaise } from "@/lib/finance-service";
import { getClientIp } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const org_id    = searchParams.get("org_id")    ?? undefined;
  const event_id  = searchParams.get("event_id")  ?? undefined;
  const verified  = searchParams.get("verified");
  const page      = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit     = 50;
  const offset    = (page - 1) * limit;

  const db = getSupabaseServer();
  let q = db
    .from("manual_payment_records")
    .select("*, events(title)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (org_id)    q = q.eq("organization_id", org_id) as typeof q;
  if (event_id)  q = q.eq("event_id", event_id) as typeof q;
  if (verified === "true")  q = q.eq("verified", true) as typeof q;
  if (verified === "false") q = q.eq("verified", false) as typeof q;

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  return NextResponse.json({ records: data ?? [], total: count ?? 0, page, limit });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    organization_id, event_id, registration_id,
    entity_type = "other", entity_id,
    user_email, user_name,
    amount_rupees, payment_method = "cash",
    payment_reference, payment_date, notes,
    recorded_by,
  } = body;

  if (!organization_id || !user_email || !user_name || !amount_rupees || !recorded_by) {
    return NextResponse.json({ error: "organization_id, user_email, user_name, amount_rupees, recorded_by are required" }, { status: 400 });
  }

  const amount_paise = rupeesToPaise(amount_rupees);
  const db = getSupabaseServer();
  const { data, error } = await db.from("manual_payment_records").insert({
    organization_id,
    event_id:         event_id ?? null,
    registration_id:  registration_id ?? null,
    entity_type,
    entity_id:        entity_id ?? null,
    user_email:       user_email.toLowerCase(),
    user_name,
    amount_paise,
    payment_method,
    payment_reference: payment_reference ?? null,
    payment_date:      payment_date ?? new Date().toISOString().slice(0, 10),
    recorded_by:       recorded_by.toLowerCase(),
    notes:             notes ?? null,
  }).select().single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  await writeFinancialAudit({
    organization_id,
    event_id: event_id ?? undefined,
    action:       "manual_payment.recorded",
    actor_email:  recorded_by,
    entity_type:  entity_type,
    entity_id:    data.id,
    amount_paise,
    detail:       { payment_method, payment_reference, user_email },
    ip:           getClientIp(req),
  });

  return NextResponse.json({ record: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, verified, verified_by } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = getSupabaseServer();
  const { data, error } = await db.from("manual_payment_records").update({
    verified:    verified ?? true,
    verified_by: verified_by ?? null,
    verified_at: new Date().toISOString(),
  }).eq("id", id).select().single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ record: data });
}
