/**
 * Payment reconciliation engine — shared between the admin manual tool
 * (/api/admin/events/registrations/reconcile) and the automatic cron job
 * (/api/cron/payment-reconcile).
 *
 * For every PENDING event registration that reached Razorpay checkout
 * (has a razorpay_order_id), this module:
 *   1. Queries the Razorpay API for actual payment status
 *   2. If captured → recovers the registration (mark paid/confirmed, enqueue
 *      QR email + invoice)
 *   3. If not captured → classifies as genuine abandon / failed
 *   4. Logs every decision
 *
 * All operations are idempotent — safe to run multiple times.
 */

import { getSupabaseServer } from "@/lib/supabase-server";
import { getCapturedPayment } from "@/lib/razorpay-client";
import { handleEventQrEmail, handleInvoiceGenerate } from "@/lib/job-handlers";
import { enqueueJob } from "@/lib/job-queue";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PendingReg {
  id:                string;
  registration_code: string;
  user_email:        string;
  user_name:         string;
  event_id:          string;
  distance_category: string | null;
  final_price:       number | null;
  payment_status:    string;
  razorpay_order_id: string | null;
  events: {
    title:      string;
    start_date: string;
    start_time: string | null;
    location:   string;
  } | null;
}

export type ReconcileOutcome =
  | "no_order_id"          // never reached checkout — genuine abandon
  | "razorpay_api_error"   // could not contact Razorpay API
  | "no_payment_found"     // order exists, no payment made — genuine abandon
  | "payment_failed"       // payment was attempted but failed/declined
  | "already_paid_in_db"   // already recovered by another process
  | "recovered"            // ✅ successfully recovered
  | "recovery_failed";     // DB update failed

export interface ReconcileRow {
  registration_code:   string;
  user_name:           string;
  user_email:          string;
  event:               string;
  order_id:            string | null;
  razorpay_payment_id: string | null;
  razorpay_status:     string;
  db_payment_status:   string;
  match:               boolean;
  outcome:             ReconcileOutcome;
  category:            ReconcileCategory;
  recovered:           boolean;
  error?:              string;
}

export type ReconcileCategory =
  | "genuine_abandon"              // user never completed payment
  | "payment_failed"               // card declined / payment error
  | "successful_not_synced"        // 🚨 paid but DB not updated
  | "api_error"                    // could not verify with Razorpay
  | "already_reconciled"           // was already recovered
  | "unknown";

export interface ReconcileResult {
  checked:       number;
  recovered:     number;
  still_pending: number;
  api_errors:    number;
  duration_ms:   number;
  report:        ReconcileRow[];
  summary: {
    genuine_abandon:       number;
    payment_failed:        number;
    successful_not_synced: number;
    api_errors:            number;
    recovered:             number;
  };
}

// ── Core engine ───────────────────────────────────────────────────────────────

