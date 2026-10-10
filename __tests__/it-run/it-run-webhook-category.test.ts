/**
 * The IT Run Razorpay webhook applies a paid category change, and only that. Registration payments stay with
 * the general webhook. A bad signature changes nothing.
 */

const SECRET = "test-webhook-secret";

jest.mock("@/lib/supabase-server", () => ({ getSupabaseServer: jest.fn(() => ({})) }));
jest.mock("@/lib/it-run-category-change", () => ({
  applyPaidCategoryChange: jest.fn().mockResolvedValue({ kind: "applied" }),
}));

import crypto from "crypto";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/it-run/webhook/razorpay/route";
import { applyPaidCategoryChange } from "@/lib/it-run-category-change";

const mockApply = applyPaidCategoryChange as jest.Mock;

function signed(body: unknown, secret = SECRET, sig?: string) {
  const raw = JSON.stringify(body);
  const signature = sig ?? crypto.createHmac("sha256", secret).update(raw).digest("hex");
  return new NextRequest("http://t/api/it-run/webhook/razorpay", {
    method: "POST",
    headers: { "content-type": "application/json", "x-razorpay-signature": signature },
    body: raw,
  });
}

const categoryPayment = {
  event: "payment.captured",
  payload: {
    payment: {
      entity: {
        id: "pay_1", order_id: "order_1", amount: 50000,
        notes: { type: "it_run_category_change", it_run_change_id: "chg-1" },
      },
    },
  },
};

const registrationPayment = {
  event: "payment.captured",
  payload: {
    payment: { entity: { id: "pay_2", order_id: "order_2", amount: 79900, notes: { type: "it_run", it_run_reg_id: "reg-1" } } },
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  (console.log as jest.Mock).mockRestore?.();
  (console.warn as jest.Mock).mockRestore?.();
});

describe("IT Run Razorpay webhook: paid category change", () => {
  it("applies a captured category-change payment with the change id and payment details", async () => {
    const res = await POST(signed(categoryPayment));
    expect(res.status).toBe(200);
    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(mockApply.mock.calls[0][1]).toEqual({
      changeId: "chg-1", orderId: "order_1", paymentId: "pay_1", amountPaise: 50000, actor: "razorpay-webhook",
    });
  });

  it("leaves a registration payment to the general webhook", async () => {
    const res = await POST(signed(registrationPayment));
    expect(res.status).toBe(200);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("changes nothing when the signature is wrong", async () => {
    const res = await POST(signed(categoryPayment, "wrong-secret"));
    expect(res.status).toBe(401);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("changes nothing for a category payment without a change id", async () => {
    const body = JSON.parse(JSON.stringify(categoryPayment));
    delete body.payload.payment.entity.notes.it_run_change_id;
    const res = await POST(signed(body));
    expect(res.status).toBe(200);
    expect(mockApply).not.toHaveBeenCalled();
  });
});
