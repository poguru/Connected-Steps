import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach, getAdminEmail } from "@/lib/admin-auth";
import { sendEmail } from "@/lib/notify";
import { createRefund } from "@/lib/razorpay-client";
import { SUPPORT_EMAIL } from "@/lib/config";

type Params = { params: Promise<{ id: string; code: string }> };

// POST /api/admin/events/[id]/registrations/[code]/cancel
// Body: { reason?: string, send_email?: boolean, auto_refund?: boolean }
//
// auto_refund defaults to true.
// When auto_refund=true AND payment_status='paid':
//   - Immediately calls Razorpay Refund API for the full amount
//   - Stores refund_id, refund_amount, refund_status, refund_raw_response
//   - Sends a cancellation+refund email
//   - Writes a full audit log entry
//   - Idempotent: will NOT double-refund if refund_id already exists or
//     refund_status is already 'processed'
//
// On Razorpay failure:
//   - Registration stays Cancelled (never rolled back)
//   - refund_status = 'failed', failure reason stored
//   - Admin can retry via the Cancellations report page

export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId, code: registrationCode } = await params;
  const body = await req.json() as { reason?: string; send_email?: boolean; auto_refund?: boolean };
  const reason      = body.reason?.trim() || "Cancelled by admin";
  const sendEmail_  = body.send_email  !== false;  // default true
  const autoRefund  = body.auto_refund !== false;   // default true

  const db    = getSupabaseServer();
  const actor = getAdminEmail(req) ?? "admin";

  // ── Fetch registration ───────────────────────────────────────────────────────
  const { data: reg, error: regErr } = await db
    .from("event_registrations")
    .select(`
      id, registration_code, user_email, user_name,
      payment_status, razorpay_payment_id, razorpay_order_id,
      final_price, status, refund_status, refund_id,
      events ( id, title, start_date, location )
    `)
    .eq("registration_code", registrationCode)
    .eq("event_id", eventId)
    .single();

  if (regErr || !reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  if (reg.status === "cancelled") return NextResponse.json({ error: "Already cancelled" }, { status: 409 });

  // ── Idempotency: never double-refund ────────────────────────────────────────
  if (reg.refund_status === "processed" || reg.refund_id) {
    return NextResponse.json({ error: "Refund already processed for this registration" }, { status: 409 });
  }

  const isPaid         = reg.payment_status === "paid";
  const willRefund     = autoRefund && isPaid && !!reg.razorpay_payment_id;
  const now            = new Date().toISOString();

  // ── Cancel the registration ──────────────────────────────────────────────────
  const { error: cancelErr } = await db
    .from("event_registrations")
    .update({
      status:              "cancelled",
      cancelled_at:        now,
      cancelled_by:        actor,
      cancellation_reason: reason,
      refund_status:       willRefund ? "processing" : (isPaid ? "pending" : "not_applicable"),
      refund_requested_by: isPaid ? actor : null,
      refund_requested_at: isPaid ? now : null,
    })
    .eq("id", reg.id);

  if (cancelErr) return NextResponse.json({ error: "Database error: " + cancelErr.message }, { status: 500 });

  // ── Cancel event_participants rows (invalidates all QR scans) ────────────────
  await db
    .from("event_participants")
    .update({ status: "cancelled" })
    .eq("registration_id", reg.id);

  // ── Auto-refund via Razorpay ─────────────────────────────────────────────────
  const event = reg.events as unknown as { id: string; title: string; start_date: string; location: string } | null;
  let refundOutcome: RefundOutcome = { ok: false };

  if (willRefund) {
    const amountPaise = (reg.final_price ?? 0) * 100;  // final_price is ₹; Razorpay needs paise

    try {
      const rzp = await createRefund(reg.razorpay_payment_id!, {
        amount: amountPaise,
        speed:  "normal",
        notes:  { registration_code: registrationCode, actor, event_id: eventId },
      });

      const finalStatus = rzp.status === "processed" ? "processed" : "processing";

      await db.from("event_registrations").update({
        refund_status:        finalStatus,
        refund_id:            rzp.id,
        refund_amount:        rzp.amount,
        refunded_at:          finalStatus === "processed" ? now : null,
        refund_raw_response:  rzp,
      }).eq("id", reg.id);

      refundOutcome = {
        ok:           true,
        refund_id:    rzp.id,
        amount_paise: rzp.amount,
        amount_inr:   rzp.amount / 100,
        rzp_status:   rzp.status,
        refund_status: finalStatus,
      };

      void db.from("cancellation_audit_log").insert({
        event_id:          eventId,
        registration_id:   reg.id,
        registration_code: registrationCode,
        action:            "refund_initiated",
        actor,
        actor_type:        "admin",
        payload: {
          refund_id:    rzp.id,
          amount_paise: rzp.amount,
          rzp_status:   rzp.status,
          auto:         true,
        },
      });

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown Razorpay error";
      console.error("[cancel/auto-refund] Razorpay error:", msg, "reg:", registrationCode);

      await db.from("event_registrations").update({
        refund_status:         "failed",
        refund_failure_reason: msg,
        refund_raw_response:   { error: msg, attempted_at: now },
      }).eq("id", reg.id);

      refundOutcome = { ok: false, error: msg };

      void db.from("cancellation_audit_log").insert({
        event_id:          eventId,
        registration_id:   reg.id,
        registration_code: registrationCode,
        action:            "refund_failed",
        actor,
        actor_type:        "admin",
        payload:           { error: msg, auto: true },
      });
    }
  }

  // ── Audit log — cancellation ─────────────────────────────────────────────────
  void db.from("cancellation_audit_log").insert({
    event_id:          eventId,
    registration_id:   reg.id,
    registration_code: registrationCode,
    action:            "cancelled",
    actor,
    actor_type:        "admin",
    payload: {
      reason,
      payment_status:  reg.payment_status,
      final_price:     reg.final_price,
      auto_refund:     willRefund,
      refund_outcome:  refundOutcome,
    },
  });

  // ── Send notification email ───────────────────────────────────────────────────
  if (sendEmail_) {
    const html = buildCancellationEmail({
      name:          reg.user_name,
      code:          registrationCode,
      eventName:     event?.title ?? "the event",
      eventDate:     event?.start_date
        ? new Date(event.start_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
        : "",
      amount:        reg.final_price,
      isPaid,
      refundOutcome,
    });

    void sendEmail(
      reg.user_email,
      reg.user_name,
      `Registration Cancelled${refundOutcome.ok ? " & Refund Initiated" : ""} — ${event?.title ?? "Connected Steps Event"}`,
      html,
      false,
      true,
    );
  }

  // ── Response ─────────────────────────────────────────────────────────────────
  const refund_status = willRefund
    ? (refundOutcome.ok ? (refundOutcome.rzp_status === "processed" ? "processed" : "processing") : "failed")
    : (isPaid ? "pending" : "not_applicable");

  return NextResponse.json({
    success:      true,
    refund_status,
    refund_id:    refundOutcome.ok ? refundOutcome.refund_id : null,
    amount_inr:   refundOutcome.ok ? refundOutcome.amount_inr : null,
    refund_error: !refundOutcome.ok && willRefund ? refundOutcome.error : null,
    final_price:  reg.final_price,
    razorpay_payment_id: reg.razorpay_payment_id ?? null,
    message: buildMessage({ willRefund, refundOutcome, isPaid }),
  });
}

// ── Types & helpers ────────────────────────────────────────────────────────────

interface RefundOutcome {
  ok:            boolean;
  refund_id?:    string;
  amount_paise?: number;
  amount_inr?:   number;
  rzp_status?:   string;
  refund_status?: string;
  error?:        string;
}

function buildMessage({ willRefund, refundOutcome, isPaid }: { willRefund: boolean; refundOutcome: RefundOutcome; isPaid: boolean }) {
  if (!isPaid)        return "Registration cancelled successfully.";
  if (!willRefund)    return "Registration cancelled. Refund is pending — process it from the Cancellations page.";
  if (refundOutcome.ok) {
    const inr = refundOutcome.amount_inr?.toLocaleString("en-IN") ?? "";
    return `Registration cancelled and ₹${inr} refund initiated via Razorpay (ID: ${refundOutcome.refund_id}).`;
  }
  return `Registration cancelled. Refund failed: ${refundOutcome.error}. Retry from the Cancellations page.`;
}

// ── Email template ─────────────────────────────────────────────────────────────

function buildCancellationEmail(opts: {
  name: string; code: string; eventName: string; eventDate: string;
  amount: number; isPaid: boolean; refundOutcome: RefundOutcome;
}): string {
  const { name, code, eventName, eventDate, amount, isPaid, refundOutcome } = opts;
  const refundInitiated = isPaid && refundOutcome.ok;
  const refundFailed    = isPaid && !refundOutcome.ok && !!refundOutcome.error;
  const amountStr       = amount.toLocaleString("en-IN");
  const refundAmountStr = refundOutcome.amount_inr?.toLocaleString("en-IN") ?? amountStr;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Registration Cancelled</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="600" style="max-width:600px;background:#111;border-radius:12px;border:1px solid rgba(255,255,255,0.08);" cellpadding="0" cellspacing="0">
  <tr><td style="background:#e8620a;padding:24px 32px;border-radius:12px 12px 0 0;">
    <div style="font-size:20px;font-weight:700;color:#fff;">Connected Steps</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.75);margin-top:4px;">Registration Cancellation Notice</div>
  </td></tr>
  <tr><td style="padding:32px;">
    <p style="font-size:15px;color:#ccc;margin:0 0 20px;">Dear ${escHtml(name)},</p>
    <p style="font-size:15px;color:#ccc;margin:0 0 20px;">
      Your registration for <strong style="color:#fff;">${escHtml(eventName)}</strong>${eventDate ? ` on <strong style="color:#fff;">${escHtml(eventDate)}</strong>` : ""} has been cancelled.
    </p>

    <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:8px;padding:16px 20px;margin:0 0 20px;">
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">Registration Details</div>
      <table cellpadding="0" cellspacing="0" style="font-size:13px;color:#aaa;">
        <tr><td style="padding:2px 0;padding-right:16px;">Code</td><td style="font-family:monospace;color:#e8620a;">${escHtml(code)}</td></tr>
        ${isPaid ? `<tr><td style="padding:2px 0;padding-right:16px;">Amount Paid</td><td style="color:#fff;font-weight:700;">₹${amountStr}</td></tr>` : ""}
      </table>
    </div>

    ${refundInitiated ? `
    <div style="background:rgba(74,222,128,0.06);border:1px solid rgba(74,222,128,0.25);border-radius:8px;padding:16px 20px;margin:0 0 20px;">
      <div style="font-size:14px;font-weight:700;color:#4ade80;margin-bottom:10px;">Refund Initiated ✓</div>
      <table cellpadding="0" cellspacing="0" style="font-size:13px;color:#aaa;">
        <tr><td style="padding:3px 0;padding-right:16px;">Refund Amount</td><td style="color:#fff;font-weight:700;">₹${refundAmountStr}</td></tr>
        <tr><td style="padding:3px 0;padding-right:16px;">Refund Reference</td><td style="font-family:monospace;color:#4ade80;">${escHtml(refundOutcome.refund_id ?? "")}</td></tr>
        <tr><td style="padding:3px 0;padding-right:16px;">Payment Method</td><td>Original payment method</td></tr>
        <tr><td style="padding:3px 0;padding-right:16px;">Expected Timeline</td><td style="color:#fff;">5–7 business days</td></tr>
      </table>
      <p style="font-size:12px;color:#666;margin:12px 0 0;">
        The refund has been submitted to your bank/payment provider. Actual credit time depends on your bank.
        If not received after 7 business days, please contact us with your refund reference above.
      </p>
    </div>` : ""}

    ${isPaid && !refundInitiated && !refundFailed ? `
    <div style="background:rgba(234,179,8,0.06);border:1px solid rgba(234,179,8,0.2);border-radius:8px;padding:16px 20px;margin:0 0 20px;">
      <div style="font-size:14px;font-weight:700;color:#eab308;margin-bottom:6px;">Refund Pending</div>
      <p style="font-size:13px;color:#aaa;margin:0;">
        A refund of ₹${amountStr} will be processed to your original payment method within 5–7 business days.
        If you have not received the refund after 7 business days, please contact us.
      </p>
    </div>` : ""}

    ${refundFailed ? `
    <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:8px;padding:16px 20px;margin:0 0 20px;">
      <div style="font-size:14px;font-weight:700;color:#f87171;margin-bottom:6px;">Refund Processing</div>
      <p style="font-size:13px;color:#aaa;margin:0;">
        Your refund of ₹${amountStr} is being processed. Our team will complete it manually within 2–3 business days.
        Please contact us if you have not received it by then.
      </p>
    </div>` : ""}

    <p style="font-size:13px;color:#666;margin:0 0 24px;">
      Questions? Contact us at
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#e8620a;">${SUPPORT_EMAIL}</a>.
    </p>
    <p style="font-size:13px;color:#555;margin:0;">Team Connected Steps</p>
  </td></tr>
  <tr><td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.06);">
    <p style="font-size:11px;color:#444;margin:0;text-align:center;">
      © ${new Date().getFullYear()} Connected Steps. All rights reserved.
    </p>
  </td></tr>
</table></td></tr></table>
</body></html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
