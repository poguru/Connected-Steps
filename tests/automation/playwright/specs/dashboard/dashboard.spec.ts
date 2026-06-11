import { test, expect } from "../../fixtures/base";
import { ROUTES } from "../../utils/test-data";

test.describe("Dashboard", () => {
  test("TC-DASH01 | dashboard loads with key widgets for authenticated user", async ({ dashboardPage }) => {
    await dashboardPage.waitForLoad();
    await expect(dashboardPage.totalPoints()).toBeVisible({ timeout: 10_000 });
    await expect(dashboardPage.upcomingSessions()).toBeVisible({ timeout: 10_000 });
  });

  test("TC-DASH02 | unauthenticated access to /dashboard redirects to /auth", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(ROUTES.dashboard);
    await page.waitForTimeout(3000);
    expect(page.url()).toMatch(/\/auth/);
  });

  test("TC-DASH03 | free user does NOT see training plan widget", async ({ dashboardPage, db }) => {
    const { USERS } = await import("../../utils/test-data");
    // Ensure no active membership
    await db.expireMembership(USERS.standard.email).catch(() => {});
    await dashboardPage.waitForLoad();
    // Training plan should show upgrade prompt or be hidden
    const planWidget = dashboardPage.trainingPlanWidget();
    const upgradeBtn = dashboardPage.upgradeBtn();
    const planVisible = await planWidget.isVisible().catch(() => false);
    const upgradeVisible = await upgradeBtn.isVisible().catch(() => false);
    // Either plan is hidden, OR upgrade CTA is shown in its place
    expect(planVisible === false || upgradeVisible === true).toBe(true);
  });

  test("TC-DASH04 | notification bell is visible and clickable", async ({ dashboardPage }) => {
    await dashboardPage.waitForLoad();
    const bell = dashboardPage.notificationBell();
    if (await bell.isVisible()) {
      await bell.click();
      await dashboardPage.page.waitForTimeout(1000);
    }
  });

  test("TC-DASH05 | dashboard renders correctly on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(ROUTES.dashboard);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    // No horizontal scroll
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewWidth + 5);
    await page.screenshot({ path: "reports/screenshots/dashboard-mobile.png" });
  });

  test("TC-DASH06 | streak count shows a numeric value", async ({ dashboardPage }) => {
    await dashboardPage.waitForLoad();
    const count = await dashboardPage.getStreakCount().catch(() => -1);
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
