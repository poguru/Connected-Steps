/**
 * Payment for a pending registration: it can be paid only inside its 15-minute window. Outside the window the server
 * refuses, the dashboard offers no payment, and the page never shows "Registration Expired" next to "Payment Required".
 */

import fs from "fs";
import path from "path";
import { paymentWindowOpen, checkCheckoutGroup, PAYMENT_WINDOW_MINUTES, type CheckoutRegistration } from "@/lib/it-run-checkout";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");
const MIN = 60_000;
const CREATED = "2026-10-17T04:00:00.000Z";
const T0 = Date.parse(CREATED);

describe("the payment window", () => {
  it("is 15 minutes, the reservation length", () => {
    expect(PAYMENT_WINDOW_MINUTES).toBe(15);
  });

  it("is open from creation up to, but not including, 15 minutes later", () => {
    expect(paymentWindowOpen(CREATED, T0)).toBe(true);
    expect(paymentWindowOpen(CREATED, T0 + 14 * MIN)).toBe(true);
    expect(paymentWindowOpen(CREATED, T0 + 15 * MIN)).toBe(false);
  });

  it("is closed when the creation time is unknown", () => {
    expect(paymentWindowOpen(null, T0)).toBe(false);
    expect(paymentWindowOpen("not a date", T0)).toBe(false);
  });
});

describe("a checkout refuses a pending registration whose window has closed", () => {
  const base: CheckoutRegistration = {
    id: "r1", registration_code: "ITRUN2-AAAA", event_id: "e1", lead_email: "a@x.in",
    final_price: 649, payment_status: "pending", razorpay_order_id: null, created_at: CREATED,
  };

  it("refuses a pending registration after the window", () => {
    const realNow = Date.now;
    Date.now = () => T0 + 20 * MIN;
    try {
      const out = checkCheckoutGroup(["r1"], [base]);
      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.status).toBe(409);
        expect(out.error).toMatch(/payment window has closed/);
      }
    } finally {
      Date.now = realNow;
    }
  });

  it("accepts a pending registration inside the window", () => {
    const realNow = Date.now;
    Date.now = () => T0 + 5 * MIN;
    try {
      expect(checkCheckoutGroup(["r1"], [base]).ok).toBe(true);
    } finally {
      Date.now = realNow;
    }
  });

  it("does not refuse a pending registration that has no creation time (no regression for older rows)", () => {
    expect(checkCheckoutGroup(["r1"], [{ ...base, created_at: undefined }]).ok).toBe(true);
  });
});

describe("the server enforces the window on both payment paths", () => {
  const route = read("app/api/it-run/payment/create-order/route.ts");

  it("the single-registration path refuses a closed window with PAYMENT_WINDOW_CLOSED", () => {
    expect(route).toMatch(/payment_status === "pending" && !paymentWindowOpen\(reg\.reserved_at \?\? reg\.created_at, Date\.now\(\)\)/);
    expect(route).toMatch(/code: "PAYMENT_WINDOW_CLOSED"/);
  });

  it("the group path reads created_at, so checkCheckoutGroup can enforce the window", () => {
    expect(route).toMatch(/razorpay_order_id, created_at, reserved_at"\)/);
  });
});

describe("the dashboard offers payment only when the server says the window is open", () => {
  const api = read("app/api/it-run/dashboard/[code]/route.ts");
  const page = read("app/it-run/dashboard/[code]/page.tsx");

  it("the dashboard API computes payment_window_open on the server", () => {
    expect(api).toMatch(/payment_window_open: reg\.payment_status === "pending" && paymentWindowOpen\(reg\.reserved_at \?\? reg\.created_at, Date\.now\(\)\)/);
  });

  it("the Complete Payment button appears only inside the open window", () => {
    expect(page).toMatch(/reg\.payment_status === "pending" && reg\.payment_window_open && \(/);
    expect(page).toMatch(/Complete Payment/);
  });

  it("a closed window shows Reservation Expired, with no payment button", () => {
    expect(page).toMatch(/Reservation Expired/);
    expect(page).not.toMatch(/label: "Registration Expired"/);
  });

  it("the page never shows the contradictory Registration Expired with Payment Required together", () => {
    expect(page).toMatch(/reg\.payment_status !== "pending" && reg\.payment_status !== "expired"/);
  });

  it("payment goes through the existing create-order and verify routes, and a double click is ignored", () => {
    expect(page).toMatch(/fetch\("\/api\/it-run\/payment\/create-order"/);
    expect(page).toMatch(/fetch\("\/api\/it-run\/payment\/verify"/);
    expect(page).toMatch(/if \(busy\) return;/);
  });

  it("success is confirmed only by the server's verify call, not by the browser", () => {
    expect(page).toMatch(/if \(!v\.ok\) \{[\s\S]*?return;\s*\}\s*onPaid\(\);/);
  });
});
