/**
 * Campaign Service — platform-wide email/WhatsApp campaign orchestration.
 *
 * Segment resolution → consent filtering → suppression check →
 * bulk queue into email_queue → parallel send → stats update
 */

import { getSupabaseServer } from "@/lib/supabase-server";
import { sendSingleEmail }    from "@/lib/email-service";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { loadAttachmentsAsBase64, type AttachmentMeta } from "@/lib/email-attachments";

import { APP_URL } from "@/lib/config";
// ── Types ─────────────────────────────────────────────────────────────────────

export interface Recipient {
  email:     string;
  firstName: string;
  lastName:  string;
  phone?:    string;
}

export type SegmentType =
  | "all_users"
  | "premium_members"
  | "free_members"
  | "training_members"
  | "event_registered"
  | "attended_recent"
  | "never_attended"
  | "training_location"
  | "event_category"
  | "waitlisted"
  | "admins"
  | "custom_emails"
  | "custom_phones"
  | "external_contacts_all"    // all active external contacts with consent
  | "external_contact_list";   // specific contact list(s)

export interface SegmentConfig {
  event_ids?:       string[];
  location_ids?:    string[];
  categories?:      string[];
  days?:            number;
  emails?:          string[];
  phones?:          string[];
  contact_list_ids?: string[]; // for external_contact_list segment
  require_consent?: boolean;   // for external segments; default true
}

export interface CampaignResult {
  recipientCount: number;
  batchId:        string;
}

// ── Segment resolution ────────────────────────────────────────────────────────

