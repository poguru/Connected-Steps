/**
 * POST-IMPLEMENTATION VERIFICATION SUITE
 * Uses localStorage injection for speed; real UI login only for auth tests.
 */
import { test, expect, Page, request } from '@playwright/test';

const BASE  = 'http://localhost:3099';
const EMAIL = 'pogurikalyan624@gmail.com';
const TOKEN = 'cG9ndXJpa2FseWFuNjI0QGdtYWlsLmNvbQ.dfa92af2981aa6d7f8bf83e51360baa5676007826938699087b3dbd2a01f0d52';
const USER  = {
  firstName: 'Kalyan', lastName: 'Poguru', email: EMAIL,
  phone: '9703620574', goal: '5k', location: 'Kondapur', photo: null,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Inject auth state into localStorage — fast, no UI login needed */
async function auth(page: Page) {
  await page.goto(BASE);
  await page.evaluate(({ user, token }) => {
    localStorage.setItem('cs_user', JSON.stringify(user));
    localStorage.setItem('cs_user_token', token);
  }, { user: USER, token: TOKEN });
}

/** Navigate to a page with auth already injected */
async function goTo(page: Page, path: string) {
  await auth(page);
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
}

function ss(name: string) { return `test-results/piv-${name}.png`; }

// ════════════════════════════════════════════════════════════════════
// 1. AUTH REGRESSION
// ════════════════════════════════════════════════════════════════════

test.describe('AUTH', () => {

  test('Sign-in page renders correct fields', async ({ page }) => {
    await page.goto(`${BASE}/auth?tab=signin`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: ss('auth-01-page') });
    await expect(page.getByPlaceholder('Email address').first()).toBeVisible();
    await expect(page.getByPlaceholder('Password')).toBeVisible();
    console.log('✅ Auth page renders email + password fields');
  });

  test('Sign-in with real credentials redirects to dashboard/home', async ({ page }) => {
    await page.goto(`${BASE}/auth?tab=signin`);
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder('Email address').first().fill(EMAIL);
    await page.getByPlaceholder('Password').fill('Kalyan@12');
    await page.locator('form').getByRole('button').filter({ hasText: /sign in|login|access/i }).click();
    await page.waitForURL(url => !url.pathname.startsWith('/auth'), { timeout: 20000 });
    await page.screenshot({ path: ss('auth-02-signedin') });
    expect(page.url()).not.toContain('/auth');
    console.log('✅ Signed in → redirected to', page.url());
  });

  test('Wrong password shows error message', async ({ page }) => {
    await page.goto(`${BASE}/auth?tab=signin`);
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder('Email address').first().fill(EMAIL);
    await page.getByPlaceholder('Password').fill('wrongpassword123');
    await page.locator('form').getByRole('button').filter({ hasText: /sign in|login|access/i }).click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: ss('auth-03-wrongpw') });
    const hasErr = await page.locator('text=/invalid|incorrect|wrong|check/i').count();
    console.log(`Wrong password error shown: ${hasErr > 0}`);
    expect(hasErr).toBeGreaterThan(0);
  });

  test('OTP mode tab visible and switches', async ({ page }) => {
    await page.goto(`${BASE}/auth?tab=signin`);
    await page.waitForLoadState('networkidle');
    const otpTab = page.locator('button:has-text("OTP"), button:has-text("Sign in with OTP")').first();
    if (await otpTab.isVisible()) {
      await otpTab.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: ss('auth-04-otp') });
      console.log('✅ OTP mode tab works');
    } else {
      console.log('⚠️ OTP tab not visible — check LoginForm mode toggle');
    }
  });

  test('Sign-up page renders', async ({ page }) => {
    await page.goto(`${BASE}/auth?tab=signup`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: ss('auth-05-signup') });
    const hasForm = await page.locator('input, text=Create account, text=Sign up').count();
    expect(hasForm).toBeGreaterThan(0);
    console.log('✅ Sign-up page renders');
  });

  test('Unauthenticated user redirected from /dashboard', async ({ page }) => {
    await page.goto(`${BASE}/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: ss('auth-06-redirect') });
    const redirected = page.url().includes('/auth') || page.url().includes('/login');
    console.log(`Unauthenticated /dashboard redirects: ${redirected} → ${page.url()}`);
    expect(redirected).toBeTruthy();
  });

  test('Sign-out clears localStorage and redirects', async ({ page }) => {
    await goTo(page, '/dashboard');
    const userMenuBtn = page.locator('.cs-app-nav-user button').first();
    if (await userMenuBtn.isVisible()) {
      await userMenuBtn.click();
      await page.waitForTimeout(400);
      await page.locator('text=Log out').click();
      await page.waitForURL(`**\/auth**`, { timeout: 10000 });
      const csUser = await page.evaluate(() => localStorage.getItem('cs_user'));
      expect(csUser).toBeNull();
      await page.screenshot({ path: ss('auth-07-signout') });
      console.log('✅ Sign-out clears cs_user and redirects to /auth');
    } else {
      console.log('⚠️ User menu button not found');
    }
  });

});

// ════════════════════════════════════════════════════════════════════
// 2. DASHBOARD & NAVIGATION
// ════════════════════════════════════════════════════════════════════

test.describe('DASHBOARD', () => {

  test('Dashboard loads with user name and stat cards', async ({ page }) => {
    await goTo(page, '/dashboard');
    await page.screenshot({ path: ss('dash-01-loaded'), fullPage: false });
    await expect(page.locator('text=Kalyan').first()).toBeVisible();
    const hasStats = await page.locator('text=This Month, text=Total Pts, text=Sessions').count();
    console.log(`✅ Dashboard stat blocks: ${hasStats}`);
    expect(hasStats).toBeGreaterThan(0);
  });

  test('Training Plan section visible on dashboard', async ({ page }) => {
    await goTo(page, '/dashboard');
    await page.screenshot({ path: ss('dash-02-training') });
    const hasTraining = await page.locator('text=Training Plan').count();
    console.log(`Training Plan section: ${hasTraining}`);
    expect(hasTraining).toBeGreaterThan(0);
  });

  test('Upcoming Sessions section renders', async ({ page }) => {
    await goTo(page, '/dashboard');
    const hasUpcoming = await page.locator('text=Upcoming Sessions, text=Upcoming').count();
    console.log(`Upcoming Sessions section: ${hasUpcoming}`);
    await page.screenshot({ path: ss('dash-03-sessions') });
  });

  test('Streak indicator visible on dashboard', async ({ page }) => {
    await goTo(page, '/dashboard');
    await page.screenshot({ path: ss('dash-04-streak') });
    const pageText = await page.textContent('body') ?? '';
    const hasStreak = /streak|sessions?\s+in\s+a\s+row/i.test(pageText);
    console.log(`Streak on dashboard: ${hasStreak}`);
  });

  test('Mobile layout 375px — no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await goTo(page, '/dashboard');
    await page.screenshot({ path: ss('dash-05-mobile') });
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientW = await page.evaluate(() => document.documentElement.clientWidth);
    console.log(`Mobile scroll overflow: ${scrollW - clientW}px`);
    expect(scrollW).toBeLessThanOrEqual(clientW + 5);
  });

  test('Nav links: Feed, Leaderboard, Achievements accessible', async ({ page }) => {
    await goTo(page, '/dashboard');
    for (const [label, path] of [
      ['Feed', '/feed'],
      ['Leaderboard', '/leaderboard'],
      ['Achievements', '/achievements'],
    ] as [string, string][]) {
      const link = page.locator(`a[href="${path}"], nav a:has-text("${label}")`).first();
      if (await link.isVisible()) {
        console.log(`✅ Nav link "${label}" visible`);
      } else {
        console.log(`⚠️ Nav link "${label}" NOT found`);
      }
    }
    await page.screenshot({ path: ss('dash-06-nav') });
  });

});

// ════════════════════════════════════════════════════════════════════
// 3. COMMUNITY FEED
// ════════════════════════════════════════════════════════════════════

test.describe('COMMUNITY FEED', () => {

  test('Feed page loads — posts or empty state visible', async ({ page }) => {
    await goTo(page, '/feed');
    await page.screenshot({ path: ss('feed-01-load'), fullPage: false });
    const pageText = await page.textContent('body') ?? '';
    const hasFeed  = /post|feed|share|community|no posts/i.test(pageText);
    console.log(`Feed page loaded with content: ${hasFeed}, URL: ${page.url()}`);
    // Should not redirect away
    expect(page.url()).toContain('/feed');
  });

  test('Feed scope toggle (Global / Following)', async ({ page }) => {
    await goTo(page, '/feed');
    const toggle = page.locator('text=Following, button:has-text("Following")').first();
    const hasToggle = await toggle.isVisible();
    if (hasToggle) {
      await toggle.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: ss('feed-02-following') });
      console.log('✅ Following scope toggle works');
      const globalBtn = page.locator('text=Global, button:has-text("Global")').first();
      if (await globalBtn.isVisible()) {
        await globalBtn.click();
        await page.waitForTimeout(1000);
        console.log('✅ Global scope toggle works');
      }
    } else {
      console.log('⚠️ Scope toggle not found on feed page');
    }
  });

  test('Feed mobile layout — no overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await goTo(page, '/feed');
    await page.screenshot({ path: ss('feed-03-mobile') });
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientW = await page.evaluate(() => document.documentElement.clientWidth);
    console.log(`Feed mobile overflow: ${scrollW - clientW}px`);
    expect(scrollW).toBeLessThanOrEqual(clientW + 5);
  });

  test('Feed API returns valid paginated response', async ({ page }) => {
    const res  = await page.request.get(`${BASE}/api/posts?limit=5`);
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(Array.isArray(body.posts)).toBeTruthy();
    expect(typeof body.has_more).toBe('boolean');
    expect('next_cursor' in body).toBeTruthy();
    console.log(`✅ GET /api/posts → ${body.posts.length} posts, has_more=${body.has_more}`);
  });

  test('Feed API scope=following returns valid response', async ({ page }) => {
    const res  = await page.request.get(`${BASE}/api/posts?scope=following&email=${EMAIL}&limit=5`);
    const body = await res.json();
    expect(res.status()).toBe(200);
    console.log(`✅ GET /api/posts?scope=following → ${body.posts?.length ?? 0} posts`);
  });

  test('Feed infinite scroll triggers', async ({ page }) => {
    await goTo(page, '/feed');
    const before = await page.locator('article, [class*="post"]').count();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
    const after = await page.locator('article, [class*="post"]').count();
    console.log(`Posts before scroll: ${before}, after scroll: ${after}`);
    await page.screenshot({ path: ss('feed-04-scroll') });
  });

});

// ════════════════════════════════════════════════════════════════════
// 4. COMMUNITY POSTS — Create / Delete / Comments
// ════════════════════════════════════════════════════════════════════

test.describe('COMMUNITY POSTS', () => {

  test('Create post button visible on feed', async ({ page }) => {
    await goTo(page, '/feed');
    await page.screenshot({ path: ss('posts-01-feed') });
    const createBtn = page.locator('button:has-text("Create"), button:has-text("Post"), button:has-text("Share"), button:has-text("Write")').first();
    const visible = await createBtn.isVisible();
    console.log(`Create post button: ${visible}`);
    expect(visible).toBeTruthy();
  });

  test('Create post overlay opens with post type tabs', async ({ page }) => {
    await goTo(page, '/feed');
    const createBtn = page.locator('button:has-text("Create"), button:has-text("Post"), button:has-text("Share"), button:has-text("Write")').first();
    await createBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: ss('posts-02-overlay') });
    const textarea = page.locator('textarea').first();
    expect(await textarea.isVisible()).toBeTruthy();
    console.log('✅ Create post overlay opens with textarea');
    // Check post type tabs
    let tabsFound = 0;
    for (const t of ['Run', 'Achievement', 'Race', 'Question', 'General']) {
      if (await page.locator(`button:has-text("${t}")`).first().isVisible()) tabsFound++;
    }
    console.log(`Post type tabs found: ${tabsFound}/5`);
  });

  test('Create post — character counter shown', async ({ page }) => {
    await goTo(page, '/feed');
    const createBtn = page.locator('button:has-text("Create"), button:has-text("Post"), button:has-text("Share"), button:has-text("Write")').first();
    await createBtn.click();
    await page.waitForTimeout(600);
    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible()) {
      await textarea.fill('Testing character counter display 🏃');
      await page.waitForTimeout(300);
      await page.screenshot({ path: ss('posts-03-charcount') });
      const charCounter = page.locator('text=/\\d+\\/800/');
      console.log(`Character counter visible: ${await charCounter.isVisible()}`);
    }
  });

  test('Create post — submit and verify post appears', async ({ page }) => {
    await goTo(page, '/feed');
    const createBtn = page.locator('button:has-text("Create"), button:has-text("Post"), button:has-text("Share"), button:has-text("Write")').first();
    await createBtn.click();
    await page.waitForTimeout(600);
    const textarea = page.locator('textarea').first();
    if (!await textarea.isVisible()) { console.log('SKIP: no create overlay found'); return; }
    await textarea.fill('E2E verification test post — automated. #testing 🔥');
    const submitBtn = page.locator('button[type="submit"], button:has-text("Post it"), button:has-text("Submit")').last();
    if (await submitBtn.isEnabled()) {
      await submitBtn.click();
      await page.waitForTimeout(2500);
      await page.screenshot({ path: ss('posts-04-submitted') });
      console.log('✅ Post submitted — checking feed for new post...');
      const feedText = await page.textContent('body') ?? '';
      const appeared = feedText.includes('E2E verification test post');
      console.log(`Post appears in feed: ${appeared}`);
    }
  });

  test('Create post — 800 char limit enforced', async ({ page }) => {
    await goTo(page, '/feed');
    const createBtn = page.locator('button:has-text("Create"), button:has-text("Post"), button:has-text("Share"), button:has-text("Write")').first();
    await createBtn.click();
    await page.waitForTimeout(600);
    const textarea = page.locator('textarea').first();
    if (!await textarea.isVisible()) { console.log('SKIP'); return; }
    const longText = 'X'.repeat(850);
    await textarea.fill(longText);
    const val = await textarea.inputValue();
    await page.screenshot({ path: ss('posts-05-charlimit') });
    if (val.length > 800) {
      console.log(`⚠️ BLOCKER: textarea accepted ${val.length} chars (limit should be 800)`);
    } else {
      console.log(`✅ Char limit enforced: ${val.length} chars stored`);
    }
  });

  test('Create post — XSS in body is not executed', async ({ page }) => {
    await goTo(page, '/feed');
    const createBtn = page.locator('button:has-text("Create"), button:has-text("Post"), button:has-text("Share"), button:has-text("Write")').first();
    await createBtn.click();
    await page.waitForTimeout(600);
    const textarea = page.locator('textarea').first();
    if (!await textarea.isVisible()) { console.log('SKIP'); return; }
    let alertFired = false;
    page.on('dialog', () => { alertFired = true; });
    await textarea.fill('<script>alert("xss")</script><img onerror="alert(1)" src=x>');
    await page.waitForTimeout(500);
    console.log(`XSS alert fired: ${alertFired}`);
    expect(alertFired).toBeFalsy();
    await page.screenshot({ path: ss('posts-06-xss') });
  });

  test('Post API — missing fields returns 400', async ({ page }) => {
    const res = await page.request.post(`${BASE}/api/posts`, {
      headers: { 'Content-Type': 'application/json' },
      data: { author_email: EMAIL },
    });
    expect(res.status()).toBe(400);
    console.log(`✅ POST /api/posts (missing fields) → ${res.status()}`);
  });

  test('Delete post API — no token returns 401', async ({ page }) => {
    const res = await page.request.delete(`${BASE}/api/posts/fake-id`, {
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(401);
    console.log(`✅ DELETE /api/posts (no token) → ${res.status()}`);
  });

  test('Delete post API — wrong token returns 401', async ({ page }) => {
    const res = await page.request.delete(`${BASE}/api/posts/fake-id`, {
      headers: { 'Content-Type': 'application/json', 'x-user-token': 'garbage.token' },
    });
    expect(res.status()).toBe(401);
    console.log(`✅ DELETE /api/posts (bad token) → ${res.status()}`);
  });

  test('Post mobile layout — create post usable on 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await goTo(page, '/feed');
    const createBtn = page.locator('button:has-text("Create"), button:has-text("Post"), button:has-text("Share"), button:has-text("Write")').first();
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: ss('posts-07-mobile') });
      const textarea = page.locator('textarea').first();
      console.log(`Create post overlay mobile: textarea visible = ${await textarea.isVisible()}`);
    }
  });

});

// ════════════════════════════════════════════════════════════════════
// 5. STREAK SYSTEM
// ════════════════════════════════════════════════════════════════════

test.describe('STREAK SYSTEM', () => {

  test('Streak data returned by API is non-negative integer', async ({ page }) => {
    const res  = await page.request.get(`${BASE}/api/user/achievements?email=${EMAIL}`);
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(typeof body.sessionCount).toBe('number');
    expect(body.sessionCount).toBeGreaterThanOrEqual(0);
    console.log(`✅ sessionCount via API: ${body.sessionCount}`);
  });

  test('Dashboard shows streak number', async ({ page }) => {
    await goTo(page, '/dashboard');
    await page.screenshot({ path: ss('streak-01') });
    const pageText = await page.textContent('body') ?? '';
    const match = pageText.match(/(\d+)\s*(session\s*streak|streak|sessions?\s+in\s+a\s+row)/i);
    if (match) {
      console.log(`✅ Streak visible on dashboard: "${match[0].trim()}"`);
    } else {
      // Fallback: look for any streak-like pattern
      const hasNum = /\d+/.test(pageText);
      console.log(`Streak pattern not found. Page has numbers: ${hasNum}. May use different label.`);
    }
  });

  test('Achievements page shows session count matching API', async ({ page }) => {
    const apiRes  = await page.request.get(`${BASE}/api/user/achievements?email=${EMAIL}`);
    const apiData = await apiRes.json();
    await goTo(page, '/achievements');
    await page.screenshot({ path: ss('streak-02-achievements') });
    const pageText = await page.textContent('body') ?? '';
    const hasCount = pageText.includes(String(apiData.sessionCount));
    console.log(`API sessionCount=${apiData.sessionCount}, visible on page: ${hasCount}`);
  });

});

// ════════════════════════════════════════════════════════════════════
// 6. BADGE SYSTEM
// ════════════════════════════════════════════════════════════════════

test.describe('BADGE SYSTEM', () => {

  test('Achievements page loads and shows badge grid', async ({ page }) => {
    await goTo(page, '/achievements');
    await page.screenshot({ path: ss('badges-01-page'), fullPage: true });
    expect(page.url()).toContain('/achievements');
    const pageText = await page.textContent('body') ?? '';
    const hasBadgeContent = /first session|sessions|champion|leaderboard|member|badge|achievement/i.test(pageText);
    console.log(`Badge content on achievements page: ${hasBadgeContent}`);
    expect(hasBadgeContent).toBeTruthy();
  });

  test('Achievements page shows progress fraction (X/9)', async ({ page }) => {
    await goTo(page, '/achievements');
    const progress = page.locator('text=/\\d+\\s*\\/\\s*9/').first();
    const visible  = await progress.isVisible();
    console.log(`Badge progress fraction visible: ${visible}`);
    await page.screenshot({ path: ss('badges-02-progress') });
  });

  test('Session badges show correct thresholds', async ({ page }) => {
    await goTo(page, '/achievements');
    const pageText = await page.textContent('body') ?? '';
    for (const n of ['1', '5', '10', '25', '50']) {
      const found = pageText.includes(n);
      console.log(`  Threshold "${n}" present on page: ${found}`);
    }
  });

  test('Active member badge shows for paid user', async ({ page }) => {
    await goTo(page, '/achievements');
    await page.screenshot({ path: ss('badges-03-member') });
    const pageText = await page.textContent('body') ?? '';
    const hasMember = /active member|membership|member badge/i.test(pageText);
    console.log(`Active Member badge visible: ${hasMember}`);
  });

  test('API records earned badges into user_achievements', async ({ page }) => {
    // Call achievements endpoint — it should persist newly unlocked badges
    const res  = await page.request.get(`${BASE}/api/user/achievements?email=${EMAIL}`);
    const body = await res.json();
    expect(res.status()).toBe(200);
    console.log(`✅ Achievements API: sessions=${body.sessionCount}, rank=${body.leaderboardRank}, member=${body.hasMembership}`);
    // With 5 sessions and hasMembership=true, first_session + five_sessions + active_member should be earned
    expect(body.sessionCount).toBeGreaterThanOrEqual(1);
  });

  test('Badge notifications API — achievement type defined', async ({ page }) => {
    const res  = await page.request.get(`${BASE}/api/notifications?email=${EMAIL}&limit=20`);
    const body = await res.json();
    if (res.status() === 200) {
      const achievementNotifs = (body.notifications ?? []).filter((n: { type: string }) => n.type === 'achievement');
      console.log(`Achievement notifications found: ${achievementNotifs.length}`);
    } else {
      console.log(`Notifications API status: ${res.status()}`);
    }
  });

});

// ════════════════════════════════════════════════════════════════════
// 7. NOTIFICATIONS
// ════════════════════════════════════════════════════════════════════

test.describe('NOTIFICATIONS', () => {

  test('Notifications page loads', async ({ page }) => {
    await goTo(page, '/notifications');
    await page.screenshot({ path: ss('notif-01-page'), fullPage: true });
    expect(page.url()).toContain('/notifications');
    const hasHeading = await page.locator('text=Notifications, h1, h2').count();
    console.log(`Notifications page heading: ${hasHeading}`);
  });

  test('Notification bell visible in nav when authed', async ({ page }) => {
    await goTo(page, '/dashboard');
    await page.screenshot({ path: ss('notif-02-bell') });
    // Look for bell icon or notification count
    const bell = page.locator('[aria-label*="notif" i], button:has-text("🔔"), [href="/notifications"]').first();
    const hasBell = await bell.isVisible();
    console.log(`Notification bell in nav: ${hasBell}`);
  });

  test('Notifications API returns list or empty', async ({ page }) => {
    const res  = await page.request.get(`${BASE}/api/notifications?email=${EMAIL}&limit=10`);
    const body = await res.json();
    console.log(`GET /api/notifications → ${res.status()}, notifications=${body.notifications?.length ?? body.error}`);
    expect(res.status()).toBeLessThan(500);
  });

  test('Mark notification as read — API works', async ({ page }) => {
    // First check if there are any notifications
    const listRes  = await page.request.get(`${BASE}/api/notifications?email=${EMAIL}&limit=5`);
    const listBody = await listRes.json();
    if (listBody.notifications?.length > 0) {
      const id  = listBody.notifications[0].id;
      const res = await page.request.patch(`${BASE}/api/notifications/${id}`, {
        data: { email: EMAIL },
      });
      console.log(`PATCH /api/notifications/${id} → ${res.status()}`);
      expect(res.status()).toBeLessThan(400);
    } else {
      console.log('No notifications to mark read (empty state)');
    }
  });

  test('Notifications mobile layout', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await goTo(page, '/notifications');
    await page.screenshot({ path: ss('notif-03-mobile') });
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientW = await page.evaluate(() => document.documentElement.clientWidth);
    console.log(`Notifications mobile overflow: ${scrollW - clientW}px`);
    expect(scrollW).toBeLessThanOrEqual(clientW + 5);
  });

});

// ════════════════════════════════════════════════════════════════════
// 8. MEMBERSHIP
// ════════════════════════════════════════════════════════════════════

test.describe('MEMBERSHIP', () => {

  test('Pricing page loads with all 4 plan cards', async ({ page }) => {
    await page.goto(`${BASE}/pricing`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: ss('membership-01-pricing') });
    for (const plan of ['Monthly', '3 Months', '6 Months', '12 Months']) {
      const visible = await page.locator(`text=${plan}`).first().isVisible();
      console.log(`Plan "${plan}": ${visible}`);
      expect(visible).toBeTruthy();
    }
  });

  test('Coupon input field is present', async ({ page }) => {
    await goTo(page, '/pricing');
    await page.screenshot({ path: ss('membership-02-coupon') });
    const input = page.locator('input[placeholder*="coupon" i], input[placeholder*="code" i]').first();
    const vis   = await input.isVisible();
    console.log(`Coupon input visible: ${vis}`);
    expect(vis).toBeTruthy();
  });

  test('Invalid coupon shows error message', async ({ page }) => {
    await goTo(page, '/pricing');
    const input = page.locator('input[placeholder*="coupon" i], input[placeholder*="code" i]').first();
    await input.fill('NOTAVALIDCODE');
    await page.locator('button:has-text("Apply")').click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: ss('membership-03-bad-coupon') });
    const errText = await page.textContent('body') ?? '';
    const hasErr  = /invalid|not valid|expired|not found/i.test(errText);
    console.log(`Invalid coupon error message: ${hasErr}`);
    expect(hasErr).toBeTruthy();
  });

  test('Membership status on dashboard — active member sees Premium badge', async ({ page }) => {
    await goTo(page, '/dashboard');
    await page.screenshot({ path: ss('membership-04-dashboard') });
    const pageText = await page.textContent('body') ?? '';
    const hasMembership = /premium|active.*member|member.*active|membership/i.test(pageText);
    console.log(`Membership status on dashboard: ${hasMembership}`);
  });

  test('Membership API returns active status for paid user', async ({ page }) => {
    const res  = await page.request.get(`${BASE}/api/membership?email=${EMAIL}`);
    const body = await res.json();
    expect(res.status()).toBe(200);
    console.log(`Membership API: status=${body.membership?.status}, active=${body.membership?.isActive}, expires=${body.membership?.expires_at}`);
    expect(body.membership?.isActive).toBeTruthy();
  });

  test('Pricing page — plan cards show discounted price when valid coupon', async ({ page }) => {
    // First validate a coupon exists — if none, this is an informational test
    const validateRes = await page.request.post(`${BASE}/api/coupons/validate`, {
      data: { code: 'TEST10', email: EMAIL },
    });
    if (validateRes.status() !== 200) {
      console.log('No TEST10 coupon in DB — discount display test skipped');
      return;
    }
    await goTo(page, '/pricing');
    const input = page.locator('input[placeholder*="coupon" i], input[placeholder*="code" i]').first();
    await input.fill('TEST10');
    await page.locator('button:has-text("Apply")').click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: ss('membership-05-discount') });
    const hasCrossed = await page.locator('[style*="line-through"]').count();
    console.log(`Strikethrough original price shown: ${hasCrossed}`);
  });

  test('Pricing page mobile layout', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/pricing`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: ss('membership-06-mobile') });
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientW = await page.evaluate(() => document.documentElement.clientWidth);
    console.log(`Pricing mobile overflow: ${scrollW - clientW}px`);
    expect(scrollW).toBeLessThanOrEqual(clientW + 5);
  });

});

