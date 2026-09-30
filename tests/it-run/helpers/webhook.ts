import * as crypto from "crypto";

const SECRET = process.env.ITR_TEST_RAZORPAY_WEBHOOK_SECRET ?? "test-webhook-secret";

/** Build and sign a Razorpay-style webhook payload for testing. */
export function buildWebhookPayload(event: string, paymentId: string, orderId: string, extra: Record<string, unknown> = {}) {
  const paymentEntity = {
    id: paymentId,
    order_id: orderId,
    amount: 99900,
    currency: "INR",
    status: event === "payment.captured" ? "captured" : "failed",
    method: "upi",
    captured: event === "payment.captured",
    notes: { registration_code: "ITRUN2-TESTCODE" },
    ...extra,
  };

  return {
    entity: "event",
    account_id: "acc_test",
    event,
    payload: {
      payment: { entity: paymentEntity },
    },
  };
}

export function buildRefundWebhookPayload(paymentId: string, refundId: string) {
  return {
    entity: "event",
    account_id: "acc_test",
    event: "refund.created",
    payload: {
      refund: {
        entity: {
          id: refundId,
          payment_id: paymentId,
          amount: 99900,
          currency: "INR",
          notes: {},
          receipt: null,
        },
      },
    },
  };
}

/** Compute the Razorpay webhook HMAC signature for a given raw body. */
export function signWebhook(rawBody: string, secret = SECRET): string {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

/** Current UNIX timestamp (seconds) for webhook replay protection. */
export function webhookTimestamp(): string {
  return String(Math.floor(Date.now() / 1000));
}

/** Returns headers needed for a valid webhook request. */
export function webhookHeaders(rawBody: string, secret = SECRET): Record<string, string> {
  return {
    "x-razorpay-signature": signWebhook(rawBody, secret),
    "x-razorpay-timestamp": webhookTimestamp(),
    "content-type": "application/json",
  };
}
