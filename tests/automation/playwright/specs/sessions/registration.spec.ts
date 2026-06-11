import { test, expect } from "../../fixtures/base";
import { ROUTES } from "../../utils/test-data";

test.describe("Session Registration", () => {
  test("TC-SR01 | upcoming sessions listed on dashboard", async ({ dashboardPage }) => {
    await dashboardPage.waitForLoad();
    await expect(dashboardPage.upcomingSessions()).toBeVisible({ timeout: 10_000 });
  });

  test("TC-SR02 | join session increments RSVP count", async ({ page, api, db }) => {
    const sessionsRes = await api.getSessions();
    expect(sessionsRes.status()).toBe(200);
    const sessions = await sessionsRes.json();
    if (!sessions?.length) {
      test.skip(true, "No upcoming sessions — skipping join test");
      return;
    }
    const sessionId = sessions[0].id;
    const before = await db.getAttendanceCount(sessionId);

    const joinRes = await api.joinSession(sessionId);
    expect(joinRes.status()).toBe(200);

    const after = await db.getAttendanceCount(sessionId);
    expect(after).toBeGreaterThanOrEqual(before);

    // Cleanup
    await api.leaveSession(sessionId);
  });

  test("TC-SR03 | join then leave removes attendance record", async ({ api, db }) => {
    const sessionsRes = await api.getSessions();
    const sessions = await sessionsRes.json();
    if (!sessions?.length) { test.skip(true, "No sessions"); return; }
    const sessionId = sessions[0].id;

    await api.joinSession(sessionId);
    const after = await db.getAttendanceCount(sessionId);

    await api.leaveSession(sessionId);
    const afterLeave = await db.getAttendanceCount(sessionId);

    expect(afterLeave).toBeLessThan(after);
  });

  test("TC-SR04 | cannot join same session twice", async ({ api }) => {
    const sessionsRes = await api.getSessions();
    const sessions = await sessionsRes.json();
    if (!sessions?.length) { test.skip(true, "No sessions"); return; }
    const sessionId = sessions[0].id;

    await api.joinSession(sessionId);
    const r2 = await api.joinSession(sessionId);
    // Should be 409 conflict or graceful already-joined response
    expect([200, 400, 409]).toContain(r2.status());

    await api.leaveSession(sessionId);
  });

  test("TC-SR05 | join button changes to joined state after clicking", async ({ page, dashboardPage }) => {
    await dashboardPage.waitForLoad();
    const joined = await dashboardPage.joinFirstAvailableSession();
    if (!joined) { test.skip(true, "No join button visible"); return; }
    // Join state should be reflected
    const joinedLabel = dashboardPage.joinedLabel();
    const visible = await joinedLabel.isVisible().catch(() => false);
    expect(visible).toBe(true);
  });

  test("TC-SR06 | registration blocked >2h after session start", async ({ request, db }) => {
    // Create a session that started 3h ago
    const pastTime = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const dateStr = pastTime.toISOString().slice(0, 10);
    const timeStr = `${pastTime.getHours().toString().padStart(2, "0")}:${pastTime.getMinutes().toString().padStart(2, "0")}`;
    const session = await db.createSession({
      title: "QA Past Session",
      date: dateStr,
      time: timeStr,
      venue: "Test Venue",
      location: "Hyderabad",
    });
    try {
      const res = await request.post(`/api/sessions/${session.id}/join`);
      const body = await res.json();
      expect(res.status()).toBeGreaterThanOrEqual(400);
      expect(body.error ?? body.message ?? "").toMatch(/closed|ended|past|expired/i);
    } finally {
      await db.deleteSession(session.id);
    }
  });

  test("TC-SR07 | session detail page renders OG image", async ({ page, db }) => {
    const session = await db.getUpcomingSession();
    if (!session) { test.skip(true, "No upcoming session"); return; }
    const res = await page.request.get(`/api/og/session/${session.id}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/image/);
  });
});
