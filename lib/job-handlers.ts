/**
 * Job handler implementations.
 *
 * Rules for every handler:
 *   • MUST be idempotent — safe to call more than once with the same payload
 *   • MUST throw on transient failures so the worker retries the job
 *   • MUST return cleanly (not throw) when the work was already done
 */

import { createAndSendInvoice }                       from "@/lib/invoice-service";
import { signEventQR }                                from "@/lib/event-qr";
import { sendEmail, eventRegistrationEmailHTML,
         paymentEmailHTML }                           from "@/lib/notify";
import { processReferral }                            from "@/lib/referrals";
import { getSupabaseServer }                          from "@/lib/supabase-server";
import type { JobPayloads }                           from "@/lib/job-queue";

// ── invoice_generate ──────────────────────────────────────────────────────────
// createAndSendInvoice() is already idempotent: it returns the existing invoice
// when paymentId / registrationId already has one.

export async function handleInvoiceGenerate(p: JobPayloads["invoice_generate"]): Promise<void> {
  const invoice = await createAndSendInvoice({
    userEmail:       p.userEmail,
    userName:        p.userName,
    userPhone:       p.userPhone,
    productName:     p.productName,
    productType:     p.productType,
    totalPaidRupees: p.totalPaidRupees,
    paymentId:       p.paymentId,
    orderId:         p.orderId,
    registrationId:  p.registrationId,
    membershipId:    p.membershipId,
    eventId:         p.eventId,
    eventDate:       p.eventDate,
    eventVenue:      p.eventVenue,
  });
  // null means a transient failure (storage upload, SES error, etc.) — retry
  if (!invoice) throw new Error("createAndSendInvoice returned null — transient failure");
}

// ── event_qr_email ────────────────────────────────────────────────────────────
// Idempotency: confirmation_email_sent_at column. If already set → skip.
// QR token: reuse if already written to the row.

export async function handleEventQrEmail(p: JobPayloads["event_qr_email"]): Promise<void> {
  const db = getSupabaseServer();

  const { data: reg } = await db
    .from("event_registrations")
    .select("qr_token, confirmation_email_sent_at")
    .eq("id", p.registrationId)
    .maybeSingle();

  if (reg?.confirmation_email_sent_at) {
    console.log(`[handleEventQrEmail] already sent for reg=${p.registrationId} — skipping`);
    return;  // already delivered — idempotency guard
  }

  // Reuse existing QR token or sign a new one
  let qrToken = (reg?.qr_token as string | null) ?? null;
  if (!qrToken) {
    qrToken = signEventQR(p.registrationCode, p.eventId);
    await db
      .from("event_registrations")
      .update({ qr_token: qrToken, qr_generated_at: new Date().toISOString() })
      .eq("id", p.registrationId);
    console.log(`[handleEventQrEmail] QR generated reg=${p.registrationId}`);
  }

  const html = eventRegistrationEmailHTML({
    name:             p.userName,
    eventTitle:       p.eventTitle,
    startDate:        p.startDate,
    startTime:        p.startTime,
    location:         p.location,
    registrationCode: p.registrationCode,
    distanceCategory: p.distanceCategory,
    qrToken,
  });

  const result = await sendEmail(
    p.userEmail, p.userName,
    `Event Registration Confirmed – ${p.eventTitle}`,
    html,
    false, true,  // isOtp=false, isTransactional=true — never suppressed
  );

  if (!result.ok) {
    // Record failure in DB so admins can see it and trigger resend
    await db.from("event_registrations").update({
      email_status: "failed",
    }).eq("id", p.registrationId);

    console.error(`[handleEventQrEmail] SES failed reg=${p.registrationId} error="${result.error}" provider=${result.provider}`);
    throw new Error(`SES delivery failed: ${result.error ?? "unknown"}`);
  }

  // Mark as sent — save SES message ID and QR timestamp for full traceability
  await db.from("event_registrations").update({
    confirmation_email_sent_at: new Date().toISOString(),
    email_status:               "sent",
    email_ses_message_id:       result.messageId ?? null,
    qr_generated_at:            new Date().toISOString(),
  }).eq("id", p.registrationId);

  console.log(`[handleEventQrEmail] ✅ email sent reg=${p.registrationId} to=${p.userEmail} msgId=${result.messageId} provider=${result.provider}`);
}

