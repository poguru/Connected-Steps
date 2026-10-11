/**
 * Two-stage confirmation: a registration is confirmed only when it is paid (or free) AND every adult's ID is verified.
 * Until then it stays pending_verification, keeps its seats, and gets the payment-received notice, not the confirmation.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake Supabase builder is intentionally loosely typed */

jest.mock("@/lib/it-run-email", () => ({
  sendItRunConfirmationEmail: jest.fn().mockResolvedValue(undefined),
  sendItRunBibInviteEmail: jest.fn().mockResolvedValue(undefined),
  sendItRunPaymentReceivedEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/after-response", () => ({ runAfterResponse: jest.fn() }));

import fs from "fs";
import path from "path";
import { confirmIfVerified, allVerified, paymentInPlace } from "@/lib/it-run-confirmation";

type Reg = { id: string; payment_status: string; registration_status: string };

/** A fake with one registration and its participants. `claimRows` is what the guarded update returns. */
function fakeDb(reg: Reg | null, participants: Array<{ verification_status: string }>, claimRows: unknown[] = [{ id: "r-1" }]) {
  const updates: any[] = [];
  return {
    updates,
    from(table: string) {
      const b: any = {};
      let op: "select" | "update" = "select";
      b.select = () => b;
      b.eq = () => b;
      b.update = (p: any) => { op = "update"; updates.push(p); return b; };
      b.maybeSingle = () => Promise.resolve({ data: table === "it_run_registrations" ? reg : null, error: null });
      b.returns = () => Promise.resolve({ data: table === "it_run_participants" ? participants : [], error: null });
      b.then = (res: any, rej?: any) => {
        const data = op === "update" ? claimRows : [];
        return Promise.resolve({ data, error: null }).then(res, rej);
      };
      return b;
    },
  };
}

describe("allVerified and paymentInPlace", () => {
  it("needs at least one participant, and every one verified", () => {
    expect(allVerified([])).toBe(false);
    expect(allVerified([{ verification_status: "verified" }, { verification_status: "verified" }])).toBe(true);
    expect(allVerified([{ verification_status: "verified" }, { verification_status: "pending" }])).toBe(false);
    expect(allVerified([{ verification_status: "not_provided" }])).toBe(false);
  });

  it("counts paid, free and partially refunded as paid; pending and failed are not", () => {
    expect(paymentInPlace("paid")).toBe(true);
    expect(paymentInPlace("free")).toBe(true);
    expect(paymentInPlace("partially_refunded")).toBe(true);
    expect(paymentInPlace("pending")).toBe(false);
    expect(paymentInPlace("failed")).toBe(false);
  });
});

describe("confirmIfVerified", () => {
  const PENDING = "pending_verification";

  it("confirms a paid registration once every adult is verified", async () => {
    const db = fakeDb({ id: "r-1", payment_status: "paid", registration_status: PENDING }, [{ verification_status: "verified" }]);
    expect(await confirmIfVerified(db as any, "r-1")).toBe("confirmed");
    expect(db.updates).toEqual([{ registration_status: "active" }]);
  });

  it("confirms a free registration once verified", async () => {
    const db = fakeDb({ id: "r-1", payment_status: "free", registration_status: PENDING }, [{ verification_status: "verified" }]);
    expect(await confirmIfVerified(db as any, "r-1")).toBe("confirmed");
  });

  it("keeps it waiting while any adult is still unverified, and changes nothing", async () => {
    const db = fakeDb({ id: "r-1", payment_status: "paid", registration_status: PENDING }, [
      { verification_status: "verified" }, { verification_status: "pending" },
    ]);
    expect(await confirmIfVerified(db as any, "r-1")).toBe("waiting");
    expect(db.updates).toEqual([]);
  });

  it("keeps it waiting when the payment is not in place, even with verified IDs", async () => {
    const db = fakeDb({ id: "r-1", payment_status: "pending", registration_status: PENDING }, [{ verification_status: "verified" }]);
    expect(await confirmIfVerified(db as any, "r-1")).toBe("waiting");
    expect(db.updates).toEqual([]);
  });

  it("reports already for a registration that is confirmed (legacy rows stay as they are)", async () => {
    const db = fakeDb({ id: "r-1", payment_status: "paid", registration_status: "active" }, []);
    expect(await confirmIfVerified(db as any, "r-1")).toBe("already");
    expect(db.updates).toEqual([]);
  });

  it("never confirms a cancelled registration", async () => {
    const db = fakeDb({ id: "r-1", payment_status: "paid", registration_status: "cancelled" }, [{ verification_status: "verified" }]);
    expect(await confirmIfVerified(db as any, "r-1")).toBe("waiting");
    expect(db.updates).toEqual([]);
  });

  it("reports already when a concurrent check confirmed it first (guarded update matches no row)", async () => {
    const db = fakeDb({ id: "r-1", payment_status: "paid", registration_status: PENDING }, [{ verification_status: "verified" }], []);
    expect(await confirmIfVerified(db as any, "r-1")).toBe("already");
  });

  it("reports not_found for an unknown registration", async () => {
    const db = fakeDb(null, []);
    expect(await confirmIfVerified(db as any, "missing")).toBe("not_found");
  });
});

describe("registration insert", () => {
  // The guarded update in confirmIfVerified is the only path to 'active'; the insert holds a new registration pending.
  it("is inserted as pending_verification (see app/api/it-run/register/route.ts)", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "app/api/it-run/register/route.ts"), "utf8");
    expect(source).toMatch(/registration_status:\s*"pending_verification"/);
  });
});
