/**
 * IT Run WhatsApp notices: nothing is sent unless MSG91 is the provider, every template keeps its approved name and
 * variable order, a missing value is refused, and the registration confirmation is wired in after the email.
 */

import fs from "fs";
import path from "path";
import { sendItRunWhatsApp, templateValues, IT_RUN_WHATSAPP_TEMPLATES } from "@/lib/it-run-whatsapp";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");
const MSG91_ENV = { WHATSAPP_PROVIDER: "msg91", MSG91_AUTH_KEY: "k", MSG91_WA_NUMBER: "919703620571" };
const okFetch = () => jest.fn(async () => new Response("{}", { status: 200 }));

describe("the default provider", () => {
  it("sends nothing unless MSG91 is chosen", async () => {
    const fetchImpl = okFetch();
    const result = await sendItRunWhatsApp("registration_confirmed", "9876543210",
      { name: "Asha", code: "ITRUN2-AB12CD34", event: "The IT Run Sprint-2" }, { MSG91_AUTH_KEY: "k", MSG91_WA_NUMBER: "919703620571" }, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ status: "skipped" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("the approved templates", () => {
  it("keep the approved names", () => {
    expect(IT_RUN_WHATSAPP_TEMPLATES.registration_confirmed.name).toBe("it_run_registration_confirmed");
    expect(IT_RUN_WHATSAPP_TEMPLATES.bib_collection.name).toBe("it_run_bib_collection_v2");
    expect(IT_RUN_WHATSAPP_TEMPLATES.bib_collection.variables).toEqual(["name", "bib"]);
    expect(IT_RUN_WHATSAPP_TEMPLATES.id_clarification.name).toBe("it_run_id_clarification_v2");
    expect(IT_RUN_WHATSAPP_TEMPLATES.id_cancelled_refund.name).toBe("it_run_id_cancelled_refund");
  });

  it("values come out in the template's own order", () => {
    expect(templateValues("registration_confirmed", { event: "E", name: "A", code: "C" })).toEqual(["A", "C", "E"]);
  });

  it("a missing value is refused, never sent blank", () => {
    expect(templateValues("registration_confirmed", { name: "A", code: "C" })).toEqual({ missing: "event" });
    expect(templateValues("refund_processed", { name: "A", amount: "", code: "C" })).toEqual({ missing: "amount" });
  });
});

describe("sending through MSG91", () => {
  it("sends the approved template with the values in order", async () => {
    const fetchImpl = okFetch();
    const result = await sendItRunWhatsApp("registration_confirmed", "9876543210",
      { name: "Asha", code: "ITRUN2-AB12CD34", event: "The IT Run Sprint-2" }, MSG91_ENV, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ status: "sent" });
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.payload.template.name).toBe("it_run_registration_confirmed");
    expect(body.payload.template.to_and_components[0].components).toEqual({
      body_1: { type: "text", value: "Asha" },
      body_2: { type: "text", value: "ITRUN2-AB12CD34" },
      body_3: { type: "text", value: "The IT Run Sprint-2" },
    });
  });

  it("a missing value sends nothing and reports why", async () => {
    const fetchImpl = okFetch();
    const result = await sendItRunWhatsApp("registration_confirmed", "9876543210", { name: "Asha" }, MSG91_ENV, fetchImpl as unknown as typeof fetch);
    expect(result.status).toBe("failed");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("the registration notice is wired in", () => {
  it("sends the WhatsApp notice after the confirmation email, to the first runner's mobile", () => {
    const src = read("lib/it-run-confirmation.ts");
    const emailAt = src.indexOf("sendItRunConfirmationEmail(registrationId");
    const waAt = src.indexOf('sendItRunWhatsApp("registration_confirmed"');
    expect(emailAt).toBeGreaterThan(0);
    expect(waAt).toBeGreaterThan(emailAt);
    expect(src).toMatch(/\.select\("first_name, mobile"\)/);
  });
});
