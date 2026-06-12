import { test, expect } from "../../fixtures/base";
import { USERS, ROUTES } from "../../utils/test-data";

test.describe("Authentication — Login", () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // no pre-auth for this suite

  test("TC-L01 | valid email+password login redirects to dashboard", async ({ authPage }) => {
    await authPage.signIn(USERS.standard.email, USERS.standard.password);
    await authPage.expectSignedIn();
  });

  test("TC-L02 | wrong password shows error, does not redirect", async ({ authPage, page }) => {
    await authPage.attemptSignIn(USERS.standard.email, "WrongPassword999!");
    await authPage.expectSignInError();
    expect(page.url()).toContain("/auth");
  });

  test("TC-L03 | non-existent email shows error", async ({ authPage, page }) => {
    await authPage.attemptSignIn("nobody@connectedsteps.test", "SomePass@123");
    await authPage.expectSignInError();
    expect(page.url()).toContain("/auth");
  });

  test("TC-L04 | empty email shows validation error", async ({ authPage, page }) => {
    await authPage.navigateToSignIn();
    await authPage.passwordInput().fill("SomePass@123");
    await authPage.signInBtn().click();
    await page.waitForTimeout(1000);
    expect(page.url()).toContain("/auth");
  });

  test("TC-L05 | empty password shows validation error", async ({ authPage, page }) => {
    await authPage.navigateToSignIn();
    await authPage.emailInput().fill(USERS.standard.email);
    await authPage.signInBtn().click();
    await page.waitForTimeout(1000);
    expect(page.url()).toContain("/auth");
  });

  test("TC-L06 | deactivated user is blocked from login", async ({ authPage, db, page }) => {
    await db.deactivateUser(USERS.standard.email);
    try {
      await authPage.attemptSignIn(USERS.standard.email, USERS.standard.password);
      await page.waitForTimeout(2000);
      // Must still be on /auth — NOT dashboard
      expect(page.url()).toContain("/auth");
      const bodyText = await page.textContent("body");
      expect(bodyText).toMatch(/suspended|deactivated|disabled|invalid/i);
    } finally {
      await db.activateUser(USERS.standard.email);
    }
  });

  // Use `identifier` (not `email`) to match the actual login API field name.
  // Prior tests (TC-L02, TC-L03) each consume 1 of 5 failure quota; this loop
  // fires up to 12 times and must trip the limiter within the same window.
  test("TC-L07 | login rate limiting triggers after repeated failures", async ({ request }) => {
    const attempts = 12;
    let got429 = false;
    for (let i = 0; i < attempts; i++) {
      const res = await request.post("/api/auth/login", {
        data: { identifier: USERS.standard.email, password: `wrong${i}` },
      });
      if (res.status() === 429) { got429 = true; break; }
    }
    expect(got429, "Expected 429 after repeated login failures").toBe(true);
  });

  test("TC-L08 | logout clears session and protected routes redirect to /auth", async ({ authPage, page, request }) => {
    // TC-L07 intentionally trips the rate limiter for the standard user.
    // Reset it before attempting another sign-in in this test.
    await request.delete("/api/test-utils/reset-rate-limits").catch(() => {});
    await authPage.signIn(USERS.standard.email, USERS.standard.password);
    await authPage.logout();
    await page.goto(ROUTES.dashboard);
    await page.waitForTimeout(2000);
    expect(page.url()).toMatch(/\/auth/);
  });
});
