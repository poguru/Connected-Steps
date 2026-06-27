import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import {
  getPayment,
  getOrder,
  getOrderPayments,
  searchPayments,
  findPaymentByUTR,
} from "@/lib/razorpay-client";

// POST /api/admin/payment-investigate
// Accepts any combination of identifiers and returns a complete payment audit trail.
// Used by admin to trace exactly where a payment flow broke.
//
// Body (at least one required):
//   payment_id         — Razorpay pay_xxx
//   order_id           — Razorpay order_xxx
//   registration_code  — CS-EVT-XXXXXX
//   email              — user email
//   phone              — user phone (10 digits)
//   utr                — UPI Transaction Reference / RRN / PhonePe transaction ref

export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    payment_id?:        string;
    order_id?:          string;
    registration_code?: string;
    email?:             string;
    phone?:             string;
    utr?:               string;
  };

  const { payment_id, order_id, registration_code, email, phone, utr } = body;

  if (!payment_id && !order_id && !registration_code && !email && !phone && !utr) {
    return NextResponse.json({ error: "Provide at least one identifier" }, { status: 400 });
  }

  const db     = getSupabaseServer();
  const report: Record<string, unknown> = {
    searched_with: body,
    timestamp:     new Date().toISOString(),
  };

  // ── Step 1: Search our database ────────────────────────────────────────────

  let dbQuery = db
    .from("event_registrations")
    .select(`
      id, registration_code, user_email, user_name, phone,
      status, payment_status,
      razorpay_order_id, razorpay_payment_id, razorpay_signature,
      final_price, original_price, coupon_discount,
      created_at, qr_generated_at, confirmation_email_sent_at,
      email_status, email_ses_message_id,
      event_id,
      events ( id, title, start_date )
    `);

  if (registration_code) dbQuery = dbQuery.eq("registration_code", registration_code.toUpperCase()) as typeof dbQuery;
  else if (payment_id)   dbQuery = dbQuery.eq("razorpay_payment_id", payment_id) as typeof dbQuery;
  else if (order_id)     dbQuery = dbQuery.eq("razorpay_order_id",   order_id)   as typeof dbQuery;
  else if (email)        dbQuery = dbQuery.eq("user_email",           email.toLowerCase().trim()) as typeof dbQuery;
  else if (phone)        dbQuery = dbQuery.eq("phone",                phone.replace(/\s/g, "")) as typeof dbQuery;

  const { data: dbRegs, error: dbErr } = await dbQuery.order("created_at", { ascending: false }).limit(10);

  report.database = {
    found:         !dbErr && (dbRegs?.length ?? 0) > 0,
    count:         dbRegs?.length ?? 0,
    error:         dbErr?.message ?? null,
    registrations: (dbRegs ?? []).map(r => ({
      registration_code:      r.registration_code,
      user_email:             r.user_email,
      user_name:              r.user_name,
      phone:                  r.phone,
      status:                 r.status,
      payment_status:         r.payment_status,
      amount:                 r.final_price,
      razorpay_order_id:      r.razorpay_order_id,
      razorpay_payment_id:    r.razorpay_payment_id,
      event:                  (r.events as { title?: string })?.title,
      event_id:               r.event_id,
      created_at:             r.created_at,
      qr_generated_at:        r.qr_generated_at,
      email_sent_at:          r.confirmation_email_sent_at,
      email_status:           r.email_status,
      email_ses_message_id:   r.email_ses_message_id,
    })),
  };

  // ── Step 2: Search Razorpay ────────────────────────────────────────────────

  let rzpPayment = null;
  let rzpOrder   = null;
  let rzpErr     = null;

  try {
    if (payment_id) {
      rzpPayment = await getPayment(payment_id);
    } else if (order_id) {
      rzpOrder   = await getOrder(order_id);
      const payments = await getOrderPayments(order_id);
      rzpPayment = payments.find(p => p.status === "captured" || p.status === "authorized") ?? payments[0] ?? null;
    } else if (utr) {
      rzpPayment = await findPaymentByUTR(utr);
    } else if (email || phone) {
      const results = await searchPayments({ email: email ?? undefined, contact: phone ?? undefined, count: 5 });
      rzpPayment = results[0] ?? null;
    }

    // If we found a payment, also fetch its order
    if (rzpPayment?.order_id && !rzpOrder) {
      rzpOrder = await getOrder(rzpPayment.order_id);
    }
  } catch (e: unknown) {
    rzpErr = e instanceof Error ? e.message : String(e);
  }

  report.razorpay = {
    payment_found: rzpPayment !== null,
    order_found:   rzpOrder !== null,
    error:         rzpErr,
    payment: rzpPayment ? {
      id:          rzpPayment.id,
      status:      rzpPayment.status,
      amount_inr:  (rzpPayment.amount ?? 0) / 100,
      method:      rzpPayment.method,
      captured:    rzpPayment.captured,
      order_id:    rzpPayment.order_id,
      email:       rzpPayment.email,
      contact:     rzpPayment.contact,
      created_at:  rzpPayment.created_at ? new Date(rzpPayment.created_at * 1000).toISOString() : null,
      notes:       rzpPayment.notes,
      utr:         rzpPayment.acquirer_data?.upi_transaction_id ?? rzpPayment.acquirer_data?.rrn ?? null,
    } : null,
    order: rzpOrder ? {
      id:          rzpOrder.id,
      status:      rzpOrder.status,
      amount_inr:  (rzpOrder.amount ?? 0) / 100,
      amount_paid: (rzpOrder.amount_paid ?? 0) / 100,
      receipt:     rzpOrder.receipt,
      notes:       rzpOrder.notes,
      created_at:  rzpOrder.created_at ? new Date(rzpOrder.created_at * 1000).toISOString() : null,
    } : null,
  };

  // ── Step 3: Diagnosis ──────────────────────────────────────────────────────

  const dbReg        = (dbRegs ?? [])[0] ?? null;
  const paymentInRzp = rzpPayment !== null;
  const paymentInDb  = dbReg !== null;

  const diagnosis: {
    status:            string;
    action_required:   string;
    can_auto_recover:  boolean;
    steps:             string[];
  } = { status: "unknown", action_required: "", can_auto_recover: false, steps: [] };

  if (!paymentInRzp && !paymentInDb) {
    diagnosis.status          = "NOT_FOUND";
    diagnosis.action_required = "Payment not found in Razorpay or our database. User may have paid to a wrong UPI ID, or the payment was rejected before creation.";
    diagnosis.steps           = [
      "Ask user for PhonePe Transaction ID and UTR number",
      "Search Razorpay dashboard manually under Payments > All Payments",
      "If found in Razorpay with order_id matching a registration, use force-reconcile",
      "If not in Razorpay, contact Razorpay support with UTR for investigation",
      "Check user's bank statement — if debit reversed, no action needed",
    ];
  } else if (paymentInRzp && !paymentInDb) {
    diagnosis.status          = "ORPHAN_PAYMENT";
    diagnosis.action_required = "Payment exists in Razorpay but no matching registration found. The order_id may not have been saved.";
    diagnosis.can_auto_recover = true;
    diagnosis.steps           = [
      "Use force-reconcile with the payment_id and email to link payment to registration",
      "OR: create a manual registration and mark as paid",
    ];
  } else if (!paymentInRzp && paymentInDb) {
    diagnosis.status          = "PAYMENT_MISSING_IN_GATEWAY";
    diagnosis.action_required = "Registration exists in our DB but no payment found in Razorpay.";
    if (dbReg.payment_status === "pending") {
      diagnosis.steps = [
        "Payment was started but not completed — user may have closed the Razorpay window",
        "Check if webhook was received — look in Vercel logs for 'razorpay-webhook'",
        "Ask user to retry payment via /events/[slug]/register",
      ];
    } else if (dbReg.payment_status === "paid") {
      diagnosis.steps = ["Registration is already paid in our DB — no action needed"];
    }
  } else if (paymentInRzp && paymentInDb) {
    const regPaid = dbReg.payment_status === "paid";
    const regConfirmed = dbReg.status === "confirmed";
    const emailSent = dbReg.email_status === "sent";

    if (regPaid && regConfirmed && emailSent) {
      diagnosis.status          = "COMPLETE";
      diagnosis.action_required = "Everything is in order. Payment captured, registration confirmed, email sent.";
      diagnosis.steps           = [];
    } else if (regPaid && !emailSent) {
      diagnosis.status          = "EMAIL_MISSING";
      diagnosis.action_required = "Registration confirmed but email/QR not sent.";
      diagnosis.can_auto_recover = true;
      diagnosis.steps           = [
        `Use Resend QR on registration ${dbReg.registration_code}`,
        "Go to Admin → Events → Registrations → find participant → Resend Email",
      ];
    } else if (!regPaid && rzpPayment?.status === "captured") {
      diagnosis.status          = "WEBHOOK_MISSED";
      diagnosis.action_required = "Payment captured in Razorpay but registration not updated. Webhook may have failed.";
      diagnosis.can_auto_recover = true;
      diagnosis.steps           = [
        "Use force-reconcile to mark registration as paid",
        "Then trigger QR/email resend",
      ];
    } else {
      diagnosis.status          = "PARTIAL";
      diagnosis.action_required = `Payment status: Razorpay=${rzpPayment?.status}, DB=${dbReg.payment_status}/${dbReg.status}`;
      diagnosis.steps           = ["Review details and use force-reconcile if payment is captured in Razorpay"];
    }
  }

  report.diagnosis = diagnosis;

  // ── Step 4: Force-reconcile option ────────────────────────────────────────

  // If we have both the payment and the registration, offer auto-reconcile endpoint
  if (rzpPayment && dbReg && dbReg.payment_status !== "paid" && rzpPayment.status === "captured") {
    report.auto_reconcile_available = true;
    report.auto_reconcile_hint = `POST /api/admin/payment-force-reconcile with { registration_code: "${dbReg.registration_code}", payment_id: "${rzpPayment.id}", order_id: "${rzpPayment.order_id}" }`;
  }

  return NextResponse.json(report);
}
