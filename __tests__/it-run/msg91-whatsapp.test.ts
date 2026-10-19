/**
 * The MSG91 template sender: the request matches MSG91's documented shape, the number rules hold, the blocked number is
 * refused, and a failure is reported rather than thrown. Nothing is sent over the network in these tests.
 */

import {
  buildMsg91TemplateBody, normalizeRecipient, sendMsg91Template, whatsAppProvider,
  MSG91_TEMPLATE_ENDPOINT, BLOCKED_WHATSAPP_NUMBER,
} from "@/lib/it-run-msg91-whatsapp";

const ENV = { MSG91_AUTH_KEY: "test-key", MSG91_WA_NUMBER: "919703620571" };
const okFetch = (status = 200) => jest.fn(async () => new Response("{}", { status }));

describe("the request body", () => {
  it("matches the documented MSG91 template shape", () => {
    const body = buildMsg91TemplateBody({
      integratedNumber: "919703620571", templateName: "it_run_registration_confirmed", to: "919876543210",
      bodyValues: ["Asha", "ITRUN2-AB12CD34", "The IT Run Sprint-2"],
    });
    expect(body).toEqual({
      integrated_number: "919703620571",
      content_type: "template",
      payload: {
        type: "template",
        template: {
          name: "it_run_registration_confirmed",
          language: { code: "en", policy: "deterministic" },
          to_and_components: [{
            to: ["919876543210"],
            components: {
              body_1: { type: "text", value: "Asha" },
              body_2: { type: "text", value: "ITRUN2-AB12CD34" },
              body_3: { type: "text", value: "The IT Run Sprint-2" },
            },
          }],
        },
        messaging_product: "whatsapp",
      },
    });
  });

  it("uses the documented endpoint", () => {
    expect(MSG91_TEMPLATE_ENDPOINT).toBe("https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/");
  });
});

describe("recipient numbers", () => {
  it("accepts a 10-digit Indian mobile and adds the country code", () => {
    expect(normalizeRecipient("9876543210")).toBe("919876543210");
    expect(normalizeRecipient("+91 98765 43210")).toBe("919876543210");
  });

  it("refuses anything that is not a valid Indian mobile", () => {
    expect(normalizeRecipient("12345")).toBeNull();
    expect(normalizeRecipient("5876543210")).toBeNull();
    expect(normalizeRecipient("")).toBeNull();
  });
});

describe("sending", () => {
  it("sends one POST with the auth key header and the documented body", async () => {
    const fetchImpl = okFetch();
    const result = await sendMsg91Template({
      templateName: "it_run_registration_confirmed", to: "9876543210", bodyValues: ["Asha", "ITRUN2-AB12CD34", "The IT Run Sprint-2"],
      env: ENV, fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: true, status: 200 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(MSG91_TEMPLATE_ENDPOINT);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authkey).toBe("test-key");
    expect(JSON.parse(init.body as string).payload.template.to_and_components[0].to).toEqual(["919876543210"]);
  });

  it("refuses the blocked number as the sender, and sends nothing", async () => {
    const fetchImpl = okFetch();
    const result = await sendMsg91Template({
      templateName: "x", to: "9876543210", bodyValues: [],
      env: { MSG91_AUTH_KEY: "k", MSG91_WA_NUMBER: BLOCKED_WHATSAPP_NUMBER }, fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses to send without credentials, and sends nothing", async () => {
    const fetchImpl = okFetch();
    const result = await sendMsg91Template({ templateName: "x", to: "9876543210", bodyValues: [], env: {}, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports a refusal from MSG91 instead of throwing", async () => {
    const result = await sendMsg91Template({
      templateName: "x", to: "9876543210", bodyValues: [], env: ENV, fetchImpl: okFetch(400) as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: false, status: 400, error: "MSG91 refused the message (HTTP 400)" });
  });

  it("reports a network failure instead of throwing", async () => {
    const fetchImpl = jest.fn(async () => { throw new Error("offline"); });
    const result = await sendMsg91Template({ templateName: "x", to: "9876543210", bodyValues: [], env: ENV, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toEqual({ ok: false, status: null, error: "Could not reach MSG91" });
  });
});

describe("the provider switch", () => {
  it("stays on Meta unless MSG91 is chosen", () => {
    expect(whatsAppProvider({})).toBe("meta");
    expect(whatsAppProvider({ WHATSAPP_PROVIDER: "meta" })).toBe("meta");
    expect(whatsAppProvider({ WHATSAPP_PROVIDER: "msg91" })).toBe("msg91");
  });
});