export async function resolveSegment(
  type: SegmentType,
  config: SegmentConfig,
): Promise<Recipient[]> {
  const db = getSupabaseServer();

  switch (type) {
    case "all_users": {
      const { data } = await db.from("users")
        .select("email, first_name, last_name, phone")
        .eq("is_active", true)
        .neq("role", "admin");
      return toRecipients(data);
    }

    case "training_members": {
      const { data } = await db.from("users")
        .select("email, first_name, last_name, phone")
        .eq("is_active", true);
      if (!data) return [];
      const emails = data.map(u => u.email);
      const { data: mems } = await db.from("memberships")
        .select("user_email")
        .eq("status", "active")
        .in("user_email", emails);
      const activeSet = new Set((mems ?? []).map(m => m.user_email));
      return toRecipients(data.filter(u => activeSet.has(u.email)));
    }

    case "premium_members": {
      const { data: mems } = await db.from("memberships")
        .select("user_email")
        .eq("status", "active")
        .not("expires_at", "is", null);
      if (!mems?.length) return [];
      const emails = [...new Set(mems.map(m => m.user_email))];
      const { data: users } = await db.from("users")
        .select("email, first_name, last_name, phone")
        .in("email", emails)
        .eq("is_active", true);
      return toRecipients(users);
    }

    case "free_members": {
      const { data: mems } = await db.from("memberships")
        .select("user_email").eq("status", "active");
      const memberSet = new Set((mems ?? []).map(m => m.user_email));
      const { data } = await db.from("users")
        .select("email, first_name, last_name, phone")
        .eq("is_active", true);
      return toRecipients((data ?? []).filter(u => !memberSet.has(u.email)));
    }

    case "event_registered": {
      if (!config.event_ids?.length) return [];
      const { data: regs } = await db.from("event_registrations")
        .select("user_email")
        .in("event_id", config.event_ids)
        .not("payment_status", "in", '("cancelled","waitlisted")');
      if (!regs?.length) return [];
      const emails = [...new Set(regs.map(r => r.user_email))];
      const { data: users } = await db.from("users")
        .select("email, first_name, last_name, phone")
        .in("email", emails)
        .eq("is_active", true);
      return toRecipients(users);
    }

    case "attended_recent": {
      const days  = config.days ?? 30;
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      const { data: att } = await db.from("session_attendance")
        .select("user_email")
        .eq("attended", true)
        .gte("check_in_time", since);
      if (!att?.length) return [];
      const emails = [...new Set(att.map(a => a.user_email))];
      const { data: users } = await db.from("users")
        .select("email, first_name, last_name, phone")
        .in("email", emails)
        .eq("is_active", true);
      return toRecipients(users);
    }

    case "never_attended": {
      const { data: att } = await db.from("session_attendance")
        .select("user_email").eq("attended", true);
      const attendedSet = new Set((att ?? []).map(a => a.user_email));
      const { data } = await db.from("users")
        .select("email, first_name, last_name, phone")
        .eq("is_active", true).neq("role", "admin");
      return toRecipients((data ?? []).filter(u => !attendedSet.has(u.email)));
    }

    case "training_location": {
      if (!config.location_ids?.length) return [];
      const { data: att } = await db.from("session_attendance")
        .select("user_email, sessions!inner(location_id)")
        .eq("attended", true)
        .in("sessions.location_id", config.location_ids);
      if (!att?.length) return [];
      const emails = [...new Set(att.map(a => a.user_email))];
      const { data: users } = await db.from("users")
        .select("email, first_name, last_name, phone")
        .in("email", emails).eq("is_active", true);
      return toRecipients(users);
    }

    case "event_category": {
      if (!config.categories?.length) return [];
      const { data: regs } = await db.from("event_registrations")
        .select("user_email")
        .in("distance_category", config.categories);
      if (!regs?.length) return [];
      const emails = [...new Set(regs.map(r => r.user_email))];
      const { data: users } = await db.from("users")
        .select("email, first_name, last_name, phone")
        .in("email", emails).eq("is_active", true);
      return toRecipients(users);
    }

    case "waitlisted": {
      const q = db.from("event_registrations")
        .select("user_email")
        .eq("payment_status", "waitlisted");
      if (config.event_ids?.length) q.in("event_id", config.event_ids);
      const { data: regs } = await q;
      if (!regs?.length) return [];
      const emails = [...new Set(regs.map(r => r.user_email))];
      const { data: users } = await db.from("users")
        .select("email, first_name, last_name, phone")
        .in("email", emails).eq("is_active", true);
      return toRecipients(users);
    }

    case "admins": {
      const { data } = await db.from("users")
        .select("email, first_name, last_name, phone")
        .eq("role", "admin");
      return toRecipients(data);
    }

    case "custom_emails": {
      if (!config.emails?.length) return [];
      const emails = config.emails.map(e => e.trim().toLowerCase()).filter(Boolean);
      const { data: users } = await db.from("users")
        .select("email, first_name, last_name, phone").in("email", emails);
      const found = toRecipients(users);
      const foundSet = new Set(found.map(r => r.email));
      const missing: Recipient[] = emails
        .filter(e => !foundSet.has(e))
        .map(e => ({ email: e, firstName: "Subscriber", lastName: "", phone: "" }));
      return [...found, ...missing];
    }

    case "custom_phones": {
      if (!config.phones?.length) return [];
      const phones = config.phones.map(p => p.trim()).filter(Boolean);
      const { data: users } = await db.from("users")
        .select("email, first_name, last_name, phone").in("phone", phones);
      const found = toRecipients(users);
      const foundPhones = new Set(found.map(r => r.phone ?? ""));
      const missing: Recipient[] = phones
        .filter(p => !foundPhones.has(p))
        .map(p => ({ email: "", firstName: "Subscriber", lastName: "", phone: p }));
      return [...found, ...missing];
    }

    // ── External contacts segments ──────────────────────────────────────────
    case "external_contacts_all": {
      const requireConsent = config.require_consent !== false;
      let q = db.from("external_contacts")
        .select("full_name, email, mobile, whatsapp_number")
        .eq("is_active", true)
        .eq("do_not_contact", false);
      if (requireConsent) q = q.eq("email_consent", true);
      const { data } = await q.limit(100_000);
      return externalToRecipients(data);
    }

    case "external_contact_list": {
      const listIds = config.contact_list_ids ?? [];
      if (!listIds.length) return [];
      const requireConsent = config.require_consent !== false;

      const { data: members } = await db.from("contact_list_members")
        .select("contact_id").in("list_id", listIds);
      const ids = [...new Set((members ?? []).map(m => m.contact_id))];
      if (!ids.length) return [];

      let q = db.from("external_contacts")
        .select("full_name, email, mobile, whatsapp_number")
        .in("id", ids)
        .eq("is_active", true)
        .eq("do_not_contact", false);
      if (requireConsent) q = q.eq("email_consent", true);
      const { data } = await q.limit(100_000);
      return externalToRecipients(data);
    }

    default:
      return [];
  }
}

