/**
 * Confirmation and BIB invite delivery: recipients, a provider failure is never recorded as delivered, a failed
 * send can be retried, a registration already sent is not sent again, and background work is not dropped.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes are intentionally loosely typed */

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn() }));
jest.mock("@/lib/notify", () => ({ sendEmail: jest.fn() }));
jest.mock("@/lib/it-run-dashboard-link", () => ({ buildDashboardUrl: () => "https://x/dash" }));

import { getSupabaseServer } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/notify";
import {
  sendItRunConfirmationEmail,
  sendItRunBibInviteEmail,
  confirmationRecipients,
} from "@/lib/it-run-email";
import { runAfterResponse } from "@/lib/after-response";

const mockDb = getSupabaseServer as jest.Mock;
const mockSend = sendEmail as jest.Mock;

const REG = {
  id: "reg-1", registration_code: "ITR-AAA", lead_email: "lead@example.com", linked_user_email: "parent@example.com",
  final_price: 799, base_price: 799, discount_amount: 0, early_bird_offer_id: null, confirmation_email_sent_at: null,
  participant_count: 2, bib_invite_token: "tok-1", bib_invite_sent_at: null,
  it_run_categories: { name: "5K Timed Run" },
  it_run_events: { title: "The IT Run Sprint-2", event_date: "2027-02-07", venue_name: "Hitec City", report_time: "5:30 AM" },
};

const PARTS = [
  { id: "p-1", first_name: "Asha", last_name: "Rao", participant_type: "parent", tshirt_size: "M", qr_token: "qr-1" },
  { id: "p-2", first_name: "Ravi", last_name: "Rao", participant_type: "child", tshirt_size: "S", qr_token: "qr-2" },
];

/** Fake database. `claimed` decides whether the atomic "sent" claim succeeds. Every update is recorded. */
function fakeDb(opts: { reg?: any; claimed?: boolean } = {}) {
  const updates: Array<{ table: string; payload: any }> = [];
  const reg = opts.reg ?? REG;
  const claimed = opts.claimed ?? true;
  return {
    updates,
    from(table: string) {
      const q: { op: string; payload?: any } = { op: "select" };
      const result = (): any => {
        if (q.op === "update") return { data: claimed ? [{ id: reg.id }] : [], error: null };
        if (table === "it_run_registrations") return { data: reg, error: null };
        if (table === "it_run_participants") return { data: PARTS, error: null };
        return { data: [], error: null };
      };
      const b: any = {};
      for (const m of ["select", "eq", "is", "in", "order"]) b[m] = () => b;
      b.update = (payload: any) => { q.op = "update"; q.payload = payload; updates.push({ table, payload }); return b; };
      b.single = () => Promise.resolve(result());
      b.maybeSingle = () => Promise.resolve(result());
      b.then = (res: any, rej?: any) => Promise.resolve(result()).then(res, rej);
      return b;
    },
  };
}

const ok = { ok: true, to: "x", channel: "email" as const };
const failed = { ok: false, to: "x", channel: "email" as const, error: "ZeptoMail rejected", httpStatus: 422 };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── Recipients ────────────────────────────────────────────────────────────────

describe("confirmationRecipients", () => {
  it("sends to the registration address and to a different account address", () => {
    expect(confirmationRecipients("child@example.com", "parent@example.com")).toEqual(["child@example.com", "parent@example.com"]);
  });

  it("lists an address once, ignoring case and spaces", () => {
    expect(confirmationRecipients(" Asha@Example.com ", "asha@example.com")).toEqual(["Asha@Example.com"]);
  });

  it("returns nothing when neither address is present", () => {
    expect(confirmationRecipients("", null)).toEqual([]);
    expect(confirmationRecipients("   ", "")).toEqual([]);
  });
});

// ── Confirmation ──────────────────────────────────────────────────────────────

