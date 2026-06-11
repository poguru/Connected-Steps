import { Page, expect } from "@playwright/test";
import { BasePage } from "./BasePage";
import { ROUTES } from "../utils/test-data";

export class LeaderboardPage extends BasePage {
  readonly rows         = () => this.locator("[data-testid='lb-row'], .leaderboard-row, tbody tr");
  readonly rankCells    = () => this.locator("[data-testid='lb-rank'], .rank-cell, td:first-child");
  readonly pointCells   = () => this.locator("[data-testid='lb-points'], .points-cell");
  readonly myRankBadge  = () => this.page.getByText(/your rank|my rank|#\d+/i).first();
  readonly noEmailRegex = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i;

  async navigate() {
    await this.goto(ROUTES.leaderboard);
  }

  async getRowCount(): Promise<number> {
    return this.rows().count();
  }

  async getTopRank(): Promise<number> {
    const text = await this.rankCells().first().textContent();
    return parseInt(text?.match(/\d+/)?.[0] ?? "0", 10);
  }

  async expectNoEmailsVisible() {
    const pageText = await this.page.textContent("body");
    expect(pageText ?? "").not.toMatch(this.noEmailRegex);
  }

  async expectRanksDescending() {
    const points = await this.pointCells().allTextContents();
    const nums = points.map((t) => parseInt(t.match(/\d+/)?.[0] ?? "0", 10));
    for (let i = 1; i < nums.length; i++) {
      expect(nums[i]).toBeLessThanOrEqual(nums[i - 1]);
    }
  }
}
