import { Page, Locator, expect } from "@playwright/test";
import { TIMEOUTS } from "../utils/test-data";

export abstract class BasePage {
  constructor(protected page: Page) {}

  async goto(path: string) {
    await this.page.goto(path);
    await this.page.waitForLoadState("networkidle");
  }

  async waitForToast(text?: string) {
    const toast = this.page.locator('[role="alert"], [data-toast], .toast, .Toastify__toast').first();
    await toast.waitFor({ state: "visible", timeout: TIMEOUTS.standard });
    if (text) await expect(toast).toContainText(text);
    return toast;
  }

  async expectNoConsoleErrors() {
    const errors: string[] = [];
    this.page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await this.page.waitForTimeout(1000);
    return errors;
  }

  async screenshot(name: string) {
    await this.page.screenshot({
      path: `reports/screenshots/${name}-${Date.now()}.png`,
      fullPage: false,
    });
  }

  async waitForApiResponse(urlPattern: string | RegExp) {
    return this.page.waitForResponse(
      (r) => (typeof urlPattern === "string"
        ? r.url().includes(urlPattern)
        : urlPattern.test(r.url()))
        && r.status() < 400,
      { timeout: TIMEOUTS.long },
    );
  }

  async expectVisible(locator: Locator) {
    await expect(locator).toBeVisible({ timeout: TIMEOUTS.standard });
  }

  async expectHidden(locator: Locator) {
    await expect(locator).toBeHidden({ timeout: TIMEOUTS.standard });
  }

  protected getByText(text: string | RegExp) {
    return this.page.getByText(text).first();
  }

  protected getByRole(role: Parameters<Page["getByRole"]>[0], options?: Parameters<Page["getByRole"]>[1]) {
    return this.page.getByRole(role, options);
  }

  protected getByPlaceholder(text: string | RegExp) {
    return this.page.getByPlaceholder(text);
  }

  protected getByLabel(text: string | RegExp) {
    return this.page.getByLabel(text);
  }

  protected locator(selector: string) {
    return this.page.locator(selector);
  }
}
