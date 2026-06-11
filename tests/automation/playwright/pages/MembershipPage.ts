import { Page, expect } from "@playwright/test";
import { BasePage } from "./BasePage";
import { ROUTES } from "../utils/test-data";

export class MembershipPage extends BasePage {
  readonly planCards     = () => this.locator("[data-testid='plan-card'], .plan-card, .pricing-card");
  readonly couponInput   = () => this.getByPlaceholder(/coupon|promo code/i);
  readonly applyBtn      = () => this.page.getByRole("button", { name: /apply/i });
  readonly discountMsg   = () => this.page.getByText(/discount applied|saved/i).first();
  readonly errorMsg      = () => this.page.locator(".error, [role='alert']").first();
  readonly checkoutBtn   = () => this.page.getByRole("button", { name: /subscribe|checkout|pay/i });
  readonly expiryBadge   = () => this.page.getByText(/expired|renew/i).first();
  readonly activeBadge   = () => this.page.getByText(/active|premium member/i).first();

  async navigate() {
    await this.goto(ROUTES.pricing);
  }

  async selectPlan(planName: string) {
    await this.navigate();
    const card = this.page.getByText(planName, { exact: false }).first();
    await card.click();
    await this.page.waitForTimeout(500);
  }

  async applyCoupon(code: string) {
    await this.couponInput().fill(code);
    await this.applyBtn().click();
    await this.page.waitForTimeout(2000);
  }

  async expectCouponApplied() {
    await expect(this.discountMsg()).toBeVisible({ timeout: 5_000 });
  }

  async expectCouponError(text?: string) {
    await expect(this.errorMsg()).toBeVisible({ timeout: 5_000 });
    if (text) await expect(this.errorMsg()).toContainText(text);
  }

  async planCount(): Promise<number> {
    return this.planCards().count();
  }
}
