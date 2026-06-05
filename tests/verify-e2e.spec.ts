import { test, expect, Page } from '@playwright/test';

const BASE = 'http://localhost:3000';
const MOCK_USER = {
  email: 'test@connectedsteps.in',
  firstName: 'Test', lastName: 'User',
  phone: '9999999999', goal: '10k',
  location: 'Kondapur', photo: null,
};

async function loginAs(page: Page) {
  await page.goto(BASE);
  await page.evaluate((u) => localStorage.setItem('cs_user', JSON.stringify(u)), MOCK_USER);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  // cs-app-nav is always visible after login regardless of viewport
  await page.waitForSelector('.cs-app-nav', { timeout: 20000 });
  await page.waitForTimeout(500); // allow React state to settle
}

// ── Desktop ──────────────────────────────────────────────────────────────────

test.describe('Desktop (1280×800)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('Home page loads', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=Connected Steps').first()).toBeVisible({ timeout: 8000 });
    await page.screenshot({ path: 'test-results/verify/01-home.png' });
  });

  test('Auth — Sign Up then Login tab', async ({ page }) => {
    await page.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=Create your account')).toBeVisible({ timeout: 8000 });
    await page.screenshot({ path: 'test-results/verify/02a-auth-signup.png' });
    await page.click('button:has-text("Sign in")');
    await expect(page.locator('text=Welcome back')).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'test-results/verify/02b-auth-login.png' });
  });

  test('Dashboard — nav links visible', async ({ page }) => {
    await loginAs(page);
    await expect(page.locator('nav a[href="/leaderboard"]')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('nav a[href="/community"]')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('nav a[href="/achievements"]')).toBeVisible({ timeout: 8000 });
    await page.screenshot({ path: 'test-results/verify/03-dashboard-nav.png' });
  });

  test('Dashboard — hamburger hidden on desktop', async ({ page }) => {
    await loginAs(page);
    await expect(page.locator('.cs-mobile-nav-toggle')).toBeHidden({ timeout: 5000 });
  });

  test('Dashboard — Training Plan sidebar visible', async ({ page }) => {
    await loginAs(page);
    await expect(page.locator('text=Training Plan').first()).toBeVisible({ timeout: 8000 });
    await page.screenshot({ path: 'test-results/verify/03b-dashboard-sidebar.png' });
  });

  test('Leaderboard page — loads and no JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await loginAs(page);
    await page.goto(`${BASE}/leaderboard`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=Test User').first()).toBeVisible({ timeout: 20000 });
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 8000 });
    await page.screenshot({ path: 'test-results/verify/04-leaderboard.png' });
    const fatal = errors.filter(e => !e.includes('VAPID') && !e.includes('favicon') && !e.includes('sw.js'));
    expect(fatal, `JS errors: ${fatal.join(', ')}`).toHaveLength(0);
  });

  test('Community page — loads and no JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await loginAs(page);
    await page.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=Test User').first()).toBeVisible({ timeout: 20000 });
    await expect(page.locator('text=Find Runners')).toBeVisible({ timeout: 8000 });
    await page.screenshot({ path: 'test-results/verify/05-community.png' });
    const fatal = errors.filter(e => !e.includes('VAPID') && !e.includes('favicon') && !e.includes('sw.js'));
    expect(fatal, `JS errors: ${fatal.join(', ')}`).toHaveLength(0);
  });

  test('Achievements page — loads and no JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await loginAs(page);
    await page.goto(`${BASE}/achievements`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=Test User').first()).toBeVisible({ timeout: 20000 });
    await expect(page.locator('text=Your Achievements')).toBeVisible({ timeout: 8000 });
    await page.screenshot({ path: 'test-results/verify/06-achievements.png' });
    const fatal = errors.filter(e => !e.includes('VAPID') && !e.includes('favicon') && !e.includes('sw.js'));
    expect(fatal, `JS errors: ${fatal.join(', ')}`).toHaveLength(0);
  });
});

// ── Mobile ───────────────────────────────────────────────────────────────────

test.describe('Mobile (375×812)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('Hamburger visible on dashboard', async ({ page }) => {
    await loginAs(page);
    await expect(page.locator('.cs-mobile-nav-toggle')).toBeVisible({ timeout: 8000 });
    await page.screenshot({ path: 'test-results/verify/07-mobile-dashboard.png' });
  });

  test('Hamburger opens menu with all nav links', async ({ page }) => {
    await loginAs(page);
    await page.locator('.cs-mobile-nav-toggle').click();
    await expect(page.locator('.cs-mobile-menu')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.cs-mobile-menu a[href="/leaderboard"]')).toBeVisible();
    await expect(page.locator('.cs-mobile-menu a[href="/community"]')).toBeVisible();
    await expect(page.locator('.cs-mobile-menu a[href="/achievements"]')).toBeVisible();
    await expect(page.locator('.cs-mobile-menu a[href="/weekend-run"]')).toBeVisible();
    await page.screenshot({ path: 'test-results/verify/08-mobile-menu-open.png' });
  });

  test('Mobile menu link navigates to leaderboard', async ({ page }) => {
    await loginAs(page);
    await page.locator('.cs-mobile-nav-toggle').click();
    await expect(page.locator('.cs-mobile-menu')).toBeVisible({ timeout: 5000 });
    await page.locator('.cs-mobile-menu a[href="/leaderboard"]').click();
    await page.waitForSelector('.cs-app-nav', { timeout: 20000 });
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 8000 });
    await page.screenshot({ path: 'test-results/verify/09-mobile-leaderboard.png' });
    expect(page.url()).toContain('/leaderboard');
  });
});

// ── API spot-checks ───────────────────────────────────────────────────────────

test.describe('API', () => {
  test('GET /api/stats — numeric fields', async ({ request }) => {
    const res  = await request.get(`${BASE}/api/stats`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.totalRunners).toBe('number');
  });

  test('GET /api/leaderboard — entries array', async ({ request }) => {
    const res  = await request.get(`${BASE}/api/leaderboard`);
    expect(res.status()).toBe(200);
    expect(Array.isArray((await res.json()).entries)).toBe(true);
  });

  test('GET /api/sessions — data array', async ({ request }) => {
    const res  = await request.get(`${BASE}/api/sessions`);
    expect(res.status()).toBe(200);
    expect(Array.isArray((await res.json()).data)).toBe(true);
  });

  test('GET /api/stories — stories array', async ({ request }) => {
    const res  = await request.get(`${BASE}/api/stories`);
    expect(res.status()).toBe(200);
    expect(Array.isArray((await res.json()).stories)).toBe(true);
  });
});
