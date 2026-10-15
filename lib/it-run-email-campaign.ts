/**
 * IT Run email campaigns: event updates and confirmation resends, recorded one row per recipient in the existing
 * email queue (public.email_queue). The queue is the only record of what was sent: a row is 'accepted' when the
 * provider took it and 'delivered' only when the provider's delivery event says so.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/notify";
import { isValidEmail } from "@/lib/it-run-validation";
import { emailWrapper, emailHeader, emailFooter } from "@/lib/email/layout";
import { escapeHtml } from "@/lib/it-run-verification";

export type EmailType = "event_update" | "confirmation_resend";
export const MAX_ATTEMPTS = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RecipientFilter {
  /** Only runners in these categories. Empty or missing means every category. */
  categoryIds?: string[];
  /** Only registrations with these payment statuses. Empty or missing means every status. */
  paymentStatuses?: string[];
  /** Registrations made on or after this date (YYYY-MM-DD, IST) */
  registeredFrom?: string;
  /** Registrations made on or before this date (YYYY-MM-DD, IST) */
  registeredTo?: string;
  /** Only these runners (chosen by hand) */
  participantIds?: string[];
}

export interface Recipient {
  participantId: string;
  registrationId: string;
  email: string;
  name: string;
  categoryId: string | null;
}

export interface RecipientSelection {
  recipients: Recipient[];
  /** Runners left out because they have no usable email address */
  excludedInvalid: number;
  /** Runners left out because the same address is already selected */
  excludedDuplicate: number;
}

export interface EventRunnerRow {
  id: string;
  registration_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  category_id: string | null;
  event_id: string;
  registration_category_id: string;
  payment_status: string;
  registration_status: string;
  created_at: string;
}

/** Keeps the runners that match the filter. The rows must already belong to one event. */
export function selectRecipients(rows: EventRunnerRow[], filter: RecipientFilter): RecipientSelection {
  const categories = new Set(filter.categoryIds ?? []);
  const statuses = new Set(filter.paymentStatuses ?? []);
  const people = new Set(filter.participantIds ?? []);
  const from = filter.registeredFrom ?? "";
  const to = filter.registeredTo ?? "";
  const recipients: Recipient[] = [];
  const seen = new Set<string>();
  let excludedInvalid = 0;
  let excludedDuplicate = 0;

  for (const row of rows) {
    if (row.registration_status === "cancelled") continue;
    const categoryId = row.category_id ?? row.registration_category_id;
    if (categories.size > 0 && !categories.has(categoryId)) continue;
    if (statuses.size > 0 && !statuses.has(row.payment_status)) continue;
    if (people.size > 0 && !people.has(row.id)) continue;
    const day = row.created_at.slice(0, 10);
    if (from && day < from) continue;
    if (to && day > to) continue;

    if (!isValidEmail(row.email)) { excludedInvalid++; continue; }
    const email = (row.email as string).trim().toLowerCase();
    if (seen.has(email)) { excludedDuplicate++; continue; }
    seen.add(email);
    recipients.push({
      participantId: row.id,
      registrationId: row.registration_id,
      email,
      name: `${row.first_name} ${row.last_name}`.trim(),
      categoryId,
    });
  }
  return { recipients, excludedInvalid, excludedDuplicate };
}

/** Every runner in one event, with the registration fields the filter needs. The event scope is applied here. */
export async function loadEventRunners(db: SupabaseClient, eventId: string): Promise<EventRunnerRow[]> {
  const { data, error } = await db
    .from("it_run_participants")
    .select("id, registration_id, first_name, last_name, email, category_id, it_run_registrations!inner(event_id, category_id, payment_status, registration_status, created_at)")
    .eq("it_run_registrations.event_id", eventId)
    .returns<Array<Record<string, unknown>>>();
  if (error) throw new Error("runners could not be loaded");
  return (data ?? []).map(row => {
    const reg = row.it_run_registrations as { event_id: string; category_id: string; payment_status: string; registration_status: string; created_at: string };
    return {
      id: row.id as string,
      registration_id: row.registration_id as string,
      first_name: row.first_name as string,
      last_name: row.last_name as string,
      email: (row.email as string | null) ?? null,
      category_id: (row.category_id as string | null) ?? null,
      event_id: reg.event_id,
      registration_category_id: reg.category_id,
      payment_status: reg.payment_status,
      registration_status: reg.registration_status,
      created_at: reg.created_at,
    };
  })
    // The event scope is checked here as well as in the query: a runner of another event is never returned
    .filter(row => row.event_id === eventId);
}

