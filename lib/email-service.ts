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

// ── Resend fallback ───────────────────────────────────────────────────────────
// Used when SES is unavailable or in Sandbox (which rejects unverified addresses).
// Requires RESEND_API_KEY env var. Once SES production access is approved and
// all users can receive SES emails, this fallback becomes a no-op.

async function sendViaResend(msg: EmailMessage, from: string): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, to: msg.to, error: "Resend not configured" };
  try {
    const res  = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html }),
    });
    const data = await res.json().catch(() => ({})) as { message?: string };
    if (!res.ok) {
      console.error(`[Resend] fallback failed to=${msg.to}:`, data.message ?? res.status);
      return { ok: false, to: msg.to, error: data.message ?? String(res.status) };
    }
    console.log(`[Resend] fallback sent to=${msg.to} subject="${msg.subject}"`);
    return { ok: true, to: msg.to };
  } catch (e: unknown) {
    return { ok: false, to: msg.to, error: String(e) };
  }
}

// ── Core send ─────────────────────────────────────────────────────────────────
// Tries SES first. If SES fails (e.g. Sandbox rejects unverified address,
// credentials wrong, or region misconfigured) falls back to Resend automatically.

export async function sendSingleEmail(msg: EmailMessage): Promise<SendResult> {
  const from = msg.from ?? defaultFrom();

  // Try SES if credentials are configured
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
      await getClient().send(new SendEmailCommand(input));
      console.log(`[SES] sent to=${msg.to} subject="${msg.subject}"`);
      return { ok: true, to: msg.to };
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e);
      console.error(`[SES] failed to=${msg.to} — falling back to Resend. Error: ${err}`);
      // Fall through to Resend below
    }
  } else {
    console.warn(`[SES] AWS_SES_ACCESS_KEY_ID not set — trying Resend fallback for: ${msg.subject}`);
  }

  // Resend fallback (covers SES Sandbox, missing credentials, region issues)
  return sendViaResend(msg, from);
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
