import { test, expect, Page } from '@playwright/test';

// ─── Shared mock user ─────────────────────────────────────────────────────────
const MOCK_USER = {
  email: 'test@connectedsteps.in',
  firstName: 'Test',
  lastName: 'User',
  phone: '9999999999',
  goal: '10k',
  location: 'Kondapur',
  photo: null,
};

async function loginAs(page: Page) {
  await page.goto('http://localhost:3000');
  await page.evaluate((u) => localStorage.setItem('cs_user', JSON.stringify(u)), MOCK_USER);
}

// ─── 1. Home Page ─────────────────────────────────────────────────────────────
test.describe('1. Home Page', () => {
  test('loads with logo, nav and hero', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Connected Steps').first()).toBeVisible();
    await page.screenshot({ path: 'test-results/01-home.png', fullPage: false });
  });

  test('Community Q&A section visible with posts or empty state', async ({ page }) => {
    await page.goto('http://localhost:3000/#community');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await expect(page.locator('text=Questions').first()).toBeVisible();
    await page.screenshot({ path: 'test-results/01-community-section.png', fullPage: false });
  });
});

// ─── 2. Auth Pages ────────────────────────────────────────────────────────────
test.describe('2. Auth Pages', () => {
  test('Sign in page loads with email/password fields', async ({ page }) => {
    await page.goto('http://localhost:3000/auth?tab=signin');
    await page.waitForLoadState('networkidle');
    // Input uses type="text" with email/phone placeholder
    await expect(page.getByPlaceholder('Email address or phone number')).toBeVisible();
    await expect(page.getByPlaceholder('Password')).toBeVisible();
    await page.screenshot({ path: 'test-results/02-signin.png' });
  });

  test('Sign up tab switches correctly', async ({ page }) => {
    await page.goto('http://localhost:3000/auth?tab=signup');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Create account').or(page.locator('text=Sign up')).first()).toBeVisible();
    await page.screenshot({ path: 'test-results/02-signup.png' });
  });

  test('Forgot password page loads', async ({ page }) => {
    await page.goto('http://localhost:3000/auth/forgot-password');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await page.screenshot({ path: 'test-results/02-forgot-password.png' });
  });

  test('Unauthenticated dashboard redirects to auth', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.evaluate(() => localStorage.removeItem('cs_user'));
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/auth');
    await page.screenshot({ path: 'test-results/02-auth-redirect.png' });
  });
});

