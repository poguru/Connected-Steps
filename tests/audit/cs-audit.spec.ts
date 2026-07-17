/**
 * Connected Steps — Full UI Audit
 * Target: https://www.connectedsteps.in
 *
 * Sections:
 *   1  Public pages
 *   2  Auth flows
 *   3  User dashboard
 *   4  Sessions module
 *   5  Events module
 *   6  Leaderboard
 *   7  Feed module
 *   8  Pricing / Membership
 *   9  Admin portal
 *   10 Mobile admin
 *   11 Responsive
 *   12 Performance
 *   13 Broken links
 *   14 Accessibility
 */

import { test, expect, Page, Browser, BrowserContext } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = "https://www.connectedsteps.in";
const REPORT_DIR = path.join(__dirname, "screenshots");
const REPORT_FILE = path.join(__dirname, "report.json");

// Test credentials – supply real ones via env vars if needed
const TEST_EMAIL = process.env.CS_TEST_EMAIL || "";
const TEST_PASS  = process.env.CS_TEST_PASS  || "";

// ── Issue collector ───────────────────────────────────────────────────────────

interface Issue {
  id:          number;
  section:     string;
  severity:    "critical" | "high" | "medium" | "low";
  page:        string;
  title:       string;
  detail:      string;
  screenshot?: string;
  timestamp:   string;
}

const issues: Issue[] = [];
let   issueSeq = 0;

function addIssue(
  section: string,
  severity: Issue["severity"],
  page: string,
  title: string,
  detail: string,
  screenshot?: string,
) {
  issues.push({
    id: ++issueSeq,
    section,
    severity,
    page,
    title,
    detail,
    screenshot,
    timestamp: new Date().toISOString(),
  });
  console.log(`[${severity.toUpperCase()}] #${issueSeq} ${title} — ${page}`);
}

// ── Screenshot helper ─────────────────────────────────────────────────────────

