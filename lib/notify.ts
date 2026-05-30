/**
 * MSG91 notification helper — WhatsApp, SMS, Email
 *
 * Required env vars:
 *   MSG91_AUTH_KEY            – API auth key from MSG91 dashboard
 *   MSG91_SENDER_ID           – 6-char SMS sender ID  e.g. CRSTPS
 *   MSG91_WHATSAPP_NUMBER     – Integrated WhatsApp number  e.g. 919XXXXXXXXX
 *   MSG91_WHATSAPP_TEMPLATE   – Approved template name  e.g. session_alert
 *   MSG91_FROM_EMAIL          – Verified sender email  e.g. noreply@connectedsteps.in
 *   MSG91_FROM_NAME           – Sender display name  e.g. Connected Steps
 */

// ── Phone normalisation (Indian numbers → 91XXXXXXXXXX, no +) ────────────────

function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10)                              return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91"))   return digits;
  if (digits.length === 13 && digits.startsWith("091"))  return digits.slice(1);
  return digits;
}

// ── Result type ───────────────────────────────────────────────────────────────

export interface NotifyResult {
  to:      string;
  channel: "whatsapp" | "sms" | "email";
  ok:      boolean;
  error?:  string;
}

// ── WhatsApp ──────────────────────────────────────────────────────────────────
// MSG91 WhatsApp outbound — requires a pre-approved template in MSG91 dashboard.
// Template name is set via MSG91_WHATSAPP_TEMPLATE.
//
// Create this template in MSG91 → WhatsApp → Templates:
//   Name:     session_alert
//   Category: Utility
//   Body:
//     Hi {{1}}, a new *Connected Steps* Weekend Special Long Run has been scheduled!
//
//     📅 *Date:* {{2}}
//     📍 *Location:* {{3}}
//     🏃 *Run:* {{4}}
//
//     Lace up and join us for the long run! 💪
//     Register: https://www.connectedsteps.in/weekend-run
//
//     — Connected Steps Team

export async function sendWhatsApp(
  phone: string,
  params: string[],
  templateName?: string
): Promise<NotifyResult> {
  const authKey    = process.env.MSG91_AUTH_KEY;
  const fromNumber = process.env.MSG91_WHATSAPP_NUMBER;
  const template   = templateName ?? process.env.MSG91_WHATSAPP_TEMPLATE ?? "session_alert";

  if (!authKey || !fromNumber) {
    console.error("MSG91 not configured — AUTH_KEY set:", !!authKey, "| WA_NUMBER set:", !!fromNumber);
    return { to: phone, channel: "whatsapp", ok: false, error: "MSG91 WhatsApp not configured." };
  }

  console.log("MSG91 WA config — number:", fromNumber, "| authKey length:", authKey.length, "| template:", template);
  const to = normalisePhone(phone);

  const body = {
    integrated_number: fromNumber,
    content_type: "template",
    payload: {
      to,
      type: "template",
      template: {
        name: template,
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: params.map((text) => ({ type: "text", text })),
          },
        ],
      },
    },
  };

  try {
    const res = await fetch(
      "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/",
      {
        method: "POST",
        headers: { authkey: authKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.type === "error") {
      const errMsg = data.message ?? JSON.stringify(data) ?? String(res.status);
      console.error("MSG91 WA error response:", JSON.stringify(data));
      return { to: phone, channel: "whatsapp", ok: false, error: errMsg };
    }
    return { to: phone, channel: "whatsapp", ok: true };
  } catch (e: unknown) {
    return { to: phone, channel: "whatsapp", ok: false, error: String(e) };
  }
}

// ── SMS ───────────────────────────────────────────────────────────────────────
// MSG91 transactional SMS (route 4).
// Note: In India, SMS requires DLT-registered sender ID and template.
// Register at trai.gov.in or through MSG91's DLT portal.

export async function sendSMS(phone: string, message: string): Promise<NotifyResult> {
  const authKey  = process.env.MSG91_AUTH_KEY;
  const senderId = process.env.MSG91_SENDER_ID;

  if (!authKey || !senderId) {
    return { to: phone, channel: "sms", ok: false, error: "MSG91 SMS not configured." };
  }

  const to = normalisePhone(phone);

  const body = {
    sender:  senderId,
    route:   "4",           // 4 = Transactional
    country: "91",
    sms: [{ message, to: [to] }],
  };

  try {
    const res = await fetch("https://api.msg91.com/api/v5/sms", {
      method: "POST",
      headers: { authkey: authKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.type === "error") {
      return { to: phone, channel: "sms", ok: false, error: data.message ?? String(res.status) };
    }
    return { to: phone, channel: "sms", ok: true };
  } catch (e: unknown) {
    return { to: phone, channel: "sms", ok: false, error: String(e) };
  }
}

// ── Email ─────────────────────────────────────────────────────────────────────

export async function sendEmail(
  to: string,
  toName: string,
  subject: string,
  html: string
): Promise<NotifyResult> {
  const authKey   = process.env.MSG91_AUTH_KEY;
  const fromEmail = process.env.MSG91_FROM_EMAIL ?? "noreply@connectedsteps.in";
  const fromName  = process.env.MSG91_FROM_NAME  ?? "Connected Steps";

  if (!authKey) {
    return { to, channel: "email", ok: false, error: "MSG91 not configured." };
  }

  const body = {
    from:    { name: fromName, email: fromEmail },
    to:      [{ name: toName, email: to }],
    subject,
    html,
  };

  try {
    const res = await fetch("https://api.msg91.com/api/v5/email/send", {
      method: "POST",
      headers: { authkey: authKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.type === "error") {
      return { to, channel: "email", ok: false, error: data.message ?? String(res.status) };
    }
    return { to, channel: "email", ok: true };
  } catch (e: unknown) {
    return { to, channel: "email", ok: false, error: String(e) };
  }
}

// ── Message builders ──────────────────────────────────────────────────────────

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

/** WhatsApp params for session_alert template */
export function sessionWAParams(
  name: string, title: string, date: string, location: string
): string[] {
  return [name, title, formatDate(date), location];
}

/** WhatsApp params for run_registration template
 *  MSG91 template body (create in MSG91 → WhatsApp → Templates):
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
 *  MSG91 template body (create in MSG91 → WhatsApp → Templates):
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

/** Short SMS text (DLT-registered template content) */
export function sessionSMSText(
  name: string, title: string, date: string, location: string
): string {
  return `Hi ${name}, Connected Steps session "${title}" scheduled on ${formatDate(date)} at ${location}. Register: connectedsteps.in/weekend-run`;
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