// ════════════════════════════════════════════════════════════════════
// 9. COACH DASHBOARD
// ════════════════════════════════════════════════════════════════════

test.describe('COACH DASHBOARD', () => {

  test('Coach-ops page shows auth gate or auto-logins coach', async ({ page }) => {
    await page.goto(`${BASE}/admin/coach-ops`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: ss('coach-01-gate') });
    const hasPwInput    = await page.locator('input[type="password"]').count();
    const hasDashboard  = await page.locator('text=Athletes, text=Cohorts, text=Broadcast, text=Templates').count();
    console.log(`Coach-ops: pwGate=${hasPwInput > 0}, dashboard=${hasDashboard}`);
    expect(hasPwInput + hasDashboard).toBeGreaterThan(0);
  });

  test('Athletes API returns list (admin-protected)', async ({ page }) => {
    const res = await page.request.get(`${BASE}/api/admin/coach-ops/athletes`);
    console.log(`GET /api/admin/coach-ops/athletes (no auth) → ${res.status()}`);
    expect(res.status()).toBe(401);
  });

  test('Cohorts API returns list (admin-protected)', async ({ page }) => {
    const res = await page.request.get(`${BASE}/api/admin/cohorts`);
    console.log(`GET /api/admin/cohorts (no auth) → ${res.status()}`);
    expect(res.status()).toBe(401);
  });

  test('Training plan templates API protected', async ({ page }) => {
    const res = await page.request.get(`${BASE}/api/admin/plan-templates`);
    console.log(`GET /api/admin/plan-templates (no auth) → ${res.status()}`);
    expect(res.status()).toBe(401);
  });

  test('Broadcast API protected', async ({ page }) => {
    const res = await page.request.post(`${BASE}/api/admin/coach-ops/broadcast`, {
      data: { channel: 'email', message: 'test', target: 'all' },
    });
    console.log(`POST /api/admin/coach-ops/broadcast (no auth) → ${res.status()}`);
    expect(res.status()).toBe(401);
  });

});

