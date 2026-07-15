import { NextRequest, NextResponse }      from "next/server";
import { runReconciliation }             from "@/lib/payment-reconcile";
import { runMembershipReconciliation }   from "@/lib/membership-reconcile";

// GET /api/cron/payment-reconcile
// Automatic payment reconciliation — runs on the Vercel Cron schedule.
//
// Scans ALL pending event registrations that have a Razorpay order ID,
// queries Razorpay for the actual payment status, and automatically
// recovers any that were successfully charged but not synced to our DB.
//
// Schedule: daily at 6:30 AM IST (01:00 UTC)
// Auth: CRON_SECRET header (Vercel sets this automatically for cron jobs)
//
// This cron is the safety net for the entire payment pipeline:
//   Razorpay charges user → client app sends verify-payment → DB updated
//
// If step 2 or 3 fails (network loss, app crash, Vercel freeze), this cron
// catches it within 24 hours and ensures the user gets their QR + email.
//
// The Razorpay webhook (already configured) is the primary real-time fix.
// This cron is the secondary daily sweep.

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startMs = Date.now();
  console.log("[cron/payment-reconcile] starting daily sweep");

  try {
    // ── Event registration reconciliation ──────────────────────────────────
    const evResult = await runReconciliation({
      dryRun:      false,
      maxBatch:    5,    // 5 concurrent Razorpay API calls max
      callerLabel: "cron",
    });

    const { checked, recovered, still_pending, api_errors, summary, duration_ms } = evResult;

    // Log structured summary for monitoring
    console.log(JSON.stringify({
      ts:            new Date().toISOString(),
      level:         "info",
      service:       "cron/payment-reconcile",
      msg:           "Daily event payment reconciliation complete",
      checked,
      still_pending,
      api_errors,
      duration_ms,
      genuine_abandon:       summary.genuine_abandon,
      payment_failed:        summary.payment_failed,
      successful_not_synced: summary.successful_not_synced,
      recovered_count:       recovered,
    }));

    if (recovered > 0) {
      console.log(`[cron/payment-reconcile] ✅ RECOVERED ${recovered} event registrations — users will receive QR emails`);
    }
    if (api_errors > 0) {
      console.error(`[cron/payment-reconcile] ⚠️  ${api_errors} event Razorpay API errors — will retry tomorrow`);
    }

    // ── Membership reconciliation ───────────────────────────────────────────
    const mbResult = await runMembershipReconciliation({
      maxBatch:    5,
      callerLabel: "cron",
    });

    console.log(JSON.stringify({
      ts:            new Date().toISOString(),
      level:         "info",
      service:       "cron/payment-reconcile",
      msg:           "Daily membership reconciliation complete",
      checked:       mbResult.checked,
      recovered:     mbResult.recovered,
      still_pending: mbResult.still_pending,
      api_errors:    mbResult.api_errors,
      duration_ms:   mbResult.duration_ms,
    }));

    if (mbResult.recovered > 0) {
      console.log(`[cron/payment-reconcile] ✅ RECOVERED ${mbResult.recovered} memberships — users have been activated`);
    }
    if (mbResult.api_errors > 0) {
      console.error(`[cron/payment-reconcile] ⚠️  ${mbResult.api_errors} membership reconcile errors — will retry tomorrow`);
    }

    return NextResponse.json({
      ok:                        true,
      events: {
        checked,
        recovered,
        still_pending,
        api_errors,
        summary,
        duration_ms,
      },
      memberships: {
        checked:       mbResult.checked,
        recovered:     mbResult.recovered,
        still_pending: mbResult.still_pending,
        api_errors:    mbResult.api_errors,
        duration_ms:   mbResult.duration_ms,
      },
      total_recovered: recovered + mbResult.recovered,
      duration_ms:     Date.now() - startMs,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron/payment-reconcile] FATAL:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
