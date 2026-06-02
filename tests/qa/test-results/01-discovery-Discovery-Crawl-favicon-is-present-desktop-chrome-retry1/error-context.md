# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 01-discovery.spec.ts >> Discovery & Crawl >> favicon is present
- Location: tests\qa\tests\01-discovery.spec.ts:119:7

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected value: 404
Received array: [200, 204]
```

# Test source

```ts
  21  |       try {
  22  |         const res = await request.get(url, { timeout: 20000 });
  23  |         if (res.status() >= 400) {
  24  |           failures.push(`${url} → ${res.status()}`);
  25  |         }
  26  |       } catch (e) {
  27  |         failures.push(`${url} → NETWORK_ERROR: ${(e as Error).message}`);
  28  |       }
  29  |     }
  30  |     if (failures.length > 0) {
  31  |       console.warn('Route failures:\n' + failures.join('\n'));
  32  |     }
  33  |     // We log but don't fail hard — some routes may require auth
  34  |     expect(failures.filter(f => !f.includes('401') && !f.includes('403')).length).toBeLessThanOrEqual(3);
  35  |   });
  36  | 
  37  |   test('sitemap.xml is accessible', async ({ request }) => {
  38  |     const res = await request.get(`${BASE_URL}/sitemap.xml`, { timeout: 15000 });
  39  |     expect([200, 404], `sitemap.xml status`).toContain(res.status());
  40  |     if (res.status() === 200) {
  41  |       const body = await res.text();
  42  |       expect(body).toContain('<urlset');
  43  |     }
  44  |   });
  45  | 
  46  |   test('robots.txt is accessible', async ({ request }) => {
  47  |     const res = await request.get(`${BASE_URL}/robots.txt`, { timeout: 15000 });
  48  |     expect([200, 404]).toContain(res.status());
  49  |     if (res.status() === 200) {
  50  |       const body = await res.text();
  51  |       expect(body.length).toBeGreaterThan(0);
  52  |       console.log('robots.txt content:', body.slice(0, 500));
  53  |     }
  54  |   });
  55  | 
  56  |   test('collect all links from home page and check for broken ones', async ({ page }) => {
  57  |     const { jsErrors, networkFails } = collectErrors(page);
  58  |     await gotoAndWait(page, BASE_URL);
  59  |     await screenshot(page, '01-home-page');
  60  | 
  61  |     const links = await getAllLinks(page);
  62  |     const internalLinks = links.filter(
  63  |       (l) => l.startsWith(BASE_URL) || l.startsWith('/')
  64  |     );
  65  |     const uniqueInternal = [...new Set(internalLinks)].slice(0, 40); // cap to avoid timeout
  66  | 
  67  |     console.log(`Found ${links.length} total links, ${uniqueInternal.length} unique internal`);
  68  | 
  69  |     const broken: string[] = [];
  70  |     for (const link of uniqueInternal) {
  71  |       try {
  72  |         const res = await page.request.get(link, { timeout: 15000 });
  73  |         if (res.status() >= 500) {
  74  |           broken.push(`${link} → ${res.status()}`);
  75  |         }
  76  |       } catch {
  77  |         // network errors tolerated for external
  78  |       }
  79  |     }
  80  | 
  81  |     if (broken.length > 0) {
  82  |       console.warn('Broken links:', broken.join('\n'));
  83  |     }
  84  |     expect(broken.length).toBe(0);
  85  |   });
  86  | 
  87  |   test('no redirect loops on known routes', async ({ page }) => {
  88  |     const loops: string[] = [];
  89  |     for (const route of ['/', '/auth', '/contact', '/pricing', '/blog']) {
  90  |       const url = `${BASE_URL}${route}`;
  91  |       const visited = new Set<string>();
  92  |       let current = url;
  93  |       let loopDetected = false;
  94  | 
  95  |       page.on('response', (res) => {
  96  |         if ([301, 302, 307, 308].includes(res.status())) {
  97  |           const location = res.headers()['location'] ?? '';
  98  |           if (visited.has(location)) loopDetected = true;
  99  |           visited.add(location);
  100 |         }
  101 |       });
  102 | 
  103 |       await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  104 |       if (loopDetected) loops.push(url);
  105 |     }
  106 | 
  107 |     expect(loops.length, `Redirect loops detected: ${loops.join(', ')}`).toBe(0);
  108 |   });
  109 | 
  110 |   test('404 page is served for invalid URL', async ({ page, request }) => {
  111 |     const res = await request.get(`${BASE_URL}/this-page-definitely-does-not-exist-xyz-abc-123`);
  112 |     expect(res.status()).toBe(404);
  113 |     await gotoAndWait(page, `${BASE_URL}/this-page-definitely-does-not-exist-xyz-abc-123`);
  114 |     await screenshot(page, '01-404-page');
  115 |     const body = await page.textContent('body');
  116 |     expect(body?.toLowerCase()).toMatch(/not found|404|page not found/i);
  117 |   });
  118 | 
  119 |   test('favicon is present', async ({ request }) => {
  120 |     const res = await request.get(`${BASE_URL}/favicon.ico`);
> 121 |     expect([200, 204]).toContain(res.status());
      |                        ^ Error: expect(received).toContain(expected) // indexOf
  122 |   });
  123 | 
  124 |   test('external links open in new tab', async ({ page }) => {
  125 |     await gotoAndWait(page, BASE_URL);
  126 |     const externalLinks = await page.evaluate((base) => {
  127 |       return Array.from(document.querySelectorAll('a[href]'))
  128 |         .filter((a) => {
  129 |           const href = (a as HTMLAnchorElement).href;
  130 |           return href && !href.startsWith(base) && href.startsWith('http');
  131 |         })
  132 |         .map((a) => ({
  133 |           href: (a as HTMLAnchorElement).href,
  134 |           target: a.getAttribute('target'),
  135 |           rel: a.getAttribute('rel'),
  136 |         }));
  137 |     }, BASE_URL);
  138 | 
  139 |     const missingTarget = externalLinks.filter((l) => l.target !== '_blank');
  140 |     if (missingTarget.length > 0) {
  141 |       console.warn(`External links without target="_blank":`, missingTarget.slice(0, 5));
  142 |     }
  143 | 
  144 |     const missingRel = externalLinks.filter(
  145 |       (l) => l.target === '_blank' && !(l.rel ?? '').includes('noopener')
  146 |     );
  147 |     if (missingRel.length > 0) {
  148 |       console.warn(`External links with target="_blank" missing rel="noopener":`, missingRel.slice(0, 5));
  149 |     }
  150 | 
  151 |     // Soft assertion — log but don't fail hard
  152 |     console.log(`External links: ${externalLinks.length} total, ${missingTarget.length} missing target, ${missingRel.length} missing noopener`);
  153 |   });
  154 | });
  155 | 
```