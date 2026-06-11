import { Page, expect } from "@playwright/test";
import { BasePage } from "./BasePage";
import { ROUTES } from "../utils/test-data";

export class CoachPage extends BasePage {
  readonly coachCards      = () => this.locator("[data-testid='coach-card'], .coach-card");
  readonly questionInput   = () => this.getByPlaceholder(/question|ask/i);
  readonly submitQBtn      = () => this.page.getByRole("button", { name: /submit|ask/i });
  readonly questions       = () => this.locator("[data-testid='question-row'], .question-item");
  readonly answeredBadge   = () => this.page.getByText(/answered/i).first();
  readonly pendingBadge    = () => this.page.getByText(/pending|unanswered/i).first();
  readonly trainingPlan    = () => this.locator("[data-testid='training-plan-content'], .training-plan");
  readonly upgradePrompt   = () => this.page.getByText(/premium|upgrade/i).first();
  readonly inboxConversations = () => this.locator("[data-testid='conversation-row'], .conversation-item");

  async navigateToCoaches() {
    await this.goto(ROUTES.coaches);
  }

  async navigateToMyQuestions() {
    await this.goto(ROUTES.myQuestions);
  }

  async submitQuestion(question: string) {
    await this.navigateToMyQuestions();
    await this.questionInput().fill(question);
    await this.submitQBtn().click();
    await this.page.waitForTimeout(2000);
  }

  async coachCount(): Promise<number> {
    return this.coachCards().count();
  }

  async questionCount(): Promise<number> {
    return this.questions().count();
  }

  async expectUpgradePrompt() {
    await expect(this.upgradePrompt()).toBeVisible({ timeout: 5_000 });
  }

  async expectTrainingPlanVisible() {
    await expect(this.trainingPlan()).toBeVisible({ timeout: 10_000 });
  }
}
