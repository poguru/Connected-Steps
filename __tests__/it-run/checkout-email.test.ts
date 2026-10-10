/**
 * One confirmation for a shared payment: one email listing every registration, with each runner's QR code and the
 * total. Sent once; a failed send releases the claim so it can be resent; nothing is sent twice.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/notify", () => ({ sendEmail: jest.fn() }));
jest.mock("@/lib/it-run-dashboard-link", () => ({ buildDashboardUrl: (code: string) => `https://x/dash/${code}` }));

import { getSupabaseServer } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/notify";
import { buildCheckoutConfirmEmail, sendItRunCheckoutConfirmationEmail, type CheckoutSection } from "@/lib/it-run-email";

const mockDb = getSupabaseServer as jest.Mock;
const mockSend = sendEmail as jest.Mock;

const SECTIONS: CheckoutSection[] = [
  {
    code: "ITR-DUO", category: "5K Duo Challenge", date: "2027-02-07", venue: "Hitec City", reportTime: "5:30 AM",
    finalPrice: 1399, dashUrl: "https://x/dash/ITR-DUO",
    participants: [
      { name: "Asha Rao", typeLabel: "", tshirtSize: "M", qrUrl: "https://x/api/it-run/qr/qr-a" },
      { name: "Ravi Rao", typeLabel: "", tshirtSize: "S", qrUrl: "https://x/api/it-run/qr/qr-b" },
    ],
  },
  {
    code: "ITR-10K", category: "10K Timed Run", date: "2027-02-07", venue: "Hitec City", reportTime: "5:30 AM",
    finalPrice: 999, dashUrl: "https://x/dash/ITR-10K",
    participants: [{ name: "Meera Rao", typeLabel: "", tshirtSize: "L", qrUrl: "https://x/api/it-run/qr/qr-c" }],
  },
];

describe("buildCheckoutConfirmEmail", () => {
  it("lists every registration, every runner's QR code, and the total paid", () => {
    const html = buildCheckoutConfirmEmail(SECTIONS);
    expect(html).toContain("ITR-DUO");
    expect(html).toContain("ITR-10K");
    expect(html).toContain("https://x/api/it-run/qr/qr-a");
    expect(html).toContain("https://x/api/it-run/qr/qr-b");
    expect(html).toContain("https://x/api/it-run/qr/qr-c");
    expect(html).toContain("2 registrations confirmed");
    expect(html).toContain("₹2,398");
  });

  it("gives each registration its own dashboard link", () => {
    const html = buildCheckoutConfirmEmail(SECTIONS);
    expect(html).toContain("https://x/dash/ITR-DUO");
    expect(html).toContain("https://x/dash/ITR-10K");
  });

  it("escapes runner names so they cannot inject markup", () => {
    const html = buildCheckoutConfirmEmail([{ ...SECTIONS[1], participants: [{ name: "<b>x</b>", typeLabel: "", tshirtSize: null, qrUrl: "https://x/q" }] }]);
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

// ── Sending ───────────────────────────────────────────────────────────────────

const REGS = [
  {
    id: "duo", registration_code: "ITR-DUO", lead_email: "asha@example.com", linked_user_email: "asha@example.com",
    final_price: 1399, base_price: 1399, discount_amount: 0, early_bird_offer_id: null,
    it_run_categories: { name: "5K Duo Challenge" },
    it_run_events: { title: "The IT Run Sprint-2", event_date: "2027-02-07", venue_name: "Hitec City", report_time: "5:30 AM" },
    it_run_participants: [
      { first_name: "Asha", last_name: "Rao", participant_type: "parent", tshirt_size: "M", qr_token: "qr-a", created_at: "2026-10-01T10:00:00Z" },
      { first_name: "Ravi", last_name: "Rao", participant_type: "child", tshirt_size: "S", qr_token: "qr-b", created_at: "2026-10-01T10:00:01Z" },
    ],
  },
  {
    id: "tenk", registration_code: "ITR-10K", lead_email: "asha@example.com", linked_user_email: "asha@example.com",
    final_price: 999, base_price: 999, discount_amount: 0, early_bird_offer_id: null,
    it_run_categories: { name: "10K Timed Run" },
    it_run_events: { title: "The IT Run Sprint-2", event_date: "2027-02-07", venue_name: "Hitec City", report_time: "5:30 AM" },
    it_run_participants: [
      { first_name: "Meera", last_name: "Rao", participant_type: "solo", tshirt_size: "L", qr_token: "qr-c", created_at: "2026-10-01T10:01:00Z" },
    ],
  },
];

/** Fake: the claim (update with a null-guard) succeeds for `claimable` ids; the registrations read returns REGS. */
function fakeDb(opts: { claimable?: string[] } = {}) {
  const updates: any[] = [];
  const claimable = opts.claimable ?? ["duo", "tenk"];
  return {
    updates,
    from(table: string) {
      const q: any = { op: "select", payload: undefined };
      const b: any = {};
      b.select = () => b;
      b.in = () => b;
      b.is = () => b;
      b.order = () => b;
      b.returns = () => b;
      b.update = (p: any) => { q.op = "update"; q.payload = p; updates.push({ table, payload: p }); return b; };
      b.then = (res: any, rej?: any) => {
        const data = q.op === "update"
          ? (q.payload?.confirmation_email_sent_at === null ? [] : claimable.map(id => ({ id })))
          : REGS;
        return Promise.resolve({ data, error: null }).then(res, rej);
      };
      return b;
    },
  };
}

const ok = { ok: true, to: "x", channel: "email" as const };
const failed = { ok: false, to: "x", channel: "email" as const, error: "rejected", httpStatus: 422 };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("sendItRunCheckoutConfirmationEmail", () => {
  it("sends one email to the booking contact, covering both registrations", async () => {
    mockSend.mockResolvedValue(ok);
    mockDb.mockReturnValue(fakeDb());
    await sendItRunCheckoutConfirmationEmail(["duo", "tenk"]);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0]).toBe("asha@example.com");
    const html = mockSend.mock.calls[0][3] as string;
    expect(html).toContain("ITR-DUO");
    expect(html).toContain("ITR-10K");
  });

  it("sends nothing when the registrations were already claimed (a repeated delivery)", async () => {
    mockDb.mockReturnValue(fakeDb({ claimable: [] }));
    await sendItRunCheckoutConfirmationEmail(["duo", "tenk"]);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("a failed send releases every claim, so an admin resend can send it again", async () => {
    mockSend.mockResolvedValue(failed);
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    await sendItRunCheckoutConfirmationEmail(["duo", "tenk"]);
    expect(db.updates).toContainEqual({ table: "it_run_registrations", payload: { confirmation_email_sent_at: null } });
  });

  it("the failure log names the outcome and status, never an address", async () => {
    mockSend.mockResolvedValue(failed);
    mockDb.mockReturnValue(fakeDb());
    await sendItRunCheckoutConfirmationEmail(["duo", "tenk"]);
    const logged = (console.error as jest.Mock).mock.calls.map(c => String(c[0])).join("\n");
    expect(logged).toContain('"outcome":"send_failed"');
    expect(logged).not.toContain("@example.com");
  });
});
