import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { getCapturedPayment } from "@/lib/razorpay-client";
import { handleEventQrEmail, handleInvoiceGenerate } from "@/lib/job-handlers";
import { enqueueJob } from "@/lib/job-queue";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RegistrationRow {
  id:                string;
  registration_code: string;
  user_email:        string;
  user_name:         string;
  event_id:          string;
  distance_category: string | null;
  final_price:       number | null;
  payment_status:    string;
  razorpay_order_id: string | null;
  slot_expires_at:   string | null;
  events: { title: string; start_date: string; start_time: string | null; location: string } | null;
}

type ReconcileOutcome =
  | "no_order_id"          // registration has no Razorpay order (never reached checkout)
  | "razorpay_api_error"   // could not contact Razorpay
  | "no_payment_found"     // order exists but no payment attempted
  | "payment_pending"      // payment attempted but not captured (e.g. failed / authorized)
  | "already_paid_in_db"   // DB already shows paid (race condition)
  | "dry_run_would_recover" // dry_run=true: Razorpay captured, would recover
  | "recovered"            // successfully recovered
  | "recovery_failed";     // DB update failed

interface ReportRow {
  registration_code:    string;
  user_name:            string;
  user_email:           string;
  event:                string;
  order_id:             string | null;
  razorpay_payment_id:  string | null;
  razorpay_status:      string;
  db_payment_status:    string;
  match:                boolean;
  outcome:              ReconcileOutcome;
  error?:               string;
}

// ── GET /api/admin/events/registrations/reconcile ─────────────────────────────
// Produces a reconciliation report for all (or one event's) pending registrations.
// Query params:
//   event_id  string  optional – limit to one event
//   dry_run   bool    default false – when true, report only, no DB changes

export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp      = req.nextUrl.searchParams;
  const eventId = sp.get("event_id") ?? null;
  const dryRun  = sp.get("dry_run") !== "false";   // default true for GET (read-only)

  return runReconciliation(eventId, dryRun);
}

// ── POST /api/admin/events/registrations/reconcile ────────────────────────────
// Same as GET but defaults to dry_run=false — actually recovers registrations.
// Body: { event_id?: string, dry_run?: boolean }

export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body    = await req.json().catch(() => ({})) as Record<string, unknown>;
  const eventId = (body.event_id as string | null) ?? null;
  const dryRun  = body.dry_run === true;   // default false for POST (actually recovers)

  return runReconciliation(eventId, dryRun);
}

// ── Core reconciliation logic ─────────────────────────────────────────────────

