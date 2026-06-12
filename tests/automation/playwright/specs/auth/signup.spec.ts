import { test, expect } from "../../fixtures/base";
import { uniqueEmail, ROUTES } from "../../utils/test-data";

test.describe("Authentication — Signup", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // The signup form is multi-step (email OTP → details).
  // TC-SU01 verifies the API path works end-to-end without needing to receive a real email.
  test("TC-SU01 | valid registration creates account via API", async ({ request, db }) => {
    const email = uniqueEmail("signup");
    try {
      const res = await request.post("/api/auth/register", {
        data: {
          firstName: "Test",
          lastName:  "User",
          email,
          password:  "TestPass@123",
          goal:      "5K",
          location:  "Hyderabad",
        },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    } finally {
      await db.deleteUser(email).catch(() => {});
    }
  });

  test("TC-SU02 | duplicate email registration is rejected", async ({ request }) => {
    const { USERS } = await import("../../utils/test-data");
    const res = await request.post("/api/auth/register", {
      data: {
        firstName: "Dup",
        lastName:  "User",
        email:     USERS.standard.email,
        password:  "TestPass@123",
        goal:      "5K",
        location:  "Hyderabad",
      },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(body.error ?? body.message ?? "").toMatch(/already|duplicate|exists/i);
  });

  test("TC-SU03 | weak password registration is rejected", async ({ request }) => {
    const res = await request.post("/api/auth/register", {
      data: {
        firstName: "Weak",
        lastName:  "Pass",
        email:     uniqueEmail("weakpwd"),
        password:  "1",
        goal:      "5K",
        location:  "Hyderabad",
      },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("TC-SU04 | DOB field is optional — signup completes without it", async ({ request, db }) => {
    const email = uniqueEmail("noDob");
    try {
      const res = await request.post("/api/auth/register", {
        data: {
          firstName: "No",
          lastName:  "Dob",
          email,
          password:  "TestPass@123",
          goal:      "10K",
          location:  "Hyderabad",
        },
      });
      expect(res.status()).toBe(200);
    } finally {
      await db.deleteUser(email).catch(() => {});
    }
  });

  // Signup form is multi-step: first step shows only the email field.
  // Verify the first step is accessible and renders the email input.
  test("TC-SU05 | registration form initial step is accessible", async ({ page }) => {
    await page.goto(ROUTES.signUp);
    await page.waitForLoadState("networkidle");
    // First step of signup shows the email input and the send-OTP button
    await expect(page.getByPlaceholder(/email/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /send|otp|next|continue/i }).first()).toBeVisible();
  });
});
