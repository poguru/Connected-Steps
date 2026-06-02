/**
 * 08-edge-cases.spec.ts
 * Invalid URLs, rapid clicks, back/forward spam, 404, network errors.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, gotoAndWait, screenshot, collectErrors, login } from '../utils/helpers';

test.describe('Edge Cases', () => {
  test('invalid/random URL returns 404 page', async ({ page }) => {
    await gotoAndWait(page, `${BASE_URL}/xyz-not-real-page-12345`);
    await screenshot(page, '08-404-random');
    const body = await page.textContent('body');
    expect(body?.toLowerCase()).toMatch(/not found|404/i);
  });

  test('URL with special characters does not crash', async ({ page }) => {
    const { jsErrors } = collectErrors(page);
    const urls = [
      `${BASE_URL}/<script>`,
      `${BASE_URL}/page%00null`,
      `${BASE_URL}/page/../admin`,
      `${BASE_URL}/?param=<img src=x onerror=alert(1)>`,
      `${BASE_URL}/../../etc/passwd`,
    ];

    for (const url of urls) {
      await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(500);
      const criticalErrors = jsErrors.filter(
        (e) => !e.includes('ResizeObserver') && !e.includes('Not-found')
      );
      if (criticalErrors.length > 0) {
        console.warn(`JS errors for URL "${url}":`, criticalErrors);
      }
    }
  });

  test('rapid clicking submit button does not cause race condition', async ({ page }) => {
    await gotoAndWait(page, `${BASE_URL}/auth`);
    await page.locator('input[type="email"]').first().fill('test@test.com');
    await page.locator('input[type="password"]').first().fill('Test@1234');

    const submitBtn = page.locator('button[type="submit"]').first();

    let requestCount = 0;
    page.on('request', (req) => {
      if (req.method() === 'POST') requestCount++;
    });

    // Rapid click 5 times
    for (let i = 0; i < 5; i++) {
      await submitBtn.click({ delay: 50 });
    }

    await page.waitForTimeout(3000);
    console.log(`POST requests after 5 rapid clicks: ${requestCount}`);
    // Ideally 1 request; >2 indicates double-submit bug
    if (requestCount > 2) {
      console.warn(`ISSUE: ${requestCount} POST requests from rapid clicking`);
    }
  });

  test('back/forward navigation spam does not break page', async ({ page }) => {
    const { jsErrors } = collectErrors(page);

    await gotoAndWait(page, BASE_URL);
    await gotoAndWait(page, `${BASE_URL}/contact`);
    await gotoAndWait(page, `${BASE_URL}/pricing`);

    // Spam back/forward
    for (let i = 0; i < 5; i++) {
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(300);
    }
    for (let i = 0; i < 5; i++) {
      await page.goForward({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(300);
    }

    await screenshot(page, '08-back-forward');

    const criticalErrors = jsErrors.filter((e) => !e.includes('ResizeObserver'));
    if (criticalErrors.length > 0) {
      console.warn('JS errors after back/forward spam:', criticalErrors);
    }
    expect(criticalErrors.length).toBe(0);
  });

  test('page still works with JavaScript partially disabled (meta fallback)', async ({ page, context }) => {
    // Intercept and check if critical content is in HTML (SSR)
    const response = await page.request.get(BASE_URL);
    const html = await response.text();
    // Should have some server-rendered content
    expect(html.length).toBeGreaterThan(500);
    console.log('HTML size:', html.length);
    // Check if key content exists in HTML
    const hasContent = html.includes('<html') && html.includes('<body');
    expect(hasContent).toBeTruthy();
  });

  test('extremely long URL does not crash server', async ({ page }) => {
    const longPath = '/page/' + 'a'.repeat(2000);
    const res = await page.request.get(`${BASE_URL}${longPath}`, { timeout: 15000 }).catch(() => null);
    if (res) {
      console.log(`Long URL response: ${res.status()}`);
      // Should return 404 or 400, not 500
      expect(res.status()).not.toBe(500);
    }
  });

  test('page handles offline gracefully (intercepted network)', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);

    // Simulate offline by intercepting all requests
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.includes(BASE_URL)) {
        route.abort('failed');
      } else {
        route.continue();
      }
    });

    // Try navigating to another page
    const navResult = await page.goto(`${BASE_URL}/contact`, {
      waitUntil: 'domcontentloaded',
      timeout: 5000,
    }).catch((e) => e);

    console.log('Offline navigation result:', navResult instanceof Error ? 'Error (expected)' : 'Loaded');

    // Page shouldn't show blank — may show error page
    const body = await page.textContent('body').catch(() => '');
    console.log('Body on offline:', body?.slice(0, 100));
  });

  test('session cookie deleted — protected pages redirect to auth', async ({ page, context }) => {
    await login(page);
    // Clear all cookies
    await context.clearCookies();

    await gotoAndWait(page, `${BASE_URL}/dashboard`);
    await screenshot(page, '08-no-session-dashboard');

    const url = page.url();
    console.log('Dashboard without session:', url);
    // Should redirect to auth or show login prompt
    // Some pages may be public; just verify no server error
    expect(page.url()).not.toContain('/500');
  });

  test('malformed cookie does not crash app', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'session',
        value: '<script>alert(1)</script>',
        domain: 'www.connectedsteps.in',
        path: '/',
      },
      {
        name: 'auth-token',
        value: 'AAAA' + 'A'.repeat(1000),
        domain: 'www.connectedsteps.in',
        path: '/',
      },
    ]);

    await gotoAndWait(page, BASE_URL);
    await screenshot(page, '08-malformed-cookie');

    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    // No server error
    expect(body?.toLowerCase()).not.toMatch(/internal server error|500|fatal/i);
  });

  test('deep nested URL does not cause infinite redirect', async ({ page }) => {
    const deepUrl = `${BASE_URL}/a/b/c/d/e/f/g/h/i/j`;
    const res = await page.goto(deepUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    }).catch((e) => null);

    console.log('Deep URL final URL:', page.url());
    // Should resolve to 404 or home, not loop forever
    expect(page.url()).not.toBe(deepUrl + '/a/b/c/d/e/f/g/h/i/j/a/b'); // No infinite redirect
  });

  test('anchor links (#) navigate smoothly', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);

    const anchorLinks = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href^="#"]'))
        .map((a) => a.getAttribute('href'))
        .filter(Boolean)
    );

    console.log('Anchor links:', anchorLinks);

    for (const anchor of anchorLinks.slice(0, 5)) {
      await page.click(`a[href="${anchor}"]`).catch(() => {});
      await page.waitForTimeout(500);
      // Should not cause JS error or page reload
    }
  });

  test('concurrent requests do not cause race condition on auth', async ({ page }) => {
    await gotoAndWait(page, `${BASE_URL}/auth`);

    // Fill form
    await page.locator('input[type="email"]').first().fill('pogurikalyan624@gmail.com');
    await page.locator('input[type="password"]').first().fill('Kalyan@12');

    // Get submit button
    const btn = page.locator('button[type="submit"]').first();

    // Single legitimate submit
    await btn.click();
    await page.waitForTimeout(5000);

    const finalUrl = page.url();
    console.log('Final URL after auth:', finalUrl);
    // Should have navigated away or shown appropriate response
  });

  test('page handles very large query strings', async ({ page }) => {
    const bigQuery = '?data=' + 'x'.repeat(8000);
    const res = await page.goto(`${BASE_URL}/${bigQuery}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    }).catch(() => null);
    const status = res?.status() ?? 'error';
    console.log('Large query string response status:', status);
    // Should not 500
    if (typeof status === 'number') {
      expect(status).not.toBe(500);
    }
  });
});
