import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const BASE_URL = 'https://www.connectedsteps.in';

export default defineConfig({
  testDir: path.join(__dirname, 'tests'),
  timeout: 60000,
  expect: { timeout: 15000 },
  retries: 1,
  workers: 2,
  fullyParallel: false,
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(__dirname, 'playwright-report'), open: 'never' }],
  ],
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: 'on',
    video: 'off',
    trace: 'off',
    ignoreHTTPSErrors: false,
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
      },
    },
    {
      name: 'tablet',
      use: {
        ...devices['iPad (gen 7)'],
        viewport: { width: 768, height: 1024 },
      },
    },
  ],
  outputDir: path.join(__dirname, 'test-results'),
});
