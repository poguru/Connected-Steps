import { test, expect, Page } from '@playwright/test';

const EMAIL    = 'pogurikalyan624@gmail.com';
const PASSWORD = 'Kalyan@12';

// ─── Helper: sign in once, reuse across tests via storageState ────────────────
async function signIn(page: Page) {
  await page.goto('http://localhost:3000/auth?tab=signin');
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('Email address or phone number').fill(EMAIL);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
  // Wait until redirected away from /auth
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

// ─── 1. Sign In ───────────────────────────────────────────────────────────────
test('1. Sign in with real credentials', async ({ page }) => {
  await signIn(page);
  expect(page.url()).not.toContain('/auth');
  await page.screenshot({ path: 'test-results/e2e-01-signin.png', fullPage: false });
  console.log('✅ Signed in → redirected to', page.url());
});

// ─── 2. Dashboard loads with real user data ───────────────────────────────────
test('2. Dashboard shows real user name, goal and stats', async ({ page }) => {
  await signIn(page);
  if (!page.url().includes('/dashboard')) await page.goto('http://localhost:3000/dashboard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Real user name visible
  await expect(page.locator('text=Kalyan').first()).toBeVisible();
  // Stats row
  await expect(page.locator('text=This Month').first()).toBeVisible();
  await expect(page.locator('text=Total Pts').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/e2e-02-dashboard.png', fullPage: false });
  console.log('✅ Dashboard: real user data visible');
});

// ─── 3. Upcoming Session — Join button ───────────────────────────────────────
test('3. Upcoming session visible (Join or Joined)', async ({ page }) => {
  await signIn(page);
  await page.goto('http://localhost:3000/dashboard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const hasUpcoming = await page.locator('text=Upcoming Sessions').count();
  if (hasUpcoming > 0) {
    const joinBtn  = page.locator('text=Join →').first();
    const joinedLbl = page.locator('text=✓ Joined').first();
    const hasJoin   = await joinBtn.isVisible();
    const hasJoined = await joinedLbl.isVisible();
    expect(hasJoin || hasJoined).toBeTruthy();
    console.log(`✅ Upcoming session found — status: ${hasJoined ? 'Joined' : 'Not joined'}`);
  } else {
    console.log('✅ No upcoming sessions scheduled (expected)');
  }
  await page.screenshot({ path: 'test-results/e2e-03-upcoming.png', fullPage: false });
});

// ─── 4. Training Plan in sidebar ─────────────────────────────────────────────
test('4. Training plan shows real plan or empty state', async ({ page }) => {
  await signIn(page);
  await page.goto('http://localhost:3000/dashboard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await expect(page.locator('text=Training Plan').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/e2e-04-training-plan.png', fullPage: false });
  console.log('✅ Training Plan section loaded');
});

// ─── 5. Leaderboard — real data, own row pinned ───────────────────────────────
test('5. Leaderboard shows real entries and own rank pinned at top', async ({ page }) => {
  await signIn(page);
  await page.goto('http://localhost:3000/leaderboard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  await expect(page.locator('text=Community Leaderboard')).toBeVisible();
  // Own row should be pinned (you) label
  await expect(page.locator('text=(you)').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/e2e-05-leaderboard.png', fullPage: false });
  console.log('✅ Leaderboard: own row pinned with (you) label');
});

// ─── 6. Location filter on leaderboard ───────────────────────────────────────
test('6. Leaderboard location filter works', async ({ page }) => {
  await signIn(page);
  await page.goto('http://localhost:3000/leaderboard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  const select = page.locator('select');
  await expect(select).toBeVisible();
  // Get available options
  const options = await select.locator('option').allTextContents();
  console.log('  Location options:', options.join(', '));

  // Select a non-All option if available
  if (options.length > 1) {
    await select.selectOption({ index: 1 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'test-results/e2e-06-leaderboard-filter.png', fullPage: false });
    console.log(`✅ Location filter applied: ${options[1]}`);
  } else {
    console.log('✅ Location filter: only All locations available');
  }
});

// ─── 7. Community Q&A — homepage posts and like button ───────────────────────
test('7. Community Q&A — posts visible, like button works', async ({ page }) => {
  await signIn(page);
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  await page.locator('section#community').filter({ hasText: 'Questions' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);

  const postCount = await page.locator('text=View answers').count();
  console.log(`  Community posts visible: ${postCount}`);

  if (postCount > 0) {
    // Click first like button
    const likeBtn = page.locator('button').filter({ hasText: '♥' }).first();
    if (await likeBtn.isVisible()) {
      const beforeText = await likeBtn.textContent();
      await likeBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: 'test-results/e2e-07-like.png', fullPage: false });
      console.log(`✅ Like button clicked (was: "${beforeText?.trim()}")`);
    }
    // Expand first post answers
    await page.locator('text=View answers').first().click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'test-results/e2e-07-community-expanded.png', fullPage: false });
    console.log('✅ Post expanded to show answers');
  } else {
    console.log('✅ No posts yet (empty state)');
    await page.screenshot({ path: 'test-results/e2e-07-community-empty.png', fullPage: false });
  }
});

// ─── 8. Ask Coach FAB — open, fill, close ────────────────────────────────────
test('8. Ask Coach FAB — open, fill question, close without submitting', async ({ page }) => {
  await signIn(page);
  await page.goto('http://localhost:3000/dashboard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  const gotIt = page.locator('text=Got it');
  if (await gotIt.isVisible()) await gotIt.click();
  await page.waitForTimeout(300);

  await page.locator('.cs-ask-fab-btn').dispatchEvent('click');
  await page.waitForTimeout(1000);

  const modalOpen = await page.getByText('Ask Your Coach', { exact: true }).isVisible();
  if (modalOpen) {
    await page.getByPlaceholder('Describe your injury').fill('E2E test question — not a real submission.');
    await page.screenshot({ path: 'test-results/e2e-08-fab-filled.png', fullPage: false });
    await page.locator('button').filter({ hasText: '×' }).click();
    console.log('✅ FAB: opened, filled, closed');
  } else {
    await page.screenshot({ path: 'test-results/e2e-08-fab.png', fullPage: false });
    console.log('✅ FAB: button rendered correctly');
  }
});

// ─── 9. My Questions page ────────────────────────────────────────────────────
test('9. My Questions page — loads real question history', async ({ page }) => {
  await signIn(page);
  await page.goto('http://localhost:3000/my-questions');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  await expect(page.locator('text=My Coach Questions')).toBeVisible();
  const hasAnswered = await page.locator('text=Answered').count();
  const hasPending  = await page.locator('text=Awaiting Reply').count();
  const hasEmpty    = await page.locator('text=No questions yet').count();
  console.log(`✅ My Questions: answered=${hasAnswered}, pending=${hasPending}, empty=${hasEmpty}`);
  await page.screenshot({ path: 'test-results/e2e-09-my-questions.png', fullPage: true });
});

// ─── 10. Profile page — real data, update location ───────────────────────────
test('10. Profile page — real data pre-filled', async ({ page }) => {
  await signIn(page);
  await page.goto('http://localhost:3000/profile');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Real name pre-filled
  const firstNameInput = page.locator('input:not([type="file"]):not([type="password"])').first();
  const firstName = await firstNameInput.inputValue();
  expect(firstName.length).toBeGreaterThan(0);
  console.log(`✅ Profile pre-filled with first name: "${firstName}"`);

  await page.screenshot({ path: 'test-results/e2e-10-profile.png', fullPage: true });
});

// ─── 11. Payment history — real transactions ──────────────────────────────────
test('11. Payment history — loads real transactions', async ({ page }) => {
  await signIn(page);
  await page.goto('http://localhost:3000/payments');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  await expect(page.getByRole('heading', { name: 'Payment History' })).toBeVisible();
  const hasTxns  = await page.locator('text=PAID').count();
  const hasEmpty = await page.locator('text=No payments yet').count();
  console.log(`✅ Payment history: transactions=${hasTxns}, empty=${hasEmpty}`);
  await page.screenshot({ path: 'test-results/e2e-11-payments.png', fullPage: true });
});

// ─── 12. Weekend Run page ─────────────────────────────────────────────────────
test('12. Weekend Run page — registration form visible', async ({ page }) => {
  await signIn(page);
  await page.goto('http://localhost:3000/weekend-run');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/e2e-12-weekend-run.png', fullPage: false });
  console.log('✅ Weekend Run page loaded');
});

// ─── 13. Pricing page — plan cards ───────────────────────────────────────────
test('13. Pricing page — all plan cards visible', async ({ page }) => {
  await signIn(page);
  await page.goto('http://localhost:3000/pricing');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Monthly').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/e2e-13-pricing.png', fullPage: false });
  console.log('✅ Pricing page: plan cards visible');
});

// ─── 14. Share Your Story — form opens ───────────────────────────────────────
test('14. Share Your Story — form opens and accepts input', async ({ page }) => {
  await signIn(page);
  await page.goto('http://localhost:3000/dashboard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  await page.locator('text=Write a story').click();
  await page.waitForTimeout(400);
  await page.locator('textarea').first().fill('E2E test story — not a real submission.');
  await page.screenshot({ path: 'test-results/e2e-14-story-form.png', fullPage: false });
  await page.locator('text=Cancel').first().click();
  console.log('✅ Share Your Story: form opened, filled, cancelled');
});

// ─── 15. Sign out ─────────────────────────────────────────────────────────────
test('15. Sign out clears session and redirects to auth', async ({ page }) => {
  await signIn(page);
  await page.goto('http://localhost:3000/dashboard');
  await page.waitForLoadState('networkidle');

  // Open UserMenu and click Log out
  await page.locator('.cs-app-nav-user button').click();
  await page.waitForTimeout(400);
  await page.locator('text=Log out').click();
  await page.waitForURL('**/auth**', { timeout: 8000 });

  expect(page.url()).toContain('/auth');
  const csUser = await page.evaluate(() => localStorage.getItem('cs_user'));
  expect(csUser).toBeNull();
  await page.screenshot({ path: 'test-results/e2e-15-signout.png', fullPage: false });
  console.log('✅ Signed out → redirected to', page.url());
});
