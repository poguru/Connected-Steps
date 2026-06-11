import { Page, expect } from "@playwright/test";
import { BasePage } from "./BasePage";
import { ROUTES } from "../utils/test-data";

export class ProfilePage extends BasePage {
  readonly editEmailBtn    = () => this.page.getByRole("button", { name: /edit|change email/i }).first();
  readonly newEmailInput   = () => this.getByPlaceholder(/new email/i);
  readonly sendCodeBtn     = () => this.page.getByRole("button", { name: /send code/i });
  readonly otpInput        = () => this.page.locator("input[maxlength='6'], input[name='otp']").first();
  readonly verifyBtn       = () => this.page.getByRole("button", { name: /verify/i });
  readonly currentPwdInput = () => this.getByPlaceholder(/current password/i);
  readonly newPwdInput     = () => this.getByPlaceholder(/new password/i);
  readonly savePwdBtn      = () => this.page.getByRole("button", { name: /save|update password/i });
  readonly firstName       = () => this.getByLabel(/first name/i);
  readonly saveProfileBtn  = () => this.page.getByRole("button", { name: /save|update profile/i });
  readonly successMsg      = () => this.page.getByText(/updated|success|saved/i).first();
  readonly errorMsg        = () => this.page.locator("[role='alert'], .error").first();

  async navigate() {
    await this.goto(ROUTES.profile);
  }

  async startEmailChange(newEmail: string) {
    await this.navigate();
    await this.editEmailBtn().click();
    await this.newEmailInput().fill(newEmail);
    await this.sendCodeBtn().click();
    await this.page.waitForTimeout(2000);
  }

  async enterOtpAndVerify(otp: string) {
    await this.otpInput().fill(otp);
    await this.verifyBtn().click();
    await this.page.waitForTimeout(2000);
  }

  async changePassword(current: string, newPwd: string) {
    await this.navigate();
    await this.currentPwdInput().fill(current);
    await this.newPwdInput().fill(newPwd);
    await this.savePwdBtn().click();
    await this.page.waitForTimeout(2000);
  }

  async expectSuccess(text?: string) {
    await expect(this.successMsg()).toBeVisible({ timeout: 10_000 });
    if (text) await expect(this.successMsg()).toContainText(text);
  }

  async expectError(text?: string) {
    await expect(this.errorMsg()).toBeVisible({ timeout: 5_000 });
    if (text) await expect(this.errorMsg()).toContainText(text);
  }
}
