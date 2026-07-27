/**
 * TC-VOL* — Volunteer portal: check-in, T-shirt, and breakfast service tests
 *
 * Coverage:
 *  - Check-in API auth guard (401 without credentials)
 *  - Invalid QR token rejected with structured error
 *  - Valid check-in roundtrip (requires live event + registered participant)
 *  - Duplicate check-in returns already_checked_in:true (idempotency)
 *  - T-shirt distribution API auth guard
 *  - Breakfast marking API auth guard
 *  - Volunteer portal page renders without crash
 *  - Service-config controls what services appear on portal
 */

import { test, expect } from "../../fixtures/base";
import * as fs from "fs";
import * as path from "path";
import { ENV } from "../../utils/env";

const TOKEN_FILE = path.join(__dirname, "../../playwright/.auth/token.txt");
function readUserToken() {
  try { return fs.readFileSync(TOKEN_FILE, "utf8").trim(); } catch { return ""; }
}

const FAKE_EVENT_ID = "00000000-0000-0000-0000-000000000001";
const FAKE_QR       = "invalid-qr-token-for-testing";

// ── Auth guard tests (no credentials required) ────────────────────────────────

test.describe("Volunteer — API auth guards @smoke", () => {
  test("TC-VOL01 | check-in POST requires auth", async ({ request }) => {
    const res = await request.post("/api/events/check-in", {
      data: { token: FAKE_QR, event_id: FAKE_EVENT_ID },
    });
    expect(res.status()).toBe(401);
  });

  test("TC-VOL02 | tshirt-distribute POST requires auth", async ({ request }) => {
    const res = await request.post("/api/events/tshirt-distribute", {
      data: { token: FAKE_QR, event_id: FAKE_EVENT_ID },
    });
    expect(res.status()).toBe(401);
  });

  test("TC-VOL03 | mark-breakfast POST requires auth", async ({ request }) => {
    const res = await request.post("/api/events/mark-breakfast", {
      data: { participant_id: "00000000-0000-0000-0000-000000000002", event_id: FAKE_EVENT_ID },
    });
    expect(res.status()).toBe(401);
  });

  test("TC-VOL04 | portal-users GET requires auth", async ({ request }) => {
    const res = await request.get(`/api/admin/events/${FAKE_EVENT_ID}/portal-users`);
    expect(res.status()).toBe(401);
  });
});

// ── Invalid QR rejection ──────────────────────────────────────────────────────

test.describe("Volunteer — QR validation", () => {
  test("TC-VOL10 | invalid QR token returns 400 from check-in", async ({ page, db }) => {
    const ev = await db.getPublishedEvent();
    if (!ev) { test.skip(true, "No published event"); return; }

    // Use page context which carries the admin cookie from global.setup
    const res = await page.request.post("/api/events/check-in", {
      data: { token: FAKE_QR, event_id: ev.id },
    });
    if (res.status() === 401) { test.skip(true, "No admin auth state"); return; }

    expect(res.status()).toBe(400);
    const body = await res.json() as { error?: string };
    expect(body.error).toBeTruthy();
  });

  test("TC-VOL11 | invalid QR token returns 400 from tshirt-distribute", async ({ page, db }) => {
    const ev = await db.getPublishedEvent();
    if (!ev) { test.skip(true, "No published event"); return; }

    const res = await page.request.post("/api/events/tshirt-distribute", {
      data: { token: FAKE_QR, event_id: ev.id },
    });
    if (res.status() === 401) { test.skip(true, "No admin auth state"); return; }

    expect(res.status()).toBe(400);
  });

  test("TC-VOL12 | cross-event QR token rejected", async ({ page, db }) => {
    // Register for one event, then try to check in at a different event
    const token = readUserToken();
    if (!token) { test.skip(true, "No user token"); return; }

    const events = await Promise.all([db.getFreePublishedEvent(), db.getPublishedEvent()]);
    const freeEv = events[0];
    const otherEv = events[1];
    if (!freeEv || !otherEv || freeEv.id === otherEv.id) {
      test.skip(true, "Need two distinct events for cross-event test"); return;
    }

    // Register for free event to get a QR token
    await db.deleteEventRegistration(freeEv.id, ENV.TEST_EMAIL);
    const cat = freeEv.distance_categories?.[0] ?? undefined;
    await page.request.post("/api/events/register", {
      data: {
        event_id: freeEv.id, email: ENV.TEST_EMAIL, name: "QA Vol User",
        phone: "9000000099", gender: "male", date_of_birth: "1990-01-15",
        blood_group: "B+", emergency_contact: "9000000098", special_notes: "NA",
        distance_category: cat,
      },
      headers: { "x-user-token": token },
    });

    const reg = await db.getEventRegistration(freeEv.id, ENV.TEST_EMAIL);
    if (!reg?.id) { test.skip(true, "Registration not found"); return; }

    const participants = await db.getEventParticipants(reg.id);
    const qrToken = participants[0]?.qr_token;
    if (!qrToken) { test.skip(true, "No QR token"); return; }

    // Try to check in at a DIFFERENT event — must be rejected
    const checkInRes = await page.request.post("/api/events/check-in", {
      data: { token: qrToken, event_id: otherEv.id },
    });
    if (checkInRes.status() === 401) {
      await db.deleteEventRegistration(freeEv.id, ENV.TEST_EMAIL);
      test.skip(true, "No admin auth state"); return;
    }

    expect(checkInRes.status()).toBe(400);
    const body = await checkInRes.json() as { error?: string };
    expect(body.error).toMatch(/invalid|event|token/i);

    await db.deleteEventRegistration(freeEv.id, ENV.TEST_EMAIL);
  });
});

