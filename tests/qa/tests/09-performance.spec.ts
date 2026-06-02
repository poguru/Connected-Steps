/**
 * 09-performance.spec.ts
 * LCP, CLS, navigation timing, slow 3G simulation, resource sizes.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, gotoAndWait, screenshot, getNavTiming, getLCP, getCLS } from '../utils/helpers';

const PAGES_TO_TEST = [
  { name: 'home', path: '/' },
  { name: 'pricing', path: '/pricing' },
  { name: 'blog', path: '/blog' },
];

// Thresholds
const THRESHOLDS = {
  LCP_GOOD: 2500,     // ms — LCP < 2.5s = Good
  LCP_POOR: 4000,     // ms — LCP > 4s = Poor
  CLS_GOOD: 0.1,      // CLS < 0.1 = Good
  CLS_POOR: 0.25,     // CLS > 0.25 = Poor
  TTFB_GOOD: 800,     // ms
  DOM_CONTENT_LOADED: 3000, // ms
  PAGE_LOAD: 5000,    // ms
  JS_BUNDLE_MAX: 500 * 1024, // 500KB per bundle
  TOTAL_JS_MAX: 2 * 1024 * 1024, // 2MB total JS
  TOTAL_IMG_MAX: 3 * 1024 * 1024, // 3MB total images
};

test.describe('Performance', () => {
  test('home page navigation timing', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    const timing = await getNavTiming(page);
    console.log('Navigation timing:', timing);

    if (timing.ttfb > THRESHOLDS.TTFB_GOOD) {
      console.warn(`TTFB slow: ${timing.ttfb}ms (good < ${THRESHOLDS.TTFB_GOOD}ms)`);
    }
    if (timing.domContentLoaded > THRESHOLDS.DOM_CONTENT_LOADED) {
      console.warn(`DOMContentLoaded slow: ${timing.domContentLoaded}ms`);
    }
    if (timing.loadComplete > THRESHOLDS.PAGE_LOAD) {
      console.warn(`Page load slow: ${timing.loadComplete}ms`);
    }

    expect(timing.ttfb).toBeGreaterThan(0);
    expect(timing.loadComplete).toBeLessThan(15000); // hard cap at 15s
  });

  test('home page LCP', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'load' });
    const lcp = await getLCP(page);
    console.log(`LCP: ${Math.round(lcp)}ms`);

    if (lcp > 0) {
      if (lcp <= THRESHOLDS.LCP_GOOD) {
        console.log('LCP: GOOD');
      } else if (lcp <= THRESHOLDS.LCP_POOR) {
        console.warn(`LCP: NEEDS IMPROVEMENT (${Math.round(lcp)}ms, target <2500ms)`);
      } else {
        console.warn(`LCP: POOR (${Math.round(lcp)}ms, target <2500ms)`);
      }
      expect(lcp).toBeLessThan(10000); // hard cap
    }
  });

  test('home page CLS (Cumulative Layout Shift)', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'load' });
    await page.waitForTimeout(3000); // wait for layout shifts to complete

    const cls = await getCLS(page);
    console.log(`CLS: ${cls.toFixed(4)}`);

    if (cls <= THRESHOLDS.CLS_GOOD) {
      console.log('CLS: GOOD');
    } else if (cls <= THRESHOLDS.CLS_POOR) {
      console.warn(`CLS: NEEDS IMPROVEMENT (${cls.toFixed(4)}, target <0.1)`);
    } else {
      console.warn(`CLS: POOR (${cls.toFixed(4)}, target <0.1)`);
    }

    expect(cls).toBeLessThan(1); // hard cap
  });

  test('resource sizes — JS bundles', async ({ page }) => {
    const jsSizes: Array<{ url: string; size: number }> = [];
    let totalJs = 0;

    page.on('response', async (res) => {
      if (
        res.request().resourceType() === 'script' &&
        res.url().includes(BASE_URL.replace('https://', ''))
      ) {
        try {
          const body = await res.body();
          jsSizes.push({ url: res.url().split('/').pop() ?? res.url(), size: body.length });
          totalJs += body.length;
        } catch {}
      }
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });

    console.log(`Total JS: ${(totalJs / 1024).toFixed(1)} KB`);
    console.log(
      'JS bundles:',
      jsSizes
        .sort((a, b) => b.size - a.size)
        .slice(0, 10)
        .map((j) => `${(j.size / 1024).toFixed(1)}KB — ${j.url.slice(-60)}`)
    );

    const largeBundles = jsSizes.filter((j) => j.size > THRESHOLDS.JS_BUNDLE_MAX);
    if (largeBundles.length > 0) {
      console.warn('Large JS bundles (>500KB):', largeBundles.map((j) => `${(j.size / 1024).toFixed(1)}KB — ${j.url.slice(-60)}`));
    }

    if (totalJs > THRESHOLDS.TOTAL_JS_MAX) {
      console.warn(`Total JS exceeds 2MB: ${(totalJs / 1024 / 1024).toFixed(2)}MB`);
    }

    expect(largeBundles.length).toBeLessThanOrEqual(3);
  });

  test('resource sizes — images', async ({ page }) => {
    const imgSizes: Array<{ url: string; size: number }> = [];
    let totalImg = 0;

    page.on('response', async (res) => {
      if (res.request().resourceType() === 'image') {
        try {
          const body = await res.body();
          imgSizes.push({ url: res.url().split('/').pop() ?? res.url(), size: body.length });
          totalImg += body.length;
        } catch {}
      }
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });

    console.log(`Total images: ${(totalImg / 1024).toFixed(1)} KB`);
    const largeImages = imgSizes.filter((i) => i.size > 500 * 1024); // >500KB per image
    if (largeImages.length > 0) {
      console.warn('Large images (>500KB):', largeImages.map((i) => `${(i.size / 1024).toFixed(1)}KB — ${i.url}`));
    }
  });

  test('images use modern formats (webp/avif)', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });

    const imageFormats = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img'))
        .map((img) => {
          const src = img.currentSrc || img.src;
          const ext = src.split('?')[0].split('.').pop()?.toLowerCase();
          return { src: src.slice(-60), format: ext };
        });
    });

    const legacyImages = imageFormats.filter(
      (i) => i.format && ['jpg', 'jpeg', 'png', 'gif'].includes(i.format)
    );
    const modernImages = imageFormats.filter(
      (i) => i.format && ['webp', 'avif'].includes(i.format)
    );

    console.log(`Images: ${imageFormats.length} total, ${modernImages.length} modern (webp/avif), ${legacyImages.length} legacy`);
    if (legacyImages.length > 5) {
      console.warn('Many legacy format images:', legacyImages.slice(0, 5));
    }
  });

  test('slow 3G simulation — page still loads', async ({ page }) => {
    // Simulate slow 3G: 400 Kbps, 400ms latency
    const client = await page.context().newCDPSession(page);
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (400 * 1024) / 8, // 400 Kbps in bytes
      uploadThroughput: (400 * 1024) / 8,
      latency: 400,
    });

    const startTime = Date.now();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const loadTime = Date.now() - startTime;

    await screenshot(page, '09-slow-3g-home');
    console.log(`Slow 3G load time (DOMContentLoaded): ${loadTime}ms`);

    // Should load within 30s on slow 3G
    expect(loadTime).toBeLessThan(30000);

    // Content should be visible
    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(100);

    // Reset network conditions
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });
  });

  test('no render-blocking resources (check for async/defer on scripts)', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    const blockingScripts = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('script[src]'))
        .filter((s) => !s.hasAttribute('async') && !s.hasAttribute('defer') && !s.hasAttribute('type'))
        .map((s) => s.getAttribute('src'))
        .slice(0, 10);
    });

    if (blockingScripts.length > 0) {
      console.warn('Potentially render-blocking scripts:', blockingScripts);
    }
    console.log(`Blocking scripts: ${blockingScripts.length}`);
    // Next.js handles this, but check for any manual scripts
    expect(blockingScripts.length).toBeLessThanOrEqual(2);
  });

  test('multiple pages performance comparison', async ({ page }) => {
    const results: Record<string, any> = {};

    for (const { name, path } of PAGES_TO_TEST) {
      await page.goto(`${BASE_URL}${path}`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(1000);

      const timing = await getNavTiming(page);
      results[name] = timing;
    }

    console.log('Performance comparison:');
    for (const [name, timing] of Object.entries(results)) {
      console.log(`  ${name}: TTFB=${timing.ttfb}ms, DCL=${timing.domContentLoaded}ms, Load=${timing.loadComplete}ms`);
    }
  });

  test('no unnecessary preload requests', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    const preloads = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('link[rel="preload"]'))
        .map((l) => ({ href: l.getAttribute('href'), as: l.getAttribute('as') }));
    });

    console.log('Preloaded resources:', preloads);
    // This is informational — preloads are generally good
  });

  test('Service Worker / caching headers for static assets', async ({ page }) => {
    const cacheHeaders: Array<{ url: string; cacheControl: string }> = [];

    page.on('response', (res) => {
      const rt = res.request().resourceType();
      if (['stylesheet', 'script', 'image', 'font'].includes(rt)) {
        const cc = res.headers()['cache-control'] ?? '';
        if (cc) {
          cacheHeaders.push({
            url: res.url().split('/').pop() ?? '',
            cacheControl: cc,
          });
        }
      }
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });

    const noCacheAssets = cacheHeaders.filter(
      (h) => !h.cacheControl || h.cacheControl.includes('no-store') || h.cacheControl.includes('no-cache')
    );

    if (noCacheAssets.length > 0) {
      console.warn('Static assets with no caching:', noCacheAssets.slice(0, 5));
    }

    const wellCachedAssets = cacheHeaders.filter((h) =>
      h.cacheControl.includes('max-age') && !h.cacheControl.includes('max-age=0')
    );
    console.log(`Assets: ${cacheHeaders.length} with cache headers, ${wellCachedAssets.length} well-cached`);
  });
});
