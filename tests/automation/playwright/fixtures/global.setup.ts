import { test as setup, request } from "@playwright/test";
import * as fs from "fs";
import { ENV } from "../utils/env";

const USER_AUTH_FILE  = "playwright/.auth/user.json";
const ADMIN_AUTH_FILE = "playwright/.auth/admin.json";
const TOKEN_FILE      = "playwright/.auth/token.txt";

setup.beforeAll(async () => {
  fs.mkdirSync("playwright/.auth", { recursive: true });

  // Clear rate-limit state from any previous test run so login tests start fresh.
  // The endpoint is a no-op in production (returns 404).
  const apiCtx = await request.newContext({ baseURL: ENV.BASE_URL });
  await apiCtx.delete("/api/test-utils/reset-rate-limits").catch(() => {});
  await apiCtx.dispose();
  console.log("✅ Rate-limit store cleared for fresh test run");
});

// ── Authenticate standard user via API ───────────────────────────────────────
// Calls the login API, injects auth into localStorage, saves storageState.
// Also writes the userToken to a plain text file so api-helper.ts can read
// it and include it in x-user-token headers for authenticated API calls.
setup("authenticate as standard user", async ({ page }) => {
  const apiCtx    = await request.newContext({ baseURL: ENV.BASE_URL });
  const loginRes  = await apiCtx.post("/api/auth/login", {
    data: { identifier: ENV.TEST_EMAIL, password: ENV.TEST_PASSWORD },
  });
  // Read body FIRST — Playwright disposes the response after the first read.
  const loginBody = await loginRes.json() as Record<string, unknown>;
  const loginStatus = loginRes.status();
  await apiCtx.dispose();

  if (loginStatus < 200 || loginStatus >= 300) {
    throw new Error(
      `Login API failed ${loginStatus} for ${ENV.TEST_EMAIL}: ${JSON.stringify(loginBody)}`
    );
  }

  const user      = (loginBody.user      ?? {}) as Record<string, unknown>;
  const userToken = (loginBody.userToken  ?? user.userToken ?? "") as string;

  // Save token to file so api-helper.ts can read it for x-user-token header
  fs.writeFileSync(TOKEN_FILE, userToken, "utf8");

  // Inject auth into localStorage and save storageState
  await page.goto(ENV.BASE_URL + "/");
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(
    ({ u, t }) => {
      localStorage.setItem("cs_user",       JSON.stringify(u));
      localStorage.setItem("cs_user_token", t);
    },
    { u: user, t: userToken }
  );

  await page.context().storageState({ path: USER_AUTH_FILE });
  console.log(`✅ User auth saved: ${ENV.TEST_EMAIL}`);
});

// ── Admin auth state ──────────────────────────────────────────────────────────
// Authenticates via /api/admin/auth to obtain the httpOnly cs_admin_session
// cookie, then saves the browser storage state so admin Playwright specs
// run with a valid session (no raw-password header).
setup("create admin auth state", async ({ page }) => {
  if (!ENV.ADMIN_PASSWORD) {
    console.warn("⚠️  ADMIN_PASSWORD not set — admin tests will return 401");
    fs.writeFileSync(ADMIN_AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  await page.goto(ENV.BASE_URL + "/admin/login");
  await page.waitForLoadState("domcontentloaded");

  // Call the admin auth API from the browser context so the httpOnly cookie
  // is stored in the page's cookie jar and captured by storageState().
  const status = await page.evaluate(async ({ baseUrl, password }: { baseUrl: string; password: string }) => {
    const res = await fetch(`${baseUrl}/api/admin/auth`, {
      method:      "POST",
      headers:     { "Content-Type": "application/json" },
      credentials: "include",
      body:        JSON.stringify({ password }),
    });
    return res.status;
  }, { baseUrl: ENV.BASE_URL, password: ENV.ADMIN_PASSWORD });

  if (status !== 200) {
    throw new Error(`Admin login failed (status ${status}) — check ADMIN_PASSWORD in .env.test`);
  }

  await page.context().storageState({ path: ADMIN_AUTH_FILE });
  console.log("✅ Admin auth state written (session cookie)");
});
