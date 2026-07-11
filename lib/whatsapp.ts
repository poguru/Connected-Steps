/**
 * Meta WhatsApp Cloud API helper.
 *
 * Required env vars:
 *   WHATSAPP_ACCESS_TOKEN       — permanent system-user token from Meta Business Manager
 *   WHATSAPP_PHONE_NUMBER_ID    — the From phone number ID shown in Meta's API setup (numeric string)
 *   WHATSAPP_APP_SECRET         — app secret from Meta Developer Console (for webhook signature verification)
 *   WHATSAPP_VERIFY_TOKEN       — arbitrary string configured in Meta webhook settings
 *   WHATSAPP_OTP_TEMPLATE_NAME  — pre-approved OTP template name (default: cs_otp_verification)
 *
 * Template bodies that must be approved in Meta Business Manager:
 *
 *   cs_otp_verification (Authentication category):
 *     Body:   "Your Connected Steps verification code is {{1}}. This code expires in 5 minutes."
 *     Button: Copy Code (OTP type) — parameter: {{1}}
 *
 *   session_alert (Utility category):
 *     Body: "Hi {{1}}, a new Connected Steps session has been scheduled!\n\nDate: {{2}}\nLocation: {{3}}\nRun: {{4}}\n\nJoin here: {{5}}"
 *
 *   run_registration (Utility category):
 *     Body: "Hi {{1}}, you're registered for {{2}}! 🏃\nDate: {{3}}\nLocation: {{4}}\nSee you on the track! — Connected Steps"
 *
 *   membership_confirmation (Utility category):
 *     Body: "Hi {{1}}, your Connected Steps {{2}} membership is confirmed! ✅\nAmount paid: ₹{{3}}\nValid until: {{4}}\nDashboard: https://www.connectedsteps.in/dashboard"
 *
 *   birthday_wishes (Utility category):
 *     Body: "🎉 Happy Birthday, {{1}}!\n\nThe Connected Steps team wishes you a fantastic year ahead filled with good health, strong runs, personal bests, and memorable races.\n\nThank you for being part of our community.\n\nKeep running and keep inspiring!\n\n🏃 Team Connected Steps"
 */

const META_API_VERSION = "v19.0";
const META_BASE        = `https://graph.facebook.com/${META_API_VERSION}`;

// ── Phone normalisation ────────────────────────────────────────────────────────
// Indian numbers are normalised to 91XXXXXXXXXX (no + prefix).
// Meta requires the full international format without the + sign.

export function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10)                             return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 13 && digits.startsWith("091")) return digits.slice(1);
  return digits;
}

/** Returns a masked display string: +91 XXXXXXX123 */
export function maskPhone(phone: string): string {
  const digits = normalisePhone(phone);
  const local  = digits.startsWith("91") ? digits.slice(2) : digits;
  if (local.length < 4) return `+91 ${"X".repeat(local.length)}`;
  return `+91 ${"X".repeat(local.length - 3)}${local.slice(-3)}`;
}

// ── Result type ────────────────────────────────────────────────────────────────

export interface WAResult {
  ok:          boolean;
  messageId?:  string;   // Meta's wamid
  error?:      string;
  httpStatus?: number;
}

// ── Internal send ──────────────────────────────────────────────────────────────

async function metaSend(payload: unknown): Promise<WAResult> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId     = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneId) {
    console.error("[WA] WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set");
    return { ok: false, error: "WhatsApp not configured." };
  }

  try {
    const res  = await fetch(`${META_BASE}/${phoneId}/messages`, {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({})) as {
      messages?: { id: string }[];
      error?:    { message: string; code: number; error_subcode?: number };
    };

    if (!res.ok || data.error) {
      const msg = data.error?.message ?? `HTTP ${res.status}`;
      console.error(`[WA] send failed status=${res.status} error="${msg}"`);
      return { ok: false, error: msg, httpStatus: res.status };
    }

    const messageId = data.messages?.[0]?.id;
    return { ok: true, messageId };
  } catch (e: unknown) {
    return { ok: false, error: String(e) };
  }
}

// ── Send phone OTP ─────────────────────────────────────────────────────────────
// Uses the Meta "Authentication" template category with a Copy Code button.
// The template must have exactly one body variable {{1}} = the 6-digit code,
// and a button parameter of type "otp" so WhatsApp can auto-fill it.

export async function sendWhatsAppOTP(phone: string, code: string): Promise<WAResult> {
  const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME ?? "cs_otp_verification";
  const to           = normalisePhone(phone);

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name:     templateName,
      language: { code: "en_US" },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: code }],
        },
        // Authentication templates with Copy Code button require sub_type "copy_code"
        {
          type:      "button",
          sub_type:  "copy_code",
          index:     "0",
          parameters: [{ type: "text", text: code }],
        },
      ],
    },
  };

  const result = await metaSend(payload);
  if (result.ok) {
    console.log(`[WA] OTP sent to=${to} msgId=${result.messageId} template=${templateName}`);
  }
  return result;
}

// ── Send named template ────────────────────────────────────────────────────────
// Used for session alerts, run registration, membership confirmation, birthday wishes.
// params[] maps to {{1}}, {{2}}, … body variables in order.

export async function sendWhatsAppTemplate(
  phone:        string,
  templateName: string,
  params:       string[],
): Promise<WAResult> {
  const to = normalisePhone(phone);

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name:     templateName,
      language: { code: "en_US" },
      components: params.length > 0
        ? [{ type: "body", parameters: params.map(text => ({ type: "text", text })) }]
        : [],
    },
  };

  const result = await metaSend(payload);
  if (result.ok) {
    console.log(`[WA] template="${templateName}" sent to=${to} msgId=${result.messageId}`);
  }
  return result;
}

// ── Webhook signature verification ────────────────────────────────────────────
// Meta signs webhook payloads with HMAC-SHA256 using the app secret.
// Signature header: X-Hub-Signature-256: sha256=<hex>

export async function verifyWebhookSignature(
  rawBody:   string,
  signature: string | null,
): Promise<boolean> {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret || !signature) return false;

  const sigHex = signature.startsWith("sha256=") ? signature.slice(7) : signature;

  const encoder = new TextEncoder();
  const key     = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const hex    = Array.from(new Uint8Array(sigBuf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  return hex === sigHex;
}
