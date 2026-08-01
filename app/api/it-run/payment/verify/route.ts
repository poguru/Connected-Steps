import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyPaymentSignature } from "@/lib/razorpay-security";

import { APP_URL } from "@/lib/config";
// POST /api/it-run/payment/verify
// Called by the client after Razorpay checkout success.
// Verifies signature and confirms the registration.
export async function POST(req: NextRequest) {
  try {
    const { registrationId, paymentId, orderId, signature } = await req.json() as {
      registrationId: string; paymentId: string;
      orderId: string; signature: string;
    };

    if (!registrationId || !paymentId || !orderId || !signature) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    // Verify Razorpay signature
    let sigValid: boolean;
    try { sigValid = verifyPaymentSignature(orderId, paymentId, signature); } catch { sigValid = false; }

    if (!sigValid) {
      console.error(`[it-run/payment/verify] invalid signature payment=${paymentId}`);
      return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
    }

    const db = getSupabaseServer();

    // Fetch registration
    const { data: reg } = await db
      .from("it_run_registrations")
      .select("id,registration_code,lead_email,final_price,payment_status,razorpay_payment_id,it_run_categories(name),it_run_events(title,event_date,venue_name)")
      .eq("id", registrationId)
      .single<{
        id: string; registration_code: string; lead_email: string; final_price: number;
        payment_status: string; razorpay_payment_id: string | null;
        it_run_categories: { name: string } | null;
        it_run_events: { title: string; event_date: string; venue_name: string } | null;
      }>();

    if (!reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });

    // Idempotency check
    if (reg.payment_status === "paid") {
      return NextResponse.json({ ok: true, already: true });
    }

    if (reg.razorpay_payment_id === paymentId) {
      return NextResponse.json({ ok: true, already: true });
    }

    // Confirm payment
    const { error: updateErr } = await db
      .from("it_run_registrations")
      .update({
        payment_status:       "paid",
        razorpay_payment_id:  paymentId,
        razorpay_order_id:    orderId,
      })
      .eq("id", registrationId)
      .in("payment_status", ["pending", "failed"]);

    if (updateErr) {
      console.error("[it-run/payment/verify] update error:", updateErr.message);
      return NextResponse.json({ error: "Failed to confirm payment" }, { status: 500 });
    }

    console.log(`[it-run/payment/verify] Registration ${reg.registration_code} confirmed via client verify — payment ${paymentId}`);

    // Send confirmation email + QR (fire-and-forget)
    sendConfirmationEmail(db, reg, paymentId).catch(e =>
      console.error("[it-run/payment/verify] email error:", e)
    );

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[it-run/payment/verify] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

async function sendConfirmationEmail(
  db: ReturnType<typeof getSupabaseServer>,
  reg: {
    id: string; registration_code: string; lead_email: string; final_price: number;
    it_run_categories: { name: string } | null;
    it_run_events: { title: string; event_date: string; venue_name: string } | null;
  },
  paymentId: string
) {
  // Fetch participants for the confirmation
  const { data: parts } = await db
    .from("it_run_participants")
    .select("first_name,last_name,email,bib_number,participant_type")
    .eq("registration_id", reg.id);

  if (!parts?.length) return;

  const appUrl = APP_URL;
  const dashUrl = `${appUrl}/it-run/dashboard/${reg.registration_code}`;
  const ev      = reg.it_run_events;
  const cat     = reg.it_run_categories;

  const primaryEmail = reg.lead_email;
  const primaryName  = `${parts[0].first_name} ${parts[0].last_name}`;

  const html = buildConfirmEmail(primaryName, reg.registration_code, cat?.name ?? "IT Run Sprint-2", ev?.event_date ?? "2026-08-17", ev?.venue_name ?? "Hitec City", dashUrl);

  const { sendEmail } = await import("@/lib/notify");
  await sendEmail(
    primaryEmail,
    primaryName,
    `Registration Confirmed - The IT Run Sprint-2 (${reg.registration_code})`,
    html,
    false,
    true,
  );
}

function buildConfirmEmail(name: string, code: string, category: string, date: string, venue: string, dashUrl: string): string {
  const dateFormatted = new Date(date + "T12:00:00Z").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Registration Confirmed</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#0a0a0a;border-radius:12px;overflow:hidden;">
      <tr><td style="height:4px;background:#e8620a;"></td></tr>
      <tr><td style="padding:32px 40px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:#fff;">The IT Run Sprint-2</div>
        <div style="font-size:11px;color:#e8620a;letter-spacing:0.12em;text-transform:uppercase;margin-top:4px;">Registration Confirmed</div>
      </td></tr>
      <tr><td style="padding:0 40px 32px;">
        <p style="margin:0 0 16px;font-size:15px;color:#ccc;">Hi <strong style="color:#fff;">${name}</strong>,</p>
        <p style="margin:0 0 24px;font-size:15px;color:#888;line-height:1.6;">You are officially registered for The IT Run Sprint-2! We are excited to run with you.</p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:10px;overflow:hidden;margin-bottom:24px;">
          <tr><td style="padding:20px 24px;border-bottom:1px solid #333;">
            <div style="font-size:11px;color:#e8620a;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Registration Code</div>
            <div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:0.08em;">${code}</div>
          </td></tr>
          <tr><td><table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="padding:16px 24px;border-right:1px solid #333;width:50%;">
              <div style="font-size:11px;color:#888;text-transform:uppercase;margin-bottom:4px;">Category</div>
              <div style="font-size:14px;font-weight:600;color:#fff;">${category}</div>
            </td>
            <td style="padding:16px 24px;width:50%;">
              <div style="font-size:11px;color:#888;text-transform:uppercase;margin-bottom:4px;">Date</div>
              <div style="font-size:14px;font-weight:600;color:#fff;">${dateFormatted}</div>
            </td>
          </tr></table></td></tr>
          <tr><td style="padding:16px 24px;border-top:1px solid #333;">
            <div style="font-size:11px;color:#888;text-transform:uppercase;margin-bottom:4px;">Venue</div>
            <div style="font-size:14px;font-weight:600;color:#fff;">${venue}</div>
          </td></tr>
        </table>

        <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
          <tr><td style="background:#e8620a;border-radius:8px;">
            <a href="${dashUrl}" style="display:block;padding:14px 32px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;">View Participant Dashboard</a>
          </td></tr>
        </table>

        <div style="background:#1a1a1a;border-radius:8px;padding:16px 20px;margin-bottom:16px;">
          <p style="margin:0;font-size:13px;color:#888;line-height:1.7;">
            <strong style="color:#ccc;">Next steps:</strong><br/>
            1. Book your BIB collection slot from your dashboard<br/>
            2. Carry original company ID for physical verification if not yet verified<br/>
            3. Report at the venue by 5:30 AM on August 17, 2026
          </p>
        </div>

        <p style="margin:0;font-size:14px;color:#666;text-align:center;line-height:1.7;">See you at the start line! Questions? Email info@connectedsteps.in</p>
      </td></tr>
      <tr><td style="padding:20px 40px;border-top:1px solid #222;text-align:center;">
        <p style="margin:0;font-size:12px;color:#555;">Connected Steps - Hyderabad, India</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
