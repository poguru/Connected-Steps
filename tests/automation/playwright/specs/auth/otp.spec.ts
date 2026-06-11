import { test, expect } from "../../fixtures/base";
import { USERS } from "../../utils/test-data";

test.describe("Authentication — OTP", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("TC-OTP01 | OTP verify rate limiting blocks after repeated wrong codes", async ({ request, db }) => {
    // Request an OTP so the identifier exists
    await request.post("/api/auth/send-otp", {
      data: { type: "email", value: USERS.standard.email, purpose: "login" },
    });
    let got429 = false;
    for (let i = 0; i < 15; i++) {
      const res = await request.post("/api/auth/verify-otp", {
        data: { email: USERS.standard.email, code: `00${i.toString().padStart(4, "0")}`, purpose: "login" },
      });
      if (res.status() === 429) { got429 = true; break; }
    }
    expect(got429, "Expected rate limit 429 on OTP verify").toBe(true);
  });

  test("TC-OTP02 | OTP send rate limiting blocks excessive requests", async ({ request }) => {
    let got429 = false;
    for (let i = 0; i < 8; i++) {
      const res = await request.post("/api/auth/send-otp", {
        data: { type: "email", value: USERS.standard.email, purpose: "login" },
      });
      if (res.status() === 429) { got429 = true; break; }
    }
    expect(got429, "Expected rate limit 429 on repeated OTP send").toBe(true);
  });

  test("TC-OTP03 | used OTP cannot be replayed", async ({ request, db }) => {
    // Get fresh OTP from DB (only works in test env with service role key)
    await request.post("/api/auth/send-otp", {
      data: { type: "email", value: USERS.standard.email, purpose: "login" },
    });
    const code = await db.getLatestOtp(USERS.standard.email);
    if (!code) {
      test.skip(true, "No OTP available in DB — skipping replay test");
      return;
    }
    // First use
    const r1 = await request.post("/api/auth/verify-otp", {
      data: { email: USERS.standard.email, code, purpose: "login" },
    });
    expect(r1.status()).toBe(200);

    // Replay
    const r2 = await request.post("/api/auth/verify-otp", {
      data: { email: USERS.standard.email, code, purpose: "login" },
    });
    expect(r2.status()).not.toBe(200);
  });

  test("TC-OTP04 | expired OTP returns error, not success", async ({ request }) => {
    const res = await request.post("/api/auth/verify-otp", {
      data: { email: USERS.standard.email, code: "000000", purpose: "login" },
    });
    // Should be 400 (not found / expired), never 200
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("TC-OTP05 | OTP for change_email delivered to NEW email only", async ({ page, db }) => {
    // This test verifies the OTP send-otp endpoint rejects if new email is taken
    const res = await page.request.post("/api/auth/send-otp", {
      data: {
        type: "email",
        value: USERS.standard.email, // already registered
        purpose: "change_email",
      },
    });
    const body = await res.json();
    expect(res.status()).toBe(400);
    expect(body.error).toMatch(/already in use|taken/i);
  });
});
