import { defineConfig, devices } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

// Load .env.test first (highest priority), then .env.local as fallback.
// This avoids a dotenv dependency — env files are parsed manually.
function loadEnvFile(filePath: string): void {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (key && !(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch { /* file absent is fine */ }
}

const ROOT = path.resolve(__dirname, "../..");
loadEnvFile(path.join(ROOT, ".env.test"));   // .env.test takes precedence
loadEnvFile(path.join(ROOT, ".env.local"));  // .env.local as fallback

const BASE_URL = process.env.ITR_TEST_BASE_URL ?? "http://localhost:3000";

// Safety guard: prevent accidental runs against production
const PRODUCTION_DOMAINS = ["connectedsteps.in", "www.connectedsteps.in"];
try {
  const urlHost = new URL(BASE_URL).hostname;
  if (PRODUCTION_DOMAINS.includes(urlHost)) {
    throw new Error(
      `[IT Run Tests] BASE_URL points to production (${urlHost}). ` +
      `Set ITR_TEST_BASE_URL to a local or staging environment.`,
    );
  }
} catch (e) {
  if ((e as Error).message.includes("production")) throw e;
  // ignore URL parse errors (e.g. placeholder value)
}

export default defineConfig({
  testDir: __dirname,
  // Run all test files in the it-run directory
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  // Concurrency tests need isolated workers; default to 4 for API tests
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "../../playwright-report/it-run" }],
    ["json", { outputFile: "../../playwright-report/it-run/results.json" }],
  ],
  use: {
    baseURL: BASE_URL,
    extraHTTPHeaders: {
      "x-forwarded-for": "127.0.0.1",
    },
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "api",
      testMatch: "**/api/**/*.spec.ts",
      use: { ...devices["Desktop Chrome"], headless: true },
    },
    {
      name: "security",
      testMatch: "**/security/**/*.spec.ts",
      use: { ...devices["Desktop Chrome"], headless: true },
    },
    {
      name: "concurrency",
      testMatch: "**/concurrency/**/*.spec.ts",
      // Concurrency tests run sequentially to avoid interfering with each other
      fullyParallel: false,
      use: { ...devices["Desktop Chrome"], headless: true },
    },
    {
      name: "smoke",
      testMatch: "**/smoke/**/*.spec.ts",
      use: { ...devices["Desktop Chrome"], headless: true },
    },
    {
      name: "smoke-mobile",
      testMatch: "**/smoke/**/*.spec.ts",
      use: { ...devices["Pixel 5"], headless: true },
    },
  ],
});
