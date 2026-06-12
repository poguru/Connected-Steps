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
// Admin routes use x-admin-password header (via playwright.config.ts extraHTTPHeaders).
// Only an empty storage state file is needed here.
setup("create admin auth state", async ({}) => {
  if (!ENV.ADMIN_PASSWORD) {
    console.warn("⚠️  ADMIN_PASSWORD not set — admin tests will return 401");
  }
  fs.writeFileSync(ADMIN_AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }));
  console.log("✅ Admin auth state written (header-based auth)");
});