// ── Consent filter ────────────────────────────────────────────────────────────

// Maps message_type → preference column suffix (null = treat as transactional)
const MSG_PREF: Record<string, string | null> = {
  training_announcement:   "training",
  event_announcement:      "events",
  special_event:           "events",
  community_run:           "community",
  festive_greeting:        "festive",
  birthday_wish:           "birthday",
  sponsor_promotion:       "partners",
  venue_change:            null,
  route_map:               null,
  emergency_notification:  null,
  maintenance_announcement: "marketing",
  general_update:          "marketing",
};

export async function filterByConsent(
  recipients: Recipient[],
  channel:         "email" | "whatsapp",
  messageType:     string,
  isTransactional: boolean,
): Promise<Recipient[]> {
  if (isTransactional) return recipients;

  const db      = getSupabaseServer();
  const emails  = recipients.map(r => r.email).filter(Boolean);
  if (!emails.length) return recipients;

  // 1. Top-level marketing_consent = false → blocked from all marketing
  const { data: noMktConsent } = await db.from("users")
    .select("email")
    .in("email", emails)
    .eq("marketing_consent", false);
  const blocked = new Set((noMktConsent ?? []).map(u => u.email));

  // 2. Email suppression list
  const { data: suppressed } = await db.from("email_suppression")
    .select("email").in("email", emails);
  (suppressed ?? []).forEach(s => blocked.add(s.email));

  // 3. Per-preference opt-out
  const prefSuffix = MSG_PREF[messageType];
  if (prefSuffix) {
    const col = (channel === "email" ? "email_" : "wa_") + prefSuffix;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prefRows } = await (db.from("user_notification_preferences") as any)
      .select(`user_email, ${col}`)
      .in("user_email", emails)
      .eq(col, false) as { data: Array<{ user_email: string }> | null };
    (prefRows ?? []).forEach(p => blocked.add(p.user_email));
  }

  return recipients.filter(r => !blocked.has(r.email));
}

// ── Unsubscribe tokens ────────────────────────────────────────────────────────

export async function bulkGetOrCreateUnsubscribeTokens(
  emails: string[],
): Promise<Map<string, string>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSupabaseServer() as any;

  const { data: existing } = await db.from("email_unsubscribe_tokens")
    .select("user_email, token")
    .in("user_email", emails)
    .eq("channel", "email")
    .is("used_at", null);

  const tokenMap = new Map<string, string>();
  ((existing as Array<{ user_email: string; token: string }>) ?? []).forEach(t => tokenMap.set(t.user_email, t.token));

  const missing = emails.filter(e => !tokenMap.has(e));
  if (missing.length) {
    const { data: newTokens } = await db.from("email_unsubscribe_tokens")
      .insert(missing.map((e: string) => ({ user_email: e, channel: "email" })))
      .select("user_email, token");
    ((newTokens as Array<{ user_email: string; token: string }>) ?? []).forEach(t => tokenMap.set(t.user_email, t.token));
  }

  return tokenMap;
}

// ── Email personalization ─────────────────────────────────────────────────────

function personalise(template: string, r: Recipient, unsubToken?: string): string {
  const full = `${r.firstName} ${r.lastName}`.trim();
  let out = template
    .replace(/\{\{firstName\}\}/gi, r.firstName || "")
    .replace(/\{\{lastName\}\}/gi,  r.lastName  || "")
    .replace(/\{\{fullName\}\}/gi,  full         || "");
  if (unsubToken) {
    const url = `${APP_URL}/unsubscribe?token=${unsubToken}`;
    // Inject unsubscribe footer if not already present
    if (!out.includes("/unsubscribe?token=")) {
      out += `
<div style="margin-top:32px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);text-align:center;font-size:11px;color:#888;">
  You're receiving this because you registered on Connected Steps.
  &nbsp;·&nbsp;
  <a href="${url}" style="color:#888;text-decoration:underline;">Unsubscribe</a>
</div>`;
    }
  }
  return out;
}

// ── Queue campaign emails ─────────────────────────────────────────────────────