async function runReconciliation(
  eventId: string | null,
  dryRun:  boolean,
): Promise<NextResponse> {
  const db      = getSupabaseServer();
  const startMs = Date.now();

  // Fetch all pending registrations that went through the payment flow
  // (i.e. have a razorpay_order_id — meaning the user reached the checkout).
  let q = db
    .from("event_registrations")
    .select(`
      id, registration_code, user_email, user_name,
      event_id, distance_category, final_price, payment_status,
      razorpay_order_id, slot_expires_at,
      events ( title, start_date, start_time, location )
    `)
    .eq("payment_status", "pending")
    .not("razorpay_order_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(500);

  if (eventId) q = q.eq("event_id", eventId) as typeof q;

  const { data: rows, error: fetchErr } = await q;
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

  const registrations = (rows as unknown as RegistrationRow[]) ?? [];

  const report: ReportRow[] = [];
  let recovered = 0, stillPending = 0, errors = 0;

  console.log(`[reconcile] Starting — ${registrations.length} pending registrations, dry_run=${dryRun}`);

  // ── Parallel Razorpay checks (5 at a time) ────────────────────────────────
  // Sequential was timing out at 16 registrations (1-2s per API call = 30s+).
  // Batching keeps total time under 10s for 16 registrations.
  const BATCH = 5;
  const results: ReportRow[] = [];

  for (let i = 0; i < registrations.length; i += BATCH) {
    const batch = registrations.slice(i, i + BATCH);

    const batchResults = await Promise.all(batch.map(async (reg) => {
      const row: ReportRow = {
        registration_code:   reg.registration_code,
        user_name:           reg.user_name,
        user_email:          reg.user_email,
        event:               reg.events?.title ?? "Unknown Event",
        order_id:            reg.razorpay_order_id,
        razorpay_payment_id: null,
        razorpay_status:     "unknown",
        db_payment_status:   reg.payment_status,
        match:               false,
        outcome:             "razorpay_api_error" as ReconcileOutcome,
      };

      if (!reg.razorpay_order_id) {
        row.outcome = "no_order_id";
        row.razorpay_status = "N/A";
        return { row, outcome: "no_order_id" as const };
      }

      let capturedPayment;
      try {
        capturedPayment = await getCapturedPayment(reg.razorpay_order_id);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[reconcile] Razorpay API error order=${reg.razorpay_order_id}: ${msg}`);
        row.error = msg.slice(0, 200);
        return { row, outcome: "razorpay_api_error" as const };
      }

      if (!capturedPayment) {
        row.razorpay_status = "not_captured";
        row.outcome         = "no_payment_found";
        row.match           = true;
        return { row, outcome: "no_payment_found" as const };
      }

      row.razorpay_payment_id = capturedPayment.id;
      row.razorpay_status     = capturedPayment.status;
      row.match               = false;

      if (dryRun) {
        row.outcome = "dry_run_would_recover";
        return { row, outcome: "dry_run_would_recover" as const, reg, paymentId: capturedPayment.id };
      }

      return { row, outcome: "needs_recovery" as const, reg, paymentId: capturedPayment.id };
    }));

    // Recovery must be sequential to avoid DB race conditions
    for (const item of batchResults) {
      if (item.outcome === "needs_recovery" && item.reg && item.paymentId) {
        const outcome = await recoverRegistration(db, item.reg, item.paymentId);
        item.row.outcome = outcome;
        if (outcome === "recovered") {
          recovered++;
          console.log(`[reconcile] ✅ Recovered ${item.reg.registration_code} — payment ${item.paymentId}`);
        } else if (outcome === "already_paid_in_db") {
          console.log(`[reconcile] ℹ️  ${item.reg.registration_code} already paid`);
        } else {
          errors++;
          console.error(`[reconcile] ❌ Recovery failed ${item.reg.registration_code}: ${outcome}`);
        }
      } else if (item.outcome === "no_order_id" || item.outcome === "no_payment_found") {
        stillPending++;
      } else if (item.outcome === "razorpay_api_error") {
        errors++;
      }
      results.push(item.row);
    }
  }

  report.push(...results);

  const durationMs = Date.now() - startMs;
  console.log(`[reconcile] Done — recovered=${recovered} stillPending=${stillPending} errors=${errors} duration=${durationMs}ms`);

  return NextResponse.json({
    dry_run:       dryRun,
    checked:       registrations.length,
    recovered:     dryRun ? 0 : recovered,
    would_recover: dryRun ? report.filter(r => r.outcome === "dry_run_would_recover").length : 0,
    still_pending: stillPending,
    errors,
    duration_ms:   durationMs,
    report,
  });
}

// ── Recovery: update a single registration ────────────────────────────────────

async function recoverRegistration(
  db:        ReturnType<typeof getSupabaseServer>,
  reg:       RegistrationRow,
  paymentId: string,
): Promise<ReconcileOutcome> {
  // Idempotency: re-check DB before writing in case another process already recovered it
  const { data: fresh } = await db
    .from("event_registrations")
    .select("payment_status")
    .eq("id", reg.id)
    .single();

  if (fresh?.payment_status === "paid") return "already_paid_in_db";

  // ── Update registration to confirmed ─────────────────────────────────────
  const { error: updateErr } = await db
    .from("event_registrations")
    .update({
      payment_status:      "paid",
      status:              "confirmed",
      razorpay_payment_id: paymentId,
    })
    .eq("id", reg.id)
    .eq("payment_status", "pending");  // optimistic lock: only update if still pending

  if (updateErr) {
    console.error(`[reconcile] DB update error for ${reg.registration_code}:`, updateErr.message);
    return "recovery_failed";
  }

  const ev = reg.events;

  // ── Enqueue QR email + invoice (idempotent — safe to call multiple times) ─
  const qrPayload = {
    registrationId:   reg.id,
    registrationCode: reg.registration_code,
    eventId:          reg.event_id,
    userEmail:        reg.user_email,
    userName:         reg.user_name,
    eventTitle:       ev?.title        ?? "Connected Steps Event",
    startDate:        ev?.start_date   ?? "",
    startTime:        ev?.start_time   ?? null,
    location:         ev?.location     ?? "",
    distanceCategory: reg.distance_category,
  };
  const invoicePayload = {
    productType:     "event" as const,
    userEmail:       reg.user_email,
    userName:        reg.user_name,
    productName:     ev?.title ?? "Event Registration",
    totalPaidRupees: (reg.final_price ?? 0),   // final_price stored in rupees
    paymentId:       paymentId,
    orderId:         reg.razorpay_order_id ?? undefined,
    registrationId:  reg.id,
    eventId:         reg.event_id,
    eventDate:       ev?.start_date,
    eventVenue:      ev?.location,
  };

  // Enqueue for durability (daily cron will pick up any that fail immediately)
  await enqueueJob("event_qr_email",   qrPayload,      { idempotencyKey: `event_qr_email:${reg.id}`,             priority: 10 });
  await enqueueJob("invoice_generate", invoicePayload, { idempotencyKey: `invoice_generate:${paymentId}` });

  // Also fire immediately — handleEventQrEmail has idempotency guard inside
  await handleEventQrEmail(qrPayload).catch(e =>
    console.error(`[reconcile] QR email failed for ${reg.registration_code}:`, e)
  );
  await handleInvoiceGenerate(invoicePayload).catch(e =>
    console.error(`[reconcile] Invoice failed for ${reg.registration_code}:`, e)
  );

  return "recovered";
}
