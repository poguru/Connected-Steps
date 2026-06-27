/**
 * EmailService — provider-agnostic email abstraction.
 *
 * Current provider: Amazon SES v2 (@aws-sdk/client-sesv2).
 * Fallback:         Resend (RESEND_API_KEY).
 *
 * Required env vars:
 *   AWS_SES_ACCESS_KEY_ID     — IAM user access key (SES:SendEmail permission)
 *   AWS_SES_SECRET_ACCESS_KEY — IAM user secret key
 *   AWS_SES_REGION            — e.g. ap-south-1 or us-east-1
 *   AWS_SES_FROM_EMAIL        — verified sender, e.g. "Connected Steps <info@connectedsteps.in>"
 *
 * Rate limits:
 *   SES production:  14 emails/second (default; may be higher after account review)
 *   SES sandbox:     1 email/second to VERIFIED addresses only
 *   Resend free:     3 emails/second; 100 emails/month total quota
 *
 * The previous implementation had NO inter-batch delay which caused
 * ThrottlingException from SES after ~25 emails when sending to 100+ recipients.
 * Root cause: 101 emails ÷ concurrency=5 = 21 consecutive batches fired with no
 * pause. SES rate limit hit after ~6 batches (30 emails) → remaining 76 failed.
 *
 * Fix: configurable inter-batch delay (default 400 ms → ≤12 emails/sec with
 * concurrency=5, safely under the 14/sec SES limit with headroom for retries).
 */

import {
  SESv2Client,
  SendEmailCommand,
  type SendEmailCommandInput,
} from "@aws-sdk/client-sesv2";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EmailMessage {
  to:       string;
  subject:  string;
  html:     string;
  from?:    string;
  replyTo?: string;
}

export interface BatchEmailJob {
  from:    string;
  to:      string[];
  subject: string;
  html:    string;
}

/** Error category for failure classification and retry decisions */
export type EmailErrorCategory =
  | "rate_limit"        // ThrottlingException — transient, back off and retry
  | "invalid_address"   // invalid recipient — permanent, never retry
  | "sandbox_rejection" // SES sandbox, address not verified — permanent
  | "auth_error"        // wrong credentials — permanent until config fixed
  | "quota_exceeded"    // account sending limit — wait until quota resets
  | "network_error"     // transient network issue
  | "provider_error"    // SES/Resend API error not otherwise classified
  | "both_providers_failed"; // SES + Resend both failed

export interface SendResult {
  ok:            boolean;
  to:            string;
  error?:        string;
  errorCategory?: EmailErrorCategory;
  messageId?:    string;
  provider?:     "ses" | "resend";
  httpStatus?:   number;
  /** true = retry may succeed; false = don't retry */
  isTransient?:  boolean;
}

export interface BatchSendResult {
  sent:    number;
  failed:  number;
  results: SendResult[];  // per-email results with failure reasons
}

// ── Lazy SES client ────────────────────────────────────────────────────────────

let _client: SESv2Client | null = null;

function getClient(): SESv2Client {
  if (!_client) {
    _client = new SESv2Client({
      region:      process.env.AWS_SES_REGION ?? "ap-south-1",
      credentials: {
        accessKeyId:     process.env.AWS_SES_ACCESS_KEY_ID     ?? "",
        secretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  return _client;
}

function defaultFrom(): string {
  return (
    process.env.AWS_SES_FROM_EMAIL ??
    process.env.RESEND_FROM_EMAIL  ??
    "Connected Steps <noreply@connectedsteps.in>"
  );
}

// ── Error classifier ──────────────────────────────────────────────────────────

function classifySesError(err: unknown): { category: EmailErrorCategory; isTransient: boolean } {
  const msg = err instanceof Error ? err.message : String(err);
  const name = (err as { name?: string }).name ?? "";

  if (name === "ThrottlingException" || msg.includes("Throttling") || msg.includes("rate"))
    return { category: "rate_limit",        isTransient: true  };
  if (msg.includes("Invalid") && msg.includes("address") || msg.includes("invalid email"))
    return { category: "invalid_address",   isTransient: false };
  if (msg.includes("Email address is not verified") || msg.includes("sandbox"))
    return { category: "sandbox_rejection", isTransient: false };
  if (name === "InvalidClientTokenId" || msg.includes("credentials") || msg.includes("AuthFailure"))
    return { category: "auth_error",        isTransient: false };
  if (msg.includes("Daily maximum") || msg.includes("account-level"))
    return { category: "quota_exceeded",    isTransient: false };
  if (name === "NetworkingError" || msg.includes("ECONNRESET") || msg.includes("timeout"))
    return { category: "network_error",     isTransient: true  };

  return { category: "provider_error", isTransient: true };
}

// ── Resend fallback ───────────────────────────────────────────────────────────

async function sendViaResend(msg: EmailMessage, from: string): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, to: msg.to, error: "Resend not configured", errorCategory: "provider_error", isTransient: false };

  try {
    const res  = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html }),
    });
    const data = await res.json().catch(() => ({})) as { message?: string; id?: string };

    if (!res.ok) {
      const errMsg  = data.message ?? String(res.status);
      const isRate  = res.status === 429;
      const isQuota = errMsg.toLowerCase().includes("quota") || errMsg.toLowerCase().includes("limit");
      console.error(`[Resend] failed to=${msg.to} status=${res.status}: ${errMsg}`);
      return {
        ok:            false,
        to:            msg.to,
        error:         `Resend ${res.status}: ${errMsg}`,
        errorCategory: isRate || isQuota ? "rate_limit" : "provider_error",
        httpStatus:    res.status,
        isTransient:   isRate,
        provider:      "resend",
      };
    }

    console.log(`[Resend] sent to=${msg.to} id=${data.id}`);
    return { ok: true, to: msg.to, messageId: data.id, provider: "resend", httpStatus: res.status };
  } catch (e: unknown) {
    return { ok: false, to: msg.to, error: String(e), errorCategory: "network_error", isTransient: true };
  }
}

