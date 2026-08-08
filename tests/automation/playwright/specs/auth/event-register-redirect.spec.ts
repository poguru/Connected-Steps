/**
 * Event Registration Redirect — regression tests for the production bug where
 * completing event-registration auth redirected to /dashboard instead of back
 * to the event registration page.
 *
 * Root cause: handleAuthExpiry() stored the return URL only in sessionStorage.
 * If sessionStorage was cleared (mobile background, page reload) before the
 * user finished logging in, saveAndRedirect() found dest="" and fell back to
 * /dashboard.
 *
 * Fix: handleAuthExpiry() now also passes ?redirect= in the navigation URL so
 * the return destination survives sessionStorage loss.
 */

import { test, expect }  from "../../fixtures/base";
import type { Page }     from "@playwright/test";
import { DbHelper }      from "../../utils/db-helper";

// No pre-existing auth state — these tests manage their own auth
test.use({ storageState: { cookies: [], origins: [] } });

// ── helpers ──────────────────────────────────────────────────────────────────

/** Type one digit per OTP box. The component auto-submits after the 6th digit. */
async function fillOtpBoxes(page: Page, code: string) {
  const inputs = page.locator('input[type="password"][maxlength="1"]');
  for (let i = 0; i < 6; i++) {
    await inputs.nth(i).fill(code[i] ?? "0");
  }
}

/** Poll the DB until the latest OTP for `email` appears (up to ~5 s). */
async function waitForOtp(
  db: typeof DbHelper,
  email: string,
): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = await db.getLatestOtp(email);
    if (code) return code;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`No OTP in DB for ${email} after 5 s`);
}

async function mockSendOtpIfNeeded(page: Page) {
  await page.route("**/api/auth/send-otp", async (route) => {
    const response = await route.fetch();
    if (response.status() === 500) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    } else {
      await route.fulfill({ response });
    }
  });
}

/** Plants an expired 3-part client token in localStorage (exp=1 = Jan 1970). */
async function setExpiredToken(page: Page, email: string) {
  await page.evaluate((e) => {
    const b64 = btoa(e).replace(/=/g, "");
    localStorage.setItem("cs_user", JSON.stringify({ email: e, name: "Redirect Test" }));
    localStorage.setItem("cs_user_token", `${b64}.1.fakesig`);
  }, email);
}

/**
 * Creates a new user account via the EventRegisterFlow OTP page and waits
 * until the browser is on `returnPath` after successful auth.
 */
