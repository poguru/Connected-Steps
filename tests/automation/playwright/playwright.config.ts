import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.test" });

export default defineConfig({
  testDir: "./specs",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: [
    ["list"],
    ["html", { outputFolder: "reports/html", open: "never" }],
    ["json", { outputFile: "reports/results.json" }],
    ...(process.env.CI ? [["github"] as ["github"]] : []),
  ],

  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    headless: true,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 800 },
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    ignoreHTTPSErrors: true,
  },

  projects: [
    // ── Setup: create authenticated storage states ──────────────────────────
    { name: "setup", testMatch: /global\.setup\.ts/ },

    // ── Desktop Chrome ──────────────────────────────────────────────────────
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/user.json",
      },
      dependencies: ["setup"],
    },

    // ── Mobile Safari (iOS) ─────────────────────────────────────────────────
    {
      name: "mobile-safari",
      use: {
        ...devices["iPhone 13"],
        storageState: "playwright/.auth/user.json",
      },
      dependencies: ["setup"],
    },

    // ── Admin project (separate auth state) ────────────────────────────────
    {
      name: "admin",
      testMatch: /admin\/.+\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/admin.json",
      },
      dependencies: ["setup"],
    },

    // ── Security tests run without auth ────────────────────────────────────
    {
      name: "security",
      testMatch: /security\/.+\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Start dev server automatically if not already running
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
