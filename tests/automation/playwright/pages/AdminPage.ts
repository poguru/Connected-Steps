import { Page, expect } from "@playwright/test";
import { BasePage } from "./BasePage";
import { ROUTES } from "../utils/test-data";

export class AdminPage extends BasePage {
  readonly sessionRows   = () => this.locator("[data-testid='session-row'], .session-row, tbody tr");
  readonly createBtn     = () => this.page.getByRole("button", { name: /create|new session|add/i }).first();
  readonly syncBtn       = (sessionId?: string) =>
    sessionId
      ? this.locator(`[data-session-id="${sessionId}"] button:has-text("Sync")`)
      : this.locator("button:has-text('Sync')").first();
  readonly attendanceMarkBtn = () => this.page.getByRole("button", { name: /mark|attendance/i }).first();
  readonly approveBtn    = () => this.page.getByRole("button", { name: /approve/i }).first();
  readonly rejectBtn     = () => this.page.getByRole("button", { name: /reject|disapprove/i }).first();
  readonly membershipRows = () => this.locator("[data-testid='membership-row'], .membership-row");
  readonly communityPosts = () => this.locator("[data-testid='community-post-row'], .post-row");
  readonly broadcastBtn  = () => this.page.getByRole("button", { name: /broadcast|send message/i });
  readonly successMsg    = () => this.page.getByText(/success|synced|updated/i).first();
  readonly errorMsg      = () => this.page.locator("[role='alert'], .error").first();

  async navigate() {
    await this.goto(ROUTES.admin);
  }

  async navigateToSessions() {
    await this.goto(`${ROUTES.admin}/sessions`);
  }

  async navigateToMemberships() {
    await this.goto(`${ROUTES.admin}/membership`);
  }

  async navigateToCommunity() {
    await this.goto(`${ROUTES.admin}/community`);
  }

  async navigateToUsers() {
    await this.goto(`${ROUTES.admin}/users`);
  }

  async navigateToCoachOps() {
    await this.goto(`${ROUTES.admin}/coach-ops`);
  }

  async getSessionCount(): Promise<number> {
    return this.sessionRows().count();
  }

  async expectSyncSuccess() {
    await expect(this.successMsg()).toBeVisible({ timeout: 15_000 });
  }

  async approveFirstPost() {
    await this.approveBtn().click();
    await this.page.waitForTimeout(2000);
  }
}
