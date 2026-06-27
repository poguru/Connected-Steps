import { NextRequest, NextResponse } from "next/server";
import { runReconciliation } from "@/lib/payment-reconcile";

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
    const result = await runReconciliation({
      dryRun:      false,
      maxBatch:    5,    // 5 concurrent Razorpay API calls max
      callerLabel: "cron",
    });

    const { checked, recovered, still_pending, api_errors, summary, duration_ms } = result;

    // Log structured summary for monitoring
    console.log(JSON.stringify({
      ts:            new Date().toISOString(),
      level:         "info",
      service:       "cron/payment-reconcile",
      msg:           "Daily payment reconciliation complete",
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
      console.log(`[cron/payment-reconcile] ✅ RECOVERED ${recovered} registrations — users will receive QR emails`);
    }

    if (api_errors > 0) {
      console.error(`[cron/payment-reconcile] ⚠️  ${api_errors} Razorpay API errors — will retry tomorrow`);
    }

    return NextResponse.json({
      ok:            true,
      checked,
      recovered,
      still_pending,
      api_errors,
      summary,
      duration_ms:   Date.now() - startMs,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron/payment-reconcile] FATAL:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
