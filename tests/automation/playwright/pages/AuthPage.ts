import { Page, expect } from "@playwright/test";
import { BasePage } from "./BasePage";
import { ROUTES } from "../utils/test-data";

export class AuthPage extends BasePage {
  readonly emailInput    = () => this.getByPlaceholder("Email address");
  readonly passwordInput = () => this.getByPlaceholder(/^password/i);
  readonly signInBtn     = () => this.page.locator("form").getByRole("button", { name: "Sign in", exact: true });
  readonly signUpTab     = () => this.page.getByRole("button", { name: "Create account", exact: true });
  readonly signInTab     = () => this.page.locator("button:not([type='submit']):has-text('Sign in')").first();
  readonly errorMsg      = () => this.page.locator("[data-testid='auth-error'], .error-message, [role='alert']").first();
  readonly forgotPwdLink = () => this.page.getByRole("link", { name: /forgot password/i });
  readonly sendOtpBtn    = () => this.page.getByRole("button", { name: /send code|send otp/i });
  readonly otpInput      = () => this.page.locator("input[maxlength='6'], input[name='otp']").first();
  readonly verifyOtpBtn  = () => this.page.getByRole("button", { name: /verify|confirm/i });

  async navigateToSignIn() {
    // ?tab=login forces LoginForm via useEffect in AuthPage component
    await this.goto("/auth?tab=login");
    await this.page.waitForLoadState("networkidle");
    await this.page.waitForTimeout(500);
  }

  async navigateToSignUp() {
    await this.goto("/auth");
    await this.page.waitForLoadState("networkidle");
  }

  async signIn(email: string, password: string) {
    await this.navigateToSignIn();
    await this.emailInput().fill(email);
    await this.passwordInput().fill(password);
    await this.signInBtn().click();
    await this.page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 20_000 });
    await this.page.waitForLoadState("networkidle");
  }

  async attemptSignIn(email: string, password: string) {
    await this.navigateToSignIn();
    await this.emailInput().fill(email);
    await this.passwordInput().fill(password);
    await this.signInBtn().click();
    await this.page.waitForTimeout(3000);
  }

  async fillSignUpStep1(data: { firstName: string; lastName: string; email: string; password: string }) {
    await this.navigateToSignUp();
    await this.page.getByPlaceholder("First name").fill(data.firstName);
    await this.page.getByPlaceholder("Last name").fill(data.lastName);
    await this.page.getByPlaceholder("Email address").fill(data.email);
    await this.page.getByPlaceholder(/password \(min/i).fill(data.password);
    await this.page.getByRole("button", { name: /next|continue|create/i }).click();
    await this.page.waitForTimeout(1000);
  }

  async logout() {
    const logoutBtn = this.page.getByRole("button", { name: /log out|sign out/i });
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
    } else {
      await this.page.evaluate(() => {
        document.cookie.split(";").forEach((c) => {
          document.cookie = c.replace(/^ +/, "").replace(/=.*/, `=;expires=${new Date().toUTCString()};path=/`);
        });
        localStorage.clear();
      });
    }
    await this.page.waitForURL(/\/auth|\//, { timeout: 10_000 });
  }

  async expectSignedIn() {
    await expect(this.page).not.toHaveURL(/\/auth/, { timeout: 10_000 });
  }

  async expectSignInError(text?: string) {
    const err = this.errorMsg();
    await expect(err).toBeVisible({ timeout: 5_000 });
    if (text) await expect(err).toContainText(text);
  }

  async expect429RateLimited() {
    const text = this.page.getByText(/too many|rate limit|try again later/i).first();
    const status = await this.page.evaluate(() => {
      const el = document.querySelector("[data-testid='auth-error'], .error-message, [role='alert']");
      return el?.textContent ?? "";
    });
    const isRateLimited =
      (await text.isVisible().catch(() => false)) ||
      /too many|rate limit|429/i.test(status);
    return isRateLimited;
  }
}