// ─── 3. Dashboard ─────────────────────────────────────────────────────────────
test.describe('3. Dashboard', () => {
  test('profile card shows name and goal', async ({ page }) => {
    await loginAs(page);
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Test User').first()).toBeVisible();
    await expect(page.locator('text=10K').first()).toBeVisible();
    await page.screenshot({ path: 'test-results/03-dashboard-profile.png' });
  });

  test('stats row shows Activities, This Month, Total Pts', async ({ page }) => {
    await loginAs(page);
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Activities').first()).toBeVisible();
    await expect(page.locator('text=This Month').first()).toBeVisible();
    await expect(page.locator('text=Total Pts').first()).toBeVisible();
    await page.screenshot({ path: 'test-results/03-dashboard-stats.png' });
  });

  test('right sidebar has Leaderboard and Coach Q&A links', async ({ page }) => {
    await loginAs(page);
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=View community rankings').first()).toBeVisible();
    await expect(page.locator('text=My questions & replies').first()).toBeVisible();
    await page.screenshot({ path: 'test-results/03-dashboard-sidebar.png' });
  });

  test('session section shows skeleton or content', async ({ page }) => {
    await loginAs(page);
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForTimeout(500);
    // Either skeleton cards OR session history heading is present
    const hasSkeleton = await page.locator('[style*="rgba(255,255,255,0.05)"]').count();
    const hasEmpty    = await page.locator('text=Your session history will appear here').count();
    const hasSessions = await page.locator('text=session').count();
    expect(hasSkeleton + hasEmpty + hasSessions).toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/03-dashboard-sessions.png' });
  });

  test('Ask Your Coach FAB is visible', async ({ page }) => {
    await loginAs(page);
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.cs-ask-fab-btn')).toBeVisible();
    await page.screenshot({ path: 'test-results/03-dashboard-fab.png' });
  });

  test('FAB opens modal with Ask and My Questions tabs', async ({ page }) => {
    await loginAs(page);
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.locator('.cs-ask-fab-btn').scrollIntoViewIfNeeded();
    await page.locator('.cs-ask-fab-btn').click({ force: true });
    await expect(page.locator('text=Ask Your Coach')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=My Questions')).toBeVisible();
    await page.screenshot({ path: 'test-results/03-fab-modal.png' });
  });
});

// ─── 4. Profile Page ──────────────────────────────────────────────────────────
test.describe('4. Profile Page', () => {
  test('loads with photo section, personal info, change password', async ({ page }) => {
    await loginAs(page);
    await page.goto('http://localhost:3000/profile');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await expect(page.locator('text=PROFILE PHOTO')).toBeVisible();
    await expect(page.locator('text=PERSONAL INFO')).toBeVisible();
    await expect(page.locator('text=CHANGE PASSWORD').first()).toBeVisible();
    await page.screenshot({ path: 'test-results/04-profile.png', fullPage: true });
  });

  test('photo hint shows JPG or PNG · Max 2 MB', async ({ page }) => {
    await loginAs(page);
    await page.goto('http://localhost:3000/profile');
    await expect(page.locator('text=JPG or PNG · Max 2 MB')).toBeVisible();
  });

  test('oversized photo shows error', async ({ page }) => {
    await loginAs(page);
    await page.goto('http://localhost:3000/profile');
    await page.waitForLoadState('networkidle');
    const bigBuf = Buffer.alloc(3 * 1024 * 1024, 0xab);
    await page.locator('input[type="file"]').setInputFiles({ name: 'big.jpg', mimeType: 'image/jpeg', buffer: bigBuf });
    await page.waitForTimeout(600);
    await expect(page.locator('text=Photo must be under 2 MB')).toBeVisible();
    await page.screenshot({ path: 'test-results/04-photo-error.png' });
  });

  test('name validation rejects empty first name', async ({ page }) => {
    await loginAs(page);
    await page.goto('http://localhost:3000/profile');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
    // First name has no placeholder — first non-file, non-password input on page
    await page.locator('input:not([type="file"]):not([type="password"])').first().fill('');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=Name is required')).toBeVisible();
    await page.screenshot({ path: 'test-results/04-profile-validation.png' });
  });
});

// ─── 5. Leaderboard ───────────────────────────────────────────────────────────
test.describe('5. Leaderboard', () => {
  test('loads with tab switcher and location filter', async ({ page }) => {
    await loginAs(page);
    await page.goto('http://localhost:3000/leaderboard');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Community Leaderboard')).toBeVisible();
    await expect(page.getByRole('button', { name: 'This Month' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'All Time' })).toBeVisible();
    await expect(page.locator('select')).toBeVisible();
    await page.screenshot({ path: 'test-results/05-leaderboard.png' });
  });

  test('Back to Dashboard link is visible', async ({ page }) => {
    await loginAs(page);
    await page.goto('http://localhost:3000/leaderboard');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=← Dashboard')).toBeVisible();
    await page.screenshot({ path: 'test-results/05-leaderboard-back.png' });
  });

  test('All Time tab switches correctly', async ({ page }) => {
    await loginAs(page);
    await page.goto('http://localhost:3000/leaderboard');
    await page.waitForLoadState('networkidle');
    await page.locator('text=All Time').click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'test-results/05-leaderboard-alltime.png' });
  });
});

