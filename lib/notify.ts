/**
 * Notification helpers — WhatsApp (Meta Cloud API) + Email (ZeptoMail).
 * MSG91 and SMS have been removed; all WhatsApp messages now go through Meta.
 */

// ── Result type ───────────────────────────────────────────────────────────────

export interface NotifyResult {
  to:          string;
  channel:     "whatsapp" | "email";
  ok:          boolean;
  error?:      string;
  messageId?:  string;
  provider?:   string;
  httpStatus?: number;
}

// ── WhatsApp (Meta Cloud API) ─────────────────────────────────────────────────
// Delegates to lib/whatsapp.ts which uses Meta's Graph API directly.
// Templates must be pre-approved in Meta Business Manager.
// See lib/whatsapp.ts for the list of template bodies to register.

export async function sendWhatsApp(
  phone:         string,
  params:        string[],
  templateName?: string,
): Promise<NotifyResult> {
  const { sendWhatsAppTemplate } = await import("@/lib/whatsapp");
  const template = templateName ?? process.env.WHATSAPP_SESSION_TEMPLATE ?? "session_alert_v4";
  const result   = await sendWhatsAppTemplate(phone, template, params);
  return {
    to:         phone,
    channel:    "whatsapp",
    ok:         result.ok,
    error:      result.error,
    messageId:  result.messageId,
    provider:   "meta",
    httpStatus: result.httpStatus,
  };
}

// ── Email ─────────────────────────────────────────────────────────────────────
// Set NON_OTP_EMAILS_DISABLED=true in Vercel env vars to suppress all
// non-OTP emails (welcome, membership, session join, etc.) while keeping
// OTP/verification emails flowing. Re-enable by removing the var or setting
// it to "false". Business logic always executes — only the Resend call is skipped.

export async function sendEmail(
  to: string,
  toName: string,
  subject: string,
  html: string,
  isOtp = false,
  isTransactional = false,   // true = bypass NON_OTP_EMAILS_DISABLED (QR, registration, payment)
  listUnsubscribeUrl?: string, // set for non-transactional bulk/digest emails
): Promise<NotifyResult> {
  // NON_OTP_EMAILS_DISABLED suppresses optional emails (marketing, digests, notifications).
  // Transactional emails (QR codes, registration confirmation, payment receipts) are NEVER
  // suppressed — users must receive these to use the product.
  if (!isOtp && !isTransactional && process.env.NON_OTP_EMAILS_DISABLED === "true") {
    console.log(`[email] SKIPPED (NON_OTP_EMAILS_DISABLED) to=${to} subject="${subject}"`);
    return { to, channel: "email", ok: true };
  }

  const { sendSingleEmail } = await import("@/lib/email-service");
  const result = await sendSingleEmail({ to, subject, html, listUnsubscribeUrl });
  return { to, channel: "email", ok: result.ok, error: result.error, messageId: result.messageId, provider: result.provider, httpStatus: result.httpStatus };
}

// ── WhatsApp OTP ──────────────────────────────────────────────────────────────
// Sends a phone OTP via the Meta WhatsApp authentication template.
// Template: cs_otp_verification (see lib/whatsapp.ts for the required body).

export async function sendWhatsAppOTP(phone: string, _name: string, code: string): Promise<NotifyResult> {
  const { sendWhatsAppOTP: metaSend } = await import("@/lib/whatsapp");
  const result = await metaSend(phone, code);
  return {
    to:         phone,
    channel:    "whatsapp",
    ok:         result.ok,
    error:      result.error,
    messageId:  result.messageId,
    provider:   "meta",
    httpStatus: result.httpStatus,
  };
}

// ── Message builders ──────────────────────────────────────────────────────────

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

/** WhatsApp params for session_alert_v4 template
 *  Template variables: {{1}}=name {{2}}=title {{3}}=date+time {{4}}=location
 *  Registration URL is static in the template body (connectedsteps.in)
 */
export function sessionWAParams(
  name: string, title: string, date: string, time: string | null, location: string
): string[] {
  const dateStr = time ? `${formatDate(date)} at ${time}` : formatDate(date);
  return [name, title, dateStr, location];
}

