import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseServer } from "@/lib/supabase-server";

// POST /api/it-run/webhook/razorpay
// Webhook to reconcile Razorpay events: payments, refunds, etc.
// Signature verified with RAZORPAY_WEBHOOK_SECRET.
export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-razorpay-signature");
  if (!signature) {
    console.warn("[razorpay-webhook] Missing signature");
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await req.text();
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[razorpay-webhook] Missing webhook secret");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  const computed = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computed))) {
    console.warn("[razorpay-webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const db = getSupabaseServer();

  switch (event.event) {
    case "refund.processed": {
      // Razorpay confirmed refund was successful
      const refundId = event.payload?.refund?.entity?.id;
      if (!refundId) {
        console.warn("[razorpay-webhook] refund.processed missing refund ID");
        return NextResponse.json({ ok: true });
      }

      const { data: refundRecord } = await db
        .from("it_run_refunds")
        .select("id, registration_id")
        .eq("razorpay_refund_id", refundId)
        .maybeSingle<{ id: string; registration_id: string }>();

      if (refundRecord) {
        await db
          .from("it_run_refunds")
          .update({
            status: "processed",
            processed_at: new Date().toISOString(),
          })
          .eq("id", refundRecord.id);

        // Ensure registration is cancelled
        await db
          .from("it_run_registrations")
          .update({
            registration_status: "cancelled",
            payment_status: "refunded",
          })
          .eq("id", refundRecord.registration_id)
          .eq("registration_status", "active");

        console.log(`[razorpay-webhook] ✅ Refund ${refundId} processed`);
      }
      break;
    }

    case "refund.failed": {
      // Razorpay refund failed
      const refundId = event.payload?.refund?.entity?.id;
      const failureReason = event.payload?.refund?.entity?.reason_code;

      if (refundId) {
        await db
          .from("it_run_refunds")
          .update({
            status: "failed",
            failure_reason: failureReason || "Razorpay refund failed",
          })
          .eq("razorpay_refund_id", refundId);

        console.log(`[razorpay-webhook] ❌ Refund ${refundId} failed: ${failureReason}`);
      }
      break;
    }

    default:
      console.log(`[razorpay-webhook] Unhandled event: ${event.event}`);
  }

  return NextResponse.json({ ok: true });
}
