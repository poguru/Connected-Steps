/**
 * One email per category: a booking with runners in two categories sends a confirmation (and a payment notice) for each
 * category, and each lists only the runners in that category.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/notify", () => ({ sendEmail: jest.fn() }));
jest.mock("@/lib/it-run-dashboard-link", () => ({ buildDashboardUrl: () => "https://x/dash" }));

import { getSupabaseServer } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/notify";
import { sendItRunConfirmationEmail, sendItRunPaymentReceivedEmail } from "@/lib/it-run-email";

const mockDb = getSupabaseServer as jest.Mock;
const mockSend = sendEmail as jest.Mock;

const SOLO = "cat-solo";
const KID = "cat-kid";

const REG = {
  id: "reg-1", registration_code: "ITR-MIX", lead_email: "lead@example.com", linked_user_email: null,
  category_id: SOLO, final_price: 1648, base_price: 1648, discount_amount: 0, early_bird_offer_id: null,
  payment_status: "paid", confirmation_email_sent_at: null,
  it_run_categories: { name: "5K Fun Run" },
  it_run_events: { title: "The IT Run Sprint-2", event_date: "2027-02-07", venue_name: "Hitec City", report_time: "5:30 AM" },
};

const PARTS = [
  { id: "p1", first_name: "Pavan", last_name: "Poguru", participant_type: "primary", tshirt_size: "M", qr_token: "q1", verification_status: "pending", id_document_type: "company", category_id: KID },
  { id: "p2", first_name: "Kiran", last_name: "Poguru", participant_type: "child", tshirt_size: "9-10Y", qr_token: "q2", verification_status: "not_required", id_document_type: null, category_id: KID },
  { id: "p3", first_name: "Kalyan", last_name: "Poguru", participant_type: "solo", tshirt_size: "L", qr_token: "q3", verification_status: "pending", id_document_type: "company", category_id: SOLO },
];

const CATS = [
  { id: SOLO, name: "5K Fun Run", color: "#10b981" },
  { id: KID, name: "Parent & Child Duo", color: "#ec4899" },
];

function fakeDb() {
  return {
    from(table: string) {
      const b: any = { op: "select" };
      b.select = () => b; b.eq = () => b; b.is = () => b; b.order = () => b; b.limit = () => b; b.in = () => b;
      b.update = () => { b.op = "update"; return b; };
      b.returns = () => Promise.resolve({ data: table === "it_run_categories" ? CATS : PARTS, error: null });
      b.single = () => Promise.resolve({ data: REG, error: null });
      b.maybeSingle = () => Promise.resolve({ data: REG, error: null });
      b.then = (res: any, rej?: any) => {
        let data: any = [];
        if (b.op === "update") data = [{ id: "reg-1" }];
        else if (table === "it_run_participants") data = PARTS;
        else if (table === "it_run_categories") data = CATS;
        return Promise.resolve({ data, error: null }).then(res, rej);
      };
      return b;
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.mockReturnValue(fakeDb());
  mockSend.mockResolvedValue({ ok: true });
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("confirmation: one email per category", () => {
  it("sends one confirmation per category, each listing only its own runners", async () => {
    await sendItRunConfirmationEmail("reg-1", "ITR-MIX", "lead@example.com", "");

    const subjects = mockSend.mock.calls.map(c => c[2] as string);
    expect(subjects.some(s => s.includes("5K Fun Run"))).toBe(true);
    expect(subjects.some(s => s.includes("Parent & Child Duo"))).toBe(true);

    const soloEmail = mockSend.mock.calls.find(c => (c[2] as string).includes("5K Fun Run"))![3] as string;
    const kidEmail = mockSend.mock.calls.find(c => (c[2] as string).includes("Parent & Child Duo"))![3] as string;
    expect(soloEmail).toContain("Kalyan Poguru");
    expect(soloEmail).not.toContain("Kiran Poguru");
    expect(kidEmail).toContain("Pavan Poguru");
    expect(kidEmail).toContain("Kiran Poguru");
    expect(kidEmail).not.toContain("Kalyan Poguru");
  });

  it("sends each category to every recipient", async () => {
    await sendItRunConfirmationEmail("reg-1", "ITR-MIX", "lead@example.com", "");
    expect(mockSend).toHaveBeenCalledTimes(2);
  });
});

describe("payment received: one email per category", () => {
  it("sends one notice per category, naming the runners in it", async () => {
    await sendItRunPaymentReceivedEmail("reg-1");

    const subjects = mockSend.mock.calls.map(c => c[2] as string);
    expect(subjects).toHaveLength(2);
    const kidEmail = mockSend.mock.calls.find(c => (c[2] as string).includes("Parent & Child Duo"))![3] as string;
    expect(kidEmail).toContain("Runners in this category: Pavan Poguru, Kiran Poguru");
  });
});