/** WhatsApp params for run_registration template
 *  Meta WhatsApp template (create in Meta Business Manager → WhatsApp → Message Templates):
 *    Name: run_registration | Category: Utility
 *    Hi {{1}}, you're registered for *{{2}}*! 🏃
 *    📅 Date: {{3}}
 *    📍 Location: {{4}}
 *    See you on the track! — Connected Steps
 */
export function runRegistrationWAParams(
  name: string, eventName: string, date: string, location: string
): string[] {
  return [name, eventName, formatDate(date), location];
}

/** WhatsApp params for membership_confirmation template
 *  Meta WhatsApp template (create in Meta Business Manager → WhatsApp → Message Templates):
 *    Name: membership_confirmation | Category: Utility
 *    Hi {{1}}, your *Connected Steps* {{2}} membership is confirmed! ✅
 *    💳 Amount paid: ₹{{3}}
 *    📅 Valid until: {{4}}
 *    Dashboard: https://www.connectedsteps.in/dashboard
 */
export function membershipWAParams(
  name: string, plan: string, amountINR: number, expiresAt: string
): string[] {
  const expiry = new Date(expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  return [name, plan, amountINR.toLocaleString("en-IN"), expiry];
}

/** WhatsApp params for birthday_wishes template
 *  Meta WhatsApp template (create in Meta Business Manager → WhatsApp → Message Templates):
 *    Name:     birthday_wishes
 *    Category: Utility
 *    Body:
 *      🎉 Happy Birthday, {{1}}!
 *
 *      The Connected Steps team wishes you a fantastic year ahead filled with
 *      good health, strong runs, personal bests, and memorable races.
 *
 *      Thank you for being part of our community.
 *
 *      Keep running and keep inspiring!
 *
 *      🏃‍♂️ Team Connected Steps
 *  {{1}} = first name
 */
export function birthdayWAParams(firstName: string): string[] {
  return [firstName];
}

/** Payment confirmation HTML email */
export function paymentEmailHTML(
  name: string, plan: string, amountINR: number, expiresAt: string
): string {
  const expiry = new Date(expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const amount = `₹${amountINR.toLocaleString("en-IN")}`;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Membership Confirmed – Connected Steps</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <tr><td style="background:#0a0a0a;padding:28px 40px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.3px;">Connected Steps</div>
        <div style="font-size:11px;color:#e8620a;letter-spacing:0.12em;text-transform:uppercase;margin-top:4px;">Your Goal, Our Plan</div>
      </td></tr>
      <tr><td style="height:4px;background:#e8620a;"></td></tr>
      <tr><td style="padding:40px 40px 32px;">
        <p style="margin:0 0 8px;font-size:15px;color:#555;">Hi <strong>${name}</strong>,</p>
        <p style="margin:0 0 28px;font-size:15px;color:#555;line-height:1.6;">Your membership is confirmed. Welcome to the Connected Steps family! 🎉</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden;margin-bottom:32px;">
          <tr><td style="padding:20px 24px;border-bottom:1px solid #e5e5e5;">
            <div style="font-size:11px;color:#e8620a;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Membership Plan</div>
            <div style="font-size:20px;font-weight:700;color:#0a0a0a;">${plan}</div>
          </td></tr>
          <tr><td>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:16px 24px;border-right:1px solid #e5e5e5;width:50%;">
                  <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">💳 Amount Paid</div>
                  <div style="font-size:14px;font-weight:600;color:#0a0a0a;">${amount}</div>
                </td>
                <td style="padding:16px 24px;width:50%;">
                  <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">📅 Valid Until</div>
                  <div style="font-size:14px;font-weight:600;color:#0a0a0a;">${expiry}</div>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
        <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
          <tr><td style="background:#e8620a;border-radius:6px;">
            <a href="https://www.connectedsteps.in/dashboard" style="display:block;padding:14px 36px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;">Go to Dashboard →</a>
          </td></tr>
        </table>
        <p style="margin:0;font-size:14px;color:#888;line-height:1.6;text-align:center;">See you on the track! Keep running, keep growing. 🏅</p>
      </td></tr>
      <tr><td style="background:#f9f9f9;border-top:1px solid #e5e5e5;padding:20px 40px;text-align:center;">
        <p style="margin:0 0 6px;font-size:12px;color:#aaa;">Connected Steps · Hyderabad, India</p>
        <p style="margin:0;font-size:11px;color:#ccc;">Questions? <a href="https://wa.me/9703620570" style="color:#e8620a;text-decoration:none;">WhatsApp us</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/** Membership expiry reminder HTML email */
export function expiryReminderEmailHTML(name: string, plan: string, expiresAt: string, daysLeft: number): string {
  const expiry = new Date(expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const urgent = daysLeft <= 3;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Membership Expiring Soon – Connected Steps</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <tr><td style="background:#0a0a0a;padding:28px 40px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:#fff;">Connected Steps</div>
        <div style="font-size:11px;color:#e8620a;letter-spacing:0.12em;text-transform:uppercase;margin-top:4px;">Your Goal, Our Plan</div>
      </td></tr>
      <tr><td style="height:4px;background:${urgent ? "#f09595" : "#fbbf24"};"></td></tr>
      <tr><td style="padding:40px 40px 32px;">
        <p style="margin:0 0 8px;font-size:15px;color:#555;">Hi <strong>${name}</strong>,</p>
        <p style="margin:0 0 28px;font-size:15px;color:#555;line-height:1.6;">
          Your <strong>${plan}</strong> membership expires in <strong style="color:${urgent ? "#e8620a" : "#d97706"};">${daysLeft} day${daysLeft === 1 ? "" : "s"}</strong> on <strong>${expiry}</strong>.<br/>
          Renew now to keep your streak, leaderboard points, and training access going.
        </p>
        <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
          <tr><td style="background:#e8620a;border-radius:6px;">
            <a href="https://www.connectedsteps.in/dashboard" style="display:block;padding:14px 36px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;">Renew Membership →</a>
          </td></tr>
        </table>
        <p style="margin:0;font-size:14px;color:#888;line-height:1.6;text-align:center;">Questions? <a href="https://wa.me/9703620570" style="color:#e8620a;text-decoration:none;">WhatsApp us</a></p>
      </td></tr>
      <tr><td style="background:#f9f9f9;border-top:1px solid #e5e5e5;padding:20px 40px;text-align:center;">
        <p style="margin:0;font-size:12px;color:#aaa;">Connected Steps · Hyderabad, India</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/** Run registration confirmation HTML email */
export function runRegistrationEmailHTML(
  name: string, eventName: string, date: string, location: string, distance: string
): string {
  const d = formatDate(date);
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Registration Confirmed – Connected Steps</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <tr><td style="background:#0a0a0a;padding:28px 40px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.3px;">Connected Steps</div>
        <div style="font-size:11px;color:#e8620a;letter-spacing:0.12em;text-transform:uppercase;margin-top:4px;">Your Goal, Our Plan</div>
      </td></tr>
      <tr><td style="height:4px;background:#e8620a;"></td></tr>
      <tr><td style="padding:40px 40px 32px;">
        <p style="margin:0 0 8px;font-size:15px;color:#555;">Hi <strong>${name}</strong>,</p>
        <p style="margin:0 0 28px;font-size:15px;color:#555;line-height:1.6;">You're registered for our upcoming run. We can't wait to see you on the track! 🏃</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden;margin-bottom:32px;">
          <tr><td style="padding:20px 24px;border-bottom:1px solid #e5e5e5;">
            <div style="font-size:11px;color:#e8620a;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Event</div>
            <div style="font-size:20px;font-weight:700;color:#0a0a0a;">${eventName}</div>
          </td></tr>
          <tr><td>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:16px 24px;border-right:1px solid #e5e5e5;width:33%;">
                  <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">📅 Date</div>
                  <div style="font-size:13px;font-weight:600;color:#0a0a0a;">${d}</div>
                </td>
                <td style="padding:16px 24px;border-right:1px solid #e5e5e5;width:33%;">
                  <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">📍 Location</div>
                  <div style="font-size:13px;font-weight:600;color:#0a0a0a;">${location}</div>
                </td>
                <td style="padding:16px 24px;width:33%;">
                  <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">🏅 Distance</div>
                  <div style="font-size:13px;font-weight:600;color:#0a0a0a;">${distance}</div>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
        <p style="margin:0 0 24px;font-size:13px;color:#888;line-height:1.6;text-align:center;">Carry a valid ID and arrive 15 minutes early for warm-up. Stay hydrated! 💧</p>
        <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
          <tr><td style="background:#e8620a;border-radius:6px;">
            <a href="https://www.connectedsteps.in/weekend-run" style="display:block;padding:14px 36px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;">View Event Details →</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="background:#f9f9f9;border-top:1px solid #e5e5e5;padding:20px 40px;text-align:center;">
        <p style="margin:0 0 6px;font-size:12px;color:#aaa;">Connected Steps · Hyderabad, India</p>
        <p style="margin:0;font-size:11px;color:#ccc;">Questions? <a href="https://wa.me/9703620570" style="color:#e8620a;text-decoration:none;">WhatsApp us</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/** Branded HTML email */
export function sessionEmailHTML(
  name: string, title: string, date: string, location: string
): string {
  const d = formatDate(date);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>New Training Session – Connected Steps</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

      <!-- Header -->
      <tr>
        <td style="background:#0a0a0a;padding:28px 40px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.3px;">Connected Steps</div>
          <div style="font-size:11px;color:#e8620a;letter-spacing:0.12em;text-transform:uppercase;margin-top:4px;">Your Goal, Our Plan</div>
        </td>
      </tr>
      <tr><td style="height:4px;background:#e8620a;"></td></tr>

      <!-- Body -->
      <tr>
        <td style="padding:40px 40px 32px;">
          <p style="margin:0 0 8px;font-size:15px;color:#555;">Hi <strong>${name}</strong>,</p>
          <p style="margin:0 0 28px;font-size:15px;color:#555;line-height:1.6;">
            A new training session has been scheduled. Lace up and join us!
          </p>

          <!-- Session card -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden;margin-bottom:32px;">
            <tr>
              <td style="padding:20px 24px;border-bottom:1px solid #e5e5e5;">
                <div style="font-size:11px;color:#e8620a;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Session</div>
                <div style="font-size:20px;font-weight:700;color:#0a0a0a;">${title}</div>
              </td>
            </tr>
            <tr>
              <td>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:16px 24px;border-right:1px solid #e5e5e5;width:50%;">
                      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">📅 Date</div>
                      <div style="font-size:14px;font-weight:600;color:#0a0a0a;">${d}</div>
                    </td>
                    <td style="padding:16px 24px;width:50%;">
                      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">📍 Location</div>
                      <div style="font-size:14px;font-weight:600;color:#0a0a0a;">${location}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- CTA -->
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
            <tr>
              <td style="background:#e8620a;border-radius:6px;">
                <a href="https://www.connectedsteps.in/weekend-run"
                   style="display:block;padding:14px 36px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;">
                  Register Now →
                </a>
              </td>
            </tr>
          </table>

          <p style="margin:0;font-size:14px;color:#888;line-height:1.6;text-align:center;">
            See you on the track! Keep running, keep growing. 🏅
          </p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#f9f9f9;border-top:1px solid #e5e5e5;padding:20px 40px;text-align:center;">
          <p style="margin:0 0 6px;font-size:12px;color:#aaa;">Connected Steps · Hyderabad, India</p>
          <p style="margin:0;font-size:11px;color:#ccc;">
            You received this because you are a registered member. ·
            <a href="https://www.connectedsteps.in" style="color:#e8620a;text-decoration:none;">connectedsteps.in</a>
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── EMAIL HEADER / FOOTER helpers (shared across templates) ──────────────────

function emailHeader(tagline = "Your Goal, Our Plan") {
  return `
  <tr><td style="background:#0a0a0a;padding:28px 40px;text-align:center;">
    <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.3px;">Connected Steps</div>
    <div style="font-size:11px;color:#e8620a;letter-spacing:0.12em;text-transform:uppercase;margin-top:4px;">${tagline}</div>
  </td></tr>
  <tr><td style="height:4px;background:#e8620a;"></td></tr>`;
}

function emailFooter() {
  return `
  <tr><td style="background:#f9f9f9;border-top:1px solid #e5e5e5;padding:20px 40px;text-align:center;">
    <p style="margin:0 0 6px;font-size:12px;color:#aaa;">Connected Steps · Hyderabad, India</p>
    <p style="margin:0;font-size:11px;color:#ccc;">Questions? <a href="https://wa.me/9703620570" style="color:#e8620a;text-decoration:none;">WhatsApp us</a> · <a href="https://www.connectedsteps.in" style="color:#e8620a;text-decoration:none;">connectedsteps.in</a></p>
  </td></tr>`;
}

function emailWrapper(rows: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      ${rows}
    </table>
  </td></tr>
</table>
</body></html>`;
}

// ── Welcome email (sent to new user on successful registration) ───────────────

export function welcomeEmailHTML(firstName: string): string {
  return emailWrapper(`
    ${emailHeader()}
    <tr><td style="padding:40px 40px 32px;">
      <p style="margin:0 0 8px;font-size:16px;color:#555;">Hi <strong>${firstName}</strong>, welcome to Connected Steps! 🎉</p>
      <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.7;">
        You've just joined a community of passionate runners in Hyderabad. Whether you're chasing your first 5K or your next marathon PB, we run with you every step of the way.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:10px;margin-bottom:28px;">
        <tr><td style="padding:20px 24px;border-bottom:1px solid #e5e5e5;">
          <div style="font-size:11px;color:#e8620a;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">Get started</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="font-size:14px;color:#333;line-height:1.6;">
              🏃 <a href="https://www.connectedsteps.in/weekend-run" style="color:#e8620a;text-decoration:none;">Join a Weekend Run</a> — show up, run together<br/>
              📅 <a href="https://www.connectedsteps.in/events" style="color:#e8620a;text-decoration:none;">Upcoming Events</a> — races, community runs and more<br/>
              💪 <a href="https://www.connectedsteps.in/pricing" style="color:#e8620a;text-decoration:none;">Training Programs</a> — structured plans with a coach<br/>
              🏆 <a href="https://www.connectedsteps.in/leaderboard" style="color:#e8620a;text-decoration:none;">Leaderboard</a> — earn points, climb the ranks<br/>
              🤝 <a href="https://www.connectedsteps.in/community" style="color:#e8620a;text-decoration:none;">Community</a> — meet fellow runners
            </div>
          </div>
        </td></tr>
      </table>

      <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
        <tr><td style="background:#e8620a;border-radius:6px;">
          <a href="https://www.connectedsteps.in/dashboard" style="display:block;padding:14px 36px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;">Go to My Dashboard →</a>
        </td></tr>
      </table>

      <p style="margin:0 0 8px;font-size:14px;color:#888;line-height:1.6;text-align:center;">Need help? We're one WhatsApp message away.</p>
      <p style="margin:0;font-size:14px;text-align:center;">
        <a href="https://wa.me/9703620570" style="color:#e8620a;text-decoration:none;font-weight:600;">💬 WhatsApp Support</a>
      </p>
    </td></tr>
    ${emailFooter()}
  `);
}

// ── Admin new-user notification (sent to info@connectedsteps.in) ──────────────

export function adminNewUserEmailHTML(user: {
  firstName:    string;
  lastName:     string;
  email:        string;
  phone:        string;
  dob:          string | null;
  location:     string | null;
  referralCode: string | null;
  registeredAt: string;          // ISO string
}): string {
  const dob      = user.dob ? new Date(user.dob + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "Not provided";
  const regDate  = new Date(user.registeredAt).toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" });

  function row(label: string, value: string) {
    return `<tr>
      <td style="padding:10px 20px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#888;width:140px;vertical-align:top;">${label}</td>
      <td style="padding:10px 20px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#333;font-weight:600;">${value}</td>
    </tr>`;
  }

  return emailWrapper(`
    ${emailHeader("Admin Notification")}
    <tr><td style="padding:32px 40px 8px;">
      <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#0a0a0a;">New User Registration</p>
      <p style="margin:0;font-size:13px;color:#888;">A new member just joined Connected Steps.</p>
    </td></tr>
    <tr><td style="padding:16px 40px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden;">
        ${row("Full Name",       `${user.firstName} ${user.lastName}`)}
        ${row("Email",           user.email)}
        ${row("Mobile",          user.phone || "Not provided")}
        ${row("Gender",          "Not provided")}
        ${row("Date of Birth",   dob)}
        ${row("Location",        user.location || "Not provided")}
        ${row("Registered At",   regDate)}
        ${row("Referral Code",   user.referralCode || "None")}
      </table>
      <table cellpadding="0" cellspacing="0" style="margin:20px auto 0;">
        <tr><td style="background:#0a0a0a;border-radius:6px;">
          <a href="https://www.connectedsteps.in/admin/users" style="display:block;padding:12px 28px;font-size:13px;font-weight:700;color:#fff;text-decoration:none;">View All Users →</a>
        </td></tr>
      </table>
    </td></tr>
    ${emailFooter()}
  `);
}

// ── Birthday email (sent to user on their birthday) ───────────────────────────

export function birthdayEmailHTML(firstName: string): string {
  return emailWrapper(`
    <tr><td style="background:linear-gradient(135deg,#0a0a0a 0%,#1a0a00 100%);padding:36px 40px;text-align:center;">
      <div style="font-size:44px;margin-bottom:12px;">🎉</div>
      <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.3px;">Connected Steps</div>
      <div style="font-size:11px;color:#e8620a;letter-spacing:0.12em;text-transform:uppercase;margin-top:4px;">Your Goal, Our Plan</div>
    </td></tr>
    <tr><td style="height:4px;background:linear-gradient(90deg,#e8620a,#fbbf24,#e8620a);"></td></tr>
    <tr><td style="padding:40px 40px 32px;text-align:center;">
      <p style="margin:0 0 6px;font-size:28px;font-weight:800;color:#0a0a0a;letter-spacing:-0.5px;">Happy Birthday, ${firstName}! 🎂</p>
      <p style="margin:0 0 28px;font-size:15px;color:#555;line-height:1.8;">
        The entire Connected Steps team wishes you a fantastic year ahead — filled with good health, strong runs, personal bests, and unforgettable races.
      </p>
      <div style="background:linear-gradient(135deg,#fff8f0,#fff3e0);border:1px solid #fde0bc;border-radius:12px;padding:24px;margin-bottom:28px;text-align:left;">
        <p style="margin:0 0 12px;font-size:15px;color:#555;line-height:1.7;">
          🏅 <strong>Keep running.</strong> Every kilometre you log brings you closer to the version of yourself you're training to become.<br/><br/>
          🤝 <strong>Thank you</strong> for being part of our community and inspiring everyone around you.<br/><br/>
          🎯 <strong>This is your year</strong> — go chase those goals!
        </p>
      </div>
      <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
        <tr><td style="background:#e8620a;border-radius:6px;">
          <a href="https://www.connectedsteps.in/events" style="display:block;padding:14px 36px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;">View Upcoming Events 🏃</a>
        </td></tr>
      </table>
      <p style="margin:0;font-size:14px;color:#888;line-height:1.6;">With love from the Connected Steps team ❤️</p>
    </td></tr>
    ${emailFooter()}
  `);
}

// ── Event Registration Confirmation ──────────────────────────────────────────

export function eventRegistrationEmailHTML(opts: {
  name:             string;
  eventTitle:       string;
  startDate:        string;
  startTime:        string | null;
  location:         string;
  registrationCode: string;
  distanceCategory: string | null;
  qrDataUrl?:       string;  // legacy base64 (ignored — use qrToken instead)
  qrToken?:         string;  // HMAC token → public URL served by /api/events/qr/[token]
}): string {
  const { name, eventTitle, startDate, startTime, location, registrationCode, distanceCategory, qrToken } = opts;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";
  const dateStr = new Date(startDate + "T12:00:00Z").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const timeStr = startTime ? ` at ${startTime}` : "";

  return emailWrapper(`
    <h2 style="margin:0 0 6px;font-size:22px;font-weight:800;color:#0a0a0a;line-height:1.2;">
      You&rsquo;re registered! ✅
    </h2>
    <p style="margin:0 0 28px;font-size:15px;color:#555;line-height:1.7;">
      Hi <strong>${name}</strong>, your spot is confirmed for <strong>${eventTitle}</strong>.
    </p>

    <div style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:5px 0;font-size:13px;color:#888;width:38%;">Event</td>
            <td style="padding:5px 0;font-size:14px;color:#0a0a0a;font-weight:600;">${eventTitle}</td></tr>
        <tr><td style="padding:5px 0;font-size:13px;color:#888;">Date</td>
            <td style="padding:5px 0;font-size:14px;color:#0a0a0a;">${dateStr}${timeStr}</td></tr>
        <tr><td style="padding:5px 0;font-size:13px;color:#888;">Location</td>
            <td style="padding:5px 0;font-size:14px;color:#0a0a0a;">${location}</td></tr>
        <tr><td style="padding:5px 0;font-size:13px;color:#888;">Registration ID</td>
            <td style="padding:5px 0;font-size:14px;color:#e8620a;font-weight:700;font-family:monospace;">${registrationCode}</td></tr>
        ${distanceCategory ? `<tr><td style="padding:5px 0;font-size:13px;color:#888;">Category</td>
            <td style="padding:5px 0;font-size:14px;color:#0a0a0a;font-weight:600;">${distanceCategory}</td></tr>` : ""}
      </table>
    </div>

    <div style="text-align:center;margin-bottom:28px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#0a0a0a;">Your Registration QR Code</p>
      <p style="margin:0 0 16px;font-size:13px;color:#555;line-height:1.6;">
        Present this QR code at the event check-in counter. No printout needed — your phone is enough.
      </p>
      ${qrToken ? `
      <div style="display:inline-block;background:#fff;border:3px solid #e8620a;border-radius:16px;padding:20px;">
        <img src="${base}/api/events/qr/${encodeURIComponent(qrToken)}"
             alt="Your Event QR Code"
             width="220" height="220"
             style="display:block;border-radius:4px;" />
      </div>
      <p style="margin:12px 0 0;font-size:11px;color:#aaa;line-height:1.5;">
        QR code not displaying? <a href="${base}/events" style="color:#e8620a;text-decoration:none;">View in app →</a>
      </p>
      ` : `
      <div style="background:#fff8f0;border:1px solid #fde0bc;border-radius:12px;padding:20px;text-align:center;">
        <p style="margin:0;font-size:13px;color:#e8620a;font-weight:600;">QR code unavailable — please contact support.</p>
      </div>
      `}
    </div>

    <div style="background:#fff8f0;border:1px solid #fde0bc;border-radius:10px;padding:14px 18px;margin-bottom:28px;">
      <p style="margin:0;font-size:13px;color:#c05c00;line-height:1.6;">
        <strong>📋 What to bring:</strong> This email (digital copy), comfortable running shoes, water bottle.<br/>
        <strong>⏰ Reporting time:</strong> Please arrive 15 minutes before the flag-off.
      </p>
    </div>

    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr><td style="background:#e8620a;border-radius:8px;">
        <a href="${base}/events" style="display:block;padding:12px 32px;font-size:14px;font-weight:700;color:#fff;text-decoration:none;">
          View My Registrations →
        </a>
      </td></tr>
    </table>
    <p style="margin:0 0 8px;font-size:12px;color:#aaa;text-align:center;">
      Questions? <a href="mailto:info@connectedsteps.in" style="color:#e8620a;text-decoration:none;">info@connectedsteps.in</a>
    </p>
    ${emailFooter()}
  `);
}
