import { Page, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

export const BASE_URL = 'https://www.connectedsteps.in';

export const CREDENTIALS = {
  email: 'pogurikalyan624@gmail.com',
  password: 'Kalyan@12',
};

export const KNOWN_ROUTES = [
  '/',
  '/auth',
  '/join',
  '/pricing',
  '/contact',
  '/blog',
  '/community',
  '/leaderboard',
  '/dashboard',
  '/profile',
  '/achievements',
  '/my-questions',
  '/weekend-run',
  '/welcome',
  '/privacy',
  '/terms',
  '/payments',
];

export const VIEWPORTS = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
  wide: { width: 1920, height: 1080 },
};

/** Collect all JS errors and network failures on a page */
export function collectErrors(page: Page): { jsErrors: string[]; networkFails: string[] } {
  const jsErrors: string[] = [];
  const networkFails: string[] = [];

  page.on('pageerror', (err) => {
    jsErrors.push(err.message);
  });

  page.on('requestfailed', (req) => {
    const failure = req.failure();
    networkFails.push(`${req.method()} ${req.url()} — ${failure?.errorText ?? 'unknown'}`);
  });

  return { jsErrors, networkFails };
}

/** Navigate and wait for network idle */
export async function gotoAndWait(page: Page, url: string, timeout = 30000) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForTimeout(1500); // let React hydrate
}

/** Save a screenshot with a given label */
export async function screenshot(page: Page, label: string) {
  const dir = path.join(__dirname, '..', 'screenshots');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${label.replace(/[^a-z0-9]/gi, '_')}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

/** Login via the /auth page */
export async function login(page: Page) {
  await gotoAndWait(page, `${BASE_URL}/auth`);
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  await emailInput.fill(CREDENTIALS.email);
  await passwordInput.fill(CREDENTIALS.password);
  const submitBtn = page.locator('button[type="submit"]').first();
  await submitBtn.click();
  // Wait for redirect away from auth page
  await page.waitForURL((url) => !url.pathname.includes('/auth'), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
}

/** Get all anchor hrefs from the current page */
export async function getAllLinks(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]'))
      .map((a) => (a as HTMLAnchorElement).href)
      .filter((h) => h && !h.startsWith('javascript:') && !h.startsWith('mailto:') && !h.startsWith('tel:'))
  );
}

/** Check if page has horizontal overflow */
export async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

/** Get performance metrics via PerformanceNavigationTiming */
export async function getNavTiming(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (!entry) return {};
    return {
      domContentLoaded: Math.round(entry.domContentLoadedEventEnd - entry.startTime),
      loadComplete: Math.round(entry.loadEventEnd - entry.startTime),
      ttfb: Math.round(entry.responseStart - entry.requestStart),
      domInteractive: Math.round(entry.domInteractive - entry.startTime),
    };
  });
}

/** Measure LCP via PerformanceObserver */
export async function getLCP(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let lcp = 0;
        const obs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            lcp = (entry as any).startTime;
          }
        });
        try {
          obs.observe({ type: 'largest-contentful-paint', buffered: true });
        } catch {
          resolve(0);
          return;
        }
        setTimeout(() => {
          obs.disconnect();
          resolve(lcp);
        }, 3000);
      })
  );
}

/** Measure CLS */
export async function getCLS(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let cls = 0;
        const obs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              cls += (entry as any).value;
            }
          }
        });
        try {
          obs.observe({ type: 'layout-shift', buffered: true });
        } catch {
          resolve(0);
          return;
        }
        setTimeout(() => {
          obs.disconnect();
          resolve(cls);
        }, 3000);
      })
  );
}

/** Fetch response headers for a URL */
export async function fetchHeaders(page: Page, url: string): Promise<Record<string, string>> {
  return page.evaluate(async (u) => {
    const resp = await fetch(u, { method: 'HEAD', redirect: 'follow' }).catch(() => null);
    if (!resp) return {};
    const headers: Record<string, string> = {};
    resp.headers.forEach((val: string, key: string) => {
      headers[key] = val;
    });
    return headers;
  }, url);
}

/** Check heading hierarchy — returns issues */
export async function checkHeadingHierarchy(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    const issues: string[] = [];
    let prevLevel = 0;
    for (const h of headings) {
      const level = parseInt(h.tagName[1]);
      if (prevLevel > 0 && level > prevLevel + 1) {
        issues.push(`Skipped from h${prevLevel} to h${level}: "${(h as HTMLElement).innerText.slice(0, 60)}"`);
      }
      prevLevel = level;
    }
    return issues;
  });
}

/** Get all images without alt text */
export async function getImagesWithoutAlt(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('img'))
      .filter((img) => !img.alt || img.alt.trim() === '')
      .map((img) => img.src || img.dataset.src || '[unknown src]')
  );
}

/** Get form inputs without labels */
export async function getInputsWithoutLabels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select'));
    return inputs
      .filter((input) => {
        const el = input as HTMLInputElement;
        const id = el.id;
        const hasLabel = id && document.querySelector(`label[for="${id}"]`) !== null;
        const hasAriaLabel = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
        const hasPlaceholder = el.placeholder;
        return !hasLabel && !hasAriaLabel && !hasPlaceholder;
      })
      .map((el) => `${el.tagName} name="${(el as HTMLInputElement).name}" id="${(el as HTMLElement).id}"`);
  });
}
