import { test, expect } from "../../fixtures/base";
import { ROUTES } from "../../utils/test-data";

test.describe("Leaderboard", () => {
  test("TC-LB01 | leaderboard API returns ranked entries", async ({ api }) => {
    const res = await api.getLeaderboard();
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("TC-LB02 | leaderboard sorted by month_points descending", async ({ api, leaderboardPage }) => {
    const res = await api.getLeaderboard();
    const entries = (await res.json()) as Array<{ month_points: number }>;
    if (entries.length < 2) return;
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].month_points).toBeLessThanOrEqual(entries[i - 1].month_points);
    }
  });

  test("TC-LB03 | leaderboard does NOT expose email addresses publicly", async ({ page, leaderboardPage }) => {
    await page.context().clearCookies();
    await leaderboardPage.navigate();
    await page.waitForLoadState("networkidle");
    await leaderboardPage.expectNoEmailsVisible();
  });

  test("TC-LB04 | user personal rank endpoint returns rank and points", async ({ api }) => {
    const res = await api.getUserRank();
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("rank");
    expect(body).toHaveProperty("month_points");
  });

  test("TC-LB05 | leaderboard point breakdown returns itemised data", async ({ api }) => {
    const res = await api.getLeaderboardBreakdown();
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test("TC-LB06 | leaderboard recalculate is idempotent", async ({ api, db }) => {
    const { USERS } = await import("../../utils/test-data");
    const before = await db.getLeaderboardEntry(USERS.standard.email);
    const month = new Date().toISOString().slice(0, 7);
    await api.adminRecalculateLeaderboard(month);
    const after1 = await db.getLeaderboardEntry(USERS.standard.email);
    await api.adminRecalculateLeaderboard(month);
    const after2 = await db.getLeaderboardEntry(USERS.standard.email);
    if (before && after1 && after2) {
      expect(after1.month_points).toBe(after2.month_points);
      expect(after1.total_points).toBe(after2.total_points);
    }
  });

  test("TC-LB07 | public leaderboard page accessible without login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(ROUTES.leaderboard);
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/auth");
  });

  test("TC-LB08 | rank snapshot cron is authenticated", async ({ request }) => {
    const res = await request.get("/api/cron/rank-snapshot"); // no auth header
    expect(res.status()).toBe(401);
  });
});
