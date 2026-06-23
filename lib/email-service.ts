/**
 * EmailService — provider-agnostic email abstraction.
 *
 * Current provider: Amazon SES v2 (@aws-sdk/client-sesv2).
 * To switch providers in the future, update only this file.
 *
 * Required env vars:
 *   AWS_SES_ACCESS_KEY_ID     — IAM user access key (SES:SendEmail permission)
 *   AWS_SES_SECRET_ACCESS_KEY — IAM user secret key
 *   AWS_SES_REGION            — e.g. ap-south-1 or us-east-1
 *   AWS_SES_FROM_EMAIL        — verified sender address, e.g. Connected Steps <info@connectedsteps.in>
 *
 * Backward-compat alias:
 *   RESEND_FROM_EMAIL         — used as FROM if AWS_SES_FROM_EMAIL is not set
 */

import {
  SESv2Client,
  SendEmailCommand,
  type SendEmailCommandInput,
} from "@aws-sdk/client-sesv2";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EmailMessage {
  to:       string;          // single recipient address
  subject:  string;
  html:     string;
  from?:    string;          // override default sender
  replyTo?: string;
}

export interface BatchEmailJob {
  from:    string;
  to:      string[];         // Resend used arrays; we send one email per address
  subject: string;
  html:    string;
}

export interface SendResult {
  ok:      boolean;
  to:      string;
  error?:  string;
}

// ── Lazy SES client ────────────────────────────────────────────────────────────
// Instantiated on first use so build-time missing env vars don't crash the build.

let _client: SESv2Client | null = null;

function getClient(): SESv2Client {
  if (!_client) {
    _client = new SESv2Client({
      region: process.env.AWS_SES_REGION ?? "ap-south-1",
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

// ── Core send ─────────────────────────────────────────────────────────────────

export async function sendSingleEmail(msg: EmailMessage): Promise<SendResult> {
  const from = msg.from ?? defaultFrom();

  if (!process.env.AWS_SES_ACCESS_KEY_ID) {
    console.warn("[SES] AWS_SES_ACCESS_KEY_ID not set — email skipped:", msg.subject);
    return { ok: false, to: msg.to, error: "SES not configured" };
  }

  const input: SendEmailCommandInput = {
    FromEmailAddress: from,
    Destination:      { ToAddresses: [msg.to] },
    ReplyToAddresses: msg.replyTo ? [msg.replyTo] : undefined,
    Content: {
      Simple: {
        Subject: { Data: msg.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: msg.html,                              Charset: "UTF-8" },
          Text: { Data: msg.html.replace(/<[^>]*>/g, " "),    Charset: "UTF-8" },
        },
      },
    },
  };

  try {
    await getClient().send(new SendEmailCommand(input));
    console.log(`[SES] sent to=${msg.to} subject="${msg.subject}"`);
    return { ok: true, to: msg.to };
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    console.error(`[SES] failed to=${msg.to} subject="${msg.subject}":`, err);
    return { ok: false, to: msg.to, error: err };
  }
}

// ── Batch send (parallel, max concurrency 10) ─────────────────────────────────
// Replaces Resend's /emails/batch endpoint.
// SES has per-second rate limits — concurrency cap prevents throttling.

export async function sendBatchEmails(
  jobs:        BatchEmailJob[],
  concurrency = 10,
): Promise<{ sent: number; failed: number }> {
  // Flatten: each job may have multiple recipients
  const messages: EmailMessage[] = jobs.flatMap(j =>
    j.to.map(to => ({ to, subject: j.subject, html: j.html, from: j.from }))
  );

  let sent = 0, failed = 0;

  for (let i = 0; i < messages.length; i += concurrency) {
    const chunk   = messages.slice(i, i + concurrency);
    const results = await Promise.allSettled(chunk.map(sendSingleEmail));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.ok) sent++;
      else failed++;
    }
  }

  console.log(`[SES] batch complete sent=${sent} failed=${failed}`);
  return { sent, failed };
}
