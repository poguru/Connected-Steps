/**
 * IT Run WhatsApp notifications. Each message is a named template with a fixed list of variables, in the order the
 * template expects. Sending does nothing unless WHATSAPP_PROVIDER is "msg91", so existing behaviour is unchanged.
 * A failed WhatsApp send is logged and never undoes the registration, payment or email that triggered it.
 */

import { sendMsg91Template, whatsAppProvider, type Msg91SendResult } from "@/lib/it-run-msg91-whatsapp";

/** The approved template names and their variables, in the order the body uses them. */
export const IT_RUN_WHATSAPP_TEMPLATES = {
  registration_confirmed: { name: "it_run_registration_confirmed", variables: ["name", "code", "event"] },
  bib_collection: { name: "it_run_bib_collection", variables: ["name", "bib", "link"] },
  race_details: { name: "it_run_race_details", variables: ["name", "event", "venue", "report", "flag_off"] },
  id_cancelled_refund: { name: "it_run_id_cancelled_refund", variables: ["name", "event", "category", "amount", "percent"] },
  id_clarification: { name: "it_run_id_clarification_v2", variables: ["name", "event"] },
  no_bib_cancelled: { name: "it_run_no_bib_cancelled", variables: ["name", "event", "amount", "percent"] },
  refund_processed: { name: "it_run_refund_processed", variables: ["name", "amount", "code"] },
  category_changed: { name: "it_run_category_changed", variables: ["name", "code", "category"] },
} as const;

export type ItRunWhatsAppKey = keyof typeof IT_RUN_WHATSAPP_TEMPLATES;
export type ItRunWhatsAppValues = Record<string, string | number>;

/** The values for one template, in the template's own order. A missing value is an error, not a blank. */
export function templateValues(key: ItRunWhatsAppKey, values: ItRunWhatsAppValues): string[] | { missing: string } {
  const out: string[] = [];
  for (const variable of IT_RUN_WHATSAPP_TEMPLATES[key].variables) {
    const v = values[variable];
    if (v === undefined || v === null || String(v).trim() === "") return { missing: variable };
    out.push(String(v).trim());
  }
  return out;
}

export type WhatsAppNotifyResult =
  | { status: "skipped" }
  | { status: "sent" }
  | { status: "failed"; error: string };

/**
 * Sends one IT Run WhatsApp notice to one number. Skipped when the provider is not MSG91. Never throws.
 */
export async function sendItRunWhatsApp(
  key: ItRunWhatsAppKey,
  to: string,
  values: ItRunWhatsAppValues,
  env: Record<string, string | undefined> = process.env,
  fetchImpl?: typeof fetch,
): Promise<WhatsAppNotifyResult> {
  if (whatsAppProvider(env) !== "msg91") return { status: "skipped" };
  const body = templateValues(key, values);
  if (!Array.isArray(body)) return { status: "failed", error: `Missing value for ${body.missing}` };
  const result: Msg91SendResult = await sendMsg91Template({
    templateName: IT_RUN_WHATSAPP_TEMPLATES[key].name, to, bodyValues: body, env, fetchImpl,
  });
  if (result.ok) return { status: "sent" };
  console.error(JSON.stringify({ src: "it-run-whatsapp", template: key, outcome: "failed", error: result.error }));
  return { status: "failed", error: result.error };
}
