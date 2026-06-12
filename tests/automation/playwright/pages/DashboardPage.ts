import { Page, expect } from "@playwright/test";
import { BasePage } from "./BasePage";
import { ROUTES } from "../utils/test-data";

export class DashboardPage extends BasePage {
  // Actual labels rendered: "Month Pts", "All-Time Pts", "This Month", "Total Sessions"
  readonly statCells         = () => this.locator(".stat-cell, [class*='stat-cell']").first();
  readonly workoutRow        = () => this.page.getByText(/Today's Workout|Up Next|Good morning|Good afternoon|Good evening/i).first();
  readonly membershipBadge   = () => this.locator("[data-testid='membership-badge'], text=Premium, text=Active").first();
  readonly trainingPlanWidget= () => this.locator("[data-testid='training-plan'], text=Training Plan").first();
  readonly upcomingSessions  = () => this.page.getByText(/Up Next|Upcoming/i).first();
  readonly joinBtn           = () => this.locator("text=Join →").first();
  readonly joinedLabel       = () => this.locator("text=✓ Joined").first();
  readonly upgradeBtn        = () => this.locator("text=Upgrade, a[href='/pricing']").first();
  readonly notificationBell  = () => this.locator("[data-testid='notification-bell'], button[aria-label*='notification']").first();
  readonly rsvpCount         = (sessionId: string) => this.locator(`[data-session-id="${sessionId}"] [data-testid="rsvp-count"]`).first();

  // Streak chip renders as "🔥 {n} streak" — only visible when streak > 0
  readonly streakChip = () => this.page.locator("text=streak").first();

  async navigate() {
    await this.goto(ROUTES.dashboard);
  }

  async waitForLoad() {
    await this.navigate();
    await this.page.waitForTimeout(2000);
  }

  // Returns 0 (not -1) when the streak chip is not rendered (streak = 0).
  async getStreakCount(): Promise<number> {
    const chip = this.streakChip();
    const visible = await chip.isVisible().catch(() => false);
    if (!visible) return 0;
    // The chip renders: {n} streak — grab the preceding text node
    const parent = this.page.locator("div:has(> span:text('streak'))").first();
    const text   = await parent.textContent().catch(() => "");
    const match  = text?.match(/(\d+)/);
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
    const text  = await badge.textContent().catch(() => "0");
    return parseInt(text ?? "0", 10) || 0;
  }
}