/** The event update email for one recipient. The body is already sanitised HTML. */
export function buildEventUpdateHtml(name: string, bodyHtml: string): string {
  const body = `
    <p style="margin:0 0 14px;">Hi ${escapeHtml(name)},</p>
    ${bodyHtml}`;
  return emailWrapper(
    emailHeader() +
    `<tr><td style="padding:32px 40px;font-size:15px;color:#222;line-height:1.6;">${body}</td></tr>` +
    emailFooter(),
  );
}

export interface QueueResult {
  status: "queued" | "already_queued";
  count: number;
}

/**
 * Queues one email per recipient under a batch. The batch id comes from the admin's form, so a repeated submit (a double
 * click, a refresh) is refused by the database and reports the batch as already queued.
 */
export async function queueBatch(
  db: SupabaseClient,
  args: {
    batchId: string;
    eventId: string;
    emailType: EmailType;
    subject: string;
    recipients: Array<{ email: string; name: string; registrationId: string; participantId: string; html: string }>;
    createdBy: string;
  },
): Promise<QueueResult> {
  if (!UUID.test(args.batchId)) throw new Error("invalid batch id");
  if (args.recipients.length === 0) return { status: "queued", count: 0 };
  const rows = args.recipients.map(r => ({
    batch_id: args.batchId,
    event_id: args.eventId,
    recipient_email: r.email,
    recipient_name: r.name,
    subject: args.subject,
    html_body: r.html,
    status: "queued",
    attempts: 0,
    registration_id: r.registrationId,
    participant_id: r.participantId,
    email_type: args.emailType,
    created_by: args.createdBy,
  }));
  const { error } = await db.from("email_queue").insert(rows);
  if (error) {
    // 23505: the database already holds this batch for one of these recipients
    if (error.code === "23505") {
      const existing = await batchSummary(db, args.batchId);
      return { status: "already_queued", count: existing.total };
    }
    throw new Error("the batch could not be queued");
  }
  return { status: "queued", count: rows.length };
}

/** Keeps a provider error safe to store: no addresses, no message body, short. */
export function safeFailureText(text: string | undefined): string {
  return (text ?? "unknown error")
    .replace(/[^\s@]+@[^\s@]+/g, "[address]")
    .slice(0, 200);
}

function isPermanentFailure(httpStatus: number | undefined, text: string): boolean {
  // Bad requests and invalid recipients are not worth retrying
  if (httpStatus === 400 || httpStatus === 422) return true;
  return /invalid (email|address|recipient)|does not exist|no such user/i.test(text);
}

export interface ProcessResult {
  attempted: number;
  accepted: number;
  failed: number;
}

/**
 * Sends the queued emails of one batch, a bounded number at a time. A row is claimed before it is sent, so two
 * concurrent runs cannot send the same row twice. A row becomes 'accepted' only when the provider returns a message id.
 */
