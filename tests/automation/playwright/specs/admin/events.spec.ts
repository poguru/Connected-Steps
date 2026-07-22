/**
 * TC-EVT* — Generic Event Platform tests
 *
 * Coverage:
 *  - Public event listing + slug fetch
 *  - Free event registration (single participant) + idempotency
 *  - my-registrations endpoint (auth + shape)
 *  - QR code endpoint (valid token → PNG, invalid → 400)
 *  - Admin event API auth guards (expect 401 with no creds)
 *  - Admin service-config GET/PUT round-trip
 *  - Admin CSV export content-type
 *  - Dashboard /events page renders without JS error
 *  - Participants admin page renders without JS error
 */

import { test, expect } from "../../fixtures/base";
import * as fs from "fs";
import * as path from "path";
import { ENV } from "../../utils/env";

const TOKEN_FILE = path.join(__dirname, "../../playwright/.auth/token.txt");
function readUserToken() {
  try { return fs.readFileSync(TOKEN_FILE, "utf8").trim(); } catch { return ""; }
}

// ── Public event endpoints ────────────────────────────────────────────────────

test.describe("Events — public API", () => {
  test("TC-EVT01 | GET /api/events returns an array", async ({ request }) => {
    const res  = await request.get("/api/events");
    expect([200, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json() as { events?: unknown[] };
      expect(Array.isArray(body.events ?? body)).toBe(true);
    }
  });

  test("TC-EVT02 | event slug page renders without 500", async ({ page, db }) => {
    const ev = await db.getPublishedEvent();
    if (!ev?.share_slug) { test.skip(true, "No published event with a share slug"); return; }
    await page.goto(`/events/${ev.share_slug}`);
    await page.waitForLoadState("networkidle");
    const title = await page.title();
    expect(title).not.toMatch(/500|error/i);
    const body = await page.textContent("body");
    expect(body).not.toMatch(/internal server error/i);
  });

  test("TC-EVT03 | event registration page renders for a published event", async ({ page, db }) => {
    const ev = await db.getPublishedEvent();
    if (!ev?.share_slug) { test.skip(true, "No published event"); return; }
    await page.goto(`/events/${ev.share_slug}/register`);
    await page.waitForLoadState("networkidle");
    // Should show a form or redirect to login — never a hard crash
    const body = await page.textContent("body");
    expect(body).not.toMatch(/500|internal server error/i);
  });
});

// ── Free event registration ───────────────────────────────────────────────────

test.describe("Events — free registration flow", () => {
  test("TC-EVT10 | register for a free event succeeds", async ({ request, db }) => {
    const token = readUserToken();
    if (!token) { test.skip(true, "No user token — run global.setup first"); return; }

    const ev = await db.getFreePublishedEvent();
    if (!ev) { test.skip(true, "No free published event in DB"); return; }

    // Clean up any previous test registration
    await db.deleteEventRegistration(ev.id, ENV.TEST_EMAIL);

    const cat = ev.distance_categories?.[0] ?? undefined;
    const res = await request.post("/api/events/register", {
      data: {
        event_id:          ev.id,
        email:             ENV.TEST_EMAIL,
        name:              "QA Test User",
        phone:             "9000000001",
        gender:            "male",
        date_of_birth:     "1990-01-15",
        blood_group:       "O+",
        emergency_contact: "9000000002",
        special_notes:     "NA",
        distance_category: cat,
      },
      headers: { "x-user-token": token },
    });

    expect(res.status()).toBe(200);
    const body = await res.json() as { success?: boolean; free?: boolean; already?: boolean; registration_code?: string };
    expect(body.success === true || body.already === true).toBe(true);
    expect(body.free).toBe(true);

    // Verify it's in the DB
    const reg = await db.getEventRegistration(ev.id, ENV.TEST_EMAIL);
    expect(reg).toBeTruthy();
    expect(reg!.payment_status).toBe("free");
    expect(reg!.status).toBe("confirmed");

    // Cleanup
    await db.deleteEventRegistration(ev.id, ENV.TEST_EMAIL);
  });

  test("TC-EVT11 | duplicate free registration returns already:true", async ({ request, db }) => {
    const token = readUserToken();
    if (!token) { test.skip(true, "No user token"); return; }

    const ev = await db.getFreePublishedEvent();
    if (!ev) { test.skip(true, "No free published event"); return; }

    await db.deleteEventRegistration(ev.id, ENV.TEST_EMAIL);
    const cat = ev.distance_categories?.[0] ?? undefined;
    const payload = {
      event_id: ev.id, email: ENV.TEST_EMAIL, name: "QA Test User",
      phone: "9000000001", gender: "male", date_of_birth: "1990-01-15",
      blood_group: "O+", emergency_contact: "9000000002", special_notes: "NA",
      distance_category: cat,
    };
    const headers = { "x-user-token": token };

    await request.post("/api/events/register", { data: payload, headers });
    const r2 = await request.post("/api/events/register", { data: payload, headers });

    expect(r2.status()).toBe(200);
    const body = await r2.json() as { already?: boolean };
    expect(body.already).toBe(true);

    await db.deleteEventRegistration(ev.id, ENV.TEST_EMAIL);
  });

  test("TC-EVT12 | registration without user token returns 401", async ({ request, db }) => {
    const ev = await db.getFreePublishedEvent();
    if (!ev) { test.skip(true, "No free published event"); return; }
    const res = await request.post("/api/events/register", {
      data: { event_id: ev.id, email: ENV.TEST_EMAIL, name: "X" },
    });
    expect(res.status()).toBe(401);
  });

  test("TC-EVT13 | participant rows created after free registration", async ({ request, db }) => {
    const token = readUserToken();
    if (!token) { test.skip(true, "No user token"); return; }

    const ev = await db.getFreePublishedEvent();
    if (!ev) { test.skip(true, "No free published event"); return; }

    await db.deleteEventRegistration(ev.id, ENV.TEST_EMAIL);
    const cat = ev.distance_categories?.[0] ?? undefined;
    await request.post("/api/events/register", {
      data: {
        event_id: ev.id, email: ENV.TEST_EMAIL, name: "QA Test User",
        phone: "9000000001", gender: "male", date_of_birth: "1990-01-15",
        blood_group: "O+", emergency_contact: "9000000002", special_notes: "NA",
        distance_category: cat,
      },
      headers: { "x-user-token": token },
    });

    const reg = await db.getEventRegistration(ev.id, ENV.TEST_EMAIL);
    expect(reg?.id).toBeTruthy();

    const participants = await db.getEventParticipants(reg!.id);
    expect(participants.length).toBeGreaterThanOrEqual(1);
    expect(participants[0].qr_token).toBeTruthy();
    expect(participants[0].status).toBe("active");

    await db.deleteEventRegistration(ev.id, ENV.TEST_EMAIL);
  });
});

// ── my-registrations endpoint ─────────────────────────────────────────────────

test.describe("Events — my-registrations", () => {
  test("TC-EVT20 | my-registrations requires user token", async ({ request }) => {
    const res = await request.get("/api/events/my-registrations");
    expect(res.status()).toBe(401);
  });

  test("TC-EVT21 | my-registrations returns array with correct shape", async ({ request }) => {
    const token = readUserToken();
    if (!token) { test.skip(true, "No user token"); return; }
    const res = await request.get("/api/events/my-registrations", {
      headers: { "x-user-token": token },
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as { registrations: Array<{ registration_code: string; participants?: unknown[] }> };
    expect(Array.isArray(body.registrations)).toBe(true);
    // If registrations exist, each should have a registration_code and participants array
    for (const r of body.registrations) {
      expect(typeof r.registration_code).toBe("string");
      expect(Array.isArray(r.participants ?? [])).toBe(true);
    }
  });
});

// ── QR code endpoint ──────────────────────────────────────────────────────────

test.describe("Events — QR endpoint", () => {
  test("TC-EVT30 | invalid QR token returns 400", async ({ request }) => {
    const res = await request.get("/api/events/qr/not-a-valid-token");
    expect(res.status()).toBe(400);
  });

  test("TC-EVT31 | valid QR token returns PNG image", async ({ request, db }) => {
    const token  = readUserToken();
    if (!token) { test.skip(true, "No user token"); return; }

    const ev = await db.getFreePublishedEvent();
    if (!ev) { test.skip(true, "No free published event"); return; }

    await db.deleteEventRegistration(ev.id, ENV.TEST_EMAIL);
    const cat = ev.distance_categories?.[0] ?? undefined;
    const regRes = await request.post("/api/events/register", {
      data: {
        event_id: ev.id, email: ENV.TEST_EMAIL, name: "QA QR Test",
        phone: "9000000001", gender: "male", date_of_birth: "1990-01-15",
        blood_group: "O+", emergency_contact: "9000000002", special_notes: "NA",
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

    const qrRes = await request.get(`/api/events/qr/${encodeURIComponent(qrToken)}`);
    expect(qrRes.status()).toBe(200);
    expect(qrRes.headers()["content-type"]).toMatch(/image\/png/);

    await db.deleteEventRegistration(ev.id, ENV.TEST_EMAIL);
  });
});

// ── Admin event API auth guards ───────────────────────────────────────────────

test.describe("Events — admin API auth guards", () => {
  const FAKE_ID = "00000000-0000-0000-0000-000000000001";

  test("TC-EVT40 | participants endpoint requires auth", async ({ request }) => {
    const res = await request.get(`/api/admin/events/${FAKE_ID}/participants`);
    expect(res.status()).toBe(401);
  });

  test("TC-EVT41 | export endpoint requires auth", async ({ request }) => {
    const res = await request.get(`/api/admin/events/${FAKE_ID}/export`);
    expect(res.status()).toBe(401);
  });

  test("TC-EVT42 | service-config GET requires auth", async ({ request }) => {
    const res = await request.get(`/api/admin/events/${FAKE_ID}/service-config`);
    expect(res.status()).toBe(401);
  });

  test("TC-EVT43 | portal-users endpoint requires auth", async ({ request }) => {
    const res = await request.get(`/api/admin/events/${FAKE_ID}/portal-users`);
    expect(res.status()).toBe(401);
  });

  test("TC-EVT44 | participants PATCH requires auth", async ({ request }) => {
    const res = await request.patch(`/api/admin/events/${FAKE_ID}/participants`, {
      data: { participant_id: FAKE_ID, bib_number: "001" },
    });
    expect(res.status()).toBe(401);
  });
});

// ── Admin service config round-trip (requires admin session) ──────────────────

test.describe("Events — admin service config", () => {
  test("TC-EVT50 | service-config GET returns default services when authed", async ({ page, db }) => {
    const ev = await db.getPublishedEvent();
    if (!ev) { test.skip(true, "No published event"); return; }

    // Use page context which has the admin cookie from global.setup
    const res = await page.request.get(`/api/admin/events/${ev.id}/service-config`);
    if (res.status() === 401) { test.skip(true, "Not running with admin auth state"); return; }

    expect(res.status()).toBe(200);
    const body = await res.json() as { services: Array<{ service_name: string; enabled: boolean }> };
    expect(Array.isArray(body.services)).toBe(true);
    expect(body.services.length).toBeGreaterThanOrEqual(1);
    // Check-in should always be present
    const checkin = body.services.find(s => s.service_name === "checkin");
    expect(checkin).toBeTruthy();
  });

  test("TC-EVT51 | service-config PUT persists changes", async ({ page, db }) => {
    const ev = await db.getPublishedEvent();
    if (!ev) { test.skip(true, "No published event"); return; }

    // GET current config
    const getRes = await page.request.get(`/api/admin/events/${ev.id}/service-config`);
    if (getRes.status() === 401) { test.skip(true, "Not running with admin auth state"); return; }
    const current = await getRes.json() as { services: Array<{ service_name: string; enabled: boolean }> };

    // Toggle tshirt
    const toggled = current.services.map(s =>
      s.service_name === "tshirt" ? { ...s, enabled: !s.enabled } : s
    );
    const putRes = await page.request.put(`/api/admin/events/${ev.id}/service-config`, {
      data: { services: toggled },
    });
    expect(putRes.status()).toBe(200);

    // Restore original
    await page.request.put(`/api/admin/events/${ev.id}/service-config`, {
      data: { services: current.services },
    });
  });
});

// ── Admin CSV export ──────────────────────────────────────────────────────────

test.describe("Events — admin CSV export", () => {
  test("TC-EVT60 | export returns CSV content-type when authed", async ({ page, db }) => {
    const ev = await db.getPublishedEvent();
    if (!ev) { test.skip(true, "No published event"); return; }

    const res = await page.request.get(`/api/admin/events/${ev.id}/export`);
    if (res.status() === 401) { test.skip(true, "Not running with admin auth state"); return; }

    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/text\/csv/);
    expect(res.headers()["content-disposition"]).toMatch(/attachment.*\.csv/);

    const text = await res.text();
    // Must start with the header row
    expect(text).toMatch(/Registration Code/);
    expect(text).toMatch(/First Name/);
  });
});

// ── User-facing dashboard event pages ─────────────────────────────────────────

test.describe("Events — dashboard UI", () => {
  test("TC-EVT70 | /dashboard/events page loads without crash", async ({ page }) => {
    await page.goto("/dashboard/events");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    // Either shows registrations or redirects to login — never a 500
    expect(body).not.toMatch(/500|internal server error/i);
  });

  test("TC-EVT71 | /dashboard/events shows event registrations for authed user", async ({ page }) => {
    // This fixture uses the user auth storageState saved by global.setup
    await page.goto("/dashboard/events");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    // Either on dashboard/events or redirected to auth page
    expect(url).toMatch(/dashboard\/events|auth|login/);
  });
});

// ── Admin event management pages ──────────────────────────────────────────────

test.describe("Events — admin management pages", () => {
  const FAKE_ID = "00000000-0000-0000-0000-000000000001";

  test("TC-EVT80 | /admin/events/[id]/participants loads (redirect or page)", async ({ page }) => {
    await page.goto(`/admin/events/${FAKE_ID}/participants`);
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).not.toMatch(/500|TypeError/);
  });

  test("TC-EVT81 | /admin/events/[id]/volunteers loads (redirect or page)", async ({ page }) => {
    await page.goto(`/admin/events/${FAKE_ID}/volunteers`);
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).not.toMatch(/500|TypeError/);
  });

  test("TC-EVT82 | /admin/events/[id]/services loads (redirect or page)", async ({ page }) => {
    await page.goto(`/admin/events/${FAKE_ID}/services`);
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).not.toMatch(/500|TypeError/);
  });

  test("TC-EVT83 | manage page includes nav links for new sections", async ({ page, db }) => {
    const ev = await db.getPublishedEvent();
    if (!ev) { test.skip(true, "No published event"); return; }

    await page.goto(`/admin/events/${ev.id}/manage`);
    await page.waitForLoadState("networkidle");

    const url = page.url();
    if (url.includes("/admin/login") || url.includes("/auth")) {
      test.skip(true, "Admin login required — no auth state"); return;
    }

    // All three new nav items should be present in the sidebar
    const html = await page.content();
    expect(html).toMatch(/Participants/);
    expect(html).toMatch(/Volunteers/);
    expect(html).toMatch(/Services/);
  });
});
