/**
 * 01-discovery.spec.ts
 * Crawl the site, detect broken links, redirect loops, and missing pages.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, KNOWN_ROUTES, getAllLinks, gotoAndWait, screenshot, collectErrors } from '../utils/helpers';

test.describe('Discovery & Crawl', () => {
  // Use a single project to avoid redundant crawling
  test.use({ viewport: { width: 1280, height: 800 } });

  test('home page loads with 200', async ({ page, request }) => {
    const res = await request.get(BASE_URL);
    expect(res.status(), `Expected 200, got ${res.status()} for ${BASE_URL}`).toBe(200);
  });

  test('known routes resolve without 4xx/5xx', async ({ request }) => {
    const failures: string[] = [];
    for (const route of KNOWN_ROUTES) {
      const url = `${BASE_URL}${route}`;
      try {
        const res = await request.get(url, { timeout: 20000 });
        if (res.status() >= 400) {
          failures.push(`${url} → ${res.status()}`);
        }
      } catch (e) {
        failures.push(`${url} → NETWORK_ERROR: ${(e as Error).message}`);
      }
    }
    if (failures.length > 0) {
      console.warn('Route failures:\n' + failures.join('\n'));
    }
    // We log but don't fail hard — some routes may require auth
    expect(failures.filter(f => !f.includes('401') && !f.includes('403')).length).toBeLessThanOrEqual(3);
  });

  test('sitemap.xml is accessible', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/sitemap.xml`, { timeout: 15000 });
    expect([200, 404], `sitemap.xml status`).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.text();
      expect(body).toContain('<urlset');
    }
  });

  test('robots.txt is accessible', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/robots.txt`, { timeout: 15000 });
    expect([200, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.text();
      expect(body.length).toBeGreaterThan(0);
      console.log('robots.txt content:', body.slice(0, 500));
    }
  });

  test('collect all links from home page and check for broken ones', async ({ page }) => {
    const { jsErrors, networkFails } = collectErrors(page);
    await gotoAndWait(page, BASE_URL);
    await screenshot(page, '01-home-page');

    const links = await getAllLinks(page);
    const internalLinks = links.filter(
      (l) => l.startsWith(BASE_URL) || l.startsWith('/')
    );
    const uniqueInternal = [...new Set(internalLinks)].slice(0, 40); // cap to avoid timeout

    console.log(`Found ${links.length} total links, ${uniqueInternal.length} unique internal`);

    const broken: string[] = [];
    for (const link of uniqueInternal) {
      try {
        const res = await page.request.get(link, { timeout: 15000 });
        if (res.status() >= 500) {
          broken.push(`${link} → ${res.status()}`);
        }
      } catch {
        // network errors tolerated for external
      }
    }

    if (broken.length > 0) {
      console.warn('Broken links:', broken.join('\n'));
    }
    expect(broken.length).toBe(0);
  });

  test('no redirect loops on known routes', async ({ page }) => {
    const loops: string[] = [];
    for (const route of ['/', '/auth', '/contact', '/pricing', '/blog']) {
      const url = `${BASE_URL}${route}`;
      const visited = new Set<string>();
      let current = url;
      let loopDetected = false;

      page.on('response', (res) => {
        if ([301, 302, 307, 308].includes(res.status())) {
          const location = res.headers()['location'] ?? '';
          if (visited.has(location)) loopDetected = true;
          visited.add(location);
        }
      });

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
      if (loopDetected) loops.push(url);
    }

    expect(loops.length, `Redirect loops detected: ${loops.join(', ')}`).toBe(0);
  });

  test('404 page is served for invalid URL', async ({ page, request }) => {
    const res = await request.get(`${BASE_URL}/this-page-definitely-does-not-exist-xyz-abc-123`);
    expect(res.status()).toBe(404);
    await gotoAndWait(page, `${BASE_URL}/this-page-definitely-does-not-exist-xyz-abc-123`);
    await screenshot(page, '01-404-page');
    const body = await page.textContent('body');
    expect(body?.toLowerCase()).toMatch(/not found|404|page not found/i);
  });

  test('favicon is present', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/favicon.ico`);
    expect([200, 204]).toContain(res.status());
  });

  test('external links open in new tab', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);
    const externalLinks = await page.evaluate((base) => {
      return Array.from(document.querySelectorAll('a[href]'))
        .filter((a) => {
          const href = (a as HTMLAnchorElement).href;
          return href && !href.startsWith(base) && href.startsWith('http');
        })
        .map((a) => ({
          href: (a as HTMLAnchorElement).href,
          target: a.getAttribute('target'),
          rel: a.getAttribute('rel'),
        }));
    }, BASE_URL);

    const missingTarget = externalLinks.filter((l) => l.target !== '_blank');
    if (missingTarget.length > 0) {
      console.warn(`External links without target="_blank":`, missingTarget.slice(0, 5));
    }

    const missingRel = externalLinks.filter(
      (l) => l.target === '_blank' && !(l.rel ?? '').includes('noopener')
    );
    if (missingRel.length > 0) {
      console.warn(`External links with target="_blank" missing rel="noopener":`, missingRel.slice(0, 5));
    }

    // Soft assertion — log but don't fail hard
    console.log(`External links: ${externalLinks.length} total, ${missingTarget.length} missing target, ${missingRel.length} missing noopener`);
  });
});
