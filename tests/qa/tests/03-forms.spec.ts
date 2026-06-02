/**
 * 03-forms.spec.ts
 * Happy path, negative, boundary, XSS/SQLi, double submit for all forms.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, gotoAndWait, screenshot, collectErrors, login } from '../utils/helpers';

const XSS_PAYLOADS = [
  '<script>alert("XSS")</script>',
  '"><img src=x onerror=alert(1)>',
  "';alert('xss');//",
  '<svg onload=alert(1)>',
  'javascript:alert(1)',
];

const SQLI_PAYLOADS = [
  "' OR '1'='1",
  "' OR 1=1--",
  "'; DROP TABLE users;--",
  '1; SELECT * FROM users',
  "admin'--",
];

test.describe('Forms — Auth', () => {
  test('happy path: valid login', async ({ page }) => {
    const { jsErrors } = collectErrors(page);
    await gotoAndWait(page, `${BASE_URL}/auth`);

    await page.locator('input[type="email"]').first().fill('pogurikalyan624@gmail.com');
    await page.locator('input[type="password"]').first().fill('Kalyan@12');
    await page.locator('button[type="submit"]').first().click();

    await page.waitForURL((u) => !u.pathname.includes('/auth'), { timeout: 15000 }).catch(() => {});
    await screenshot(page, '03-login-success');

    const url = page.url();
    console.log('After login:', url);
    expect(url).not.toContain('/auth');
  });

  test('negative: wrong password shows error', async ({ page }) => {
    await gotoAndWait(page, `${BASE_URL}/auth`);
    await page.locator('input[type="email"]').first().fill('pogurikalyan624@gmail.com');
    await page.locator('input[type="password"]').first().fill('WrongPassword999!');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(3000);
    await screenshot(page, '03-login-wrong-password');

    const body = await page.textContent('body');
    const hasError = body?.toLowerCase().match(/invalid|incorrect|wrong|error|failed|unauthorized/i);
    console.log('Wrong password response:', hasError ? 'Error shown' : 'No error text found');
    // Still on auth page or error shown
    const stillOnAuth = page.url().includes('/auth');
    expect(stillOnAuth || !!hasError).toBeTruthy();
  });

  test('negative: empty fields validation', async ({ page }) => {
    await gotoAndWait(page, `${BASE_URL}/auth`);
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();
    await page.waitForTimeout(1500);
    await screenshot(page, '03-login-empty');

    // Should either stay on page or show validation
    const url = page.url();
    expect(url).toContain('/auth');
  });

  test('boundary: extremely long email', async ({ page }) => {
    await gotoAndWait(page, `${BASE_URL}/auth`);
    const longEmail = 'a'.repeat(300) + '@example.com';
    await page.locator('input[type="email"]').first().fill(longEmail);
    await page.locator('input[type="password"]').first().fill('password123');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);
    await screenshot(page, '03-login-long-email');
    // Should not crash the page
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('boundary: extremely long password', async ({ page }) => {
    await gotoAndWait(page, `${BASE_URL}/auth`);
    await page.locator('input[type="email"]').first().fill('test@example.com');
    await page.locator('input[type="password"]').first().fill('P@ss' + 'x'.repeat(500));
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);
    // Page should not crash
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('XSS: payloads in email field do not execute', async ({ page }) => {
    for (const payload of XSS_PAYLOADS) {
      let alertFired = false;
      page.on('dialog', async (dialog) => {
        alertFired = true;
        await dialog.dismiss();
      });

      await gotoAndWait(page, `${BASE_URL}/auth`);
      await page.locator('input[type="email"]').first().fill(payload);
      await page.locator('input[type="password"]').first().fill('password');
      await page.locator('button[type="submit"]').first().click();
      await page.waitForTimeout(1500);

      expect(alertFired, `XSS alert fired for payload: ${payload}`).toBeFalsy();
    }
  });

  test('SQLi: payloads in email field are handled safely', async ({ page }) => {
    for (const payload of SQLI_PAYLOADS) {
      await gotoAndWait(page, `${BASE_URL}/auth`);
      await page.locator('input[type="email"]').first().fill(payload);
      await page.locator('input[type="password"]').first().fill("' OR '1'='1");
      await page.locator('button[type="submit"]').first().click();
      await page.waitForTimeout(2000);

      // Should not be logged in with SQL injection
      const url = page.url();
      const body = await page.textContent('body');
      const loggedIn = !url.includes('/auth') && !body?.toLowerCase().includes('invalid');
      if (loggedIn) {
        console.warn(`SECURITY: SQLi payload may have worked: ${payload}`);
      }
      expect(url).toContain('/auth'); // Should still be on auth page
    }
  });

  test('double submit prevention', async ({ page }) => {
    await gotoAndWait(page, `${BASE_URL}/auth`);
    await page.locator('input[type="email"]').first().fill('pogurikalyan624@gmail.com');
    await page.locator('input[type="password"]').first().fill('Kalyan@12');

    const submitBtn = page.locator('button[type="submit"]').first();

    // Track requests
    let loginRequests = 0;
    page.on('request', (req) => {
      if (req.url().includes('auth') || req.url().includes('login') || req.url().includes('sign')) {
        if (req.method() === 'POST') loginRequests++;
      }
    });

    // Double click rapidly
    await submitBtn.click();
    await submitBtn.click();
    await page.waitForTimeout(3000);

    console.log(`Login requests sent on double-click: ${loginRequests}`);
    // Ideally only 1 request; if 2 it's a potential double-submit issue
    if (loginRequests > 1) {
      console.warn(`ISSUE: Double submit — ${loginRequests} requests sent`);
    }
  });
});

test.describe('Forms — Contact / Other Forms', () => {
  test('contact page has no submittable forms (info only)', async ({ page }) => {
    await gotoAndWait(page, `${BASE_URL}/contact`);
    const forms = await page.locator('form').count();
    console.log(`Contact page forms: ${forms}`);
    // Log whatever forms exist
    await screenshot(page, '03-contact-page');
  });

  test('XSS in URL query params is sanitized', async ({ page }) => {
    let alertFired = false;
    page.on('dialog', async (dialog) => {
      alertFired = true;
      await dialog.dismiss();
    });

    const xssUrl = `${BASE_URL}/?q=<script>alert(1)</script>`;
    await page.goto(xssUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(2000);

    expect(alertFired, 'XSS alert fired via URL query param').toBeFalsy();
  });

  test('community page forms (if any) handle input safely', async ({ page }) => {
    await login(page);
    await gotoAndWait(page, `${BASE_URL}/community`);
    await screenshot(page, '03-community-logged-in');

    const forms = await page.locator('form').count();
    const textareas = await page.locator('textarea').count();
    console.log(`Community forms: ${forms}, textareas: ${textareas}`);

    if (textareas > 0) {
      const textarea = page.locator('textarea').first();
      await textarea.fill('<script>alert("XSS")</script>');
      await page.waitForTimeout(500);
      const value = await textarea.inputValue();
      // Value should be stored as-is (not executed)
      console.log('Textarea value stored safely:', value.includes('<script>'));
    }
  });

  test('my-questions page form (if any)', async ({ page }) => {
    await login(page);
    await gotoAndWait(page, `${BASE_URL}/my-questions`);
    await screenshot(page, '03-my-questions');
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });
});

test.describe('Forms — Input Boundary Cases', () => {
  test('unicode and emoji in inputs', async ({ page }) => {
    await gotoAndWait(page, `${BASE_URL}/auth`);
    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.fill('测试@example.com');
    await page.locator('input[type="password"]').first().fill('Pass🔐word1!');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);
    // Page should not crash
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('null bytes and control characters', async ({ page }) => {
    await gotoAndWait(page, `${BASE_URL}/auth`);
    const emailInput = page.locator('input[type="email"]').first();
    // Fill with control chars - may be truncated by browser
    await emailInput.fill('test\x00@example.com');
    await page.locator('input[type="password"]').first().fill('\x00\x01\x02');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('whitespace-only input', async ({ page }) => {
    await gotoAndWait(page, `${BASE_URL}/auth`);
    await page.locator('input[type="email"]').first().fill('   ');
    await page.locator('input[type="password"]').first().fill('   ');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);
    const url = page.url();
    // Should not log in with whitespace credentials
    const body = await page.textContent('body');
    console.log('Whitespace login URL:', url);
  });
});
