/**
 * Sends IT Run WhatsApp template messages through MSG91. Used only when WHATSAPP_PROVIDER is "msg91"; until then, the
 * existing Meta path stays in place. Nothing in this module changes the registration, payment or BIB state.
 *
 * Request format: MSG91 WhatsApp outbound template API (control.msg91.com /api/v5/whatsapp/whatsapp-outbound-message/bulk/),
 * with one recipient. Credentials come from the environment only: MSG91_AUTH_KEY and MSG91_WA_NUMBER.
 */

export const MSG91_TEMPLATE_ENDPOINT = "https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/";

/** The number that must never be used for Connected Steps messages. */
export const BLOCKED_WHATSAPP_NUMBER = "919703620570";

export type Msg91SendResult =
  | { ok: true; status: number }
  | { ok: false; status: number | null; error: string };

/** A recipient number as digits with the country code, e.g. 919876543210. Anything else is refused. */
export function normalizeRecipient(input: string): string | null {
  const digits = (input ?? "").replace(/\D/g, "");
  const full = digits.length === 10 ? `91${digits}` : digits;
  return /^91[6-9]\d{9}$/.test(full) ? full : null;
}

/** The request body for one recipient, in the shape MSG91 documents for template messages. */
export function buildMsg91TemplateBody(args: {
  integratedNumber: string;
  templateName: string;
  languageCode?: string;
  to: string;
  bodyValues: string[];
}) {
  const components: Record<string, { type: "text"; value: string }> = {};
  args.bodyValues.forEach((value, i) => {
    components[`body_${i + 1}`] = { type: "text", value };
  });
  return {
    integrated_number: args.integratedNumber,
    content_type: "template",
    payload: {
      type: "template",
      template: {
        name: args.templateName,
        language: { code: args.languageCode ?? "en", policy: "deterministic" },
        to_and_components: [{ to: [args.to], components }],
      },
      messaging_product: "whatsapp",
    },
  };
}

/**
 * Sends one template message. Returns the outcome; never throws, so a failed send cannot break the action that
 * triggered it. The phone number is never written to logs in full.
 */
export async function sendMsg91Template(args: {
  templateName: string;
  to: string;
  bodyValues: string[];
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): Promise<Msg91SendResult> {
  const env = args.env ?? process.env;
  const authKey = env.MSG91_AUTH_KEY;
  const integratedNumber = (env.MSG91_WA_NUMBER ?? "").replace(/\D/g, "");

  if (!authKey) return { ok: false, status: null, error: "MSG91_AUTH_KEY is not set" };
  if (!integratedNumber) return { ok: false, status: null, error: "MSG91_WA_NUMBER is not set" };
  if (integratedNumber === BLOCKED_WHATSAPP_NUMBER) {
    return { ok: false, status: null, error: "The configured sender number is not allowed for Connected Steps" };
  }
  const to = normalizeRecipient(args.to);
  if (!to) return { ok: false, status: null, error: "The recipient number is not a valid Indian mobile number" };

  const body = buildMsg91TemplateBody({
    integratedNumber, templateName: args.templateName, to, bodyValues: args.bodyValues,
  });
  try {
    const res = await (args.fetchImpl ?? fetch)(MSG91_TEMPLATE_ENDPOINT, {
      method: "POST",
      headers: { accept: "application/json", authkey: authKey, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: `MSG91 refused the message (HTTP ${res.status})` };
    }
    return { ok: true, status: res.status };
  } catch {
    return { ok: false, status: null, error: "Could not reach MSG91" };
  }
}

/** The provider switch. Meta stays the default until WHATSAPP_PROVIDER is set to "msg91". */
export function whatsAppProvider(env: Record<string, string | undefined> = process.env): "meta" | "msg91" {
  return env.WHATSAPP_PROVIDER === "msg91" ? "msg91" : "meta";
}
