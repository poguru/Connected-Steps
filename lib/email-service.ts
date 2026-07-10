/**
 * EmailService — ZeptoMail (Zoho Transactional Email) provider.
 *
 * Required env vars:
 *   ZEPTOMAIL_API_KEY    — API token from ZeptoMail dashboard → Send Mail → API Token
 *   ZEPTOMAIL_FROM_EMAIL — verified sender address, e.g. "info@connectedsteps.in"
 *   ZEPTOMAIL_FROM_NAME  — sender display name (default: "Connected Steps")
 *
 * Endpoint (India region): https://api.zeptomail.in/v1.1/email
 * Auth header:             Authorization: Zoho-enczapikey {API_KEY}
 *
 * Setup checklist before going live:
 *   1. Create account at https://zeptomail.zoho.in
 *   2. Add & verify the "connectedsteps.in" send-mail domain (DNS + DKIM)
 *   3. Copy the API token from Mail Agent → SMTP/API → Send Mail token
 *   4. Set ZEPTOMAIL_API_KEY, ZEPTOMAIL_FROM_EMAIL, ZEPTOMAIL_FROM_NAME in Vercel env vars
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EmailMessage {
  to:       string;
  subject:  string;
  html:     string;
  from?:    string;   // "Name <addr@domain>" or plain address
  replyTo?: string;
  /**
   * When set, adds RFC 2369 List-Unsubscribe headers.
   * Use for bulk / non-transactional emails (digests, reminders).
   * Never set for OTP, QR codes, or payment receipts.
   */
  listUnsubscribeUrl?: string;
}

export interface BatchEmailJob {
  from:                string;
  to:                  string[];
  subject:             string;
  html:                string;
  listUnsubscribeUrl?: string;
}

export type EmailErrorCategory =
  | "rate_limit"      // 429 — back off and retry
  | "invalid_address" // bad recipient — don't retry
  | "auth_error"      // wrong API key — fix config
  | "quota_exceeded"  // plan limit hit
  | "network_error"   // transient — retry
  | "provider_error"; // ZeptoMail API error

export interface SendResult {
  ok:             boolean;
  to:             string;
  error?:         string;
  errorCategory?: EmailErrorCategory;
  messageId?:     string;
  provider?:      "zeptomail";
  httpStatus?:    number;
  isTransient?:   boolean;
}

export interface BatchSendResult {
  sent:    number;
  failed:  number;
  results: SendResult[];
}

// ── Internals ─────────────────────────────────────────────────────────────────

const ZEPTOMAIL_URL = "https://api.zeptomail.in/v1.1/email";

/** Parse "Name <addr>" or plain "addr" into { name, address }. */
function parseFrom(raw: string): { name: string; address: string } {
  const match = raw.match(/^(.+?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].trim(), address: match[2].trim() };
  return { name: "Connected Steps", address: raw.trim() };
}

function defaultFrom(): { name: string; address: string } {
  const email = process.env.ZEPTOMAIL_FROM_EMAIL ?? "info@connectedsteps.in";
  const name  = process.env.ZEPTOMAIL_FROM_NAME  ?? "Connected Steps";
  return { name, address: email };
}

function classifyError(status: number, body: unknown): { category: EmailErrorCategory; isTransient: boolean } {
  if (status === 429) return { category: "rate_limit",      isTransient: true  };
  if (status === 401 || status === 403)
                        return { category: "auth_error",     isTransient: false };

  const msg = JSON.stringify(body).toLowerCase();
  if (msg.includes("invalid") && (msg.includes("address") || msg.includes("email")))
    return { category: "invalid_address", isTransient: false };
  if (msg.includes("quota") || msg.includes("limit") || msg.includes("exceeded"))
    return { category: "quota_exceeded",  isTransient: false };
  if (status >= 500)
    return { category: "provider_error",  isTransient: true  };

  return { category: "provider_error", isTransient: false };
}

function extractError(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;
  if (b.error && typeof b.error === "object") {
    const e = b.error as Record<string, unknown>;
    return `${e.code ?? ""} ${e.message ?? ""}`.trim() || undefined;
  }
  if (typeof b.message === "string" && b.message !== "OK") return b.message;
  return undefined;
}