// ── membership_email ──────────────────────────────────────────────────────────
// The idempotency_key on the job row prevents this job from being created
// twice, so double-delivery only happens if SES acks but completeJob() fails —
// an extremely rare edge case that produces one harmless duplicate email.

export async function handleMembershipEmail(p: JobPayloads["membership_email"]): Promise<void> {
  const result = await sendEmail(
    p.userEmail, p.userName,
    "Membership Confirmed – Connected Steps",
    paymentEmailHTML(p.userName, p.planLabel, p.amountINR, p.expiresAt),
    false, true,  // isTransactional
  );
  if (!result.ok) throw new Error(`Membership email failed: ${result.error ?? "unknown"}`);
}

// ── referral_reward ───────────────────────────────────────────────────────────
// processReferral() is idempotent via the UNIQUE(referred_email) constraint on
// the referrals table — a duplicate insert returns code 23505 and is skipped.

export async function handleReferralReward(p: JobPayloads["referral_reward"]): Promise<void> {
  await processReferral(p.referralCode, p.referredEmail, p.referredFirstName);
}

// ── weekly_digest_email ───────────────────────────────────────────────────────
// Stub — the weekly-digest cron already handles batching and personalisation.
// This handler enables targeted re-delivery of one user's digest via the queue.
// Full implementation: pass pre-rendered HTML in the payload.

export async function handleWeeklyDigestEmail(p: JobPayloads["weekly_digest_email"]): Promise<void> {
  console.log(`[job-worker] weekly_digest_email stub — user=${p.userEmail}`);
}

// ── bulk_email ────────────────────────────────────────────────────────────────
// One email per job. Idempotency_key = bulk_email:{campaignId}:{to} ensures
// each recipient gets exactly one email per campaign even if backfill reruns.

export async function handleBulkEmail(p: JobPayloads["bulk_email"]): Promise<void> {
  const result = await sendEmail(p.to, p.toName, p.subject, p.html, false, false);
  if (!result.ok) throw new Error(`Bulk email to ${p.to} failed: ${result.error ?? "unknown"}`);
}

// ── bulk_invoice ──────────────────────────────────────────────────────────────
// One invoice per job. createAndSendInvoice() is idempotent by paymentId /
// registrationId — safe if the admin re-runs the backfill.

export async function handleBulkInvoice(p: JobPayloads["bulk_invoice"]): Promise<void> {
  const invoice = await createAndSendInvoice({
    userEmail:       p.userEmail,
    userName:        p.userName,
    productName:     p.productName,
    productType:     p.productType,
    totalPaidRupees: p.totalPaidRupees,
    paymentId:       p.paymentId,
    orderId:         p.orderId,
    registrationId:  p.registrationId,
    eventId:         p.eventId,
    eventDate:       p.eventDate,
    eventVenue:      p.eventVenue,
  });
  if (!invoice) throw new Error("Bulk invoice generation returned null — transient failure");
}

// ── certificate_generate ──────────────────────────────────────────────────────
// Not yet implemented. Handler is a clean no-op so the job completes without
// filling the dead-letter queue.

export async function handleCertificateGenerate(p: JobPayloads["certificate_generate"]): Promise<void> {
  console.log(`[job-worker] certificate_generate not yet implemented — user=${p.userEmail} event=${p.eventId}`);
}

// ── admin_export ──────────────────────────────────────────────────────────────
// Generates CSV (or ZIP of multiple CSVs) from admin datasets, uploads to
// Supabase Storage `admin-exports`, and marks the admin_exports row as ready.
//
// Idempotency: if the export row already has status='ready', skip.
// Scale: fetches data in 1 000-row pages to avoid loading 100 K rows at once.

const EXPORT_BUCKET = "admin-exports";
const BATCH_SIZE    = 1_000;

function buildCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const escape = (v: unknown): string => {
    const s = String(v ?? "").replace(/"/g, '""');
    return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
  };
  const lines = [columns.join(","), ...rows.map(r => columns.map(c => escape(r[c])).join(","))];
  return lines.join("\n");
}

