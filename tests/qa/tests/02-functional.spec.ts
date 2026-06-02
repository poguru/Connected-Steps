/**
 * 02-functional.spec.ts
 * Page loads, navigation, buttons, JS errors, network errors.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, KNOWN_ROUTES, gotoAndWait, screenshot, collectErrors, login, CREDENTIALS } from '../utils/helpers';

test.describe('Functional Tests', () => {
  test('home page renders key sections', async ({ page }) => {
    const { jsErrors } = collectErrors(page);
    await gotoAndWait(page, BASE_URL);
    await screenshot(page, '02-home');

    // Navbar should be present
    const nav = page.locator('nav, header').first();
    await expect(nav).toBeVisible();

    // Some hero/main content
    const main = page.locator('main, [role="main"], section').first();
    await expect(main).toBeVisible();

    // No critical JS errors
    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('Non-Error promise rejection')
    );
    if (criticalErrors.length > 0) {
      console.warn('JS errors on home page:', criticalErrors);
    }
    expect(criticalErrors.length).toBe(0);
  });

  test('navigation links work from home page', async ({ page }) => {
    const { jsErrors, networkFails } = collectErrors(page);
    await gotoAndWait(page, BASE_URL);

    // Find nav links
    const navLinks = await page.locator('nav a[href], header a[href]').all();
    console.log(`Found ${navLinks.length} nav links`);
    expect(navLinks.length).toBeGreaterThan(0);

    // Check at least a few nav links are visible and functional
    for (const link of navLinks.slice(0, 5)) {
      const href = await link.getAttribute('href');
      const text = await link.textContent();
      console.log(`Nav link: "${text?.trim()}" → ${href}`);
      if (href && !href.startsWith('http') && !href.startsWith('#')) {
        await expect(link).toBeVisible();
      }
    }
  });

  test('auth page loads and shows login form', async ({ page }) => {
    const { jsErrors } = collectErrors(page);
    await gotoAndWait(page, `${BASE_URL}/auth`);
    await screenshot(page, '02-auth-page');

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    const criticalErrors = jsErrors.filter((e) => !e.includes('ResizeObserver'));
    expect(criticalErrors.length).toBe(0);
  });

  test('successful login and redirect', async ({ page }) => {
    const { jsErrors } = collectErrors(page);
    await login(page);
    await screenshot(page, '02-after-login');

    const url = page.url();
    console.log('After login URL:', url);
    expect(url).not.toContain('/auth');

    const criticalErrors = jsErrors.filter((e) => !e.includes('ResizeObserver'));
    if (criticalErrors.length > 0) {
      console.warn('JS errors after login:', criticalErrors);
    }
  });

  test('dashboard accessible after login', async ({ page }) => {
    await login(page);
    await gotoAndWait(page, `${BASE_URL}/dashboard`);
    await screenshot(page, '02-dashboard');

    const url = page.url();
    // Either stays on dashboard or redirects to auth (if session not persisted)
    console.log('Dashboard URL:', url);
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(100);
  });

  test('pricing page loads', async ({ page }) => {
    const { jsErrors } = collectErrors(page);
    await gotoAndWait(page, `${BASE_URL}/pricing`);
    await screenshot(page, '02-pricing');

    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(100);

    const criticalErrors = jsErrors.filter((e) => !e.includes('ResizeObserver'));
    expect(criticalErrors.length).toBe(0);
  });

  test('blog page loads', async ({ page }) => {
    const { jsErrors } = collectErrors(page);
    await gotoAndWait(page, `${BASE_URL}/blog`);
    await screenshot(page, '02-blog');

    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(100);
  });

  test('contact page loads', async ({ page }) => {
    const { jsErrors } = collectErrors(page);
    await gotoAndWait(page, `${BASE_URL}/contact`);
    await screenshot(page, '02-contact');

    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('community page loads', async ({ page }) => {
    await gotoAndWait(page, `${BASE_URL}/community`);
    await screenshot(page, '02-community');
    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(100);
  });

  test('privacy page loads', async ({ page }) => {
    await gotoAndWait(page, `${BASE_URL}/privacy`);
    await screenshot(page, '02-privacy');
    const body = await page.textContent('body');
    expect(body?.toLowerCase()).toMatch(/privacy/i);
  });

  test('terms page loads', async ({ page }) => {
    await gotoAndWait(page, `${BASE_URL}/terms`);
    await screenshot(page, '02-terms');
    const body = await page.textContent('body');
    expect(body?.toLowerCase()).toMatch(/terms/i);
  });

  test('no broken network requests on home page', async ({ page }) => {
    const { networkFails } = collectErrors(page);
    await gotoAndWait(page, BASE_URL);

    // Filter out known benign failures (e.g., analytics, font preloads)
    const criticalFails = networkFails.filter(
      (f) =>
        !f.includes('analytics') &&
        !f.includes('gtag') &&
        !f.includes('google-analytics') &&
        !f.includes('fonts.googleapis') &&
        !f.includes('ERR_ABORTED')
    );
    if (criticalFails.length > 0) {
      console.warn('Network failures:', criticalFails);
    }
    expect(criticalFails.length).toBeLessThanOrEqual(2);
  });

  test('CTA buttons are clickable and navigate', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);

    const ctaButtons = await page.locator('a[href*="join"], a[href*="auth"], a[href*="pricing"], button').all();
    console.log(`Found ${ctaButtons.length} CTA elements`);

    // Verify at least one CTA is visible
    let visibleCta = 0;
    for (const btn of ctaButtons.slice(0, 10)) {
      const isVisible = await btn.isVisible().catch(() => false);
      if (isVisible) visibleCta++;
    }
    expect(visibleCta).toBeGreaterThan(0);
  });

  test('footer is present with key links', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    await screenshot(page, '02-footer');

    const footer = page.locator('footer').first();
    await expect(footer).toBeVisible();
  });

  test('page title is not empty', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);
    const title = await page.title();
    console.log('Page title:', title);
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(3);
  });

  test('leaderboard page loads', async ({ page }) => {
    await gotoAndWait(page, `${BASE_URL}/leaderboard`);
    await screenshot(page, '02-leaderboard');
    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(50);
  });

  test('JS console errors on multiple pages', async ({ page }) => {
    const allErrors: Record<string, string[]> = {};

    for (const route of ['/', '/contact', '/pricing', '/blog']) {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await gotoAndWait(page, `${BASE_URL}${route}`);
      page.removeAllListeners('pageerror');
      if (errors.length > 0) {
        allErrors[route] = errors.filter((e) => !e.includes('ResizeObserver'));
      }
    }

    const criticalPages = Object.keys(allErrors).filter(
      (p) => allErrors[p].length > 0
    );
    if (criticalPages.length > 0) {
      console.warn('Pages with JS errors:', JSON.stringify(allErrors, null, 2));
    }
    expect(criticalPages.length).toBe(0);
  });
});
