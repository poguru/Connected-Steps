import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseServer } from "@/lib/supabase-server";
import { finalizeRefundProcessed, markRefundFailed } from "@/lib/it-run-refunds";
import type { SupabaseClient } from "@supabase/supabase-js";

// Matches a local refund row by Razorpay refund ID, falling back to the local refund ID we
// sent in the refund notes (covers a webhook that arrives before the Razorpay ID was saved).
async function findLocalRefund(
  db: SupabaseClient,
  razorpayRefundId: string,
  localRefundId: string | undefined,
): Promise<{ id: string } | null> {
  const { data: byRzp } = await db
    .from("it_run_refunds")
    .select("id")
    .eq("razorpay_refund_id", razorpayRefundId)
    .maybeSingle<{ id: string }>();
  if (byRzp) return byRzp;
  if (!localRefundId) return null;
  const { data: byLocal } = await db
    .from("it_run_refunds")
    .select("id")
    .eq("id", localRefundId)
    .maybeSingle<{ id: string }>();
  return byLocal;
}

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
      // Razorpay confirmed the refund. Finalization is idempotent: duplicate deliveries are no-ops.
      const entity = event.payload?.refund?.entity;
      const refundId: string | undefined = entity?.id;
      const localRefundId: string | undefined = entity?.notes?.refund_record;
      if (!refundId) {
        console.warn("[razorpay-webhook] refund.processed missing refund ID");
        return NextResponse.json({ ok: true });
      }

      const localRecord = await findLocalRefund(db, refundId, localRefundId);
      if (localRecord) {
        const finalized = await finalizeRefundProcessed(db, localRecord.id, refundId, "razorpay-webhook");
        console.log(`[razorpay-webhook] Refund ${refundId} processed (finalized=${finalized})`);
      } else {
        console.warn(`[razorpay-webhook] refund.processed for unknown refund ${refundId}`);
      }
      break;
    }

    case "refund.failed": {
      // Razorpay refund failed. The request stays approved so an admin can retry.
      const entity = event.payload?.refund?.entity;
      const refundId: string | undefined = entity?.id;
      const localRefundId: string | undefined = entity?.notes?.refund_record;
      const failureReason: string = entity?.error_description || entity?.reason_code || "Razorpay refund failed";

      if (refundId) {
        const localRecord = await findLocalRefund(db, refundId, localRefundId);
        if (localRecord) {
          await markRefundFailed(db, localRecord.id, failureReason, "razorpay-webhook");
        }
        console.log(`[razorpay-webhook] Refund ${refundId} failed: ${failureReason}`);
      }
      break;
    }

    default:
      console.log(`[razorpay-webhook] Unhandled event: ${event.event}`);
  }

  return NextResponse.json({ ok: true });
}
