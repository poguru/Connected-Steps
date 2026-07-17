import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir:  "./tests/audit",
  testMatch: "cs-audit.spec.ts",

  // Sequential so the global `issues[]` array accumulates across tests
  workers: 1,
  retries: 0,
  timeout: 360_000,        // 6 min per test (tests 1 & 11 each need ~3-4 min)
  globalTimeout: 2_400_000, // 40 min total

  reporter: [
    ["list"],
    ["html", { outputFolder: "tests/audit/playwright-report", open: "never" }],
  ],

  use: {
    baseURL:           "https://www.connectedsteps.in",
    headless:          true,
    viewport:          { width: 1440, height: 900 },
    actionTimeout:     20_000,
    navigationTimeout: 45_000,
    ignoreHTTPSErrors: false,
    screenshot:        "off",
    video:             "off",
    trace:             "off",
  },
});
