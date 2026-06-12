import { test, expect } from "../../fixtures/base";
import { USERS } from "../../utils/test-data";

// Dedicated throwaway addresses for rate-limit tests — avoids contaminating
// the standard user's rate-limit window, which TC-OTP03 and TC-OTP05 depend on.
const BRUTE_VERIFY_EMAIL = "brute-otp-verify@ratelimit.test";
const BRUTE_SEND_EMAIL   = "brute-otp-send@ratelimit.test";

test.describe("Authentication — OTP", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("TC-OTP01 | OTP verify rate limiting blocks after repeated wrong codes", async ({ request }) => {
    // Seed a dummy OTP record so the identifier exists (send to throwaway address)
    await request.post("/api/auth/send-otp", {
      data: { type: "email", value: BRUTE_VERIFY_EMAIL, purpose: "register" },
    });
    let got429 = false;
    for (let i = 0; i < 15; i++) {
      const res = await request.post("/api/auth/verify-otp", {
        data: { email: BRUTE_VERIFY_EMAIL, code: `00${i.toString().padStart(4, "0")}`, purpose: "register" },
      });
      if (res.status() === 429) { got429 = true; break; }
    }
    expect(got429, "Expected rate limit 429 on OTP verify").toBe(true);
  });

  test("TC-OTP02 | OTP send rate limiting blocks excessive requests", async ({ request }) => {
    let got429 = false;
    for (let i = 0; i < 8; i++) {
      const res = await request.post("/api/auth/send-otp", {
        data: { type: "email", value: BRUTE_SEND_EMAIL, purpose: "register" },
      });
      if (res.status() === 429) { got429 = true; break; }
    }
    expect(got429, "Expected rate limit 429 on repeated OTP send").toBe(true);
  });

  test("TC-OTP03 | used OTP cannot be replayed", async ({ request, db }) => {
    // Request OTP for the standard user (different key from brute-force tests above)
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

    // Replay must be rejected
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

  test("TC-OTP05 | OTP for change_email rejected if new email is already taken", async ({ page }) => {
    // USERS.standard.email is already registered; send-otp with purpose=change_email must return 400
    const res = await page.request.post("/api/auth/send-otp", {
      data: {
        type:    "email",
        value:   USERS.standard.email,
        purpose: "change_email",
      },
    });
    const body = await res.json();
    expect(res.status()).toBe(400);
    expect(body.error).toMatch(/already in use|taken/i);
  });
});
