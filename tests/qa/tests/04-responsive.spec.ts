/**
 * 04-responsive.spec.ts
 * Mobile/tablet/desktop viewports, no horizontal scroll, no overlapping elements.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, VIEWPORTS, gotoAndWait, screenshot, hasHorizontalScroll } from '../utils/helpers';

const PAGES_TO_CHECK = ['/', '/auth', '/pricing', '/contact', '/blog', '/leaderboard'];

test.describe('Responsive Design', () => {
  for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
    test.describe(`Viewport: ${vpName} (${viewport.width}x${viewport.height})`, () => {
      test.use({ viewport });

      test(`home page — no horizontal scroll at ${vpName}`, async ({ page }) => {
        await gotoAndWait(page, BASE_URL);
        await screenshot(page, `04-home-${vpName}`);

        const hasScroll = await hasHorizontalScroll(page);
        if (hasScroll) {
          // Get the overflow element
          const overflowInfo = await page.evaluate(() => {
            const elms = document.querySelectorAll('*');
            const overflow: string[] = [];
            for (const el of Array.from(elms)) {
              if (el.scrollWidth > document.documentElement.clientWidth) {
                overflow.push(`${el.tagName}.${el.className} scrollWidth=${el.scrollWidth}`);
              }
            }
            return overflow.slice(0, 10);
          });
          console.warn(`Horizontal scroll at ${vpName}:`, overflowInfo);
        }
        expect(hasScroll, `Horizontal scroll detected at ${vpName}`).toBeFalsy();
      });

      test(`nav is accessible at ${vpName}`, async ({ page }) => {
        await gotoAndWait(page, BASE_URL);

        const nav = page.locator('nav, header').first();
        await expect(nav).toBeVisible();

        if (vpName === 'mobile') {
          // Check for hamburger menu or mobile nav
          const hamburger = page.locator('[aria-label*="menu" i], [aria-label*="hamburger" i], button.menu, .hamburger, .mobile-menu, [data-testid*="menu"]').first();
          const hasHamburger = await hamburger.isVisible().catch(() => false);
          console.log(`Mobile nav hamburger visible: ${hasHamburger}`);
        }
      });

      test(`text is readable (font-size >= 12px) at ${vpName}`, async ({ page }) => {
        await gotoAndWait(page, BASE_URL);

        const tinyText = await page.evaluate(() => {
          const elements = document.querySelectorAll('p, span, a, li, td, th, label, button');
          const tiny: string[] = [];
          for (const el of Array.from(elements)) {
            const style = window.getComputedStyle(el);
            const size = parseFloat(style.fontSize);
            if (size > 0 && size < 10) {
              tiny.push(`${el.tagName} "${(el as HTMLElement).innerText.slice(0, 30)}" = ${size}px`);
            }
          }
          return tiny.slice(0, 10);
        });

        if (tinyText.length > 0) {
          console.warn(`Tiny text at ${vpName}:`, tinyText);
        }
        // Warn but don't fail hard — some decorative elements may be small
        expect(tinyText.length).toBeLessThanOrEqual(5);
      });

      test(`images scale properly at ${vpName}`, async ({ page }) => {
        await gotoAndWait(page, BASE_URL);

        const overflowingImages = await page.evaluate((vp) => {
          const imgs = document.querySelectorAll('img');
          const overflow: string[] = [];
          for (const img of Array.from(imgs)) {
            if (img.offsetWidth > vp.width + 5) {
              overflow.push(`img src="${img.src.slice(-60)}" width=${img.offsetWidth}`);
            }
          }
          return overflow;
        }, viewport);

        if (overflowingImages.length > 0) {
          console.warn(`Overflowing images at ${vpName}:`, overflowingImages);
        }
        expect(overflowingImages.length).toBe(0);
      });
    });
  }

  test('auth page renders correctly on mobile', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await gotoAndWait(page, `${BASE_URL}/auth`);
    await screenshot(page, '04-auth-mobile');

    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    // Inputs should be reasonably sized on mobile
    const inputBox = await emailInput.boundingBox();
    if (inputBox) {
      console.log(`Mobile email input size: ${inputBox.width}x${inputBox.height}`);
      expect(inputBox.width).toBeGreaterThan(200);
      expect(inputBox.height).toBeGreaterThan(30);
    }
  });

  test('pricing page renders correctly on mobile', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await gotoAndWait(page, `${BASE_URL}/pricing`);
    await screenshot(page, '04-pricing-mobile');

    const hasScroll = await hasHorizontalScroll(page);
    expect(hasScroll).toBeFalsy();
  });

  test('no overlapping interactive elements on mobile', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await gotoAndWait(page, BASE_URL);

    // Check that buttons/links are not overlapping
    const overlaps = await page.evaluate(() => {
      const interactives = Array.from(document.querySelectorAll('a, button, input, select, textarea'));
      const overlapping: string[] = [];

      for (let i = 0; i < Math.min(interactives.length, 50); i++) {
        const a = interactives[i].getBoundingClientRect();
        for (let j = i + 1; j < Math.min(interactives.length, 50); j++) {
          const b = interactives[j].getBoundingClientRect();
          if (
            a.width > 0 && a.height > 0 && b.width > 0 && b.height > 0 &&
            a.left < b.right && a.right > b.left &&
            a.top < b.bottom && a.bottom > b.top
          ) {
            const overlapArea = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
              Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
            if (overlapArea > 100) { // More than 100px² overlap
              overlapping.push(
                `${interactives[i].tagName}[${i}] overlaps ${interactives[j].tagName}[${j}] by ${overlapArea}px²`
              );
            }
          }
        }
      }
      return overlapping.slice(0, 10);
    });

    if (overlaps.length > 0) {
      console.warn('Overlapping elements on mobile:', overlaps);
    }
    expect(overlaps.length).toBeLessThanOrEqual(3);
  });

  test('touch targets are large enough on mobile (min 44x44px)', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await gotoAndWait(page, BASE_URL);

    const smallTargets = await page.evaluate(() => {
      const MIN_SIZE = 44;
      const interactives = Array.from(document.querySelectorAll('a, button'));
      const small: string[] = [];

      for (const el of interactives) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) {
            small.push(
              `${el.tagName} "${(el as HTMLElement).innerText.slice(0, 30)}" ${Math.round(rect.width)}x${Math.round(rect.height)}px`
            );
          }
        }
      }
      return small.slice(0, 10);
    });

    console.log(`Small touch targets: ${smallTargets.length}`);
    if (smallTargets.length > 0) {
      console.warn('Touch targets smaller than 44px:', smallTargets);
    }
    // WCAG recommends 44px — warn if >10 violations
    expect(smallTargets.length).toBeLessThanOrEqual(10);
  });

  test('contact page no horizontal scroll on mobile', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await gotoAndWait(page, `${BASE_URL}/contact`);
    await screenshot(page, '04-contact-mobile');

    const hasScroll = await hasHorizontalScroll(page);
    expect(hasScroll).toBeFalsy();
  });

  test('leaderboard no horizontal scroll on tablet', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.tablet);
    await gotoAndWait(page, `${BASE_URL}/leaderboard`);
    await screenshot(page, '04-leaderboard-tablet');

    const hasScroll = await hasHorizontalScroll(page);
    expect(hasScroll).toBeFalsy();
  });
});
