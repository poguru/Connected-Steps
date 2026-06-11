import { Page, expect } from "@playwright/test";
import { BasePage } from "./BasePage";

export class SessionsPage extends BasePage {
  readonly sessionCards    = () => this.locator("[data-testid='session-card'], .session-card");
  readonly joinButtons     = () => this.locator("button:has-text('Join'), button:has-text('Join →')");
  readonly leaveButtons    = () => this.locator("button:has-text('Leave'), button:has-text('Cancel')");
  readonly joinedLabels    = () => this.locator("text=✓ Joined, text=Joined");
  readonly rsvpCounters    = () => this.locator("[data-testid='rsvp-count']");
  readonly registrationClosed = () => this.page.getByText(/registration closed|closed/i).first();
  readonly fullMessage     = () => this.page.getByText(/session is full|fully booked/i).first();

  async getRsvpCount(index = 0): Promise<number> {
    const text = await this.rsvpCounters().nth(index).textContent();
    return parseInt(text?.match(/\d+/)?.[0] ?? "0", 10);
  }

  async clickJoin(index = 0) {
    const btn = this.joinButtons().nth(index);
    await expect(btn).toBeVisible({ timeout: 10_000 });
    const before = await this.getRsvpCount(index).catch(() => 0);
    await btn.click();
    await this.page.waitForTimeout(2000);
    return before;
  }

  async clickLeave(index = 0) {
    const btn = this.leaveButtons().nth(index);
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();
    await this.page.waitForTimeout(2000);
  }

  async expectJoinedState(index = 0) {
    const joined = this.joinedLabels().nth(index);
    await expect(joined).toBeVisible({ timeout: 10_000 });
  }

  async expectRegistrationClosed() {
    await expect(this.registrationClosed()).toBeVisible({ timeout: 5_000 });
  }

  async sessionCount(): Promise<number> {
    return this.sessionCards().count();
  }
}