describe("confirmation delivery", () => {
  it("sends to both recipients, and keeps the sent marker when both succeed", async () => {
    mockSend.mockResolvedValue(ok);
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    await sendItRunConfirmationEmail("reg-1", "ITR-AAA", "lead@example.com", "");
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls.map(c => c[0])).toEqual(["lead@example.com", "parent@example.com"]);
    expect(db.updates.some(u => "confirmation_email_sent_at" in u.payload && u.payload.confirmation_email_sent_at === null)).toBe(false);
  });

  it("a provider failure is not recorded as delivered: the sent marker is released", async () => {
    mockSend.mockResolvedValue(failed);
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    await sendItRunConfirmationEmail("reg-1", "ITR-AAA", "lead@example.com", "");
    expect(db.updates).toContainEqual({ table: "it_run_registrations", payload: { confirmation_email_sent_at: null } });
  });

  it("a partial failure also releases the claim, so the resend can reach the failed address", async () => {
    mockSend.mockResolvedValueOnce(ok).mockResolvedValueOnce(failed);
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    await sendItRunConfirmationEmail("reg-1", "ITR-AAA", "lead@example.com", "");
    expect(db.updates).toContainEqual({ table: "it_run_registrations", payload: { confirmation_email_sent_at: null } });
  });

  it("a registration with no usable address is not recorded as sent", async () => {
    const db = fakeDb({ reg: { ...REG, lead_email: "", linked_user_email: null } });
    mockDb.mockReturnValue(db);
    await sendItRunConfirmationEmail("reg-1", "ITR-AAA", "", "");
    expect(mockSend).not.toHaveBeenCalled();
    expect(db.updates).toContainEqual({ table: "it_run_registrations", payload: { confirmation_email_sent_at: null } });
  });

  it("a registration already claimed is not sent again (repeated webhooks and verify calls)", async () => {
    const db = fakeDb({ claimed: false });
    mockDb.mockReturnValue(db);
    await sendItRunConfirmationEmail("reg-1", "ITR-AAA", "lead@example.com", "");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("the failure log names the outcome and the status, and never an address", async () => {
    mockSend.mockResolvedValue(failed);
    mockDb.mockReturnValue(fakeDb());
    await sendItRunConfirmationEmail("reg-1", "ITR-AAA", "lead@example.com", "");
    const logged = (console.error as jest.Mock).mock.calls.map(c => String(c[0])).join("\n");
    expect(logged).toContain('"outcome":"send_failed"');
    expect(logged).toContain('"httpStatus":422');
    expect(logged).not.toContain("@example.com");
  });
});

// ── BIB invite ────────────────────────────────────────────────────────────────

describe("BIB invite delivery", () => {
  it("a provider failure releases the BIB invite claim so it can be sent again", async () => {
    mockSend.mockResolvedValue(failed);
    const db = fakeDb();
    mockDb.mockReturnValue(db);
    await sendItRunBibInviteEmail("reg-1", "lead@example.com");
    expect(db.updates).toContainEqual({ table: "it_run_registrations", payload: { bib_invite_sent_at: null } });
  });

  it("sends to the booking contact as well as the registration address", async () => {
    mockSend.mockResolvedValue(ok);
    mockDb.mockReturnValue(fakeDb());
    await sendItRunBibInviteEmail("reg-1", "lead@example.com");
    expect(mockSend.mock.calls.map(c => c[0])).toEqual(["lead@example.com", "parent@example.com"]);
  });
});

// ── Background work ───────────────────────────────────────────────────────────

describe("runAfterResponse", () => {
  it("runs the task even outside a request, and a failure is logged without the task's data", async () => {
    const task = jest.fn().mockRejectedValue(new Error("boom"));
    runAfterResponse("confirmation", task);
    await new Promise(r => setTimeout(r, 0));
    expect(task).toHaveBeenCalledTimes(1);
    const logged = (console.error as jest.Mock).mock.calls.map(c => String(c[0])).join("\n");
    expect(logged).toContain('"label":"confirmation"');
    expect(logged).toContain("boom");
  });

  it("runs a successful task", async () => {
    const task = jest.fn().mockResolvedValue(undefined);
    runAfterResponse("bib_invite", task);
    await new Promise(r => setTimeout(r, 0));
    expect(task).toHaveBeenCalledTimes(1);
  });
});