// ── Core single send ──────────────────────────────────────────────────────────

export async function sendSingleEmail(msg: EmailMessage): Promise<SendResult> {
  const from = msg.from ?? defaultFrom();

  if (process.env.AWS_SES_ACCESS_KEY_ID) {
    const input: SendEmailCommandInput = {
      FromEmailAddress: from,
      Destination:      { ToAddresses: [msg.to] },
      ReplyToAddresses: msg.replyTo ? [msg.replyTo] : undefined,
      Content: {
        Simple: {
          Subject: { Data: msg.subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: msg.html,                           Charset: "UTF-8" },
            Text: { Data: msg.html.replace(/<[^>]*>/g, " "), Charset: "UTF-8" },
          },
        },
      },
    };

    try {
      const sesResult  = await getClient().send(new SendEmailCommand(input));
      const messageId  = sesResult.MessageId;
      const httpStatus = sesResult.$metadata?.httpStatusCode;
      console.log(`[SES] sent to=${msg.to} messageId=${messageId} status=${httpStatus}`);
      return { ok: true, to: msg.to, messageId, provider: "ses", httpStatus };
    } catch (e: unknown) {
      const { category, isTransient } = classifySesError(e);
      const err = e instanceof Error ? e.message : String(e);
      console.error(`[SES] failed to=${msg.to} category=${category}: ${err}`);

      // For permanent SES failures (invalid address, sandbox rejection), don't try Resend
      if (category === "invalid_address" || category === "auth_error") {
        return { ok: false, to: msg.to, error: err, errorCategory: category, isTransient: false };
      }

      // Fall through to Resend for transient errors and sandbox issues
    }
  } else {
    console.warn(`[SES] AWS_SES_ACCESS_KEY_ID not set — using Resend fallback`);
  }

  const resendResult = await sendViaResend(msg, from);
  if (!resendResult.ok) {
    resendResult.errorCategory = resendResult.errorCategory ?? "both_providers_failed";
  }
  return resendResult;
}

// ── Batch send with rate-limit-safe inter-batch delay ─────────────────────────
//
// Root cause of the 76/101 failure: NO delay between batches caused SES
// ThrottlingException after ~25 emails.
//
// Fix: interBatchDelayMs=400 → with concurrency=5: 5 emails / 0.4 s = 12.5/sec
// — safely under SES's default 14/sec limit with ~12% headroom.
//
// Returns per-email results so callers can store failure reasons and retry
// transient failures later without re-sending already-delivered emails.

export async function sendBatchEmails(
  jobs:               BatchEmailJob[],
  concurrency         = 5,
  interBatchDelayMs   = 400,   // pause between chunks to respect SES rate limits
): Promise<BatchSendResult> {
  const messages: EmailMessage[] = jobs.flatMap(j =>
    j.to.map(to => ({ to, subject: j.subject, html: j.html, from: j.from }))
  );

  let sent = 0, failed = 0;
  const allResults: SendResult[] = [];

  for (let i = 0; i < messages.length; i += concurrency) {
    const chunk   = messages.slice(i, i + concurrency);
    const settled = await Promise.allSettled(chunk.map(sendSingleEmail));

    for (const r of settled) {
      if (r.status === "fulfilled") {
        allResults.push(r.value);
        if (r.value.ok) sent++; else failed++;
      } else {
        // Promise itself rejected (should not happen — sendSingleEmail catches internally)
        const errMsg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        allResults.push({ ok: false, to: "unknown", error: errMsg, errorCategory: "provider_error", isTransient: true });
        failed++;
      }
    }

    // Rate-limit-safe pause between batches (skip after last chunk)
    if (i + concurrency < messages.length && interBatchDelayMs > 0) {
      await new Promise(r => setTimeout(r, interBatchDelayMs));
    }
  }

  const failedByCategory = allResults
    .filter(r => !r.ok)
    .reduce<Record<string, number>>((acc, r) => {
      const cat = r.errorCategory ?? "unknown";
      acc[cat] = (acc[cat] ?? 0) + 1;
      return acc;
    }, {});

  console.log(JSON.stringify({
    ts:      new Date().toISOString(),
    level:   "info",
    service: "email-service/batch",
    msg:     "Batch email complete",
    total:   messages.length,
    sent,
    failed,
    failedByCategory,
  }));

  return { sent, failed, results: allResults };
}
