import { Page, expect } from "@playwright/test";
import { BasePage } from "./BasePage";
import { ROUTES } from "../utils/test-data";

export class CommunityPage extends BasePage {
  readonly posts        = () => this.locator("[data-testid='community-post'], .community-post");
  readonly pendingBadge = () => this.page.getByText(/pending|awaiting approval/i).first();
  readonly submitBtn    = () => this.page.getByRole("button", { name: /submit|post/i });
  readonly titleInput   = () => this.getByPlaceholder(/title|question/i);
  readonly bodyInput    = () => this.getByPlaceholder(/body|description|details/i);
  readonly categorySelect = () => this.page.getByRole("combobox").first();
  readonly likeButtons  = () => this.locator("button[aria-label*='like'], button:has-text('👍')");
  readonly postContent  = (text: string) => this.page.getByText(text).first();

  // Feed
  readonly feedPosts    = () => this.locator("[data-testid='feed-post'], .feed-post");
  readonly createPostBtn = () => this.page.getByRole("button", { name: /new post|create post/i });
  readonly postBodyInput = () => this.getByPlaceholder(/what.+mind|share/i);

  async navigateToCommunity() {
    await this.goto(ROUTES.community);
  }

  async navigateToFeed() {
    await this.goto(ROUTES.feed);
  }

  async submitCommunityPost(title: string, body: string, category = "general") {
    await this.navigateToCommunity();
    await this.titleInput().fill(title);
    await this.bodyInput().fill(body);
    const catSel = this.categorySelect();
    if (await catSel.isVisible()) await catSel.selectOption(category);
    await this.submitBtn().click();
    await this.page.waitForTimeout(2000);
  }

  async createFeedPost(content: string) {
    await this.navigateToFeed();
    await this.createPostBtn().click();
    await this.postBodyInput().fill(content);
    await this.submitBtn().click();
    await this.page.waitForTimeout(2000);
  }

  async getPostCount(): Promise<number> {
    return this.posts().count();
  }

  async expectPostVisible(text: string) {
    await expect(this.postContent(text)).toBeVisible({ timeout: 10_000 });
  }

  async expectPostNotVisible(text: string) {
    await expect(this.postContent(text)).toBeHidden({ timeout: 5_000 });
  }
}
