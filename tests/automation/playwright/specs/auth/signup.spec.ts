import { test, expect } from "../../fixtures/base";
import { uniqueEmail, ROUTES } from "../../utils/test-data";

test.describe("Authentication — Signup", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("TC-SU01 | valid registration creates account and redirects away from /auth", async ({ authPage, db }) => {
    const email = uniqueEmail("signup");
    try {
      await authPage.fillSignUpStep1({
        firstName: "Test",
        lastName: "User",
        email,
        password: "TestPass@123",
      });
      // Complete remaining steps if multi-step
      const continueBtn = authPage.page.getByRole("button", { name: /next|continue|finish|create/i });
      for (let i = 0; i < 4 && await continueBtn.isVisible().catch(() => false); i++) {
        await continueBtn.click();
        await authPage.page.waitForTimeout(800);
      }
      await authPage.page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20_000 });
      expect(authPage.page.url()).not.toContain("/auth");
    } finally {
      await db.deleteUser(email).catch(() => {});
    }
  });

  test("TC-SU02 | duplicate email registration is rejected", async ({ request }) => {
    const { USERS } = await import("../../utils/test-data");
    const res = await request.post("/api/auth/register", {
      data: {
        firstName: "Dup",
        lastName: "User",
        email: USERS.standard.email,
        password: "TestPass@123",
        goal: "5K",
        location: "Hyderabad",
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
        lastName: "Pass",
        email: uniqueEmail("weakpwd"),
        password: "1",
        goal: "5K",
        location: "Hyderabad",
      },
    });
    // Expect validation error for weak password
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("TC-SU04 | DOB field is optional — signup completes without it", async ({ request, db }) => {
    const email = uniqueEmail("noDob");
    try {
      const res = await request.post("/api/auth/register", {
        data: {
          firstName: "No",
          lastName: "Dob",
          email,
          password: "TestPass@123",
          goal: "10K",
          location: "Hyderabad",
          // dob intentionally omitted
        },
      });
      expect(res.status()).toBe(200);
    } finally {
      await db.deleteUser(email).catch(() => {});
    }
  });

  test("TC-SU05 | registration form sign-up tab is accessible", async ({ page }) => {
    await page.goto(ROUTES.signUp);
    await page.waitForLoadState("networkidle");
    await expect(page.getByPlaceholder(/first name/i)).toBeVisible();
    await expect(page.getByPlaceholder(/last name/i)).toBeVisible();
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
    await expect(page.getByPlaceholder(/password/i)).toBeVisible();
  });
});
