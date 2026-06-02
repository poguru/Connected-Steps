# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 03-forms.spec.ts >> Forms — Auth >> happy path: valid login
- Location: tests\qa\tests\03-forms.spec.ts:25:7

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
  2   |  * 03-forms.spec.ts
  3   |  * Happy path, negative, boundary, XSS/SQLi, double submit for all forms.
  4   |  */
  5   | import { test, expect } from '@playwright/test';
  6   | import { BASE_URL, gotoAndWait, screenshot, collectErrors, login } from '../utils/helpers';
  7   | 
  8   | const XSS_PAYLOADS = [
  9   |   '<script>alert("XSS")</script>',
  10  |   '"><img src=x onerror=alert(1)>',
  11  |   "';alert('xss');//",
  12  |   '<svg onload=alert(1)>',
  13  |   'javascript:alert(1)',
  14  | ];
  15  | 
  16  | const SQLI_PAYLOADS = [
  17  |   "' OR '1'='1",
  18  |   "' OR 1=1--",
  19  |   "'; DROP TABLE users;--",
  20  |   '1; SELECT * FROM users',
  21  |   "admin'--",
  22  | ];
  23  | 
  24  | test.describe('Forms — Auth', () => {
  25  |   test('happy path: valid login', async ({ page }) => {
  26  |     const { jsErrors } = collectErrors(page);
  27  |     await gotoAndWait(page, `${BASE_URL}/auth`);
  28  | 
  29  |     await page.locator('input[type="email"]').first().fill('pogurikalyan624@gmail.com');
  30  |     await page.locator('input[type="password"]').first().fill('Kalyan@12');
  31  |     await page.locator('button[type="submit"]').first().click();
  32  | 
  33  |     await page.waitForURL((u) => !u.pathname.includes('/auth'), { timeout: 15000 }).catch(() => {});
  34  |     await screenshot(page, '03-login-success');
  35  | 
  36  |     const url = page.url();
  37  |     console.log('After login:', url);
> 38  |     expect(url).not.toContain('/auth');
      |                     ^ Error: expect(received).not.toContain(expected) // indexOf
  39  |   });
  40  | 
  41  |   test('negative: wrong password shows error', async ({ page }) => {
  42  |     await gotoAndWait(page, `${BASE_URL}/auth`);
  43  |     await page.locator('input[type="email"]').first().fill('pogurikalyan624@gmail.com');
  44  |     await page.locator('input[type="password"]').first().fill('WrongPassword999!');
  45  |     await page.locator('button[type="submit"]').first().click();
  46  |     await page.waitForTimeout(3000);
  47  |     await screenshot(page, '03-login-wrong-password');
  48  | 
  49  |     const body = await page.textContent('body');
  50  |     const hasError = body?.toLowerCase().match(/invalid|incorrect|wrong|error|failed|unauthorized/i);
  51  |     console.log('Wrong password response:', hasError ? 'Error shown' : 'No error text found');
  52  |     // Still on auth page or error shown
  53  |     const stillOnAuth = page.url().includes('/auth');
  54  |     expect(stillOnAuth || !!hasError).toBeTruthy();
  55  |   });
  56  | 
  57  |   test('negative: empty fields validation', async ({ page }) => {
  58  |     await gotoAndWait(page, `${BASE_URL}/auth`);
  59  |     const submitBtn = page.locator('button[type="submit"]').first();
  60  |     await submitBtn.click();
  61  |     await page.waitForTimeout(1500);
  62  |     await screenshot(page, '03-login-empty');
  63  | 
  64  |     // Should either stay on page or show validation
  65  |     const url = page.url();
  66  |     expect(url).toContain('/auth');
  67  |   });
  68  | 
  69  |   test('boundary: extremely long email', async ({ page }) => {
  70  |     await gotoAndWait(page, `${BASE_URL}/auth`);
  71  |     const longEmail = 'a'.repeat(300) + '@example.com';
  72  |     await page.locator('input[type="email"]').first().fill(longEmail);
  73  |     await page.locator('input[type="password"]').first().fill('password123');
  74  |     await page.locator('button[type="submit"]').first().click();
  75  |     await page.waitForTimeout(2000);
  76  |     await screenshot(page, '03-login-long-email');
  77  |     // Should not crash the page
  78  |     const body = await page.textContent('body');
  79  |     expect(body).toBeTruthy();
  80  |   });
  81  | 
  82  |   test('boundary: extremely long password', async ({ page }) => {
  83  |     await gotoAndWait(page, `${BASE_URL}/auth`);
  84  |     await page.locator('input[type="email"]').first().fill('test@example.com');
  85  |     await page.locator('input[type="password"]').first().fill('P@ss' + 'x'.repeat(500));
  86  |     await page.locator('button[type="submit"]').first().click();
  87  |     await page.waitForTimeout(2000);
  88  |     // Page should not crash
  89  |     const body = await page.textContent('body');
  90  |     expect(body).toBeTruthy();
  91  |   });
  92  | 
  93  |   test('XSS: payloads in email field do not execute', async ({ page }) => {
  94  |     for (const payload of XSS_PAYLOADS) {
  95  |       let alertFired = false;
  96  |       page.on('dialog', async (dialog) => {
  97  |         alertFired = true;
  98  |         await dialog.dismiss();
  99  |       });
  100 | 
  101 |       await gotoAndWait(page, `${BASE_URL}/auth`);
  102 |       await page.locator('input[type="email"]').first().fill(payload);
  103 |       await page.locator('input[type="password"]').first().fill('password');
  104 |       await page.locator('button[type="submit"]').first().click();
  105 |       await page.waitForTimeout(1500);
  106 | 
  107 |       expect(alertFired, `XSS alert fired for payload: ${payload}`).toBeFalsy();
  108 |     }
  109 |   });
  110 | 
  111 |   test('SQLi: payloads in email field are handled safely', async ({ page }) => {
  112 |     for (const payload of SQLI_PAYLOADS) {
  113 |       await gotoAndWait(page, `${BASE_URL}/auth`);
  114 |       await page.locator('input[type="email"]').first().fill(payload);
  115 |       await page.locator('input[type="password"]').first().fill("' OR '1'='1");
  116 |       await page.locator('button[type="submit"]').first().click();
  117 |       await page.waitForTimeout(2000);
  118 | 
  119 |       // Should not be logged in with SQL injection
  120 |       const url = page.url();
  121 |       const body = await page.textContent('body');
  122 |       const loggedIn = !url.includes('/auth') && !body?.toLowerCase().includes('invalid');
  123 |       if (loggedIn) {
  124 |         console.warn(`SECURITY: SQLi payload may have worked: ${payload}`);
  125 |       }
  126 |       expect(url).toContain('/auth'); // Should still be on auth page
  127 |     }
  128 |   });
  129 | 
  130 |   test('double submit prevention', async ({ page }) => {
  131 |     await gotoAndWait(page, `${BASE_URL}/auth`);
  132 |     await page.locator('input[type="email"]').first().fill('pogurikalyan624@gmail.com');
  133 |     await page.locator('input[type="password"]').first().fill('Kalyan@12');
  134 | 
  135 |     const submitBtn = page.locator('button[type="submit"]').first();
  136 | 
  137 |     // Track requests
  138 |     let loginRequests = 0;
```