// ── Core single send ──────────────────────────────────────────────────────────

export async function sendSingleEmail(msg: EmailMessage): Promise<SendResult> {
  const apiKey = process.env.ZEPTOMAIL_API_KEY;
  if (!apiKey) {
    console.error("[ZeptoMail] ZEPTOMAIL_API_KEY not set");
    return {
      ok: false, to: msg.to,
      error: "ZeptoMail not configured — set ZEPTOMAIL_API_KEY in environment variables",
      errorCategory: "provider_error", isTransient: false,
    };
  }

  const { name: fromName, address: fromAddress } = msg.from
    ? parseFrom(msg.from)
    : defaultFrom();

  const textBody = msg.html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  const payload: Record<string, unknown> = {
    from:     { address: fromAddress, name: fromName },
    to:       [{ email_address: { address: msg.to, name: "" } }],
    subject:  msg.subject,
    htmlbody: msg.html,
    textbody: textBody,
  };

  if (msg.listUnsubscribeUrl) {
    payload.mime_headers = {
      "List-Unsubscribe":      `<${msg.listUnsubscribeUrl}>, <mailto:unsubscribe@connectedsteps.in?subject=Unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };
  }

  try {
    const res = await fetch(ZEPTOMAIL_URL, {
      method:  "POST",
      headers: {
        "Authorization": apiKey.startsWith("Zoho-enczapikey ") ? apiKey : `Zoho-enczapikey ${apiKey}`,
        "Content-Type":  "application/json",
        "Accept":        "application/json",
      },
      body: JSON.stringify(payload),
    });

    let data: Record<string, unknown> = {};
    let rawBody = "";
    try {
      rawBody = await res.text();
      data = JSON.parse(rawBody);
    } catch {
      // data stays {}
    }

    if (!res.ok) {
      const { category, isTransient } = classifyError(res.status, data);
      const errMsg = (extractError(data) ?? rawBody) || `HTTP ${res.status}`;
      console.error(`[ZeptoMail] failed to=${msg.to} status=${res.status}: ${errMsg}`);
      return {
        ok: false, to: msg.to,
        error: `ZeptoMail ${res.status}: ${errMsg}`,
        errorCategory: category, httpStatus: res.status,
        isTransient, provider: "zeptomail",
      };
    }

    // Extract request_id from response data array
    const dataArr = (data.data ?? []) as Array<{ request_id?: string }>;
    const messageId = dataArr[0]?.request_id;
    console.log(`[ZeptoMail] sent to=${msg.to} request_id=${messageId}`);
    return { ok: true, to: msg.to, messageId, provider: "zeptomail", httpStatus: res.status };

  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    console.error(`[ZeptoMail] network error to=${msg.to}: ${err}`);
    return {
      ok: false, to: msg.to,
      error: err, errorCategory: "network_error",
      isTransient: true, provider: "zeptomail",
    };
  }
}

// ── Batch send ────────────────────────────────────────────────────────────────
//
// ZeptoMail free plan: 500 emails lifetime; paid plans are usage-based.
// Default: concurrency=5, interBatchDelayMs=200 → ~25 emails/sec — well
// within ZeptoMail's limits on any paid plan.

export async function sendBatchEmails(
  jobs:             BatchEmailJob[],
  concurrency       = 5,
  interBatchDelayMs = 200,
): Promise<BatchSendResult> {
  const messages: EmailMessage[] = jobs.flatMap(j =>
    j.to.map(to => ({
      to,
      subject:            j.subject,
      html:               j.html,
      from:               j.from,
      listUnsubscribeUrl: j.listUnsubscribeUrl,
    }))
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
        const errMsg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        allResults.push({ ok: false, to: "unknown", error: errMsg, errorCategory: "provider_error", isTransient: true });
        failed++;
      }
    }

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
    total:   messages.length, sent, failed, failedByCategory,
  }));

  return { sent, failed, results: allResults };
}
