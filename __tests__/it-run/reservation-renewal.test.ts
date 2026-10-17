/**
 * Renewal of an expired registration, and the payment window measured from the last reservation.
 */

import fs from "fs";
import path from "path";
import { paymentWindowOpen, checkCheckoutGroup, type CheckoutRegistration } from "@/lib/it-run-checkout";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");
const MIN = 60_000;
const CREATED = "2026-10-17T04:00:00.000Z";
const RENEWED = "2026-10-17T05:00:00.000Z";
const T0 = Date.parse(CREATED);

describe("the window restarts from the last reservation", () => {
  it("a renewed registration is payable inside its new window even though created_at is old", () => {
    const realNow = Date.now;
    Date.now = () => Date.parse(RENEWED) + 5 * MIN;
    try {
      const reg: CheckoutRegistration = {
        id: "r1", registration_code: "ITRUN2-AAAA", event_id: "e1", lead_email: "a@x.in", final_price: 649,
        payment_status: "pending", razorpay_order_id: null, created_at: CREATED, reserved_at: RENEWED,
      };
      expect(checkCheckoutGroup(["r1"], [reg]).ok).toBe(true);
    } finally {
      Date.now = realNow;
    }
  });

  it("a registration whose reservation is old is refused, even if it was created recently", () => {
    expect(paymentWindowOpen(CREATED, T0 + 16 * MIN)).toBe(false);
  });

  it("falls back to created_at for rows with no reserved_at", () => {
    const realNow = Date.now;
    Date.now = () => T0 + 20 * MIN;
    try {
      const reg: CheckoutRegistration = {
        id: "r1", registration_code: "ITRUN2-AAAA", event_id: "e1", lead_email: "a@x.in", final_price: 649,
        payment_status: "pending", razorpay_order_id: null, created_at: CREATED, reserved_at: null,
      };
      expect(checkCheckoutGroup(["r1"], [reg]).ok).toBe(false);
    } finally {
      Date.now = realNow;
    }
  });

  it("the dashboard and the checkout measure the window from reserved_at", () => {
    expect(read("app/api/it-run/dashboard/[code]/route.ts")).toMatch(/paymentWindowOpen\(reg\.reserved_at \?\? reg\.created_at/);
    expect(read("app/api/it-run/payment/create-order/route.ts")).toMatch(/paymentWindowOpen\(reg\.reserved_at \?\? reg\.created_at/);
  });
});

describe("the renewal route", () => {
  const route = read("app/api/it-run/registrations/[id]/renew/route.ts");

  it("requires the signed-in account that owns the registration", () => {
    expect(route).toMatch(/verifyUserToken\(req\.cookies\.get\(USER_SESSION_COOKIE\)/);
    expect(route).toMatch(/reg\.linked_user_email\.toLowerCase\(\) !== email\.toLowerCase\(\)/);
  });

  it("calls the database renewal, and only a 'renewed' result changes anything for the participant", () => {
    expect(route).toMatch(/rpc\("itr_renew_registration", \{ p_registration_id: id \}\)/);
    expect(route).toMatch(/result === "renewed"/);
  });

  it("maps each refusal to a clear message and never reports success for them", () => {
    for (const code of ["not_expired", "cancelled", "discount_not_renewable", "payment_recorded", "full", "unavailable"]) {
      expect(route).toMatch(new RegExp(`${code}:`));
    }
  });
});

describe("the scheduled job", () => {
  const job = read("app/api/cron/it-run-reservations/route.ts");

  it("is protected by the cron check and calls the sweep", () => {
    expect(job).toMatch(/isCronAuthorized\(req\)/);
    expect(job).toMatch(/rpc\("itr_expire_stale_registrations"/);
  });
});

describe("the dashboard offers renewal only without a discount", () => {
  const page = read("app/it-run/dashboard/[code]/page.tsx");

  it("shows the renew button only when no discount was used", () => {
    expect(page).toMatch(/reg\.discount_amount === 0 && \(\s*<div style=\{\{ marginTop: 12 \}\}>\s*<RenewButton/);
  });

  it("a renewal that succeeds refreshes the dashboard", () => {
    expect(page).toMatch(/onRenewed=\{retry\}/);
  });
});

describe("the migration that the renewal depends on", () => {
  const sql = read("supabase/migrations/20261019000001_reservation_window.sql");

  it("adds reserved_at and expires from it", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS reserved_at/);
    expect(sql).toMatch(/COALESCE\(reserved_at, created_at\)/);
  });

  it("a renewal restarts the window and is refused for discounts and recorded payments", () => {
    expect(sql).toMatch(/reserved_at    = now\(\)/);
    expect(sql).toMatch(/'discount_not_renewable'/);
    expect(sql).toMatch(/'payment_recorded'/);
  });
});