export async function processBatch(
  db: SupabaseClient,
  batchId: string,
  opts: { limit?: number; delayMs?: number; send?: typeof sendEmail } = {},
): Promise<ProcessResult> {
  const limit = Math.min(opts.limit ?? 25, 50);
  const delayMs = opts.delayMs ?? 150;
  const send = opts.send ?? sendEmail;
  const { data: rows, error } = await db
    .from("email_queue")
    .select("id, recipient_email, recipient_name, subject, html_body, email_type, attempts")
    .eq("batch_id", batchId)
    .eq("status", "queued")
    .not("email_type", "is", null)
    .order("created_at")
    .limit(limit)
    .returns<Array<{ id: string; recipient_email: string; recipient_name: string | null; subject: string; html_body: string | null; email_type: EmailType; attempts: number }>>();
  if (error) throw new Error("the batch could not be read");

  const result: ProcessResult = { attempted: 0, accepted: 0, failed: 0 };
  for (const row of rows ?? []) {
    // Claim the row first: only the request that changes queued to sending sends it
    const { data: claimed } = await db
      .from("email_queue")
      .update({ status: "sending", attempts: row.attempts + 1, last_attempt_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "queued")
      .select("id")
      .returns<Array<{ id: string }>>();
    if (!claimed?.length || !row.html_body) continue;
    result.attempted++;

    const sent = await send(
      row.recipient_email,
      row.recipient_name ?? "",
      row.subject,
      row.html_body,
      false,
      row.email_type === "confirmation_resend",
    );
    if (sent.ok && sent.messageId) {
      // Accepted by the provider. Delivery is only recorded later by the provider's delivery event.
      await db.from("email_queue").update({
        status: "accepted", aws_message_id: sent.messageId, sent_at: new Date().toISOString(),
        provider: sent.provider ?? null, http_status: sent.httpStatus ?? null,
        failure_reason: null, failure_code: null, is_permanent: null,
        // The content is not kept once the provider has it
        html_body: null,
      }).eq("id", row.id);
      result.accepted++;
    } else {
      const text = safeFailureText(sent.error ?? (sent.ok ? "provider returned no message id" : undefined));
      const permanent = isPermanentFailure(sent.httpStatus, text);
      await db.from("email_queue").update({
        status: "failed", failure_reason: text,
        failure_code: sent.httpStatus ? `http_${sent.httpStatus}` : "no_provider_id",
        is_permanent: permanent, provider: sent.provider ?? null, http_status: sent.httpStatus ?? null,
      }).eq("id", row.id);
      result.failed++;
    }
    if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return result;
}

/** Puts failed, retryable rows back in the queue. Permanent failures and rows at the attempt limit are not retried. */
export async function requeueRetryable(db: SupabaseClient, batchId: string): Promise<number> {
  const { data, error } = await db
    .from("email_queue")
    .update({ status: "queued" })
    .eq("batch_id", batchId)
    .eq("status", "failed")
    .or("is_permanent.is.null,is_permanent.eq.false")
    .lt("attempts", MAX_ATTEMPTS)
    .select("id")
    .returns<Array<{ id: string }>>();
  if (error) throw new Error("failed emails could not be requeued");
  return data?.length ?? 0;
}

export interface BatchSummary {
  total: number;
  queued: number;
  sending: number;
  accepted: number;
  delivered: number;
  bounced: number;
  failed: number;
  retryable: number;
  subject: string | null;
  createdBy: string | null;
  createdAt: string | null;
  emailType: string | null;
}

/** Counts per status for one batch. Holds no addresses and no message content. */
export async function batchSummary(db: SupabaseClient, batchId: string): Promise<BatchSummary> {
  const { data } = await db
    .from("email_queue")
    .select("status, is_permanent, attempts, subject, created_by, created_at, email_type, delivered_at")
    .eq("batch_id", batchId)
    .not("email_type", "is", null)
    .returns<Array<{ status: string; is_permanent: boolean | null; attempts: number; subject: string; created_by: string | null; created_at: string; email_type: string; delivered_at: string | null }>>();
  const rows = data ?? [];
  const summary: BatchSummary = {
    total: rows.length, queued: 0, sending: 0, accepted: 0, delivered: 0, bounced: 0, failed: 0, retryable: 0,
    subject: rows[0]?.subject ?? null, createdBy: rows[0]?.created_by ?? null,
    createdAt: rows.length ? rows.map(r => r.created_at).sort()[0] : null, emailType: rows[0]?.email_type ?? null,
  };
  for (const r of rows) {
    if (r.status in summary) (summary as unknown as Record<string, number>)[r.status]++;
    // The provider's delivery event sets delivered_at (see the ZeptoMail webhook); it does not change the status
    if (r.delivered_at) summary.delivered++;
    if (r.status === "failed" && !r.is_permanent && r.attempts < MAX_ATTEMPTS) summary.retryable++;
  }
  return summary;
}
