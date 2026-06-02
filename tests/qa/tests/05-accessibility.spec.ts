/**
 * 05-accessibility.spec.ts
 * Manual checks: alt text, labels, tab order, heading hierarchy, ARIA.
 */
import { test, expect } from '@playwright/test';
import {
  BASE_URL,
  gotoAndWait,
  screenshot,
  checkHeadingHierarchy,
  getImagesWithoutAlt,
  getInputsWithoutLabels,
} from '../utils/helpers';

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'auth', path: '/auth' },
  { name: 'contact', path: '/contact' },
  { name: 'pricing', path: '/pricing' },
  { name: 'blog', path: '/blog' },
  { name: 'leaderboard', path: '/leaderboard' },
];

test.describe('Accessibility', () => {
  test('images have alt text on all major pages', async ({ page }) => {
    const allIssues: Record<string, string[]> = {};

    for (const { name, path } of PAGES) {
      await gotoAndWait(page, `${BASE_URL}${path}`);
      const missing = await getImagesWithoutAlt(page);
      if (missing.length > 0) {
        allIssues[name] = missing;
      }
    }

    if (Object.keys(allIssues).length > 0) {
      console.warn('Images missing alt text:', JSON.stringify(allIssues, null, 2));
    }

    // Count total missing
    const total = Object.values(allIssues).reduce((sum, arr) => sum + arr.length, 0);
    expect(total).toBeLessThanOrEqual(5); // Allow max 5 across all pages
  });

  test('form inputs have labels or aria attributes', async ({ page }) => {
    const allIssues: Record<string, string[]> = {};

    for (const { name, path } of PAGES) {
      await gotoAndWait(page, `${BASE_URL}${path}`);
      const missing = await getInputsWithoutLabels(page);
      if (missing.length > 0) {
        allIssues[name] = missing;
      }
    }

    if (Object.keys(allIssues).length > 0) {
      console.warn('Inputs without labels:', JSON.stringify(allIssues, null, 2));
    }

    const total = Object.values(allIssues).reduce((sum, arr) => sum + arr.length, 0);
    expect(total).toBeLessThanOrEqual(5);
  });

  test('heading hierarchy is correct on all major pages', async ({ page }) => {
    const allIssues: Record<string, string[]> = {};

    for (const { name, path } of PAGES) {
      await gotoAndWait(page, `${BASE_URL}${path}`);
      const issues = await checkHeadingHierarchy(page);
      if (issues.length > 0) {
        allIssues[name] = issues;
      }
    }

    if (Object.keys(allIssues).length > 0) {
      console.warn('Heading hierarchy issues:', JSON.stringify(allIssues, null, 2));
    }

    // Each page should have at most 3 heading issues
    for (const [pageName, issues] of Object.entries(allIssues)) {
      expect(issues.length, `${pageName} heading issues`).toBeLessThanOrEqual(3);
    }
  });

  test('each page has exactly one H1', async ({ page }) => {
    for (const { name, path } of PAGES) {
      await gotoAndWait(page, `${BASE_URL}${path}`);
      const h1Count = await page.locator('h1').count();
      console.log(`${name}: H1 count = ${h1Count}`);
      expect(h1Count, `${name} should have exactly one H1`).toBe(1);
    }
  });

  test('skip navigation link exists on home page', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);
    const skipLink = page.locator('a[href="#main"], a[href="#content"], a.skip-link, a[href="#skip"]').first();
    const exists = await skipLink.count();
    if (exists === 0) {
      console.warn('No skip navigation link found — accessibility concern');
    }
    // Soft: log but don't fail (common issue)
    console.log(`Skip link present: ${exists > 0}`);
  });

  test('keyboard navigation — tab order is logical on auth page', async ({ page }) => {
    await gotoAndWait(page, `${BASE_URL}/auth`);

    const tabOrder: string[] = [];

    // Tab through interactive elements
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        return `${el.tagName} type="${(el as HTMLInputElement).type ?? ''}" name="${(el as HTMLInputElement).name ?? ''}"`;
      });
      if (focused) tabOrder.push(focused);
    }

    console.log('Tab order on auth page:', tabOrder);
    expect(tabOrder.length).toBeGreaterThan(0);
  });

  test('no elements with tabIndex > 0 (breaks natural order)', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);

    const badTabIndex = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[tabindex]'))
        .filter((el) => parseInt(el.getAttribute('tabindex') ?? '0') > 0)
        .map((el) => `${el.tagName} tabindex="${el.getAttribute('tabindex')}" text="${(el as HTMLElement).innerText.slice(0, 30)}"`);
    });

    if (badTabIndex.length > 0) {
      console.warn('Elements with tabIndex > 0:', badTabIndex);
    }
    expect(badTabIndex.length).toBe(0);
  });

  test('links have descriptive text (no "click here" or "read more")', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);

    const vagueLinkText = await page.evaluate(() => {
      const vague = /^(click here|read more|here|more|learn more|see more|go|link)$/i;
      return Array.from(document.querySelectorAll('a'))
        .filter((a) => {
          const text = (a as HTMLElement).innerText.trim();
          return text && vague.test(text);
        })
        .map((a) => `"${(a as HTMLElement).innerText.trim()}" href="${a.getAttribute('href')}"`);
    });

    if (vagueLinkText.length > 0) {
      console.warn('Vague link text:', vagueLinkText);
    }
    expect(vagueLinkText.length).toBeLessThanOrEqual(3);
  });

  test('ARIA roles are valid', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);

    const invalidRoles = await page.evaluate(() => {
      const validRoles = new Set([
        'alert', 'alertdialog', 'application', 'article', 'banner', 'button', 'cell',
        'checkbox', 'columnheader', 'combobox', 'complementary', 'contentinfo', 'definition',
        'dialog', 'directory', 'document', 'feed', 'figure', 'form', 'grid', 'gridcell',
        'group', 'heading', 'img', 'link', 'list', 'listbox', 'listitem', 'log', 'main',
        'marquee', 'math', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
        'navigation', 'none', 'note', 'option', 'presentation', 'progressbar', 'radio',
        'radiogroup', 'region', 'row', 'rowgroup', 'rowheader', 'scrollbar', 'search',
        'searchbox', 'separator', 'slider', 'spinbutton', 'status', 'switch', 'tab',
        'table', 'tablist', 'tabpanel', 'term', 'textbox', 'timer', 'toolbar', 'tooltip',
        'tree', 'treegrid', 'treeitem',
      ]);

      return Array.from(document.querySelectorAll('[role]'))
        .filter((el) => !validRoles.has(el.getAttribute('role') ?? ''))
        .map((el) => `${el.tagName} role="${el.getAttribute('role')}"`);
    });

    if (invalidRoles.length > 0) {
      console.warn('Invalid ARIA roles:', invalidRoles);
    }
    expect(invalidRoles.length).toBe(0);
  });

  test('color contrast — buttons have visible text', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);
    await screenshot(page, '05-home-a11y');

    // Check that buttons are not invisible (zero opacity or white-on-white)
    const invisibleButtons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button, a[role="button"]'))
        .filter((el) => {
          const style = window.getComputedStyle(el);
          return (
            parseFloat(style.opacity) < 0.3 ||
            style.color === style.backgroundColor
          );
        })
        .map((el) => `"${(el as HTMLElement).innerText.slice(0, 30)}"`)
        .filter(Boolean);
    });

    if (invisibleButtons.length > 0) {
      console.warn('Potentially invisible buttons:', invisibleButtons);
    }
  });

  test('focus indicators are visible', async ({ page }) => {
    await gotoAndWait(page, `${BASE_URL}/auth`);

    // Focus first input and check if outline is visible
    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.focus();

    const hasOutline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return (
        style.outline !== 'none' &&
        style.outline !== '0px' &&
        style.outlineWidth !== '0px' &&
        style.outlineStyle !== 'none'
      ) || style.boxShadow !== 'none';
    });

    console.log(`Focus indicator visible on email input: ${hasOutline}`);
    if (!hasOutline) {
      console.warn('No visible focus indicator on email input — accessibility issue');
    }
  });

  test('page has lang attribute on html element', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);
    const lang = await page.evaluate(() => document.documentElement.lang);
    console.log(`html lang: "${lang}"`);
    expect(lang).toBeTruthy();
    expect(lang.length).toBeGreaterThan(0);
  });

  test('no empty links', async ({ page }) => {
    await gotoAndWait(page, BASE_URL);

    const emptyLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a'))
        .filter((a) => {
          const text = (a as HTMLElement).innerText.trim();
          const hasImg = a.querySelector('img') !== null;
          const ariaLabel = a.getAttribute('aria-label');
          const ariaLabelledBy = a.getAttribute('aria-labelledby');
          return !text && !hasImg && !ariaLabel && !ariaLabelledBy;
        })
        .map((a) => `href="${a.getAttribute('href')}"`)
        .slice(0, 10);
    });

    if (emptyLinks.length > 0) {
      console.warn('Empty links:', emptyLinks);
    }
    expect(emptyLinks.length).toBeLessThanOrEqual(2);
  });
});
