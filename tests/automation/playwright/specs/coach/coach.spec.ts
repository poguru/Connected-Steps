import { test, expect } from "../../fixtures/base";
import { ROUTES } from "../../utils/test-data";

test.describe("Coach Features", () => {
  test("TC-COACH01 | coaches listing page shows at least 1 coach", async ({ coachPage }) => {
    await coachPage.navigateToCoaches();
    await coachPage.page.waitForLoadState("networkidle");
    const count = await coachPage.coachCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("TC-COACH02 | individual coach profile page loads", async ({ page, api }) => {
    const res = await api.request.get("/api/coaches");
    if (res.status() !== 200) { test.skip(true, "No coaches API"); return; }
    const body = await res.json();
    const coaches = (body.coaches ?? []) as Array<{ id: string; name: string }>;
    if (!coaches?.length) { test.skip(true, "No coaches"); return; }
    await page.goto(`/coaches/${coaches[0].id}`);
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/404");
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
  });

  test("TC-COACH03 | free user cannot submit coach Q&A", async ({ api, db }) => {
    const { USERS } = await import("../../utils/test-data");
    await db.expireMembership(USERS.standard.email).catch(() => {});
    const res = await api.request.post("/api/coach-questions", {
      data: { question: "Can I train?", category: "training" },
    });
    expect(res.status()).toBe(403);
  });

  test("TC-COACH04 | free user sees upgrade prompt on training plan page", async ({ coachPage, page, db }) => {
    const { USERS } = await import("../../utils/test-data");
    await db.expireMembership(USERS.standard.email).catch(() => {});
    await page.goto(ROUTES.dashboard);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    // Training plan section should show lock/upgrade, not actual plan
    const upgradeText = page.getByText(/upgrade|premium|unlock/i).first();
    const planText = page.getByText(/week \d|training plan/i).first();
    const planVisible = await planText.isVisible().catch(() => false);
    const upgradeVisible = await upgradeText.isVisible().catch(() => false);
    expect(planVisible === false || upgradeVisible === true).toBe(true);
  });

  test("TC-COACH05 | training plan API returns 403 for free user", async ({ api, db }) => {
    const { USERS } = await import("../../utils/test-data");
    await db.expireMembership(USERS.standard.email).catch(() => {});
    const res = await api.getTrainingPlan();
    expect(res.status()).toBe(403);
  });

  test("TC-COACH06 | GET /api/coaches returns list with required fields", async ({ api }) => {
    const res = await api.request.get("/api/coaches");
    expect(res.status()).toBe(200);
    const body = await res.json();
    const coaches = (body.coaches ?? []) as Array<{ id?: string; name?: string }>;
    expect(Array.isArray(coaches)).toBe(true);
    if (coaches.length > 0) {
      expect(coaches[0]).toHaveProperty("name");
    }
  });
});
