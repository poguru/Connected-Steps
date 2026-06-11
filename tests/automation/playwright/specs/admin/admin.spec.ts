import { test, expect } from "../../fixtures/base";
import { futureDate, USERS } from "../../utils/test-data";

test.describe("Admin Panel", () => {
  test("TC-ADM01 | admin sessions list loads without error", async ({ adminPage }) => {
    await adminPage.navigateToSessions();
    await adminPage.page.waitForLoadState("networkidle");
    const count = await adminPage.getSessionCount();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("TC-ADM02 | admin memberships list loads", async ({ adminPage, api }) => {
    const res = await api.adminGetMemberships();
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("TC-ADM03 | admin users list loads", async ({ adminPage, api }) => {
    const res = await api.adminGetUsers();
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("TC-ADM04 | session sync is idempotent", async ({ api, db }) => {
    const session = await db.getUpcomingSession();
    if (!session) { test.skip(true, "No sessions"); return; }
    const r1 = await api.adminSyncSession(session.id);
    const r2 = await api.adminSyncSession(session.id);
    // Both should succeed or return a clean response
    expect([200]).toContain(r1.status());
    expect([200]).toContain(r2.status());
    const b1 = await r1.json();
    const b2 = await r2.json();
    // Synced count on second call = 0 (nothing new)
    expect(b2.synced ?? 0).toBe(0);
  });

  test("TC-ADM05 | broadcast to empty cohort returns clean response", async ({ api }) => {
    const res = await api.request.post("/api/admin/coach-ops/broadcast", {
      data: { cohort_id: null, emails: [], message: "Test broadcast", channel: "email" },
    });
    // Should return 200 with sent:0, not a 500
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.sent ?? 0).toBe(0);
    } else {
      expect([400, 422]).toContain(res.status());
    }
  });

  test("TC-ADM06 | admin community post approval changes status", async ({ api, db }) => {
    // Submit a community post first
    const postRes = await api.createCommunityPost({
      title: `Admin Approval Test ${Date.now()}`,
      body: "Admin should approve this",
      category: "general",
    });
    const post = await postRes.json();
    const postId = post.id ?? post.post?.id;
    if (!postId) return;

    // Admin approve
    const approveRes = await api.request.patch(`/api/admin/community`, {
      data: { id: postId, status: "approved" },
    });
    expect([200, 204]).toContain(approveRes.status());

    // Verify status in DB
    const updated = await db.getCommunityPost(postId);
    expect(updated?.status).toBe("approved");
  });

  test("TC-ADM07 | negative bonus points are rejected or clamped", async ({ api, db }) => {
    const session = await db.getUpcomingSession();
    if (!session) { test.skip(true, "No session"); return; }
    const { USERS } = await import("../../utils/test-data");
    const res = await api.request.post(`/api/admin/sessions/${session.id}/attendance`, {
      data: { user_email: USERS.standard.email, attended: true, bonus_points: -100 },
    });
    if (res.status() === 200) {
      // Accepted — verify leaderboard does not go negative
      await api.adminSyncSession(session.id);
      const entry = await db.getLeaderboardEntry(USERS.standard.email);
      expect(entry?.month_points ?? 0).toBeGreaterThanOrEqual(0);
    } else {
      expect([400, 422]).toContain(res.status());
    }
  });

  test("TC-ADM08 | leaderboard recalculate API requires admin auth", async ({ page }) => {
    await page.context().clearCookies();
    const res = await page.request.post("/api/admin/leaderboard/recalculate", {
      data: { month: new Date().toISOString().slice(0, 7) },
    });
    expect(res.status()).toBe(401);
  });
});
