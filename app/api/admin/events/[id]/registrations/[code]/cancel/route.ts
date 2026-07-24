import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach, getAdminEmail } from "@/lib/admin-auth";
import { sendEmail } from "@/lib/notify";

type Params = { params: Promise<{ id: string; code: string }> };

// POST /api/admin/events/[id]/registrations/[code]/cancel
// Body: { reason: string, send_email?: boolean }
//
// 1. Sets event_registrations.status = 'cancelled' with audit fields
// 2. Sets event_participants.status = 'cancelled' (invalidates QR)
// 3. Sets refund_status = 'pending' (paid) or 'not_applicable' (free/pending payment)
// 4. Sends cancellation email to participant
// 5. Appends cancellation_audit_log row

export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId, code: registrationCode } = await params;
  const body = await req.json() as { reason?: string; send_email?: boolean };
  const reason    = body.reason?.trim() || "Cancelled by admin";
  const sendEmail_ = body.send_email !== false; // default true

  const db        = getSupabaseServer();
  const actor     = getAdminEmail(req) ?? "admin";

  // ── Fetch registration ───────────────────────────────────────────────────────
  const { data: reg, error: regErr } = await db
    .from("event_registrations")
    .select(`
      id, registration_code, user_email, user_name,
      payment_status, razorpay_payment_id, razorpay_order_id,
      final_price, original_price, coupon_discount,
      status, refund_status, distance_category,
      events ( id, title, start_date, location )
    `)
    .eq("registration_code", registrationCode)
    .eq("event_id", eventId)
    .single();

  if (regErr || !reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  if (reg.status === "cancelled") return NextResponse.json({ error: "Already cancelled" }, { status: 409 });

  // ── Determine refund status ──────────────────────────────────────────────────
  // paid → pending (admin will initiate refund separately)
  // free/pending_payment → not_applicable
  const refund_status = reg.payment_status === "paid" ? "pending" : "not_applicable";

  const now = new Date().toISOString();

  // ── Cancel the registration ──────────────────────────────────────────────────
  const { error: cancelErr } = await db
    .from("event_registrations")
    .update({
      status:              "cancelled",
      cancelled_at:        now,
      cancelled_by:        actor,
      cancellation_reason: reason,
      refund_status:       refund_status,
      refund_requested_by: actor,
      refund_requested_at: refund_status === "pending" ? now : null,
    })
    .eq("id", reg.id);

  if (cancelErr) return NextResponse.json({ error: "Database error: " + cancelErr.message }, { status: 500 });

  // ── Cancel event_participants rows (invalidates QR scans) ────────────────────
  await db
    .from("event_participants")
    .update({ status: "cancelled" })
    .eq("registration_id", reg.id);

  // ── Write audit log ──────────────────────────────────────────────────────────
  void db.from("cancellation_audit_log").insert({
    event_id:          eventId,
    registration_id:   reg.id,
    registration_code: registrationCode,
    action:            "cancelled",
    actor,
    actor_type:        "admin",
    payload: {
      reason,
      payment_status: reg.payment_status,
      final_price:    reg.final_price,
      refund_status,
    },
  });

  // ── Send cancellation email ──────────────────────────────────────────────────
  if (sendEmail_) {
    const event = reg.events as { title: string; start_date: string; location: string } | null;
    const html  = buildCancellationEmail({
      name:      reg.user_name,
      code:      registrationCode,
      eventName: event?.title ?? "the event",
      eventDate: event?.start_date ? new Date(event.start_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "",
      amount:    reg.final_price,
      isPaid:    reg.payment_status === "paid",
      reason,
    });
    void sendEmail(
      reg.user_email,
      reg.user_name,
      `Registration Cancelled — ${event?.title ?? "Connected Steps Event"}`,
      html,
      false,
      true,
    );
  }

  return NextResponse.json({
    success:       true,
    refund_status,
    razorpay_payment_id: reg.razorpay_payment_id ?? null,
    final_price:         reg.final_price,
    message: refund_status === "pending"
      ? "Registration cancelled. Refund is pending — use the Refund action to process it."
      : "Registration cancelled successfully.",
  });
}

// ── Email template ─────────────────────────────────────────────────────────────

function buildCancellationEmail(opts: {
  name: string; code: string; eventName: string;
  eventDate: string; amount: number; isPaid: boolean; reason: string;
}): string {
  const { name, code, eventName, eventDate, amount, isPaid } = opts;
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
    <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:8px;padding:16px 20px;margin:0 0 24px;">
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Registration Details</div>
      <div style="font-size:13px;color:#aaa;">Code: <span style="font-family:monospace;color:#e8620a;">${escHtml(code)}</span></div>
      ${isPaid ? `<div style="font-size:13px;color:#aaa;margin-top:6px;">Amount Paid: <strong style="color:#fff;">₹${amount.toLocaleString("en-IN")}</strong></div>` : ""}
    </div>
    ${isPaid ? `
    <div style="background:rgba(74,222,128,0.06);border:1px solid rgba(74,222,128,0.2);border-radius:8px;padding:16px 20px;margin:0 0 24px;">
      <div style="font-size:14px;font-weight:700;color:#4ade80;margin-bottom:6px;">Refund Information</div>
      <p style="font-size:13px;color:#aaa;margin:0;">
        A refund of ₹${amount.toLocaleString("en-IN")} will be processed to your original payment method within 5–7 business days.
        If you have not received the refund after 7 business days, please contact us.
      </p>
    </div>` : ""}
    <p style="font-size:13px;color:#666;margin:0 0 24px;">
      If you have any questions, reply to this email or contact us at
      <a href="mailto:info@connectedsteps.in" style="color:#e8620a;">info@connectedsteps.in</a>.
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
