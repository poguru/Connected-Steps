import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { getPayment } from "@/lib/razorpay-client";
import { handleEventQrEmail, handleInvoiceGenerate } from "@/lib/job-handlers";
import { enqueueJob } from "@/lib/job-queue";

// POST /api/admin/payment-force-reconcile
// Admin-only: manually confirms a registration where Razorpay shows
// payment.captured but our webhook or verify-payment was never called.
//
// ONLY call this AFTER verifying the payment is genuinely captured in Razorpay.
// This endpoint re-verifies with Razorpay API before making any changes.
//
// Body: { registration_code, payment_id?, order_id? }
export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { registration_code, payment_id, order_id } =
    await req.json() as { registration_code?: string; payment_id?: string; order_id?: string };

  if (!registration_code) return NextResponse.json({ error: "registration_code is required" }, { status: 400 });
  if (!payment_id && !order_id) return NextResponse.json({ error: "payment_id or order_id is required" }, { status: 400 });

  const db = getSupabaseServer();

  // ── 1. Fetch registration ──────────────────────────────────────────────────
  const { data: reg } = await db
    .from("event_registrations")
    .select(`id, registration_code, user_email, user_name, event_id, payment_status, status, razorpay_payment_id, distance_category, final_price, events ( title, start_date, start_time, location )`)
    .eq("registration_code", registration_code.toUpperCase())
    .single<{
      id: string; registration_code: string; user_email: string; user_name: string;
      event_id: string; payment_status: string; status: string; razorpay_payment_id: string | null;
      distance_category: string | null; final_price: number | null;
      events: { title: string; start_date: string; start_time: string | null; location: string } | null;
    }>();

  if (!reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });

  // ── 2. Idempotency ─────────────────────────────────────────────────────────
  if (reg.payment_status === "paid" && reg.status === "confirmed") {
    return NextResponse.json({ success: true, already_confirmed: true, message: "Registration is already confirmed" });
  }

  // ── 3. Verify with Razorpay API (server-to-server) ────────────────────────
  // We NEVER trust the admin input alone — always verify with Razorpay directly.
  const resolvedPaymentId = payment_id ?? null;
  let razorpayPayment = null;

  if (resolvedPaymentId) {
    razorpayPayment = await getPayment(resolvedPaymentId).catch(() => null);
  } else if (order_id) {
    const { getOrderPayments } = await import("@/lib/razorpay-client");
    const payments = await getOrderPayments(order_id).catch(() => []);
    razorpayPayment = payments.find(p => p.status === "captured" || p.status === "authorized") ?? null;
  }

  if (!razorpayPayment) {
    return NextResponse.json({
      error: "Payment not found in Razorpay. Cannot reconcile — verify the payment_id or order_id is correct.",
      tip:   "Check Razorpay dashboard under Payments > All Payments. Only captured or authorized payments can be reconciled.",
    }, { status: 422 });
  }

  if (razorpayPayment.status !== "captured" && razorpayPayment.status !== "authorized") {
    return NextResponse.json({
      error: `Payment is in '${razorpayPayment.status}' state — only captured or authorized payments can confirm a registration`,
    }, { status: 422 });
  }

  // ── 4. Apply the update ────────────────────────────────────────────────────
  const finalPaymentId = razorpayPayment.id;
  const finalOrderId   = razorpayPayment.order_id ?? order_id ?? "";

  const { error: updateErr } = await db
    .from("event_registrations")
    .update({
      payment_status:      "paid",
      status:              "confirmed",
      razorpay_payment_id: finalPaymentId,
      razorpay_order_id:   finalOrderId,
    })
    .eq("id", reg.id);

  if (updateErr) {
    if (updateErr.code === "23505") {
      return NextResponse.json({ success: true, already_confirmed: true, message: "Duplicate — already processed" });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // Audit log
  void (async () => {
    try {
      await db.from("audit_logs").insert({
        action:     "payment_force_reconcile",
        table_name: "event_registrations",
        record_id:  reg.id,
        metadata: {
          registration_code,
          payment_id:   finalPaymentId,
          order_id:     finalOrderId,
          rzp_status:   razorpayPayment.status,
          rzp_amount:   razorpayPayment.amount,
          admin_action: true,
        },
      });
    } catch { /* non-critical */ }
  })();

  // ── 5. Trigger QR + invoice + email ───────────────────────────────────────
  const ev = reg.events;
  const qrPayload = {
    registrationId: reg.id, registrationCode: reg.registration_code,
    eventId: reg.event_id, userEmail: reg.user_email, userName: reg.user_name,
    eventTitle: ev?.title ?? "Connected Steps Event", startDate: ev?.start_date ?? "",
    startTime: ev?.start_time ?? null, location: ev?.location ?? "",
    distanceCategory: reg.distance_category,
  };
  const invoicePayload = {
    productType: "event" as const, userEmail: reg.user_email, userName: reg.user_name,
    productName: ev?.title ?? "Event Registration", totalPaidRupees: reg.final_price ?? 0,
    paymentId: finalPaymentId, orderId: finalOrderId,
    registrationId: reg.id, eventId: reg.event_id,
    eventDate: ev?.start_date, eventVenue: ev?.location,
  };

  await enqueueJob("event_qr_email",   qrPayload,      { idempotencyKey: `event_qr_email:${reg.id}`,         priority: 10 });
  await enqueueJob("invoice_generate", invoicePayload, { idempotencyKey: `invoice_generate:${finalPaymentId}` });

  after(async () => {
    await handleEventQrEmail(qrPayload).catch(e => console.error("[force-reconcile] QR email failed:", e));
    await handleInvoiceGenerate(invoicePayload).catch(e => console.error("[force-reconcile] Invoice failed:", e));
  });

  return NextResponse.json({
    success:          true,
    registration_code,
    payment_id:       finalPaymentId,
    razorpay_status:  razorpayPayment.status,
    email_queued:     true,
    message:          `Registration ${registration_code} confirmed. Confirmation email + QR queued for delivery.`,
  });
}
