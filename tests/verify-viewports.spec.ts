/**
 * Cross-viewport consistency check.
 * Tests desktop (1280), tablet (768), and mobile (375) against all key pages.
 */
import { test, expect, Page } from '@playwright/test';

const BASE = 'http://localhost:3000';
const MOCK_USER = {
  email: 'test@connectedsteps.in',
  firstName: 'Test', lastName: 'User',
  phone: '9999999999', goal: '10k',
  location: 'Kondapur', photo: null,
};

const VIEWPORTS = [
  { name: 'Desktop',  width: 1280, height: 800  },
  { name: 'Tablet',   width: 768,  height: 1024 },
  { name: 'Mobile',   width: 375,  height: 812  },
];

async function loginAs(page: Page) {
  await page.goto(BASE);
  await page.evaluate((u) => localStorage.setItem('cs_user', JSON.stringify(u)), MOCK_USER);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.cs-app-nav', { timeout: 20000 });
  await page.waitForTimeout(400);
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} (${vp.width}px)`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('Home page loads with hero and navbar', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('text=Connected Steps').first()).toBeVisible({ timeout: 8000 });
      await page.screenshot({ path: `test-results/viewports/${vp.name.toLowerCase()}-home.png` });
      expect(errors, `JS errors on home: ${errors.join(', ')}`).toHaveLength(0);
    });

    test('Auth page — both tabs render', async ({ page }) => {
      await page.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('text=Create your account')).toBeVisible({ timeout: 8000 });
      // Dismiss cookie banner before interacting with tabs
      const banner = page.locator('button:has-text("Got it")');
      if (await banner.isVisible()) await banner.click();
      await page.waitForTimeout(200);
      await page.locator('button:has-text("Sign in")').first().click();
      await expect(page.locator('text=Welcome back')).toBeVisible({ timeout: 8000 });
      await page.screenshot({ path: `test-results/viewports/${vp.name.toLowerCase()}-auth.png` });
    });

    test('Dashboard — hero, nav, sidebar all render', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      await loginAs(page);

      // DashboardHero greeting always present
      await expect(page.locator('text=Good Morning, Test').or(
        page.locator('text=Good Afternoon, Test').or(
          page.locator('text=Good Evening, Test')
        )
      ).first()).toBeVisible({ timeout: 8000 });

      // Nav always present
      await expect(page.locator('.cs-app-nav')).toBeVisible();

      await page.screenshot({ path: `test-results/viewports/${vp.name.toLowerCase()}-dashboard.png`, fullPage: false });
      expect(errors, `JS errors on dashboard: ${errors.join(', ')}`).toHaveLength(0);
    });

    test('Leaderboard — renders with no JS errors', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      await loginAs(page);
      await page.goto(`${BASE}/leaderboard`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.cs-app-nav', { timeout: 20000 });
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 8000 });
      await page.screenshot({ path: `test-results/viewports/${vp.name.toLowerCase()}-leaderboard.png` });
      expect(errors, `JS errors: ${errors.join(', ')}`).toHaveLength(0);
    });

    test('Community — renders with no JS errors', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      await loginAs(page);
      await page.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.cs-app-nav', { timeout: 20000 });
      await expect(page.locator('text=Find Runners')).toBeVisible({ timeout: 8000 });
      await page.screenshot({ path: `test-results/viewports/${vp.name.toLowerCase()}-community.png` });
      expect(errors, `JS errors: ${errors.join(', ')}`).toHaveLength(0);
    });

    test('Achievements — renders with no JS errors', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      await loginAs(page);
      await page.goto(`${BASE}/achievements`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.cs-app-nav', { timeout: 20000 });
      await expect(page.locator('text=Your Achievements')).toBeVisible({ timeout: 8000 });
      await page.screenshot({ path: `test-results/viewports/${vp.name.toLowerCase()}-achievements.png` });
      expect(errors, `JS errors: ${errors.join(', ')}`).toHaveLength(0);
    });

    test('Nav: hamburger correct visibility', async ({ page }) => {
      await loginAs(page);
      const hamburger = page.locator('.cs-mobile-nav-toggle');
      if (vp.width >= 900) {
        await expect(hamburger).toBeHidden({ timeout: 5000 });
      } else {
        await expect(hamburger).toBeVisible({ timeout: 5000 });
        // Open and close
        await hamburger.click();
        await expect(page.locator('.cs-mobile-menu')).toBeVisible({ timeout: 5000 });
        await page.screenshot({ path: `test-results/viewports/${vp.name.toLowerCase()}-mobile-menu.png` });
      }
    });
  });
}
