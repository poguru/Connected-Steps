import crypto from "crypto";
import { logger } from "@/lib/logger";

const REPLAY_TOLERANCE_SECONDS = parseInt(
  process.env.RAZORPAY_REPLAY_TOLERANCE_SECONDS ?? "300",
  10,
);

export interface WebhookValidation {
  valid:    boolean;
  reason?:  string;
}

/**
 * Validates the HMAC-SHA256 signature on a Razorpay webhook delivery.
 * Razorpay signs the raw request body — never JSON.parse the body first.
 */
export function validateRazorpayWebhookSignature(
  rawBody:         string,
  signatureHeader: string,
  secret:          string,
): WebhookValidation {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const sigBuf = Buffer.from(signatureHeader, "hex");
  const expBuf = Buffer.from(expected,         "hex");

  if (sigBuf.length !== expBuf.length) {
    return { valid: false, reason: "signature_length_mismatch" };
  }
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: "invalid_signature" };
  }
  return { valid: true };
}

/**
 * Validates the X-Razorpay-Timestamp header to prevent webhook replay attacks.
 * Tolerance is configurable via RAZORPAY_REPLAY_TOLERANCE_SECONDS (default 300 = 5 min).
 * Returns valid:true when the header is absent — Razorpay doesn't guarantee its presence.
 */
export function validateRazorpayWebhookTimestamp(
  timestampHeader: string | null,
): WebhookValidation {
  if (!timestampHeader) return { valid: true };

  const ts = parseInt(timestampHeader, 10);
  if (!Number.isFinite(ts)) {
    return { valid: false, reason: "invalid_timestamp_format" };
  }

  const ageSeconds = Math.abs(Date.now() / 1000 - ts);
  if (ageSeconds > REPLAY_TOLERANCE_SECONDS) {
    return {
      valid:  false,
      reason: `timestamp_too_old_${Math.round(ageSeconds)}s_tolerance_${REPLAY_TOLERANCE_SECONDS}s`,
    };
  }
  return { valid: true };
}

/**
 * Full webhook validation: signature + timestamp.
 * Use this in /api/webhooks/razorpay and any future Razorpay webhook endpoints.
 *
 * @param rawBody   Raw request body string (do NOT JSON.parse before passing)
 * @param signature X-Razorpay-Signature header value
 * @param timestamp X-Razorpay-Timestamp header value (optional)
 * @param secret    RAZORPAY_WEBHOOK_SECRET env var (separate from RAZORPAY_KEY_SECRET)
 * @param context   Extra fields to include in warn logs (IP, event type, etc.)
 */
export function validateRazorpayWebhook(
  rawBody:   string,
  signature: string | null,
  timestamp: string | null,
  secret:    string,
  context:   Record<string, unknown> = {},
): WebhookValidation {
  if (!signature) {
    logger.warn("razorpay-webhook", "Missing X-Razorpay-Signature header", context);
    return { valid: false, reason: "missing_signature" };
  }

  const sigResult = validateRazorpayWebhookSignature(rawBody, signature, secret);
  if (!sigResult.valid) {
    logger.warn("razorpay-webhook", "Webhook signature invalid", { ...context, reason: sigResult.reason });
    return sigResult;
  }

  const tsResult = validateRazorpayWebhookTimestamp(timestamp);
  if (!tsResult.valid) {
    logger.warn("razorpay-webhook", "Webhook timestamp rejected — possible replay attack", {
      ...context,
      reason:    tsResult.reason,
      timestamp,
      tolerance: REPLAY_TOLERANCE_SECONDS,
    });
    return tsResult;
  }

  return { valid: true };
}
