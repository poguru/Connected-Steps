import { test as setup, expect } from "@playwright/test";
import * as fs from "fs";
import { USERS, ROUTES } from "../utils/test-data";

const USER_AUTH_FILE  = "playwright/.auth/user.json";
const ADMIN_AUTH_FILE = "playwright/.auth/admin.json";

// ── Create auth directory ────────────────────────────────────────────────────
setup.beforeAll(() => {
  fs.mkdirSync("playwright/.auth", { recursive: true });
});

// ── Authenticate standard user ───────────────────────────────────────────────
setup("authenticate as standard user", async ({ page }) => {
  await page.goto("/auth?tab=login");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  await page.getByPlaceholder("Email address").fill(USERS.standard.email);
  await page.getByPlaceholder(/^password/i).fill(USERS.standard.password);
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  await expect(page).not.toHaveURL(/\/auth/);
  await page.context().storageState({ path: USER_AUTH_FILE });
  console.log("✅ User auth state saved");
});

// ── Authenticate admin (via admin login page) ────────────────────────────────
setup("authenticate as admin", async ({ page }) => {
  if (!USERS.admin.password) {
    console.warn("⚠️  ADMIN_PASSWORD not set — skipping admin auth setup");
    fs.writeFileSync(ADMIN_AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }
  await page.goto(ROUTES.adminLogin);
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder(/password/i).fill(USERS.admin.password);
  await page.getByRole("button", { name: /log in|sign in/i }).click();
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 15_000 });
  await page.context().storageState({ path: ADMIN_AUTH_FILE });
  console.log("✅ Admin auth state saved");
});