async function snap(page: Page, name: string): Promise<string> {
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
  const file = path.join(REPORT_DIR, `${name.replace(/[^a-z0-9_-]/gi, "_")}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

// ── Console / network monitors ────────────────────────────────────────────────

interface PageMonitor {
  errors:    string[];
  warnings:  string[];
  netFails:  string[];
  apiErrors: string[];
}

function attachMonitor(page: Page): PageMonitor {
  const m: PageMonitor = { errors: [], warnings: [], netFails: [], apiErrors: [] };

  page.on("console", msg => {
    if (msg.type() === "error")   m.errors.push(msg.text());
    if (msg.type() === "warning") m.warnings.push(msg.text());
  });

  page.on("requestfailed", req => {
    const url = req.url();
    // Ignore browser-internal / extension noise
    if (url.startsWith("chrome-extension://") || url.includes("favicon")) return;
    m.netFails.push(`${req.method()} ${url} — ${req.failure()?.errorText}`);
  });

  page.on("response", async res => {
    const url = res.url();
    if (url.includes("/api/") && res.status() >= 400) {
      m.apiErrors.push(`${res.status()} ${url}`);
    }
  });

  return m;
}

// ── Goto helper (graceful) ────────────────────────────────────────────────────

async function goto(page: Page, url: string, section: string): Promise<boolean> {
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const status = res?.status() ?? 0;
    if (status >= 400) {
      const sc = await snap(page, `http_${status}_${url.replace(BASE_URL, "").replace(/\//g, "_")}`);
      addIssue(section, "critical", url, `HTTP ${status}`, `Page returned ${status}`, sc);
      return false;
    }
    return true;
  } catch (err: unknown) {
    const sc = await snap(page, `nav_fail_${url.replace(BASE_URL, "").replace(/\//g, "_")}`).catch(() => "");
    addIssue(section, "critical", url, "Navigation failed", String(err), sc);
    return false;
  }
}

// ── Page health check ─────────────────────────────────────────────────────────

async function healthCheck(
  page: Page,
  m: PageMonitor,
  section: string,
  url: string,
  opts: { checkImages?: boolean; waitMs?: number } = {},
) {
  const { checkImages = true, waitMs = 800 } = opts;
  await page.waitForTimeout(waitMs);

  // Console errors
  if (m.errors.length) {
    const sc = await snap(page, `console_err_${url.replace(BASE_URL, "").replace(/\//g, "_")}`);
    for (const e of m.errors.slice(0, 5)) {
      addIssue(section, "high", url, "Console error", e, sc);
    }
    m.errors.length = 0;
  }

  // API failures
  if (m.apiErrors.length) {
    const sc = await snap(page, `api_fail_${url.replace(BASE_URL, "").replace(/\//g, "_")}`);
    for (const e of m.apiErrors.slice(0, 5)) {
      addIssue(section, "high", url, "API error", e, sc);
    }
    m.apiErrors.length = 0;
  }

  // Net failures (skip analytics/beacon endpoints)
  const realNetFails = m.netFails.filter(f =>
    !f.includes("analytics") && !f.includes("beacon") && !f.includes("hotjar") &&
    !f.includes("clarity") && !f.includes("google-analytics"),
  );
  if (realNetFails.length) {
    const sc = await snap(page, `net_fail_${url.replace(BASE_URL, "").replace(/\//g, "_")}`);
    for (const e of realNetFails.slice(0, 5)) {
      addIssue(section, "medium", url, "Network failure", e, sc);
    }
    m.netFails.length = 0;
  }

  // Broken images — wait for network idle so /_next/image optimizations finish
  if (checkImages) {
    await page.waitForLoadState("networkidle").catch(() => {});
    const brokenImgs = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll("img"));
      return imgs
        .filter(img => img.complete && img.naturalWidth === 0)  // complete=true but no pixels = genuine 404
        .map(img => img.src || img.getAttribute("src") || "(no src)")
        .filter(src => src && !src.startsWith("data:") && !src.includes("/_next/image")); // skip Next.js optimization URLs (timing noise)
    });
    if (brokenImgs.length) {
      const sc = await snap(page, `broken_img_${url.replace(BASE_URL, "").replace(/\//g, "_")}`);
      addIssue(section, "medium", url, "Broken images", brokenImgs.slice(0, 5).join("\n"), sc);
    }
  }

  // Blank page / empty body
  const bodyText = await page.evaluate(() => document.body?.innerText?.trim() ?? "");
  if (bodyText.length < 30) {
    const sc = await snap(page, `blank_${url.replace(BASE_URL, "").replace(/\//g, "_")}`);
    addIssue(section, "critical", url, "Blank/empty page", `Body text: "${bodyText.slice(0, 80)}"`, sc);
  }

  // Hydration errors (Next.js)
  const hydrationErr = await page.evaluate(() => {
    return document.body?.innerHTML?.includes("Hydration failed") ||
           document.body?.innerHTML?.includes("hydration") ||
           false;
  });
  if (hydrationErr) {
    const sc = await snap(page, `hydration_${url.replace(BASE_URL, "").replace(/\//g, "_")}`);
    addIssue(section, "high", url, "Hydration error detected", "React hydration mismatch found in DOM", sc);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 1 — PUBLIC PAGES
// ═════════════════════════════════════════════════════════════════════════════

const PUBLIC_PAGES = [
  { path: "/",               label: "Home"           },
  { path: "/sessions",       label: "Sessions"       },
  { path: "/events",         label: "Events"         },
  { path: "/feed",           label: "Feed"           },
  { path: "/community",      label: "Community"      },
  { path: "/leaderboard",    label: "Leaderboard"    },
  { path: "/pricing",        label: "Pricing"        },
  { path: "/achievements",   label: "Achievements"   },
  { path: "/contact",        label: "Contact"        },
  { path: "/privacy-policy", label: "Privacy Policy" },
  { path: "/terms",          label: "Terms"          },
  { path: "/refund-policy",  label: "Refund Policy"  },
];

test("1 — Public pages load without errors", async ({ browser }) => {
  const ctx  = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = ctx.newPage();
  const m    = attachMonitor(await page);

  for (const { path: p, label } of PUBLIC_PAGES) {
    const url = BASE_URL + p;
    console.log(`\n── Testing ${label} (${url})`);

    const ok = await goto(await page, url, "1-Public");
    if (!ok) continue;

    // Wait for content paint then take screenshot
    await (await page).waitForTimeout(2500);
    await snap(await page, `public_${label.toLowerCase().replace(/\s/g, "_")}`);

    await healthCheck(await page, m, "1-Public", url, { checkImages: true, waitMs: 0 });

    // Check nav links — include bottom-nav patterns used on auth-only pages
    const navLinks = await (await page).locator("nav a, header a, [class*='bottom-nav'] a, [class*='bottomnav'] a, [class*='tab-bar'] a").count();
    if (navLinks === 0) {
      addIssue("1-Public", "medium", url, "No navigation links found", "Nav/header/bottom-nav has no anchor tags");
    }

    // Check for loading spinners stuck after 2.5s of content
    const spinners = await (await page).locator('[class*="spinner"], [class*="loading"], [class*="skeleton"]').count();
    if (spinners > 3) {
      const sc = await snap(await page, `spinner_${label.toLowerCase().replace(/\s/g, "_")}`);
      addIssue("1-Public", "medium", url, "Loading spinners still visible after 2.5s", `${spinners} spinner elements found`, sc);
    }
  }

  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 2 — AUTH FLOW
// ═════════════════════════════════════════════════════════════════════════════

test("2 — Auth pages render correctly", async ({ browser }) => {
  const ctx  = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = ctx.newPage();
  const m    = attachMonitor(await page);
  const SECTION = "2-Auth";

  // Login page
  const loginUrl = BASE_URL + "/auth";
  await goto(await page, loginUrl, SECTION);
  await (await page).waitForTimeout(2000);
  await snap(await page, "auth_login_page");
  await healthCheck(await page, m, SECTION, loginUrl);

  // Register tab
  try {
    const regTab = (await page).getByRole("tab", { name: /register/i })
      .or((await page).getByText(/register/i).first());
    if (await regTab.isVisible({ timeout: 3000 })) {
      await regTab.click();
      await (await page).waitForTimeout(1000);
      await snap(await page, "auth_register_tab");
    }
  } catch { /* tab may not exist */ }

  // Check form fields
  const emailInput = (await page).locator('input[type="email"], input[name="email"]');
  if (await emailInput.count() === 0) {
    addIssue(SECTION, "high", loginUrl, "No email input on auth page", "Email field not found");
  }

  // Forgot password
  try {
    const fpLink = (await page).getByText(/forgot/i).first();
    if (await fpLink.isVisible({ timeout: 3000 })) {
      await fpLink.click();
      await (await page).waitForTimeout(1500);
      await snap(await page, "auth_forgot_password");
      await healthCheck(await page, m, SECTION, loginUrl + "#forgot");
      await (await page).goBack();
    }
  } catch { /* optional UI element */ }

  // Protected route redirect check
  for (const protectedPath of ["/dashboard", "/admin"]) {
    const protUrl = BASE_URL + protectedPath;
    await goto(await page, protUrl, SECTION);
    await (await page).waitForTimeout(2000);
    const currentUrl = (await page).url();
    // Should redirect away from the protected path
    if (currentUrl.includes(protectedPath) && !currentUrl.includes("/auth")) {
      // Check if actual content is behind it or a login wall
      const bodyText = await (await page).evaluate(() => document.body?.innerText?.trim() ?? "");
      if (bodyText.length < 100) {
        const sc = await snap(await page, `auth_protected_${protectedPath.replace("/", "")}`);
        addIssue(SECTION, "high", protUrl, `Protected route accessible without login`, `${protectedPath} rendered with minimal content`, sc);
      }
    }
    await snap(await page, `auth_protected_${protectedPath.replace("/", "")}`);
  }

  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 3-4-5-6 — Sessions, Events, Leaderboard
// ═════════════════════════════════════════════════════════════════════════════

test("3-6 — Core modules: sessions, events, leaderboard", async ({ browser }) => {
  const ctx  = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = ctx.newPage();
  const m    = attachMonitor(await page);

  // Sessions
  await goto(await page, BASE_URL + "/sessions", "3-Sessions");
  await (await page).waitForTimeout(3000);
  await snap(await page, "sessions_desktop");
  await healthCheck(await page, m, "3-Sessions", BASE_URL + "/sessions");

  // Check session cards exist
  const sessionCards = await (await page).locator('[class*="card"], [class*="session"], article').count();
  if (sessionCards === 0) {
    addIssue("3-Sessions", "high", BASE_URL + "/sessions", "No session cards visible", "No card/article elements found");
  }

  // Events
  await goto(await page, BASE_URL + "/events", "5-Events");
  await (await page).waitForTimeout(3000);
  await snap(await page, "events_desktop");
  await healthCheck(await page, m, "5-Events", BASE_URL + "/events");

  // Leaderboard
  await goto(await page, BASE_URL + "/leaderboard", "6-Leaderboard");
  await (await page).waitForTimeout(3000);
  await snap(await page, "leaderboard_desktop");
  await healthCheck(await page, m, "6-Leaderboard", BASE_URL + "/leaderboard");

  // Check leaderboard entries
  const lbRows = await (await page).locator('[class*="leaderboard"], [class*="rank"], table tbody tr, [class*="list"] li').count();
  if (lbRows === 0) {
    addIssue("6-Leaderboard", "medium", BASE_URL + "/leaderboard", "No leaderboard entries visible", "No rank/row elements found");
  }

  // Achievements
  await goto(await page, BASE_URL + "/achievements", "3-Sessions");
  await (await page).waitForTimeout(3000);
  await snap(await page, "achievements_desktop");
  await healthCheck(await page, m, "3-Sessions", BASE_URL + "/achievements");

  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 7 — FEED MODULE
// ═════════════════════════════════════════════════════════════════════════════

test("7 — Feed module", async ({ browser }) => {
  const ctx  = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = ctx.newPage();
  const m    = attachMonitor(await page);
  const url  = BASE_URL + "/feed";

  await goto(await page, url, "7-Feed");
  await (await page).waitForTimeout(4000);
  await snap(await page, "feed_desktop_initial");
  await healthCheck(await page, m, "7-Feed", url);

  // Check feed items
  const feedItems = await (await page).locator('[class*="feed"], [class*="post"], [class*="card"], article').count();
  if (feedItems === 0) {
    addIssue("7-Feed", "high", url, "Feed appears empty", "No feed item elements found after 4s");
  }

  // Scroll to trigger infinite load
  await (await page).evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await (await page).waitForTimeout(2500);
  await snap(await page, "feed_after_scroll");

  // Community page
  await goto(await page, BASE_URL + "/community", "7-Feed");
  await (await page).waitForTimeout(3000);
  await snap(await page, "community_desktop");
  await healthCheck(await page, m, "7-Feed", BASE_URL + "/community");

  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 8 — PRICING / MEMBERSHIP
// ═════════════════════════════════════════════════════════════════════════════

test("8 — Pricing and membership page", async ({ browser }) => {
  const ctx  = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = ctx.newPage();
  const m    = attachMonitor(await page);
  const url  = BASE_URL + "/pricing";

  await goto(await page, url, "8-Pricing");
  await (await page).waitForTimeout(3000);
  await snap(await page, "pricing_desktop");
  await healthCheck(await page, m, "8-Pricing", url);

  // Check plan cards
  const planCards = await (await page).locator('[class*="plan"], [class*="price"], [class*="card"]').count();
  if (planCards === 0) {
    addIssue("8-Pricing", "high", url, "No pricing plan cards visible", "Pricing cards not rendered");
  }

  // Check CTA buttons
  const ctaButtons = await (await page).locator('button:has-text("Subscribe"), button:has-text("Join"), button:has-text("Get"), a:has-text("Subscribe")').count();
  if (ctaButtons === 0) {
    addIssue("8-Pricing", "high", url, "No subscription CTA buttons", "No Subscribe/Join/Get buttons found");
  }

  // Mobile viewport check for pricing
  await (await page).setViewportSize({ width: 375, height: 812 });
  await goto(await page, url, "8-Pricing");
  await (await page).waitForTimeout(2000);
  await snap(await page, "pricing_mobile_375");

  // Check no horizontal overflow
  const hasOverflow = await (await page).evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  if (hasOverflow) {
    addIssue("8-Pricing", "medium", url + " (375px)", "Horizontal overflow on mobile", "Page scrolls horizontally on 375px");
  }

  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 9 — ADMIN PORTAL
// ═════════════════════════════════════════════════════════════════════════════

const ADMIN_ROUTES = [
  "/admin",
  "/admin/users",
  "/admin/sessions",
  "/admin/events",
  "/admin/payments",
  "/admin/broadcasts",
  "/admin/memberships",
  "/admin/leaderboard",
  "/admin/analytics",
  "/admin/bug-reports",
];

test("9 — Admin portal routes", async ({ browser }) => {
  const ctx  = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = ctx.newPage();
  const m    = attachMonitor(await page);

  for (const route of ADMIN_ROUTES) {
    const url = BASE_URL + route;
    console.log(`\n── Admin ${route}`);

    await goto(await page, url, "9-Admin");
    await (await page).waitForTimeout(2000);
    const slug = route.replace(/\//g, "_").replace(/^_/, "");
    await snap(await page, `admin_${slug}`);

    // Check: either shows login prompt OR actual admin content
    const bodyText = await (await page).evaluate(() => document.body?.innerText?.trim() ?? "");
    if (bodyText.length < 50) {
      addIssue("9-Admin", "critical", url, "Admin page blank", `No content rendered for ${route}`, await snap(await page, `admin_blank_${slug}`));
    }

    // Look for auth redirect — if we land on an auth page that's fine
    const isAuthPage = (await page).url().includes("/auth") || (await page).url().includes("/login");
    if (!isAuthPage) {
      // We're on the admin page without auth — check for real content vs error
      const has404 = bodyText.toLowerCase().includes("not found") || bodyText.includes("404");
      if (has404) {
        addIssue("9-Admin", "high", url, `Admin route 404: ${route}`, "Route returned 404 / not found page");
      }
    }

    await healthCheck(await page, m, "9-Admin", url, { checkImages: false, waitMs: 500 });
  }

  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 10 — MOBILE ADMIN
// ═════════════════════════════════════════════════════════════════════════════

const MOBILE_WIDTHS = [320, 360, 375, 390, 414, 430];
const ADMIN_MOBILE_PAGES = ["/admin", "/admin/users", "/admin/sessions"];

test("10 — Mobile admin responsiveness", async ({ browser }) => {
  for (const width of MOBILE_WIDTHS) {
    const ctx  = await browser.newContext({ viewport: { width, height: 812 } });
    const page = ctx.newPage();
    attachMonitor(await page);

    for (const route of ADMIN_MOBILE_PAGES) {
      const url = BASE_URL + route;
      await goto(await page, url, "10-MobileAdmin");
      await (await page).waitForTimeout(2000);
      await snap(await page, `mobile_admin_${width}_${route.replace(/\//g, "_")}`);

      // Horizontal overflow
      const overflow = await (await page).evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 5,
      );
      if (overflow) {
        const sc = await snap(await page, `overflow_${width}_${route.replace(/\//g, "_")}`);
        addIssue("10-MobileAdmin", "high", url, `Horizontal overflow at ${width}px`, `Admin page overflows on ${width}px`, sc);
      }
    }
    await ctx.close();
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 11 — RESPONSIVE TESTING (Public)
// ═════════════════════════════════════════════════════════════════════════════

const RESPONSIVE_VIEWPORTS = [
  { width: 320,  height: 568,  label: "iPhone_SE_320"         },
  { width: 375,  height: 812,  label: "iPhone_14_375"         },
  { width: 390,  height: 844,  label: "iPhone_15_390"         },
  { width: 430,  height: 932,  label: "iPhone_15ProMax_430"   },
  { width: 360,  height: 800,  label: "Samsung_S24_360"       },
  { width: 412,  height: 915,  label: "Pixel_8_412"           },
  { width: 1366, height: 768,  label: "Laptop_1366"           },
  { width: 1440, height: 900,  label: "Desktop_1440"          },
  { width: 1920, height: 1080, label: "FHD_1920"              },
];

const RESPONSIVE_PAGES = ["/", "/sessions", "/pricing", "/leaderboard", "/feed"];

test("11 — Responsive layouts", async ({ browser }) => {
  for (const vp of RESPONSIVE_VIEWPORTS) {
    const ctx  = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = ctx.newPage();
    attachMonitor(await page);

    for (const p of RESPONSIVE_PAGES) {
      const url = BASE_URL + p;
      await goto(await page, url, "11-Responsive");
      await (await page).waitForTimeout(1500);
      await snap(await page, `responsive_${vp.label}${p.replace(/\//g, "_") || "_home"}`);

      // Overflow check
      const overflow = await (await page).evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 5,
      );
      if (overflow) {
        const sc = await snap(await page, `overflow_${vp.label}${p.replace(/\//g, "_")}`);
        addIssue("11-Responsive", "high", url, `Horizontal overflow at ${vp.width}px`, `${p} overflows on ${vp.label}`, sc);
      }

      // Text overlap — check for zero-height elements with text
      const textOverlap = await (await page).evaluate(() => {
        const elements = document.querySelectorAll("p, h1, h2, h3, span, button, a");
        for (const el of elements) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height === 0 && el.textContent!.trim().length > 3) return true;
        }
        return false;
      });
      if (textOverlap) {
        addIssue("11-Responsive", "medium", url, `Zero-height text elements at ${vp.width}px`, "Some text elements may be hidden/overlapping");
      }
    }
    await ctx.close();
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 12 — PERFORMANCE (load times)
// ═════════════════════════════════════════════════════════════════════════════

test("12 — Page load performance", async ({ browser }) => {
  const ctx  = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = ctx.newPage();
  attachMonitor(await page);

  for (const p of ["/", "/sessions", "/events", "/feed", "/leaderboard", "/pricing"]) {
    const url = BASE_URL + p;
    const t0  = Date.now();
    await goto(await page, url, "12-Perf");
    await (await page).waitForLoadState("networkidle").catch(() => {});
    const ms = Date.now() - t0;

    if (ms > 8000) {
      addIssue("12-Perf", "high", url, `Very slow page load: ${ms}ms`, `Page took ${ms}ms to reach networkidle (threshold: 8000ms)`);
    } else if (ms > 4000) {
      addIssue("12-Perf", "medium", url, `Slow page load: ${ms}ms`, `Page took ${ms}ms to reach networkidle (threshold: 4000ms)`);
    }
    console.log(`  ${p} loaded in ${ms}ms`);
  }

  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 13 — BROKEN LINKS
// ═════════════════════════════════════════════════════════════════════════════

test("13 — Broken links crawl", async ({ browser }) => {
  const ctx  = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = ctx.newPage();
  attachMonitor(await page);

  // Collect all internal links from the home page
  await goto(await page, BASE_URL, "13-Links");
  await (await page).waitForTimeout(2000);

  const links = await (await page).evaluate((base) => {
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    return anchors
      .map(a => (a as HTMLAnchorElement).href)
      .filter(href =>
        href.startsWith(base) &&
        !href.includes("#") &&
        !href.includes("mailto:") &&
        !href.includes("tel:") &&
        !href.includes("javascript:"),
      );
  }, BASE_URL);

  const uniqueLinks = [...new Set(links)];
  console.log(`Found ${uniqueLinks.length} internal links to check`);

  const checked = new Set<string>();
  for (const link of uniqueLinks.slice(0, 40)) {
    if (checked.has(link)) continue;
    checked.add(link);
    try {
      const res = await (await page).goto(link, { waitUntil: "domcontentloaded", timeout: 15000 });
      const status = res?.status() ?? 0;
      if (status === 404) {
        addIssue("13-Links", "high", link, "404 broken link", `${link} returned 404`);
      } else if (status >= 500) {
        addIssue("13-Links", "critical", link, `Server error ${status}`, `${link} returned ${status}`);
      }
    } catch {
      addIssue("13-Links", "medium", link, "Link navigation failed", `Could not navigate to ${link}`);
    }
  }

  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 14 — ACCESSIBILITY
// ═════════════════════════════════════════════════════════════════════════════

test("14 — Basic accessibility checks", async ({ browser }) => {
  const ctx  = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = ctx.newPage();
  attachMonitor(await page);
  const SECTION = "14-A11y";

  for (const p of ["/", "/sessions", "/pricing", "/feed", "/leaderboard"]) {
    const url = BASE_URL + p;
    await goto(await page, url, SECTION);
    await (await page).waitForTimeout(2000);

    const a11yIssues = await (await page).evaluate(() => {
      const issues: string[] = [];

      // Buttons without accessible label
      const buttons = document.querySelectorAll("button");
      let unlabeledButtons = 0;
      for (const btn of buttons) {
        const label = btn.textContent?.trim() || btn.getAttribute("aria-label") || btn.getAttribute("title");
        if (!label) unlabeledButtons++;
      }
      if (unlabeledButtons > 0) issues.push(`${unlabeledButtons} button(s) without accessible label`);

      // Images without alt text
      const imgs = document.querySelectorAll("img");
      let noAlt = 0;
      for (const img of imgs) {
        if (!img.hasAttribute("alt") && !img.getAttribute("role")) noAlt++;
      }
      if (noAlt > 0) issues.push(`${noAlt} image(s) missing alt attribute`);

      // Form inputs without labels
      const inputs = document.querySelectorAll("input:not([type='hidden']), select, textarea");
      let unlabeled = 0;
      for (const input of inputs) {
        const id = input.getAttribute("id");
        const label = id ? document.querySelector(`label[for="${id}"]`) : null;
        const ariaLabel = input.getAttribute("aria-label");
        const ariaLabelledby = input.getAttribute("aria-labelledby");
        const placeholder = input.getAttribute("placeholder");
        if (!label && !ariaLabel && !ariaLabelledby && !placeholder) unlabeled++;
      }
      if (unlabeled > 0) issues.push(`${unlabeled} form input(s) missing labels`);

      // Empty links
      const anchors = document.querySelectorAll("a");
      let emptyLinks = 0;
      for (const a of anchors) {
        const text = a.textContent?.trim() || a.getAttribute("aria-label");
        if (!text) emptyLinks++;
      }
      if (emptyLinks > 0) issues.push(`${emptyLinks} empty link(s)`);

      return issues;
    });

    for (const issue of a11yIssues) {
      addIssue(SECTION, "low", url, "Accessibility issue", issue);
    }
  }

  await ctx.close();
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 15 — GENERATE FINAL HTML REPORT
// ═════════════════════════════════════════════════════════════════════════════

test("15 — Generate HTML report", async () => {
  // Save JSON
  fs.writeFileSync(REPORT_FILE, JSON.stringify(issues, null, 2));

  // Counts
  const critical = issues.filter(i => i.severity === "critical").length;
  const high     = issues.filter(i => i.severity === "high").length;
  const medium   = issues.filter(i => i.severity === "medium").length;
  const low      = issues.filter(i => i.severity === "low").length;
  const total    = issues.length;

  // Score: start at 100, deduct per issue
  const score = Math.max(0, 100 - (critical * 15) - (high * 7) - (medium * 3) - (low * 1));
  const goNoGo = critical > 0 ? "🔴 NO GO" : high > 3 ? "🟡 CONDITIONAL GO" : "🟢 GO";

  // Group by section
  const sections = [...new Set(issues.map(i => i.section))];

  const severityColor: Record<string, string> = {
    critical: "#dc2626",
    high:     "#ea580c",
    medium:   "#d97706",
    low:      "#65a30d",
  };

  const severityBg: Record<string, string> = {
    critical: "#fef2f2",
    high:     "#fff7ed",
    medium:   "#fffbeb",
    low:      "#f7fee7",
  };

  const rows = issues.map(i => `
    <tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:8px 12px;color:#6b7280;font-size:12px">${i.id}</td>
      <td style="padding:8px 12px">
        <span style="background:${severityBg[i.severity]};color:${severityColor[i.severity]};padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:700;text-transform:uppercase">
          ${i.severity}
        </span>
      </td>
      <td style="padding:8px 12px;font-size:12px;color:#6b7280">${i.section}</td>
      <td style="padding:8px 12px;max-width:240px;font-size:13px;font-weight:600">${escapeHtml(i.title)}</td>
      <td style="padding:8px 12px;max-width:280px;font-size:12px;color:#374151;word-break:break-word">${escapeHtml(i.page)}</td>
      <td style="padding:8px 12px;max-width:300px;font-size:12px;color:#6b7280;white-space:pre-wrap">${escapeHtml(i.detail)}</td>
      <td style="padding:8px 12px;font-size:11px">
        ${i.screenshot ? `<a href="${i.screenshot}" target="_blank" style="color:#3b82f6">📷 View</a>` : "—"}
      </td>
    </tr>
  `).join("");

  function escapeHtml(s: string) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  const sectionSummary = sections.map(sec => {
    const secIssues = issues.filter(i => i.section === sec);
    const c = secIssues.filter(i => i.severity === "critical").length;
    const h = secIssues.filter(i => i.severity === "high").length;
    const m2 = secIssues.filter(i => i.severity === "medium").length;
    const l = secIssues.filter(i => i.severity === "low").length;
    return `
      <tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:8px 12px;font-weight:600;font-size:13px">${sec}</td>
        <td style="padding:8px 12px;color:#dc2626;font-weight:700">${c || "—"}</td>
        <td style="padding:8px 12px;color:#ea580c;font-weight:700">${h || "—"}</td>
        <td style="padding:8px 12px;color:#d97706;font-weight:700">${m2 || "—"}</td>
        <td style="padding:8px 12px;color:#65a30d;font-weight:700">${l || "—"}</td>
        <td style="padding:8px 12px;font-weight:600">${secIssues.length}</td>
      </tr>
    `;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Connected Steps — UI Audit Report</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; background: #f9fafb; color: #111827; }
    .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #fff; padding: 40px 48px; }
    .header h1 { margin: 0 0 4px; font-size: 28px; }
    .header p  { margin: 0; color: rgba(255,255,255,0.6); font-size: 14px; }
    .score-badge { display: inline-block; padding: 6px 20px; border-radius: 9999px; font-size: 22px; font-weight: 800; margin-top: 16px; background: rgba(255,255,255,0.12); }
    .container { max-width: 1400px; margin: 0 auto; padding: 32px 24px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 32px; }
    .card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); text-align: center; }
    .card .num { font-size: 36px; font-weight: 800; line-height: 1; }
    .card .lbl { font-size: 12px; color: #6b7280; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.06em; }
    .section-title { font-size: 18px; font-weight: 700; margin: 32px 0 12px; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    th { background: #f3f4f6; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; font-weight: 600; }
    tr:hover { background: #f9fafb; }
    .verdict { font-size: 20px; font-weight: 800; margin-top: 6px; }
  </style>
</head>
<body>
<div class="header">
  <h1>Connected Steps — UI Audit Report</h1>
  <p>Target: https://www.connectedsteps.in &nbsp;·&nbsp; Generated: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>
  <div class="score-badge">Production Readiness Score: ${score}/100</div>
  <div class="verdict">${goNoGo}</div>
</div>

<div class="container">

  <div class="cards">
    <div class="card"><div class="num" style="color:#dc2626">${critical}</div><div class="lbl">Critical</div></div>
    <div class="card"><div class="num" style="color:#ea580c">${high}</div><div class="lbl">High</div></div>
    <div class="card"><div class="num" style="color:#d97706">${medium}</div><div class="lbl">Medium</div></div>
    <div class="card"><div class="num" style="color:#65a30d">${low}</div><div class="lbl">Low</div></div>
    <div class="card"><div class="num">${total}</div><div class="lbl">Total Issues</div></div>
  </div>

  <div class="section-title">Issues by Section</div>
  <table style="margin-bottom:32px">
    <thead><tr>
      <th>Section</th><th>Critical</th><th>High</th><th>Medium</th><th>Low</th><th>Total</th>
    </tr></thead>
    <tbody>${sectionSummary || "<tr><td colspan='6' style='padding:16px;text-align:center;color:#6b7280'>No issues found</td></tr>"}</tbody>
  </table>

  <div class="section-title">All Issues (${total})</div>
  <table>
    <thead><tr>
      <th>#</th><th>Severity</th><th>Section</th><th>Title</th><th>Page / URL</th><th>Detail</th><th>Screenshot</th>
    </tr></thead>
    <tbody>${rows || "<tr><td colspan='7' style='padding:24px;text-align:center;color:#6b7280'>✅ No issues found</td></tr>"}</tbody>
  </table>

</div>
</body>
</html>`;

  const htmlFile = path.join(__dirname, "audit-report.html");
  fs.writeFileSync(htmlFile, html);
  console.log(`\n${"─".repeat(60)}`);
  console.log(`AUDIT COMPLETE`);
  console.log(`${"─".repeat(60)}`);
  console.log(`Critical : ${critical}`);
  console.log(`High     : ${high}`);
  console.log(`Medium   : ${medium}`);
  console.log(`Low      : ${low}`);
  console.log(`Total    : ${total}`);
  console.log(`Score    : ${score}/100`);
  console.log(`Verdict  : ${goNoGo}`);
  console.log(`Report   : ${htmlFile}`);
  console.log(`${"─".repeat(60)}\n`);

  // Report must always pass — it's the final step
  expect(total).toBeGreaterThanOrEqual(0);
});
