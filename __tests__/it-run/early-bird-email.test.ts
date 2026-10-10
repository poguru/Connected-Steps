/**
 * Confirmation email shows the discount that was applied: the early bird offer name or the discount code,
 * the base price, and the amount paid. The discount line appears only when a discount was applied.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/notify", () => ({ sendEmail: jest.fn().mockResolvedValue({ ok: true, to: "x", channel: "email" }) }));
jest.mock("@/lib/it-run-dashboard-link", () => ({ buildDashboardUrl: () => "https://x/dash" }));

import { getSupabaseServer } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/notify";
import { buildConfirmEmail, sendItRunConfirmationEmail } from "@/lib/it-run-email";

const mockDb = getSupabaseServer as jest.Mock;
const mockSend = sendEmail as jest.Mock;

const base = {
  primaryName: "Asha Rao", code: "ITR-AAA", category: "5K Timed Run", date: "2027-02-07",
  venue: "Hitec City", reportTime: "5:30 AM", dashUrl: "https://x/dash", participants: [],
};

describe("buildConfirmEmail discount line", () => {
  it("shows the early bird name, base price, and discount when a discount was applied", () => {
    const html = buildConfirmEmail({
      ...base, finalPrice: 680,
      discount: { label: "Early Bird — 5K Timed Run", baseAmount: 799, discountAmount: 119 },
    });
    expect(html).toContain("Base ₹799");
    expect(html).toContain("Early Bird — 5K Timed Run ₹119");
    expect(html).toContain("₹680");
  });

  it("shows no discount line when no discount was applied", () => {
    const html = buildConfirmEmail({ ...base, finalPrice: 799 });
    expect(html).not.toContain("Base ₹");
  });

  it("does not show a discount line for a zero discount", () => {
    const html = buildConfirmEmail({ ...base, finalPrice: 799, discount: { label: "Discount code", baseAmount: 799, discountAmount: 0 } });
    expect(html).not.toContain("Base ₹");
  });

  it("escapes the label so an offer name cannot inject markup", () => {
    const html = buildConfirmEmail({
      ...base, finalPrice: 600,
      discount: { label: "<img src=x onerror=alert(1)>", baseAmount: 799, discountAmount: 199 },
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });
});

// ── Send path ─────────────────────────────────────────────────────────────────

/** Fake for the confirmation send. Each table answers single/maybeSingle with `single`, and a plain await with `list`. */
function fakeDb(tables: Record<string, { single?: any; list?: any }>) {
  return {
    from(table: string) {
      const spec = tables[table] ?? {};
      const b: any = {};
      for (const m of ["select", "eq", "is", "order", "update"]) b[m] = () => b;
      b.single = () => Promise.resolve(spec.single ?? { data: null, error: null });
      b.maybeSingle = () => Promise.resolve(spec.single ?? { data: null, error: null });
      b.then = (res: any, rej?: any) => Promise.resolve(spec.list ?? { data: [], error: null }).then(res, rej);
      return b;
    },
  };
}

const REG = {
  id: "reg-1", registration_code: "ITR-AAA", lead_email: "asha@example.com", final_price: 680,
  base_price: 799, discount_amount: 119, early_bird_offer_id: "offer-1", confirmation_email_sent_at: null,
  it_run_categories: { name: "5K Timed Run" },
  it_run_events: { title: "The IT Run Sprint-2", event_date: "2027-02-07", venue_name: "Hitec City", report_time: "5:30 AM" },
};

const PARTS = [{ id: "p-1", first_name: "Asha", last_name: "Rao", participant_type: "solo", tshirt_size: "M", qr_token: "qr-1" }];

beforeEach(() => jest.clearAllMocks());

describe("sendItRunConfirmationEmail with an early bird", () => {
  it("names the applied early bird offer in the email", async () => {
    mockDb.mockReturnValue(fakeDb({
      it_run_registrations: { single: { data: REG, error: null }, list: { data: [{ id: "reg-1" }], error: null } },
      it_run_participants: { list: { data: PARTS, error: null } },
      it_run_early_bird_offers: { single: { data: { name: "Early Bird — 5K Timed Run" }, error: null } },
    }));
    await sendItRunConfirmationEmail("reg-1", "ITR-AAA", "asha@example.com", "qr-unused");
    expect(mockSend).toHaveBeenCalledTimes(1);
    const html = mockSend.mock.calls[0][3] as string;
    expect(html).toContain("Early Bird — 5K Timed Run ₹119");
    expect(html).toContain("Base ₹799");
  });

  it("still sends the email, labelled 'Early bird', when the offer name cannot be read", async () => {
    mockDb.mockReturnValue(fakeDb({
      it_run_registrations: { single: { data: REG, error: null }, list: { data: [{ id: "reg-1" }], error: null } },
      it_run_participants: { list: { data: PARTS, error: null } },
      it_run_early_bird_offers: { single: { data: null, error: { message: "boom" } } },
    }));
    await sendItRunConfirmationEmail("reg-1", "ITR-AAA", "asha@example.com", "qr-unused");
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect((mockSend.mock.calls[0][3] as string)).toContain("Early bird ₹119");
  });

  it("labels a coupon discount as a discount code and does not look up an offer", async () => {
    const db = fakeDb({
      it_run_registrations: {
        single: { data: { ...REG, early_bird_offer_id: null, discount_amount: 100, final_price: 699 }, error: null },
        list: { data: [{ id: "reg-1" }], error: null },
      },
      it_run_participants: { list: { data: PARTS, error: null } },
    });
    const spy = jest.spyOn(db, "from");
    mockDb.mockReturnValue(db);
    await sendItRunConfirmationEmail("reg-1", "ITR-AAA", "asha@example.com", "qr-unused");
    expect(spy.mock.calls.map(c => c[0])).not.toContain("it_run_early_bird_offers");
    expect((mockSend.mock.calls[0][3] as string)).toContain("Discount code ₹100");
  });
});