export async function queueCampaignEmails(opts: {
  campaignId:      string;
  recipients:      Recipient[];
  subject:         string;
  htmlBody:        string;
  attachments?:    AttachmentMeta[];
  isTransactional: boolean;
  scheduledFor?:   string;
}): Promise<string> {
  const { campaignId, recipients, subject, htmlBody, attachments, isTransactional, scheduledFor } = opts;
  const db      = getSupabaseServer();
  const batchId = crypto.randomUUID();

  const tokenMap = isTransactional
    ? new Map<string, string>()
    : await bulkGetOrCreateUnsubscribeTokens(recipients.map(r => r.email));

  const rows = recipients.map(r => {
    const token = tokenMap.get(r.email);
    const html  = personalise(htmlBody, r, token);
    return {
      batch_id:        batchId,
      campaign_id:     campaignId,
      recipient_email: r.email,
      recipient_name:  `${r.firstName} ${r.lastName}`.trim() || r.email,
      subject:         personalise(subject, r),
      html_body:       html,
      status:          "queued" as const,
      provider:        "zeptomail" as const,
      attachments:     (attachments ?? []).map(a => ({ name: a.name, mime_type: a.mime_type, size: a.size, path: a.path })),
      scheduled_for:   scheduledFor ?? null,
    };
  });

  // Insert in chunks to avoid hitting Supabase row limit per request
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db.from("email_queue").insert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(`Failed to queue emails (chunk ${i}): ${error.message}`);
  }

  return batchId;
}

// ── Parallel campaign batch processor ────────────────────────────────────────

const CONCURRENCY   = 10;
const INTER_BATCH_MS = 100;
const MAX_ATTEMPTS  = 3;

export async function processCampaignBatch(batchId: string): Promise<void> {
  const db = getSupabaseServer();

  // Fetch only queued rows — safe to re-run if interrupted; rows already
  // processed are 'delivered'/'failed' and are not returned here.
  const { data: rows } = await db.from("email_queue")
    .select("id, recipient_email, recipient_name, subject, html_body, attachments, attempts")
    .eq("batch_id", batchId)
    .eq("status", "queued")
    .order("created_at");

  if (!rows?.length) {
    await refreshCampaignStats(batchId);
    return;
  }

  // Claim one chunk at a time rather than bulk-claiming the full batch.
  // If the function times out mid-run, only the in-flight chunk (max CONCURRENCY rows)
  // is left at 'sending'. All unprocessed rows stay at 'queued' and are picked
  // up on the next call, making the processor safely re-entrant.
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const chunk = rows.slice(i, i + CONCURRENCY);
    const ids   = chunk.map(r => r.id);

    // Claim this chunk only
    await db.from("email_queue")
      .update({ status: "sending" })
      .in("id", ids)
      .eq("status", "queued");

    await Promise.allSettled(chunk.map(row => sendOne(db, row)));
    if (i + CONCURRENCY < rows.length) {
      await delay(INTER_BATCH_MS);
    }
  }

  // Refresh campaign stats
  await refreshCampaignStats(batchId);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function sendOne(db: ReturnType<typeof getSupabaseServer>, row: {
  id: string;
  recipient_email: string;
  recipient_name: string;
  subject: string;
  html_body: string;
  attachments: AttachmentMeta[];
  attempts: number;
}) {
  const attachments = row.attachments?.length
    ? await loadAttachmentsAsBase64(row.attachments as AttachmentMeta[])
    : [];

  const result = await sendSingleEmail({
    to:          row.recipient_email,
    subject:     row.subject,
    html:        row.html_body,
    attachments,
    listUnsubscribeUrl: undefined,
  });

  const attempts    = row.attempts + 1;
  const willRetry   = !result.ok && result.isTransient === true && attempts < MAX_ATTEMPTS;
  const finalStatus = result.ok ? "delivered" : willRetry ? "queued" : "failed";

  await db.from("email_queue").update({
    status:          finalStatus,
    attempts,
    aws_message_id:  result.messageId ?? null,
    failure_reason:  result.error     ?? null,
    failure_code:    result.errorCategory ?? null,
    is_permanent:    !result.ok && !result.isTransient,
    provider:        "zeptomail",
    http_status:     result.httpStatus ?? null,
    sent_at:         result.ok ? new Date().toISOString() : null,
  }).eq("id", row.id);
}

