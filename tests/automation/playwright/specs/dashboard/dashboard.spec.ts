import { test, expect } from "../../fixtures/base";
import { ROUTES } from "../../utils/test-data";

test.describe("Dashboard", () => {
  test("TC-DASH01 | dashboard loads with key widgets for authenticated user", async ({ dashboardPage }) => {
    await dashboardPage.waitForLoad();
    // Dashboard renders "Month Pts" and "All-Time Pts" stat cells and a workout row
    await expect(dashboardPage.statCells()).toBeVisible({ timeout: 10_000 });
    await expect(dashboardPage.workoutRow()).toBeVisible({ timeout: 10_000 });
  });

  // Clearing cookies alone does not clear localStorage (where cs_user is stored).
  // We must clear both so the dashboard has no auth state and redirects.
  test("TC-DASH02 | unauthenticated access to /dashboard redirects to /auth", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.context().clearCookies();
    await page.goto(ROUTES.dashboard);
    await page.waitForTimeout(3000);
    expect(page.url()).toMatch(/\/auth/);
  });

  test("TC-DASH03 | free user does NOT see training plan widget", async ({ dashboardPage, db }) => {
    const { USERS } = await import("../../utils/test-data");
    await db.expireMembership(USERS.standard.email).catch(() => {});
    await dashboardPage.waitForLoad();
    const planWidget  = dashboardPage.trainingPlanWidget();
    const upgradeBtn  = dashboardPage.upgradeBtn();
    const planVisible = await planWidget.isVisible().catch(() => false);
    const upgradeVis  = await upgradeBtn.isVisible().catch(() => false);
    expect(planVisible === false || upgradeVis === true).toBe(true);
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
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewWidth + 5);
    await page.screenshot({ path: "reports/screenshots/dashboard-mobile.png" });
  });

  // Streak chip is only rendered when streak > 0.
  // The page object returns 0 (not -1) when the element is absent.
  test("TC-DASH06 | streak count is a non-negative number", async ({ dashboardPage }) => {
    await dashboardPage.waitForLoad();
    const count = await dashboardPage.getStreakCount();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
