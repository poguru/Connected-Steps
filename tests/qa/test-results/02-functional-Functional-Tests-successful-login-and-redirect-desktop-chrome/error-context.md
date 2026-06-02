# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 02-functional.spec.ts >> Functional Tests >> successful login and redirect
- Location: tests\qa\tests\02-functional.spec.ts:67:7

# Error details

```
Error: expect(received).not.toContain(expected) // indexOf

Expected substring: not "/auth"
Received string:        "https://www.connectedsteps.in/auth"
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e4]:
      - link "Connected Steps" [ref=e5] [cursor=pointer]:
        - /url: /
        - img "Connected Steps" [ref=e6]
      - generic [ref=e7]: Connected Steps
      - generic [ref=e8]: Your Goal, Our Plan
      - generic [ref=e10]: Every journey starts with a step
      - heading "Train smarter. Live better." [level=2] [ref=e11]:
        - text: Train smarter.
        - text: Live better.
      - paragraph [ref=e12]: Connected Steps is a community-driven fitness movement built on real transformations. We pair you with National-level athletes and elite coaches to help you break through your limits. Whether you're looking to lose weight, run your first marathon, or simply lead a more active life, we provide the expert plan to get you there.
    - generic [ref=e14]:
      - generic [ref=e15]:
        - heading "Create your account" [level=1] [ref=e16]
        - paragraph [ref=e17]: Start your running journey today — it's free.
      - generic [ref=e18]:
        - button "Create account" [ref=e19] [cursor=pointer]
        - button "Sign in" [ref=e20] [cursor=pointer]
      - generic [ref=e21]:
        - generic [ref=e22]:
          - button [ref=e23]:
            - img [ref=e25]
          - button "Add profile photo" [ref=e28] [cursor=pointer]
          - generic [ref=e29]: Profile photo (optional)
        - generic [ref=e30]:
          - textbox "First name" [ref=e31]
          - textbox "Last name" [ref=e32]
        - textbox "Email address" [ref=e34]: pogurikalyan624@gmail.com
        - textbox "Phone number" [ref=e36]
        - generic [ref=e37]:
          - generic [ref=e38]: Date of Birth
          - textbox "Date of Birth" [ref=e39]
        - generic [ref=e40]:
          - generic [ref=e41]:
            - textbox "Password" [ref=e42]: Kalyan@12
            - button "Show" [ref=e43] [cursor=pointer]
          - paragraph [ref=e44]: Min. 8 characters
        - textbox "Confirm password" [ref=e46]
        - generic [ref=e47]:
          - generic [ref=e48]: Goal
          - combobox [ref=e49] [cursor=pointer]:
            - option "First 5K" [selected]
            - option "10K"
            - option "Half Marathon"
            - option "Full Marathon"
            - option "Ultra Marathon"
            - option "General Fitness"
            - option "Improve Speed/Pace"
            - option "Weight Loss"
            - option "Strength & Endurance"
        - generic [ref=e50]:
          - generic [ref=e51]: Preferred training location
          - combobox [ref=e52] [cursor=pointer]:
            - option "Select a location" [selected]
            - option "Kondapur"
            - option "Kukatpally"
            - option "Kokapet"
            - option "Miyapur"
            - option "Others"
        - paragraph [ref=e53]: By signing up, you agree to our Terms, Privacy Policy and Cookie Policy.
        - generic [ref=e54]: Please enter your full name.
        - button "Sign up" [active] [ref=e55] [cursor=pointer]
        - paragraph [ref=e56]:
          - text: Already have an account?
          - button "Log in" [ref=e57] [cursor=pointer]
      - paragraph [ref=e58]:
        - text: Already have an account?
        - button "Sign in" [ref=e59] [cursor=pointer]
      - link "← Back to home" [ref=e60] [cursor=pointer]:
        - /url: /
  - alert [ref=e61]
  - generic [ref=e62]:
    - paragraph [ref=e63]:
      - text: We use local storage to keep you signed in and remember your preferences. No tracking cookies, no ad networks.
      - link "Cookie policy" [ref=e64] [cursor=pointer]:
        - /url: /cookies
      - text: ·
      - link "Privacy policy" [ref=e65] [cursor=pointer]:
        - /url: /privacy
    - button "Got it" [ref=e66] [cursor=pointer]
```