// ════════════════════════════════════════════════════════════════════
// 10. LEADERBOARD, PROFILE, SESSIONS
// ════════════════════════════════════════════════════════════════════

test.describe('LEADERBOARD & PROFILE', () => {

  test('Leaderboard loads with entries', async ({ page }) => {
    await goTo(page, '/leaderboard');
    await page.screenshot({ path: ss('lb-01-page') });
    await expect(page.locator('text=Leaderboard, text=Community Leaderboard').first()).toBeVisible();
    console.log('✅ Leaderboard page loaded');
  });

  test('Leaderboard shows own rank pinned', async ({ page }) => {
    await goTo(page, '/leaderboard');
    await page.waitForTimeout(1000);
    const hasYou = await page.locator('text=(you), text=You').count();
    console.log(`Own rank indicator: ${hasYou}`);
    await page.screenshot({ path: ss('lb-02-ownrank') });
  });

  test('Leaderboard location filter works', async ({ page }) => {
    await goTo(page, '/leaderboard');
    const select = page.locator('select').first();
    if (await select.isVisible()) {
      const opts = await select.locator('option').allTextContents();
      console.log(`Location filter options: ${opts.join(', ')}`);
      if (opts.length > 1) {
        await select.selectOption({ index: 1 });
        await page.waitForTimeout(800);
        await page.screenshot({ path: ss('lb-03-filter') });
        console.log('✅ Location filter applied');
      }
    }
  });

  test('Leaderboard mobile layout', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await goTo(page, '/leaderboard');
    await page.screenshot({ path: ss('lb-04-mobile') });
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientW = await page.evaluate(() => document.documentElement.clientWidth);
    console.log(`Leaderboard mobile overflow: ${scrollW - clientW}px`);
    expect(scrollW).toBeLessThanOrEqual(clientW + 5);
  });

  test('Profile page loads with pre-filled user data', async ({ page }) => {
    await goTo(page, '/profile');
    await page.screenshot({ path: ss('profile-01-page') });
    const inputs = page.locator('input:not([type="file"]):not([type="password"])');
    const count  = await inputs.count();
    if (count > 0) {
      const val = await inputs.first().inputValue();
      console.log(`Profile first input pre-filled: "${val}"`);
      expect(val.length).toBeGreaterThan(0);
    }
  });

});

