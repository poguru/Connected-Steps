/**
 * Standalone script to create auth state via API (bypasses UI)
 * Run: npx ts-node fixtures/create-auth-state.ts
 */
import { chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "../.env.test") });

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL    = process.env.TEST_EMAIL    ?? "";
const PASSWORD = process.env.TEST_PASSWORD ?? "";

async function main() {
  fs.mkdirSync(path.join(__dirname, "../playwright/.auth"), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`Logging in as ${EMAIL} via ${BASE_URL}...`);

  await page.goto(`${BASE_URL}/auth?tab=login`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);

  // Fill login form
  await page.getByPlaceholder("Email address").fill(EMAIL);
  await page.getByPlaceholder(/^password/i).fill(PASSWORD);
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();

  try {
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 25_000 });
    console.log(`✅ Logged in — current URL: ${page.url()}`);
  } catch {
    console.error("❌ Login redirect timed out. Current URL:", page.url());
    const text = await page.textContent("body").catch(() => "");
    console.error("Page text snippet:", text.slice(0, 300));
    await browser.close();
    process.exit(1);
  }

  await context.storageState({ path: path.join(__dirname, "../playwright/.auth/user.json") });
  console.log("✅ User auth state saved to playwright/.auth/user.json");

  // Admin auth state (empty, since admin uses API password)
  const adminCtx = await browser.newContext();
  await adminCtx.storageState({ path: path.join(__dirname, "../playwright/.auth/admin.json") });
  console.log("✅ Admin auth state saved (empty — admin uses header auth)");

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