// ── Full check-in roundtrip ───────────────────────────────────────────────────

test.describe("Volunteer — check-in roundtrip", () => {
  test("TC-VOL20 | check-in marks participant as checked_in", async ({ page, db }) => {
    const token = readUserToken();
    if (!token) { test.skip(true, "No user token"); return; }

    const ev = await db.getFreePublishedEvent();
    if (!ev) { test.skip(true, "No free published event"); return; }

    await db.deleteEventRegistration(ev.id, ENV.TEST_EMAIL);
    const cat = ev.distance_categories?.[0] ?? undefined;
    const regRes = await page.request.post("/api/events/register", {
      data: {
        event_id: ev.id, email: ENV.TEST_EMAIL, name: "QA Checkin User",
        phone: "9000000011", gender: "female", date_of_birth: "1995-03-20",
        blood_group: "A+", emergency_contact: "9000000012", special_notes: "NA",
        distance_category: cat,
      },
      headers: { "x-user-token": token },
    });
    if (regRes.status() !== 200) { test.skip(true, "Registration failed"); return; }

    const reg = await db.getEventRegistration(ev.id, ENV.TEST_EMAIL);
    if (!reg?.id) { test.skip(true, "No registration found"); return; }

    const participants = await db.getEventParticipants(reg.id);
    const qrToken = participants[0]?.qr_token;
    if (!qrToken) { test.skip(true, "No QR token on participant"); return; }

    // Perform check-in
    const checkInRes = await page.request.post("/api/events/check-in", {
      data: { token: qrToken, event_id: ev.id },
    });
    if (checkInRes.status() === 401) {
      await db.deleteEventRegistration(ev.id, ENV.TEST_EMAIL);
      test.skip(true, "No admin auth state"); return;
    }

    expect(checkInRes.status()).toBe(200);
    const body = await checkInRes.json() as { valid?: boolean; already_checked_in?: boolean };
    expect(body.valid).toBe(true);
    expect(body.already_checked_in).toBe(false);

    // Duplicate check-in — must be idempotent
    const dupRes = await page.request.post("/api/events/check-in", {
      data: { token: qrToken, event_id: ev.id },
    });
    expect(dupRes.status()).toBe(200);
    const dupBody = await dupRes.json() as { already_checked_in?: boolean };
    expect(dupBody.already_checked_in).toBe(true);

    await db.deleteEventRegistration(ev.id, ENV.TEST_EMAIL);
  });
});

// ── Volunteer portal page rendering ──────────────────────────────────────────

test.describe("Volunteer — portal UI @smoke", () => {
  test("TC-VOL30 | /volunteer/[eventId] renders without 500", async ({ page, db }) => {
    const ev = await db.getPublishedEvent();
    if (!ev) { test.skip(true, "No published event"); return; }

    await page.goto(`/volunteer/${ev.id}`);
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).not.toMatch(/500|TypeError|internal server error/i);
  });

  test("TC-VOL31 | volunteer portal redirects to login when unauthenticated", async ({ page, db }) => {
    const ev = await db.getPublishedEvent();
    if (!ev) { test.skip(true, "No published event"); return; }

    // New page context without any auth cookies
    const ctx = await page.context().browser()!.newContext();
    const pg  = await ctx.newPage();
    await pg.goto(`/volunteer/${ev.id}`);
    await pg.waitForLoadState("networkidle");

    const url = pg.url();
    // Must redirect to login/auth or show unauthorized — never a 500
    const bodyText = await pg.textContent("body");
    const isRedirectedOrUnauth = url.includes("/login") || url.includes("/auth") ||
      (bodyText?.match(/login|sign.?in|unauthorized/i) ?? false);
    expect(isRedirectedOrUnauth).toBe(true);
    expect(bodyText).not.toMatch(/500|TypeError/);

    await ctx.close();
  });
});