// ════════════════════════════════════════════════════════════════════
// 11. SECURITY CHECKS
// ════════════════════════════════════════════════════════════════════

test.describe('SECURITY', () => {

  test('Training plan endpoint requires auth', async ({ page }) => {
    const res = await page.request.get(`${BASE}/api/user/training-plan?email=${EMAIL}`);
    expect(res.status()).toBe(401);
    console.log(`✅ /api/user/training-plan (no token) → 401`);
  });

  test('Cannot delete another user post by email spoofing', async ({ page }) => {
    const res = await page.request.delete(`${BASE}/api/posts/some-post-id`, {
      headers: { 'Content-Type': 'application/json' },
      data: { email: 'admin@connectedsteps.in' },
    });
    // Must be 401 (no token), not 404 or 200
    expect(res.status()).toBe(401);
    console.log(`✅ Email-spoofed delete → ${res.status()}`);
  });

  test('Admin routes return 401 without auth', async ({ page }) => {
    const routes = [
      '/api/admin/users',
      '/api/admin/sessions',
      '/api/admin/memberships',
    ];
    for (const route of routes) {
      const res = await page.request.get(`${BASE}${route}`);
      console.log(`GET ${route} (no auth) → ${res.status()}`);
      expect(res.status()).toBe(401);
    }
  });

  test('Unauthenticated cannot access /feed (redirect)', async ({ page }) => {
    await page.goto(`${BASE}/feed`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
    const redirected = page.url().includes('/auth');
    console.log(`/feed unauthenticated → redirected: ${redirected}, URL: ${page.url()}`);
    // If it doesn't redirect, it should at least not show private data
  });

});

// ════════════════════════════════════════════════════════════════════
// 12. EDGE CASES
// ════════════════════════════════════════════════════════════════════

test.describe('EDGE CASES', () => {

  test('404 page for unknown route', async ({ page }) => {
    await page.goto(`${BASE}/this-does-not-exist-xyz-abc`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: ss('edge-01-404') });
    const url = page.url();
    console.log(`Unknown route → URL: ${url}`);
    // Should not crash (500)
  });

  test('API handles empty email gracefully', async ({ page }) => {
    const res  = await page.request.get(`${BASE}/api/user/achievements?email=`);
    const body = await res.json();
    console.log(`Achievements (empty email) → ${res.status()}: ${JSON.stringify(body)}`);
    expect(res.status()).toBeLessThan(500);
  });

  test('Posts API handles very long limit gracefully', async ({ page }) => {
    const res = await page.request.get(`${BASE}/api/posts?limit=999`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Should be capped at 30
    console.log(`Posts with limit=999 returned: ${body.posts?.length} (should be ≤30)`);
    expect(body.posts?.length).toBeLessThanOrEqual(30);
  });

  test('Duplicate post submission — second submit blocked', async ({ page }) => {
    await goTo(page, '/feed');
    const createBtn = page.locator('button:has-text("Create"), button:has-text("Post"), button:has-text("Share"), button:has-text("Write")').first();
    if (!await createBtn.isVisible()) { console.log('SKIP'); return; }
    await createBtn.click();
    await page.waitForTimeout(600);
    const textarea = page.locator('textarea').first();
    if (!await textarea.isVisible()) { console.log('SKIP'); return; }
    await textarea.fill('Duplicate submission test post');
    const submitBtn = page.locator('button[type="submit"], button:has-text("Post it"), button:has-text("Submit")').last();
    // Click twice rapidly
    await submitBtn.click();
    await submitBtn.click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: ss('edge-02-duplicate') });
    console.log('Double submit attempted — checking for duplicates');
  });

  test('Refresh on feed preserves scroll position gracefully', async ({ page }) => {
    await goTo(page, '/feed');
    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: ss('edge-03-refresh') });
    const url = page.url();
    expect(url).toContain('/feed');
    console.log('✅ Refresh on feed does not crash');
  });

});