export async function runReconciliation(opts: {
  eventId?:    string;
  dryRun?:     boolean;
  maxBatch?:   number;
  callerLabel: string;  // for logging: "cron" | "admin-manual"
}): Promise<ReconcileResult> {
  const { eventId, dryRun = false, maxBatch = 5, callerLabel } = opts;
  const db      = getSupabaseServer();
  const startMs = Date.now();

  // Fetch all pending registrations that reached Razorpay checkout
  let q = db
    .from("event_registrations")
    .select(`
      id, registration_code, user_email, user_name,
      event_id, distance_category, final_price, payment_status,
      razorpay_order_id,
      events ( title, start_date, start_time, location )
    `)
    .eq("payment_status", "pending")
    .not("razorpay_order_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(500);

  if (eventId) q = q.eq("event_id", eventId) as typeof q;

  const { data: rows, error: fetchErr } = await q;
  if (fetchErr) throw new Error(`[${callerLabel}] DB fetch failed: ${fetchErr.message}`);

  const registrations = (rows as unknown as PendingReg[]) ?? [];
  const report: ReconcileRow[] = [];
  let recovered = 0, stillPending = 0, apiErrors = 0;

  console.log(`[${callerLabel}/reconcile] starting — ${registrations.length} pending, dry_run=${dryRun}`);

  // Process in parallel batches to stay within Razorpay rate limits
  for (let i = 0; i < registrations.length; i += maxBatch) {
    const batch = registrations.slice(i, i + maxBatch);

    const batchChecks = await Promise.all(batch.map(async (reg) => {
      if (!reg.razorpay_order_id) {
        return { reg, captured: null, error: null, skipped: "no_order_id" as const };
      }
      try {
        const captured = await getCapturedPayment(reg.razorpay_order_id);
        return { reg, captured, error: null, skipped: null };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[${callerLabel}/reconcile] Razorpay API error order=${reg.razorpay_order_id}: ${msg}`);
        return { reg, captured: null, error: msg.slice(0, 200), skipped: null };
      }
    }));

    // Process results sequentially to avoid DB race conditions
    for (const check of batchChecks) {
      const { reg, captured, error, skipped } = check;

      const row: ReconcileRow = {
        registration_code:   reg.registration_code,
        user_name:           reg.user_name,
        user_email:          reg.user_email,
        event:               reg.events?.title ?? "Unknown Event",
        order_id:            reg.razorpay_order_id,
        razorpay_payment_id: null,
        razorpay_status:     "unknown",
        db_payment_status:   reg.payment_status,
        match:               false,
        outcome:             "no_order_id",
        category:            "unknown",
        recovered:           false,
      };

      if (skipped === "no_order_id") {
        row.outcome  = "no_order_id";
        row.category = "genuine_abandon";
        row.match    = true;
        stillPending++;
        report.push(row);
        continue;
      }

      if (error) {
        row.outcome  = "razorpay_api_error";
        row.category = "api_error";
        row.error    = error;
        apiErrors++;
        report.push(row);
        continue;
      }

      if (!captured) {
        row.razorpay_status = "not_captured";
        row.outcome         = "no_payment_found";
        row.category        = "genuine_abandon";
        row.match           = true;
        stillPending++;
        report.push(row);
        continue;
      }

      // Payment exists in Razorpay — check its status
      row.razorpay_payment_id = captured.id;
      row.razorpay_status     = captured.status;

      if (captured.status !== "captured") {
        row.outcome  = "payment_failed";
        row.category = "payment_failed";
        row.match    = true;  // DB=pending, Razorpay=failed → both agree it's incomplete
        stillPending++;
        report.push(row);
        continue;
      }

      // 🚨 Razorpay captured but DB still pending — MISMATCH
      row.match    = false;
      row.category = "successful_not_synced";

      if (dryRun) {
        row.outcome = "no_order_id";  // preview only
        report.push(row);
        continue;
      }

      // Recover the registration
      const outcome = await recoverSingle(db, reg, captured.id, callerLabel);
      row.outcome   = outcome;
      row.recovered = outcome === "recovered";

      if (outcome === "recovered") {
        recovered++;
        row.category = "recovered" as unknown as ReconcileCategory;
        console.log(`[${callerLabel}/reconcile] ✅ recovered=${reg.registration_code} payment=${captured.id}`);
      } else if (outcome === "already_paid_in_db") {
        row.category = "already_reconciled";
        row.match    = true;
        console.log(`[${callerLabel}/reconcile] ℹ️  already_paid=${reg.registration_code}`);
      } else {
        apiErrors++;
        console.error(`[${callerLabel}/reconcile] ❌ recovery_failed=${reg.registration_code}`);
      }
      report.push(row);
    }
  }

  const durationMs = Date.now() - startMs;
  const summary = {
    genuine_abandon:       report.filter(r => r.category === "genuine_abandon").length,
    payment_failed:        report.filter(r => r.category === "payment_failed").length,
    successful_not_synced: report.filter(r => r.category === "successful_not_synced").length,
    api_errors:            apiErrors,
    recovered,
  };

  console.log(`[${callerLabel}/reconcile] done in ${durationMs}ms — recovered=${recovered} pending=${stillPending} errors=${apiErrors}`);

  return {
    checked:       registrations.length,
    recovered,
    still_pending: stillPending,
    api_errors:    apiErrors,
    duration_ms:   durationMs,
    report,
    summary,
  };
}

// ── Recovery: update one registration + trigger QR/invoice/email ──────────────

async function recoverSingle(
  db:          ReturnType<typeof getSupabaseServer>,
  reg:         PendingReg,
  paymentId:   string,
  logLabel:    string,
): Promise<ReconcileOutcome> {
  // Idempotency re-check (another process may have recovered concurrently)
  const { data: fresh } = await db
    .from("event_registrations")
    .select("payment_status")
    .eq("id", reg.id)
    .single();

  if (fresh?.payment_status === "paid") return "already_paid_in_db";

  const { error: updateErr } = await db
    .from("event_registrations")
    .update({
      payment_status:      "paid",
      status:              "confirmed",
      razorpay_payment_id: paymentId,
    })
    .eq("id", reg.id)
    .eq("payment_status", "pending");   // optimistic lock

  if (updateErr) {
    console.error(`[${logLabel}/reconcile] DB update failed ${reg.registration_code}:`, updateErr.message);
    return "recovery_failed";
  }

  const ev = reg.events;

  const qrPayload = {
    registrationId:   reg.id,
    registrationCode: reg.registration_code,
    eventId:          reg.event_id,
    userEmail:        reg.user_email,
    userName:         reg.user_name,
    eventTitle:       ev?.title      ?? "Connected Steps Event",
    startDate:        ev?.start_date ?? "",
    startTime:        ev?.start_time ?? null,
    location:         ev?.location   ?? "",
    distanceCategory: reg.distance_category,
  };

  const invoicePayload = {
    productType:     "event" as const,
    userEmail:       reg.user_email,
    userName:        reg.user_name,
    productName:     ev?.title ?? "Event Registration",
    totalPaidRupees: reg.final_price ?? 0,
    paymentId,
    orderId:         reg.razorpay_order_id ?? undefined,
    registrationId:  reg.id,
    eventId:         reg.event_id,
    eventDate:       ev?.start_date,
    eventVenue:      ev?.location,
  };

  // Enqueue for durability (survives any immediate-fire failure)
  await enqueueJob("event_qr_email",   qrPayload,      { idempotencyKey: `event_qr_email:${reg.id}`,            priority: 10 });
  await enqueueJob("invoice_generate", invoicePayload, { idempotencyKey: `invoice_generate:${paymentId}` });

  // Fire immediately — don't wait for the daily cron
  await handleEventQrEmail(qrPayload).catch(e =>
    console.error(`[${logLabel}/reconcile] QR email failed ${reg.registration_code}:`, e)
  );
  await handleInvoiceGenerate(invoicePayload).catch(e =>
    console.error(`[${logLabel}/reconcile] Invoice failed ${reg.registration_code}:`, e)
  );

  return "recovered";
}