async function createUserViaEventOtp(
  page: Page,
  db: typeof DbHelper,
  returnPath: string,
  email: string,
  name: string,
  mobile: string,
) {
  await mockSendOtpIfNeeded(page);
  await page.goto(`/auth/event-register?return=${encodeURIComponent(returnPath)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  // Email step
  await page.locator('input[type="email"]').fill(email);
  await page.locator('button[type="submit"]').click();

  // OTP step
  await expect(page.getByText("Check your email")).toBeVisible({ timeout: 15_000 });
  const code = await waitForOtp(db, email);
  await fillOtpBoxes(page, code);

  // Profile step (new user)
  await expect(page.getByText("Almost there")).toBeVisible({ timeout: 15_000 });
  await page.locator('input[placeholder="Full name"]').fill(name);
  await page.locator('input[placeholder="10-digit mobile"]').fill(mobile);
  await page.locator('button[type="submit"]').click();

  // Wait until on the intended return path
  await page.waitForURL((u) => u.pathname === returnPath || u.href.includes(returnPath), {
    timeout: 20_000,
  });
  await page.waitForLoadState("networkidle");
}

/**
 * Logs in via OTP on the regular LoginForm (/auth?tab=login page).
 * Requires the user to already exist in the DB.
 */
async function loginViaOtp(page: Page, db: typeof DbHelper, email: string) {
  await mockSendOtpIfNeeded(page);

  // Wait for Suspense boundary and useEffect tab switch to settle
  await page.waitForLoadState("networkidle");

  // Wait for LoginForm to be visible (AuthPage sets tab=login via useEffect)
  await expect(page.getByText("Welcome back")).toBeVisible({ timeout: 10_000 });

  // LoginForm defaults to password mode — switch to OTP mode
  const otpModeBtn = page.getByRole("button", { name: "Sign in with OTP" });
  await otpModeBtn.waitFor({ timeout: 5_000 });
  await otpModeBtn.click();

  // Identifier input — wait for OTP identifier step to render
  const idInput = page.locator('input[placeholder="Mobile number or email"]');
  await idInput.waitFor({ timeout: 5_000 });
  await idInput.fill(email);

  // "Send OTP →" becomes enabled when identifier is non-empty; use role for reliability
  const sendBtn = page.getByRole("button", { name: /send otp/i });
  await sendBtn.waitFor({ state: "visible", timeout: 5_000 });
  await sendBtn.click();

  // OTP step — wait for the 6-digit code boxes to appear
  await page.locator('input[type="password"][maxlength="1"]').first().waitFor({ timeout: 15_000 });

  const code = await waitForOtp(db, email);
  await fillOtpBoxes(page, code);

  // Auto-submit fires via onComplete; wait for navigation away from /auth
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20_000 });
}

// ── tests ────────────────────────────────────────────────────────────────────

test.describe("Event Registration Redirect (regression)", () => {
  /**
   * TC-REDIR-01
   * Verifies that handleAuthExpiry() includes ?redirect= in the navigation URL.
   * Direct check that the one-line fix is in place: expired token on the event
   * register page must send the browser to /auth?tab=login&redirect=<event-path>.
   */
  test("TC-REDIR-01 | handleAuthExpiry adds ?redirect= to the login URL", async ({ page }) => {
    const ev = await DbHelper.getFreePublishedEvent();
    if (!ev?.share_slug) { test.skip(); return; }

    const slug = ev.share_slug;

    // Land on the register page so localStorage is scoped to this origin
    await page.goto(`/events/${slug}/register`, { waitUntil: "domcontentloaded" });
    // Plant an expired token — auth guard will call handleAuthExpiry on next load
    await setExpiredToken(page, "expired@redir-test.invalid");

    // Reload to trigger the auth guard with the expired token
    await page.reload({ waitUntil: "domcontentloaded" });

    // handleAuthExpiry must navigate to /auth?tab=login&redirect=/events/<slug>/register
    await page.waitForURL(/\/auth.*tab=login/, { timeout: 15_000 });

    const url = new URL(page.url());
    expect(url.searchParams.get("redirect")).toBe(`/events/${slug}/register`);
  });

  /**
   * TC-REDIR-02
   * Verifies normal login (no event context, no ?redirect= param) still goes to
   * /dashboard. Guards against accidentally routing all logins to an event page.
   */
  test("TC-REDIR-02 | Normal login without redirect param → /dashboard", async ({ page, db }) => {
    // Use a fixed known email for this test to avoid creating a new account.
    // If it doesn't exist yet, skip gracefully.
    const email = "redirect-test-normal@connectedsteps.test";

    // Create the account if it doesn't exist
    const existing = await db.getUserByEmail(email);
    if (!existing) {
      await createUserViaEventOtp(page, db, "/dashboard", email, "Redirect Normal", "9200000021");
      // Clear auth state after creation
      await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
      await page.context().clearCookies();
    }

    try {
      // Navigate to regular login page — NO ?redirect= param
      await page.goto("/auth?tab=login", { waitUntil: "domcontentloaded" });
      await loginViaOtp(page, db, email);

      // Must land on /dashboard or /coach — NOT on any event registration page
      expect(page.url()).toMatch(/\/(dashboard|coach)/);
      expect(page.url()).not.toContain("/events/");
    } finally {
      await db.deleteUser(email).catch(() => {});
    }
  });

  /**
   * TC-REDIR-03  ← KEY REGRESSION TEST
   *
   * Demonstrates the full fix:
   *   EVENT REGISTRATION → expired token → handleAuthExpiry (adds ?redirect= to URL)
   *   → sessionStorage cleared (simulates mobile browser background kill)
   *   → OTP login reads ?redirect= from URL → RETURNS TO SAME EVENT REGISTRATION PAGE
   *
   * Without the fix, step 4 would land on /dashboard because sessionStorage was
   * the only place the redirect was stored, and it was cleared.
   */
  test("TC-REDIR-03 | Expired session + sessionStorage cleared → URL param returns user to event page", async ({
    page,
    db,
  }) => {
    const ev = await db.getFreePublishedEvent();
    if (!ev?.share_slug) { test.skip(); return; }

    const slug  = ev.share_slug;
    const email = `redir03-${Date.now()}@redirect-test.invalid`;

    try {
      // Step 1: Create a user account via the event OTP flow so they exist in DB
      await createUserViaEventOtp(
        page, db,
        `/events/${slug}/register`,
        email,
        "Redirect Test 03",
        "9200000031",
      );

      // Step 2: Replace the valid token with an expired one (simulate session expiry)
      await page.evaluate(() => {
        const tok   = localStorage.getItem("cs_user_token") ?? "";
        const parts = tok.split(".");
        if (parts.length === 3) {
          localStorage.setItem("cs_user_token", `${parts[0]}.1.${parts[2]}`);
        }
      });

      // Step 3: Visit the event registration page — auth guard detects expired token
      // and calls handleAuthExpiry() → sessionStorage set + navigate to /auth?tab=login&redirect=
      await page.goto(`/events/${slug}/register`, { waitUntil: "domcontentloaded" });
      await page.waitForURL(/\/auth.*tab=login/, { timeout: 15_000 });

      // Assert the fix: ?redirect= must be in the URL (not only in sessionStorage)
      const authUrl = new URL(page.url());
      expect(authUrl.searchParams.get("redirect")).toBe(`/events/${slug}/register`);

      // Step 4: Simulate sessionStorage loss (mobile browser killed in background)
      await page.evaluate(() => sessionStorage.clear());

      // Step 5: Authenticate — the URL param MUST carry the redirect since sessionStorage is gone
      await loginViaOtp(page, db, email);

      // FINAL ASSERTION: back on the event registration page, NOT /dashboard
      expect(page.url()).toContain(`/events/${slug}/register`);
      expect(page.url()).not.toContain("/dashboard");
    } finally {
      await db.deleteUser(email).catch(() => {});
    }
  });
});