async function fetchAllPages(
  db:      ReturnType<typeof getSupabaseServer>,
  dataset: string,
  filters: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let   from = 0;

  const COLS: Record<string, string> = {
    users:         "email, first_name, last_name, phone, goal, location, created_at, is_active",
    memberships:   "user_email, plan, status, amount_paid, started_at, expires_at, razorpay_payment_id",
    registrations: "registration_code, user_email, user_name, phone, payment_status, final_price, status, created_at",
    referrals:     "referral_code, referrer_email, referred_email, status, reward_granted, created_at, rewarded_at",
  };

  const table = dataset === "registrations" ? "event_registrations" : dataset;
  const cols  = COLS[dataset] ?? "*";

  for (;;) {
    let q = db.from(table).select(cols).order("created_at", { ascending: false }).range(from, from + BATCH_SIZE - 1);

    // Apply filters (event_id for registrations, etc.)
    if (dataset === "registrations" && filters.event_id) {
      q = q.eq("event_id", filters.event_id) as typeof q;
    }

    const { data, error } = await q;
    if (error) throw new Error(`[admin_export] fetch failed: ${error.message}`);
    if (!data?.length) break;
    all.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }

  return all;
}

export async function handleAdminExport(p: JobPayloads["admin_export"]): Promise<void> {
  const db = getSupabaseServer();

  // Idempotency: skip if already completed
  const { data: exportRow } = await db
    .from("admin_exports")
    .select("status")
    .eq("id", p.exportId)
    .single();

  if (exportRow?.status === "ready") return;

  // Mark as processing
  await db.from("admin_exports").update({ status: "processing" }).eq("id", p.exportId);

  try {
    const datasets = p.format === "zip"
      ? ["users", "memberships", "registrations", "referrals"]
      : [p.dataset];

    const COL_HEADERS: Record<string, string[]> = {
      users:         ["email", "first_name", "last_name", "phone", "goal", "location", "created_at", "is_active"],
      memberships:   ["user_email", "plan", "status", "amount_paid", "started_at", "expires_at", "razorpay_payment_id"],
      registrations: ["registration_code", "user_email", "user_name", "phone", "payment_status", "final_price", "status", "created_at"],
      referrals:     ["referral_code", "referrer_email", "referred_email", "status", "reward_granted", "created_at", "rewarded_at"],
    };

    let fileBuffer: Buffer;
    let filePath:   string;
    let rowCount  = 0;

    if (p.format === "csv") {
      const rows = await fetchAllPages(db, p.dataset, p.filters);
      const csv  = buildCsv(rows, COL_HEADERS[p.dataset] ?? []);
      fileBuffer = Buffer.from(csv, "utf-8");
      filePath   = `${p.exportId}/${p.dataset}.csv`;
      rowCount   = rows.length;
    } else {
      // ZIP: bundle all datasets using fflate
      const { zipSync } = await import("fflate");
      const files: Record<string, Uint8Array> = {};
      for (const ds of datasets) {
        const rows = await fetchAllPages(db, ds, p.filters);
        const csv  = buildCsv(rows, COL_HEADERS[ds] ?? []);
        files[`${ds}.csv`] = new TextEncoder().encode(csv);
        rowCount += rows.length;
      }
      fileBuffer = Buffer.from(zipSync(files));
      filePath   = `${p.exportId}/export.zip`;
    }

    // Upload to Supabase Storage (upsert so retries overwrite)
    const { error: uploadErr } = await db.storage
      .from(EXPORT_BUCKET)
      .upload(filePath, fileBuffer, {
        contentType: p.format === "csv" ? "text/csv" : "application/zip",
        upsert:      true,
      });

    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

    await db.from("admin_exports").update({
      status:       "ready",
      file_path:    filePath,
      row_count:    rowCount,
      completed_at: new Date().toISOString(),
    }).eq("id", p.exportId);

    console.log(`[admin_export] ${p.format} ready — exportId=${p.exportId} rows=${rowCount}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("admin_exports").update({ status: "failed", error: msg.slice(0, 500) }).eq("id", p.exportId);
    throw e; // re-throw so job-worker records the failure
  }
}