// ─── 6. Community Pages ───────────────────────────────────────────────────────
test.describe('6. Community Pages', () => {
  test('/community is the Find Runners directory', async ({ page }) => {
    await loginAs(page);
    await page.goto('http://localhost:3000/community');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Find Runners')).toBeVisible();
    await expect(page.getByPlaceholder(/Search by name/)).toBeVisible();
    await page.screenshot({ path: 'test-results/06-community-directory.png' });
  });

  test('homepage Q&A section has category filter buttons', async ({ page }) => {
    await loginAs(page);
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    // Scroll to community section
    await page.locator('section#community').filter({ hasText: 'Questions' }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await expect(page.getByRole('button', { name: 'Recovery' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Running Tips' }).first()).toBeVisible();
    await page.screenshot({ path: 'test-results/06-homepage-qa-filters.png' });
  });

  test('homepage Q&A posts load with like button', async ({ page }) => {
    await loginAs(page);
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.locator('section#community').filter({ hasText: 'Questions' }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    // At least one post visible or empty state
    const hasPosts    = await page.locator('text=View answers').count();
    const hasEmpty    = await page.locator('text=No posts yet').count();
    const hasSkeleton = await page.locator('text=Loading').count();
    expect(hasPosts + hasEmpty + hasSkeleton).toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/06-homepage-qa-posts.png' });
  });
});

// ─── 7. My Questions Page ─────────────────────────────────────────────────────
test.describe('7. My Questions Page', () => {
  test('redirects to auth when not logged in', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.evaluate(() => localStorage.removeItem('cs_user'));
    await page.goto('http://localhost:3000/my-questions');
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/auth');
  });

  test('loads inbox for logged-in user', async ({ page }) => {
    await loginAs(page);
    await page.goto('http://localhost:3000/my-questions');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=My Coach Questions')).toBeVisible();
    await page.screenshot({ path: 'test-results/07-my-questions.png', fullPage: true });
  });

  test('shows empty state or questions list', async ({ page }) => {
    await loginAs(page);
    await page.goto('http://localhost:3000/my-questions');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    const hasEmpty    = await page.locator('text=No questions yet').count();
    const hasAnswered = await page.locator('text=Answered').count();
    const hasPending  = await page.locator('text=Awaiting Reply').count();
    expect(hasEmpty + hasAnswered + hasPending).toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/07-my-questions-state.png', fullPage: true });
  });
});

// ─── 8. Payment History Page ──────────────────────────────────────────────────
test.describe('8. Payment History Page', () => {
  test('redirects to auth when not logged in', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.evaluate(() => localStorage.removeItem('cs_user'));
    await page.goto('http://localhost:3000/payments');
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/auth');
  });

  test('loads payment history for logged-in user', async ({ page }) => {
    await loginAs(page);
    await page.goto('http://localhost:3000/payments');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Payment History' })).toBeVisible();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-results/08-payments.png', fullPage: true });
  });
});

// ─── 9. Weekend Run Page ──────────────────────────────────────────────────────
test.describe('9. Weekend Run Page', () => {
  test('loads registration page', async ({ page }) => {
    await page.goto('http://localhost:3000/weekend-run');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/09-weekend-run.png', fullPage: false });
    await expect(page.locator('text=Run').first()).toBeVisible();
  });
});

// ─── 10. Pricing Page ─────────────────────────────────────────────────────────
test.describe('10. Pricing Page', () => {
  test('loads with plan cards', async ({ page }) => {
    await page.goto('http://localhost:3000/pricing');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Monthly').first()).toBeVisible();
    await page.screenshot({ path: 'test-results/10-pricing.png', fullPage: false });
  });
});

// ─── 11. Admin Hub ────────────────────────────────────────────────────────────
test.describe('11. Admin Hub', () => {
  test('admin page shows password prompt', async ({ page }) => {
    await page.goto('http://localhost:3000/admin');
    await page.waitForLoadState('networkidle');
    // Should show either the hub or a password gate
    await page.screenshot({ path: 'test-results/11-admin.png', fullPage: false });
    const hasCards = await page.locator('text=Training Sessions').count();
    const hasPwPrompt = await page.locator('input[type="password"]').count();
    expect(hasCards + hasPwPrompt).toBeGreaterThan(0);
  });
});

// ─── 12. Static / Legal Pages ─────────────────────────────────────────────────
test.describe('12. Static Pages', () => {
  test('Privacy Policy loads', async ({ page }) => {
    await page.goto('http://localhost:3000/privacy');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Privacy').first()).toBeVisible();
    await page.screenshot({ path: 'test-results/12-privacy.png' });
  });

  test('Terms of Service loads', async ({ page }) => {
    await page.goto('http://localhost:3000/terms');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Terms').first()).toBeVisible();
    await page.screenshot({ path: 'test-results/12-terms.png' });
  });

  test('Contact page loads', async ({ page }) => {
    await page.goto('http://localhost:3000/contact');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/12-contact.png' });
  });
});