async function refreshCampaignStats(batchId: string) {
  const db = getSupabaseServer();

  const { data: stats } = await db.from("email_queue")
    .select("status")
    .eq("batch_id", batchId);

  if (!stats) return;

  const counts = stats.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const total     = stats.length;
  const sent      = counts["delivered"] ?? 0;
  const failed    = counts["failed"]    ?? 0;
  const queued    = counts["queued"]    ?? 0;
  const allDone   = queued === 0 && (counts["sending"] ?? 0) === 0;

  const { data: campaign } = await db.from("communication_campaigns")
    .select("id").eq("batch_id", batchId).maybeSingle();
  if (!campaign) return;

  await db.from("communication_campaigns").update({
    sent_count:      sent,
    failed_count:    failed,
    queued_count:    queued,
    recipient_count: total,
    status:          allDone ? (failed === total ? "failed" : "sent") : "sending",
    sent_at:         allDone ? new Date().toISOString() : null,
  }).eq("id", campaign.id);
}

// ── WhatsApp campaign ─────────────────────────────────────────────────────────

export async function sendCampaignWhatsApp(opts: {
  campaignId:     string;
  recipients:     Recipient[];
  templateName:   string;
  templateParams: string[];
}): Promise<{ sent: number; failed: number }> {
  const { campaignId, recipients, templateName, templateParams } = opts;
  const db = getSupabaseServer();

  let sent = 0; let failed = 0;
  const withPhone = recipients.filter(r => r.phone);

  await Promise.allSettled(withPhone.map(async r => {
    const params = templateParams.map(p =>
      p.replace(/\{\{firstName\}\}/gi, r.firstName || "")
       .replace(/\{\{lastName\}\}/gi,  r.lastName  || "")
       .replace(/\{\{fullName\}\}/gi,  `${r.firstName} ${r.lastName}`.trim())
    );
    const res = await sendWhatsAppTemplate(r.phone!, templateName, params);
    await db.from("wa_message_log").insert({
      phone:         r.phone,
      user_email:    r.email || null,
      message_id:    res.messageId ?? null,
      template_name: templateName,
      purpose:       "campaign",
      campaign_id:   campaignId,
      status:        res.ok ? "sent" : "failed",
      failure_reason: res.ok ? null : res.error,
    });
    if (res.ok) sent++; else failed++;
  }));

  await db.from("communication_campaigns").update({
    sent_count:   sent,
    failed_count: failed,
    status:       "sent",
    sent_at:      new Date().toISOString(),
  }).eq("id", campaignId);

  return { sent, failed };
}

// ── Consent record ────────────────────────────────────────────────────────────

export async function recordConsent(opts: {
  userEmail:              string;
  action:                 "initial" | "opt_in" | "opt_out" | "partial_update";
  preferencesSnapshot?:   Record<string, unknown>;
  source:                 "registration" | "profile" | "unsubscribe_link" | "admin" | "import";
  ipAddress?:             string;
}): Promise<void> {
  const db = getSupabaseServer();
  await db.from("user_consent_records").insert({
    user_email:            opts.userEmail,
    action:                opts.action,
    preferences_snapshot:  opts.preferencesSnapshot ?? null,
    source:                opts.source,
    ip_address:            opts.ipAddress ?? null,
    privacy_policy_version: "1.0",
    terms_version:         "1.0",
  });
}

// ── Utility ───────────────────────────────────────────────────────────────────

function externalToRecipients(
  rows: Array<{ full_name?: string | null; email?: string | null; mobile?: string | null; whatsapp_number?: string | null }> | null,
): Recipient[] {
  return (rows ?? []).map(r => {
    const parts = (r.full_name ?? "Contact").split(" ");
    return {
      email:     r.email     ?? "",
      firstName: parts[0]   ?? "",
      lastName:  parts.slice(1).join(" ") ?? "",
      phone:     r.mobile   ?? r.whatsapp_number ?? "",
    };
  });
}

function toRecipients(
  rows: Array<{ email: string; first_name?: string | null; last_name?: string | null; phone?: string | null }> | null,
): Recipient[] {
  return (rows ?? []).map(r => ({
    email:     r.email,
    firstName: r.first_name  ?? "",
    lastName:  r.last_name   ?? "",
    phone:     r.phone       ?? "",
  }));
}

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}