# Test source

```ts
  1   | /**
  2   |  * 02-functional.spec.ts
  3   |  * Page loads, navigation, buttons, JS errors, network errors.
  4   |  */
  5   | import { test, expect } from '@playwright/test';
  6   | import { BASE_URL, KNOWN_ROUTES, gotoAndWait, screenshot, collectErrors, login, CREDENTIALS } from '../utils/helpers';
  7   | 
  8   | test.describe('Functional Tests', () => {
  9   |   test('home page renders key sections', async ({ page }) => {
  10  |     const { jsErrors } = collectErrors(page);
  11  |     await gotoAndWait(page, BASE_URL);
  12  |     await screenshot(page, '02-home');
  13  | 
  14  |     // Navbar should be present
  15  |     const nav = page.locator('nav, header').first();
  16  |     await expect(nav).toBeVisible();
  17  | 
  18  |     // Some hero/main content
  19  |     const main = page.locator('main, [role="main"], section').first();
  20  |     await expect(main).toBeVisible();
  21  | 
  22  |     // No critical JS errors
  23  |     const criticalErrors = jsErrors.filter(
  24  |       (e) => !e.includes('ResizeObserver') && !e.includes('Non-Error promise rejection')
  25  |     );
  26  |     if (criticalErrors.length > 0) {
  27  |       console.warn('JS errors on home page:', criticalErrors);
  28  |     }
  29  |     expect(criticalErrors.length).toBe(0);
  30  |   });
  31  | 
  32  |   test('navigation links work from home page', async ({ page }) => {
  33  |     const { jsErrors, networkFails } = collectErrors(page);
  34  |     await gotoAndWait(page, BASE_URL);
  35  | 
  36  |     // Find nav links
  37  |     const navLinks = await page.locator('nav a[href], header a[href]').all();
  38  |     console.log(`Found ${navLinks.length} nav links`);
  39  |     expect(navLinks.length).toBeGreaterThan(0);
  40  | 
  41  |     // Check at least a few nav links are visible and functional
  42  |     for (const link of navLinks.slice(0, 5)) {
  43  |       const href = await link.getAttribute('href');
  44  |       const text = await link.textContent();
  45  |       console.log(`Nav link: "${text?.trim()}" → ${href}`);
  46  |       if (href && !href.startsWith('http') && !href.startsWith('#')) {
  47  |         await expect(link).toBeVisible();
  48  |       }
  49  |     }
  50  |   });
  51  | 
  52  |   test('auth page loads and shows login form', async ({ page }) => {
  53  |     const { jsErrors } = collectErrors(page);
  54  |     await gotoAndWait(page, `${BASE_URL}/auth`);
  55  |     await screenshot(page, '02-auth-page');
  56  | 
  57  |     const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  58  |     const passwordInput = page.locator('input[type="password"]').first();
  59  | 
  60  |     await expect(emailInput).toBeVisible();
  61  |     await expect(passwordInput).toBeVisible();
  62  | 
  63  |     const criticalErrors = jsErrors.filter((e) => !e.includes('ResizeObserver'));
  64  |     expect(criticalErrors.length).toBe(0);
  65  |   });
  66  | 
  67  |   test('successful login and redirect', async ({ page }) => {
  68  |     const { jsErrors } = collectErrors(page);
  69  |     await login(page);
  70  |     await screenshot(page, '02-after-login');
  71  | 
  72  |     const url = page.url();
  73  |     console.log('After login URL:', url);
> 74  |     expect(url).not.toContain('/auth');
      |                     ^ Error: expect(received).not.toContain(expected) // indexOf
  75  | 
  76  |     const criticalErrors = jsErrors.filter((e) => !e.includes('ResizeObserver'));
  77  |     if (criticalErrors.length > 0) {
  78  |       console.warn('JS errors after login:', criticalErrors);
  79  |     }
  80  |   });
  81  | 
  82  |   test('dashboard accessible after login', async ({ page }) => {
  83  |     await login(page);
  84  |     await gotoAndWait(page, `${BASE_URL}/dashboard`);
  85  |     await screenshot(page, '02-dashboard');
  86  | 
  87  |     const url = page.url();
  88  |     // Either stays on dashboard or redirects to auth (if session not persisted)
  89  |     console.log('Dashboard URL:', url);
  90  |     const body = await page.textContent('body');
  91  |     expect(body).toBeTruthy();
  92  |     expect(body!.length).toBeGreaterThan(100);
  93  |   });
  94  | 
  95  |   test('pricing page loads', async ({ page }) => {
  96  |     const { jsErrors } = collectErrors(page);
  97  |     await gotoAndWait(page, `${BASE_URL}/pricing`);
  98  |     await screenshot(page, '02-pricing');
  99  | 
  100 |     const body = await page.textContent('body');
  101 |     expect(body?.length).toBeGreaterThan(100);
  102 | 
  103 |     const criticalErrors = jsErrors.filter((e) => !e.includes('ResizeObserver'));
  104 |     expect(criticalErrors.length).toBe(0);
  105 |   });
  106 | 
  107 |   test('blog page loads', async ({ page }) => {
  108 |     const { jsErrors } = collectErrors(page);
  109 |     await gotoAndWait(page, `${BASE_URL}/blog`);
  110 |     await screenshot(page, '02-blog');
  111 | 
  112 |     const body = await page.textContent('body');
  113 |     expect(body?.length).toBeGreaterThan(100);
  114 |   });
  115 | 
  116 |   test('contact page loads', async ({ page }) => {
  117 |     const { jsErrors } = collectErrors(page);
  118 |     await gotoAndWait(page, `${BASE_URL}/contact`);
  119 |     await screenshot(page, '02-contact');
  120 | 
  121 |     await expect(page.locator('h1, h2').first()).toBeVisible();
  122 |   });
  123 | 
  124 |   test('community page loads', async ({ page }) => {
  125 |     await gotoAndWait(page, `${BASE_URL}/community`);
  126 |     await screenshot(page, '02-community');
  127 |     const body = await page.textContent('body');
  128 |     expect(body?.length).toBeGreaterThan(100);
  129 |   });
  130 | 
  131 |   test('privacy page loads', async ({ page }) => {
  132 |     await gotoAndWait(page, `${BASE_URL}/privacy`);
  133 |     await screenshot(page, '02-privacy');
  134 |     const body = await page.textContent('body');
  135 |     expect(body?.toLowerCase()).toMatch(/privacy/i);
  136 |   });
  137 | 
  138 |   test('terms page loads', async ({ page }) => {
  139 |     await gotoAndWait(page, `${BASE_URL}/terms`);
  140 |     await screenshot(page, '02-terms');
  141 |     const body = await page.textContent('body');
  142 |     expect(body?.toLowerCase()).toMatch(/terms/i);
  143 |   });
  144 | 
  145 |   test('no broken network requests on home page', async ({ page }) => {
  146 |     const { networkFails } = collectErrors(page);
  147 |     await gotoAndWait(page, BASE_URL);
  148 | 
  149 |     // Filter out known benign failures (e.g., analytics, font preloads)
  150 |     const criticalFails = networkFails.filter(
  151 |       (f) =>
  152 |         !f.includes('analytics') &&
  153 |         !f.includes('gtag') &&
  154 |         !f.includes('google-analytics') &&
  155 |         !f.includes('fonts.googleapis') &&
  156 |         !f.includes('ERR_ABORTED')
  157 |     );
  158 |     if (criticalFails.length > 0) {
  159 |       console.warn('Network failures:', criticalFails);
  160 |     }
  161 |     expect(criticalFails.length).toBeLessThanOrEqual(2);
  162 |   });
  163 | 
  164 |   test('CTA buttons are clickable and navigate', async ({ page }) => {
  165 |     await gotoAndWait(page, BASE_URL);
  166 | 
  167 |     const ctaButtons = await page.locator('a[href*="join"], a[href*="auth"], a[href*="pricing"], button').all();
  168 |     console.log(`Found ${ctaButtons.length} CTA elements`);
  169 | 
  170 |     // Verify at least one CTA is visible
  171 |     let visibleCta = 0;
  172 |     for (const btn of ctaButtons.slice(0, 10)) {
  173 |       const isVisible = await btn.isVisible().catch(() => false);
  174 |       if (isVisible) visibleCta++;
```