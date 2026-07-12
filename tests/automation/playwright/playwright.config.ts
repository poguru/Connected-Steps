import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env.test from the same directory as this config file
dotenv.config({ path: path.join(__dirname, ".env.test") });

export default defineConfig({
  testDir: "./specs",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
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
    video:      "retain-on-failure",
    trace:      "retain-on-failure",
    viewport:   { width: 1280, height: 800 },
    actionTimeout:     15_000,
    navigationTimeout: 45_000,
    ignoreHTTPSErrors: true,
  },

  projects: [
    // ── 0. Global setup: create auth storage state files ───────────────────
    { name: "setup", testDir: "./fixtures", testMatch: /global\.setup\.ts/ },

    // ── 1. Main user tests (all specs except admin & security) ─────────────
    {
      name: "chromium",
      testIgnore: [/admin\/.+\.spec\.ts/, /security\/.+\.spec\.ts/],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/user.json",
      },
      dependencies: ["setup"],
    },

    // ── 2. Admin tests — session cookie set by global.setup.ts ───────────────
    {
      name: "admin",
      testMatch: /admin\/.+\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/admin.json",
      },
      dependencies: ["setup"],
    },

    // ── 3. Security tests — intentionally no auth state ────────────────────
    {
      name: "security",
      testMatch: /security\/.+\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Start Next.js dev server automatically if not already running
  webServer: {
    command: "npm run dev",
    cwd: path.join(__dirname, "../../.."),   // project root
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
