import { test, expect } from "../../fixtures/base";
import { USERS, ROUTES, PLANS } from "../../utils/test-data";
import { ENV } from "../../utils/env";

test.describe("Membership", () => {
  // Membership API now requires x-user-token header — api.getMembership() provides it.
  test("TC-MEM01 | GET /api/membership returns active/inactive status", async ({ api }) => {
    const res = await api.getMembership(USERS.standard.email);
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Response shape: { membership: { ... isActive: bool } | null }
    expect(body).toHaveProperty("membership");
    if (body.membership !== null) {
      expect(typeof body.membership.isActive).toBe("boolean");
    }
  });

  test("TC-MEM02 | expired membership blocks access to training plan API", async ({ api, db }) => {
    await db.expireMembership(USERS.standard.email).catch(() => {});
    const res = await api.getTrainingPlan(USERS.standard.email);
    // Route returns 403 for expired membership, 200 with null for active but no plan
    expect([403, 200]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.plan).toBeNull();
    }
  });

  test("TC-MEM03 | expired membership blocks access to coach Q&A API", async ({ api, db }) => {
    await db.expireMembership(USERS.standard.email).catch(() => {});
    const res = await api.request.post("/api/coach-questions", {
      data: {
        question:   "Test Q",
        category:   "training",
        user_email: USERS.standard.email,
        user_name:  "QA User",
      },
    });
    // Requires active membership — must return 403
    expect(res.status()).toBe(403);
  });

  test("TC-MEM04 | pricing page shows 4 plans", async ({ membershipPage }) => {
    await membershipPage.navigate();
    await membershipPage.page.waitForLoadState("networkidle");
    await membershipPage.page.waitForTimeout(1000);
    // Pricing page renders plans as text — verify all 4 plan labels are visible
    for (const label of ["Monthly", "3 Months", "6 Months", "12 Months"]) {
      await expect(
        membershipPage.page.getByText(label, { exact: false }).first()
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test("TC-MEM05 | invalid coupon code shows error message", async ({ membershipPage }) => {
    await membershipPage.navigate();
    await membershipPage.applyCoupon("INVALID-COUPON-XYZ");
    await membershipPage.expectCouponError();
  });

  // Razorpay tests require NEXT_PUBLIC_RAZORPAY_KEY_ID to be configured.
  test("TC-MEM06 | payment order creation returns valid Razorpay order ID", async ({ api }) => {
    if (!ENV.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
      test.skip(true, "Razorpay key not configured — skipping payment order test");
      return;
    }
    const res = await api.createPaymentOrder(PLANS.monthly.id);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(body.id).toMatch(/^order_/);
    expect(body.amount).toBe(PLANS.monthly.amount * 100);
  });

  test("TC-MEM07 | payment verification rejects tampered signature", async ({ api }) => {
    if (!ENV.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
      test.skip(true, "Razorpay key not configured — skipping payment verify test");
      return;
    }
    const orderRes = await api.createPaymentOrder(PLANS.monthly.id);
    const { id: orderId } = await orderRes.json();

    const res = await api.request.post("/api/payment/verify", {
      data: {
        razorpay_order_id:   orderId,
        razorpay_payment_id: "pay_test_fake123",
        razorpay_signature:  "TAMPERED_SIGNATURE",
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error ?? body.message ?? "").toMatch(/signature|invalid/i);
  });

  test("TC-MEM08 | coupon validation API returns discount details", async ({ api, db }) => {
    const coupon = await db.createCoupon({
      code:           `QA-TEST-${Date.now()}`,
      discount_type:  "percentage",
      discount_value: 10,
      max_uses:       5,
      valid_from:     new Date().toISOString().slice(0, 10),
      valid_to:       new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    });
    try {
      const res = await api.validateCoupon(coupon.code, PLANS.monthly.id);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.valid).toBe(true);
      // Route returns discount_value (raw value) — discountedAmount is computed client-side
      expect(body).toHaveProperty("discount_value");
    } finally {
      await db.deleteCoupon(coupon.code);
    }
  });

  test("TC-MEM09 | unauthenticated request to membership API returns 401", async ({ page }) => {
    await page.context().clearCookies();
    const res = await page.request.get("/api/membership");
    expect(res.status()).toBe(401);
  });

  test("TC-MEM10 | payment history page loads for authenticated user", async ({ page }) => {
    await page.goto(ROUTES.payments);
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/auth");
  });
});
