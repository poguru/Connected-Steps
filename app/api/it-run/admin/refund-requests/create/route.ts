import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, getClientIp } from "@/lib/it-run-auth";
import { getRefundedAmountPaise, paidAmountPaise } from "@/lib/it-run-refunds";

// POST /api/it-run/admin/refund-requests/create
// An administrator opens a refund request for any paid registration, at any time. No deadline applies to admins.
// Creating a request moves no money. The request is approved on the refund requests page, and the refund is issued
// only by executing the approved request with explicit confirmation (POST /api/it-run/admin/refund), which refunds the
// amount still refundable.
//
// Body: { registration_code, reason }
// Roles: event_admin (super_admin bypasses via requireRole).

const MIN_REASON = 10;
const MAX_REASON = 1000;

export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { registration_code?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const code = typeof body.registration_code === "string" ? body.registration_code.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!code) return NextResponse.json({ error: "registration_code is required" }, { status: 400 });
  if (reason.length < MIN_REASON || reason.length > MAX_REASON) {
    return NextResponse.json({ error: `A reason of ${MIN_REASON}-${MAX_REASON} characters is required` }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").maybeSingle<{ id: string }>();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data: reg } = await db
    .from("it_run_registrations")
    .select("id, event_id, registration_code, payment_status, registration_status, final_price, amount_paid_paise, razorpay_payment_id")
    .eq("event_id", event.id)
    .eq("registration_code", code)
    .maybeSingle<{
      id: string; event_id: string; registration_code: string; payment_status: string; registration_status: string;
      final_price: number; amount_paid_paise: number | null; razorpay_payment_id: string | null;
    }>();
  if (!reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });

  if (reg.final_price <= 0 || reg.payment_status === "free") {
    return NextResponse.json({ error: "Free registrations cannot be refunded" }, { status: 422 });
  }
  if (!["paid", "partially_refunded"].includes(reg.payment_status) || !reg.razorpay_payment_id) {
    return NextResponse.json({ error: "There is no captured payment to refund on this registration" }, { status: 422 });
  }

  let refunded: number;
  try {
    refunded = await getRefundedAmountPaise(db, reg.id);
  } catch {
    return NextResponse.json({ error: "Could not check existing refunds. Nothing was requested." }, { status: 500 });
  }
  const remaining = paidAmountPaise(reg) - refunded;
  if (remaining <= 0) {
    return NextResponse.json({ error: "The payment is already fully refunded" }, { status: 422 });
  }

  const { data: created, error: insErr } = await db
    .from("it_run_refund_requests")
    .insert({
      event_id: reg.event_id,
      registration_id: reg.id,
      requested_by_email: session.email,
      request_reason: reason,
      status: "requested",
      request_kind: "full_refund",
      requested_amount_paise: null,
      target_category_id: null,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (insErr?.code === "23505") {
    return NextResponse.json({ error: "A refund request is already open for this registration." }, { status: 409 });
  }
  if (insErr || !created) {
    console.error("[it-run/admin/refund-requests/create] insert failed:", insErr?.code ?? "unknown");
    return NextResponse.json({ error: "Could not open the refund request." }, { status: 500 });
  }

  await db.from("it_run_audit_logs").insert({
    actor_email: session.email,
    actor_role: session.role,
    action: "refund_request_created",
    entity_type: "refund_request",
    entity_id: created.id,
    ip: getClientIp(req),
    detail: { registration_id: reg.id, registration_code: reg.registration_code, refundable_paise: remaining },
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true, requestId: created.id, status: "requested", refundablePaise: remaining });
}
