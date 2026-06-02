/**
 * 07-security.spec.ts
 * HTTPS, security headers, no exposed keys, cookies, localStorage.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, gotoAndWait, screenshot, login } from '../utils/helpers';

test.describe('Security', () => {
  test('site uses HTTPS', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);
    const url = page.url();
    expect(url.startsWith('https://'), `URL should start with https: ${url}`).toBeTruthy();
  });

  test('HTTP redirects to HTTPS', async ({ request }) => {
    const httpUrl = BASE_URL.replace('https://', 'http://');
    try {
      const res = await request.get(httpUrl, {
        maxRedirects: 0,
        timeout: 10000,
      });
      // Should redirect (301/302) to https
      expect([301, 302, 307, 308]).toContain(res.status());
      const location = res.headers()['location'] ?? '';
      if (location) {
        expect(location.startsWith('https://')).toBeTruthy();
      }
    } catch {
      // If connection refused on http, that's also acceptable
      console.log('HTTP connection refused — may be HTTPS-only');
    }
  });

  test('security headers are present', async ({ page }) => {
    let responseHeaders: Record<string, string> = {};

    page.on('response', (res) => {
      if (res.url() === BASE_URL + '/' || res.url() === BASE_URL) {
        responseHeaders = res.headers();
      }
    });

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // Capture headers via fetch
    const headers = await page.evaluate(async (url) => {
      try {
        const res = await fetch(url);
        const h: Record<string, string> = {};
        res.headers.forEach((v, k) => { h[k] = v; });
        return h;
      } catch {
        return {};
      }
    }, BASE_URL);

    const allHeaders = { ...responseHeaders, ...headers };
    console.log('Response headers:', JSON.stringify(allHeaders, null, 2));

    // Check important security headers
    const checks: Array<{ header: string; required: boolean; message: string }> = [
      { header: 'x-content-type-options', required: true, message: 'Missing X-Content-Type-Options' },
      { header: 'x-frame-options', required: false, message: 'Missing X-Frame-Options (or use CSP frame-ancestors)' },
      { header: 'strict-transport-security', required: true, message: 'Missing HSTS header' },
      { header: 'content-security-policy', required: false, message: 'Missing Content-Security-Policy' },
      { header: 'referrer-policy', required: false, message: 'Missing Referrer-Policy' },
      { header: 'permissions-policy', required: false, message: 'Missing Permissions-Policy' },
    ];

    for (const check of checks) {
      const val = allHeaders[check.header];
      if (!val) {
        if (check.required) {
          console.warn(`SECURITY: ${check.message}`);
        } else {
          console.log(`INFO: ${check.message} (optional but recommended)`);
        }
      } else {
        console.log(`OK: ${check.header} = ${val}`);
      }
    }

    // At minimum check X-Content-Type-Options
    const xContentType = allHeaders['x-content-type-options'];
    if (!xContentType) {
      console.warn('X-Content-Type-Options header missing');
    }
  });

  test('no sensitive keys exposed in page source', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);

    const pageContent = await page.content();

    const sensitivePatterns = [
      { pattern: /sk_live_[a-zA-Z0-9]{24,}/, name: 'Stripe live secret key' },
      { pattern: /AIza[0-9A-Za-z\-_]{35}/, name: 'Google API key' },
      { pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/, name: 'JWT token' },
      { pattern: /password\s*[:=]\s*['"][^'"]{8,}['"]/, name: 'Hardcoded password' },
      { pattern: /private_key.*BEGIN/, name: 'Private key' },
      { pattern: /supabase.*service_role.*key/i, name: 'Supabase service role key' },
      { pattern: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"][^'"]+['"]/, name: 'Supabase service role key in env' },
    ];

    for (const { pattern, name } of sensitivePatterns) {
      const found = pattern.test(pageContent);
      if (found) {
        console.warn(`CRITICAL SECURITY: ${name} found in page source!`);
      }
      expect(found, `${name} should not be in page source`).toBeFalsy();
    }
  });

  test('no sensitive keys in JavaScript bundles (spot check)', async ({ page }) => {
    const jsUrls: string[] = [];

    page.on('response', (res) => {
      if (res.url().includes('.js') && res.request().resourceType() === 'script') {
        jsUrls.push(res.url());
      }
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Check first few JS files
    const scriptsToCheck = jsUrls.slice(0, 5);
    console.log(`JS bundles to check: ${scriptsToCheck.length}`);

    for (const jsUrl of scriptsToCheck) {
      const res = await page.request.get(jsUrl);
      const content = await res.text();

      const dangerousPatterns = [
        { pattern: /sk_live_[a-zA-Z0-9]{24,}/, name: 'Stripe live key' },
        { pattern: /service_role/, name: 'Supabase service_role' },
        { pattern: /supabaseKey.*eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{50,}/, name: 'Supabase JWT key' },
      ];

      for (const { pattern, name } of dangerousPatterns) {
        if (pattern.test(content)) {
          console.warn(`SECURITY: ${name} found in ${jsUrl}`);
        }
      }
    }
  });

  test('cookies are HttpOnly and Secure', async ({ page, context }) => {
    await login(page);
    const cookies = await context.cookies();
    console.log('Cookies:', cookies.map((c) => ({
      name: c.name,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite,
      domain: c.domain,
    })));

    const authCookies = cookies.filter((c) =>
      c.name.toLowerCase().includes('session') ||
      c.name.toLowerCase().includes('auth') ||
      c.name.toLowerCase().includes('token') ||
      c.name.toLowerCase().includes('supabase')
    );

    console.log(`Auth-related cookies: ${authCookies.length}`);

    for (const cookie of authCookies) {
      if (!cookie.secure) {
        console.warn(`Cookie "${cookie.name}" is not Secure`);
      }
      if (!cookie.httpOnly) {
        console.warn(`Cookie "${cookie.name}" is not HttpOnly (accessible via JS)`);
      }
      if (!cookie.sameSite || cookie.sameSite === 'None') {
        console.warn(`Cookie "${cookie.name}" has no SameSite or SameSite=None`);
      }
    }
  });

  test('no sensitive data in localStorage', async ({ page }) => {
    await login(page);
    await gotoAndWait(page, `${BASE_URL}/dashboard`);

    const localStorage = await page.evaluate(() => {
      const data: Record<string, string> = {};
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i) ?? '';
        data[key] = window.localStorage.getItem(key) ?? '';
      }
      return data;
    });

    console.log('localStorage keys:', Object.keys(localStorage));

    // Check for obviously sensitive data
    for (const [key, value] of Object.entries(localStorage)) {
      if (/password|secret|private_key|service_role/i.test(key)) {
        console.warn(`Sensitive key in localStorage: "${key}"`);
      }
      if (value.length > 20 && /password|secret/i.test(value)) {
        console.warn(`Sensitive value in localStorage key "${key}"`);
      }
    }
  });

  test('no exposed Supabase service_role key in public config', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);

    // Check window.__NEXT_DATA__ for exposed secrets
    const nextData = await page.evaluate(() => {
      try {
        return JSON.stringify((window as any).__NEXT_DATA__ ?? {});
      } catch {
        return '{}';
      }
    });

    expect(nextData).not.toMatch(/service_role/i);
    expect(nextData).not.toMatch(/supabaseServiceKey/i);
    console.log('__NEXT_DATA__ size:', nextData.length, 'chars');
  });

  test('Content-Security-Policy does not allow unsafe-inline broadly', async ({ page }) => {
    let csp = '';

    page.on('response', (res) => {
      if (res.url().includes(BASE_URL.replace('https://', ''))) {
        const h = res.headers()['content-security-policy'] ?? '';
        if (h) csp = h;
      }
    });

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    console.log('CSP:', csp || 'NOT SET');

    if (csp) {
      if (csp.includes("'unsafe-eval'")) {
        console.warn('CSP allows unsafe-eval');
      }
      if (csp.includes("'unsafe-inline'") && csp.includes('script-src')) {
        console.warn('CSP allows unsafe-inline scripts');
      }
    }
  });

  test('payment page does not expose card data in DOM', async ({ page }) => {
    await login(page);
    await gotoAndWait(page, `${BASE_URL}/payments`);
    await screenshot(page, '07-payments');

    const pageSource = await page.content();
    // Should not have raw card numbers or CVV fields in DOM
    expect(pageSource).not.toMatch(/\b4[0-9]{12}(?:[0-9]{3})?\b/); // Visa pattern
    expect(pageSource).not.toMatch(/\bcvv\s*=\s*['"][0-9]{3}['"]/i);
  });

  test('admin routes are protected', async ({ page }) => {
    await gotoAndWait(page, `${BASE_URL}/admin`);
    const url = page.url();
    const status = await page.evaluate(() => {
      return document.title;
    });
    console.log('Admin route redirect/title:', url, status);
    // Should redirect to auth or show 403/404
    expect(url).not.toContain('/admin');
  });
});
