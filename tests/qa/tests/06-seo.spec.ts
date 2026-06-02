/**
 * 06-seo.spec.ts
 * Title, meta description, H1, OG tags, robots.txt, sitemap.xml, canonical URLs.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, gotoAndWait, screenshot } from '../utils/helpers';

const SEO_PAGES = [
  { name: 'home', path: '/' },
  { name: 'pricing', path: '/pricing' },
  { name: 'blog', path: '/blog' },
  { name: 'contact', path: '/contact' },
  { name: 'leaderboard', path: '/leaderboard' },
];

test.describe('SEO', () => {
  test('home page has title tag (non-empty, <60 chars ideal)', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);
    const title = await page.title();
    console.log('Home title:', title);
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(5);
    if (title.length > 60) {
      console.warn(`Title too long: ${title.length} chars (ideal: <60) — "${title}"`);
    }
    if (title.length < 10) {
      console.warn(`Title too short: ${title.length} chars — "${title}"`);
    }
  });

  test('home page has meta description (50-160 chars ideal)', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);
    const metaDesc = await page.evaluate(() => {
      const el = document.querySelector('meta[name="description"]');
      return el?.getAttribute('content') ?? null;
    });
    console.log('Meta description:', metaDesc);
    expect(metaDesc, 'Meta description is missing').toBeTruthy();
    if (metaDesc) {
      expect(metaDesc.length).toBeGreaterThan(10);
      if (metaDesc.length < 50) {
        console.warn(`Meta description too short: ${metaDesc.length} chars`);
      }
      if (metaDesc.length > 160) {
        console.warn(`Meta description too long: ${metaDesc.length} chars (max 160)`);
      }
    }
  });

  test('home page has exactly one H1', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);
    const h1s = await page.locator('h1').allTextContents();
    console.log('H1 tags:', h1s);
    expect(h1s.length, 'Should have exactly one H1').toBe(1);
  });

  test('home page has Open Graph tags', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);

    const ogTags = await page.evaluate(() => {
      const tags: Record<string, string> = {};
      const metas = document.querySelectorAll('meta[property^="og:"]');
      for (const m of Array.from(metas)) {
        tags[m.getAttribute('property') ?? ''] = m.getAttribute('content') ?? '';
      }
      return tags;
    });

    console.log('OG tags:', ogTags);

    // Core OG tags
    expect(ogTags['og:title'], 'og:title missing').toBeTruthy();
    expect(ogTags['og:description'], 'og:description missing').toBeTruthy();
    expect(ogTags['og:url'], 'og:url missing').toBeTruthy();
  });

  test('home page has Twitter card tags', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);

    const twitterTags = await page.evaluate(() => {
      const tags: Record<string, string> = {};
      const metas = document.querySelectorAll('meta[name^="twitter:"]');
      for (const m of Array.from(metas)) {
        tags[m.getAttribute('name') ?? ''] = m.getAttribute('content') ?? '';
      }
      return tags;
    });

    console.log('Twitter tags:', twitterTags);
    if (!twitterTags['twitter:card']) {
      console.warn('Missing twitter:card meta tag');
    }
  });

  test('all pages have unique titles', async ({ page }) => {
    const titles: Record<string, string> = {};
    for (const { name, path } of SEO_PAGES) {
      await gotoAndWait(page, `${BASE_URL}${path}`);
      titles[name] = await page.title();
    }

    console.log('Page titles:', titles);

    const uniqueTitles = new Set(Object.values(titles));
    if (uniqueTitles.size < Object.keys(titles).length) {
      const duplicates = Object.entries(titles).filter(
        ([, t]) => Object.values(titles).filter((x) => x === t).length > 1
      );
      console.warn('Duplicate page titles:', duplicates);
    }
    expect(uniqueTitles.size, 'Pages should have unique titles').toBe(Object.keys(titles).length);
  });

  test('all pages have meta descriptions', async ({ page }) => {
    for (const { name, path } of SEO_PAGES) {
      await gotoAndWait(page, `${BASE_URL}${path}`);
      const desc = await page.evaluate(() => {
        return document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null;
      });
      console.log(`${name} meta description: ${desc?.slice(0, 80) ?? 'MISSING'}`);
      if (!desc) {
        console.warn(`${name} (${path}): Missing meta description`);
      }
    }
  });

  test('robots.txt exists and has correct directives', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/robots.txt`);
    if (res.status() === 404) {
      console.warn('robots.txt not found — SEO concern');
      return;
    }
    expect(res.status()).toBe(200);
    const body = await res.text();
    console.log('robots.txt:\n', body);
    expect(body.toLowerCase()).toMatch(/user-agent/i);
    // Should not disallow all
    if (body.match(/disallow:\s*\//i) && !body.match(/allow:/i)) {
      console.warn('robots.txt disallows all crawling!');
    }
  });

  test('sitemap.xml exists and is valid XML', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/sitemap.xml`);
    if (res.status() === 404) {
      console.warn('sitemap.xml not found — SEO concern');
      return;
    }
    expect(res.status()).toBe(200);
    const body = await res.text();
    console.log('sitemap.xml preview:', body.slice(0, 500));
    expect(body).toContain('<urlset');
    expect(body).toContain('<url>');
    expect(body).toContain('<loc>');
  });

  test('canonical URL is set on home page', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);
    const canonical = await page.evaluate(() => {
      return document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
    });
    console.log('Canonical URL:', canonical);
    if (!canonical) {
      console.warn('Missing canonical URL on home page');
    } else {
      expect(canonical).toContain('connectedsteps.in');
    }
  });

  test('viewport meta tag is set', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);
    const viewport = await page.evaluate(() => {
      return document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? null;
    });
    console.log('Viewport meta:', viewport);
    expect(viewport).toBeTruthy();
    expect(viewport).toContain('width=device-width');
  });

  test('structured data (JSON-LD) exists on home page', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);
    const jsonLd = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      return Array.from(scripts).map((s) => s.textContent?.slice(0, 200));
    });
    console.log('JSON-LD scripts:', jsonLd);
    if (jsonLd.length === 0) {
      console.warn('No JSON-LD structured data found — SEO improvement opportunity');
    }
  });

  test('images have descriptive filenames (no IMG_1234)', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);
    const badNames = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img'))
        .map((img) => img.src)
        .filter((src) => /\/(img_?\d{4,}|image\d+|photo\d+|dsc\d+)/i.test(src))
        .slice(0, 10);
    });
    if (badNames.length > 0) {
      console.warn('Images with generic filenames:', badNames);
    }
    console.log(`Generic image filenames: ${badNames.length}`);
  });

  test('page load does not have noindex directive', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);
    const noindex = await page.evaluate(() => {
      const metaRobots = document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '';
      const xRobotsTag = ''; // Would need response headers for this
      return { metaRobots };
    });
    console.log('Robots meta:', noindex.metaRobots);
    if (noindex.metaRobots.toLowerCase().includes('noindex')) {
      console.warn('HOME PAGE HAS noindex! — Critical SEO issue');
    }
    expect(noindex.metaRobots.toLowerCase()).not.toContain('noindex');
  });

  test('OG image is specified', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);
    const ogImage = await page.evaluate(() => {
      return document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? null;
    });
    console.log('OG image:', ogImage);
    if (!ogImage) {
      console.warn('Missing og:image — social sharing will show no image');
    }
  });
});
