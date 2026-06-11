import { Page, expect } from "@playwright/test";
import { BasePage } from "./BasePage";
import { ROUTES } from "../utils/test-data";

export class DashboardPage extends BasePage {
  readonly streakCount       = () => this.locator("[data-testid='streak-count'], text=week streak").first();
  readonly totalPoints       = () => this.locator("text=Total Pts").first();
  readonly membershipBadge   = () => this.locator("[data-testid='membership-badge'], text=Premium, text=Active").first();
  readonly trainingPlanWidget= () => this.locator("[data-testid='training-plan'], text=Training Plan").first();
  readonly upcomingSessions  = () => this.locator("text=Upcoming Sessions").first();
  readonly joinBtn           = () => this.locator("text=Join →").first();
  readonly joinedLabel       = () => this.locator("text=✓ Joined").first();
  readonly upgradeBtn        = () => this.locator("text=Upgrade, a[href='/pricing']").first();
  readonly notificationBell  = () => this.locator("[data-testid='notification-bell'], button[aria-label*='notification']").first();
  readonly rsvpCount         = (sessionId: string) => this.locator(`[data-session-id="${sessionId}"] [data-testid="rsvp-count"]`).first();

  async navigate() {
    await this.goto(ROUTES.dashboard);
  }

  async waitForLoad() {
    await this.navigate();
    await this.page.waitForTimeout(2000);
  }

  async getStreakCount(): Promise<number> {
    const text = await this.streakCount().textContent();
    const match = text?.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  async joinFirstAvailableSession() {
    const btn = this.joinBtn();
    if (await btn.isVisible()) {
      await btn.click();
      await this.page.waitForTimeout(2000);
      return true;
    }
    return false;
  }

  async expectMembershipActive() {
    await expect(this.membershipBadge()).toBeVisible({ timeout: 10_000 });
  }

  async expectTrainingPlanVisible() {
    await expect(this.trainingPlanWidget()).toBeVisible({ timeout: 10_000 });
  }

  async expectTrainingPlanHidden() {
    await expect(this.trainingPlanWidget()).toBeHidden({ timeout: 5_000 });
  }

  async getNotificationCount(): Promise<number> {
    const badge = this.locator("[data-testid='notification-count'], .notification-badge").first();
    const text = await badge.textContent().catch(() => "0");
    return parseInt(text ?? "0", 10) || 0;
  }
}
