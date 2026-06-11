# Connected Steps — Complete Test Automation Framework

## Stack

| Layer | Tool | Location |
|-------|------|----------|
| UI Automation | Playwright + TypeScript | `tests/automation/playwright/` |
| API Automation | Karate Framework (Java) | `tests/automation/karate/` |
| CI/CD | GitHub Actions | `.github/workflows/` |

---

## Quick Start

### Prerequisites

- Node.js 20+
- Java 17+ (for Karate)
- Maven 3.8+ (for Karate)
- App running at `http://localhost:3000`

---

## Playwright UI Tests

### 1. Setup

```bash
cd tests/automation/playwright
cp .env.test.example .env.test
# Fill in .env.test with real values
npm install
npx playwright install --with-deps chromium
```

### 2. Run Suites

```bash
# Smoke Suite (< 10 min)
npm run test:smoke

# Full regression
npm test

# Security tests only
npm run test:security

# Admin tests (separate auth)
npm run test:admin

# Mobile (iOS Safari)
npm run test:mobile

# Release validation (run before every deploy)
npm run test:release

# Headed (watch mode)
npm run test:ui

# Open last HTML report
npm run report
```

### 3. Project Structure

```
playwright/
├── playwright.config.ts       # Main config (projects, browsers, retries)
├── package.json
├── tsconfig.json
├── .env.test.example          # Copy → .env.test
├── fixtures/
│   ├── base.ts                # Extended test fixture with all page objects
│   └── global.setup.ts        # Auth state setup (user + admin)
├── pages/                     # Page Object Model
│   ├── BasePage.ts
│   ├── AuthPage.ts
│   ├── DashboardPage.ts
│   ├── SessionsPage.ts
│   ├── MembershipPage.ts
│   ├── CommunityPage.ts
│   ├── LeaderboardPage.ts
│   ├── AdminPage.ts
│   ├── ProfilePage.ts
│   └── CoachPage.ts
├── utils/
│   ├── env.ts                 # Env var management
│   ├── api-helper.ts          # HTTP request helpers
│   ├── db-helper.ts           # Direct Supabase DB helpers
│   └── test-data.ts           # Shared test data, routes, constants
├── specs/
│   ├── auth/
│   │   ├── login.spec.ts      # TC-L01–L08
│   │   ├── otp.spec.ts        # TC-OTP01–05
│   │   └── signup.spec.ts     # TC-SU01–05
│   ├── dashboard/
│   │   └── dashboard.spec.ts  # TC-DASH01–06
│   ├── sessions/
│   │   └── registration.spec.ts # TC-SR01–07
│   ├── membership/
│   │   └── membership.spec.ts # TC-MEM01–10
│   ├── community/
│   │   └── community.spec.ts  # TC-COM01–07
│   ├── leaderboard/
│   │   └── leaderboard.spec.ts # TC-LB01–08
│   ├── admin/
│   │   └── admin.spec.ts      # TC-ADM01–08
│   ├── coach/
│   │   └── coach.spec.ts      # TC-COACH01–06
│   └── security/
│       └── security.spec.ts   # SEC-01–12
└── suites/
    ├── smoke.ts               # Smoke test list (< 10 min)
    └── release-validation.ts  # Release gate test list
```

---

## Karate API Tests

### 1. Setup

```bash
cd tests/automation/karate
# No npm needed — pure Java/Maven
```

### 2. Run Suites

```bash
# Smoke (fast — key APIs only)
mvn test -Dtest=SmokeRunner -Dkarate.env=local

# Full regression
mvn test -Dtest=RegressionRunner -Dkarate.env=local

# Security only
mvn test -Dtest=SecurityRunner -Dkarate.env=local

# With env vars
BASE_URL=http://localhost:3000 \
TEST_EMAIL=qa@test.com \
TEST_PASSWORD=Pass@123 \
ADMIN_PASSWORD=admin \
CRON_SECRET=secret \
mvn test -Dtest=SmokeRunner
```

### 3. Project Structure

```
karate/
├── pom.xml
└── src/test/
    ├── java/runner/
    │   ├── SmokeRunner.java
    │   ├── RegressionRunner.java
    │   └── SecurityRunner.java
    └── resources/
        ├── karate-config.js           # Global config + env vars
        ├── helpers/
        │   └── auth-helper.feature    # Reusable login helper
        ├── auth/login.feature         # TC-API-AUTH01–10
        ├── sessions/sessions.feature  # TC-API-SES01–08
        ├── membership/membership.feature # TC-API-MEM01–08
        ├── leaderboard/leaderboard.feature # TC-API-LB01–08
        ├── notifications/notifications.feature # TC-API-NOT01–07
        ├── referrals/referrals.feature # TC-API-REF01–05
        ├── community/community.feature # TC-API-COM01–07
        ├── admin/admin.feature        # TC-API-ADM01–08
        └── coach/coach.feature        # TC-API-COACH01–06
```

---

## GitHub Actions CI/CD

### Workflows

| Workflow | Trigger | What runs |
|----------|---------|-----------|
| `pr-validation.yml` | Every PR to main/staging | Build → API Smoke → UI Smoke → Security → Deployment Gate |
| `regression.yml` | Nightly 2 AM UTC + manual | Full Karate + Playwright regression |

### Required GitHub Secrets

Add these in `Settings → Secrets → Actions`:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
ADMIN_PASSWORD
CRON_SECRET
COACH_TOKEN_SECRET
TEST_EMAIL
TEST_PASSWORD
TEST_EMAIL_2
```

---

## Test Tagging Strategy

| Tag | Meaning | Karate | Playwright |
|-----|---------|--------|------------|
| `@smoke` | Fast sanity check (< 10 min) | ✅ | `--grep @smoke` |
| `@regression` | Full regression run | ✅ | default |
| `@security` | Security/auth tests | ✅ | project: security |
| `@release` | Pre-deployment gate | - | `--grep @release` |
| `@ignore` | Skipped (helpers) | ✅ | - |

---

## Test Data Strategy

| Concern | Approach |
|---------|----------|
| Test users | Dedicated `qa-user@connectedsteps.test` accounts in Supabase |
| DB setup | `DbHelper` utility creates/cleans test data per test |
| Auth state | Playwright stores session in `playwright/.auth/*.json` |
| Cleanup | `afterEach`/`finally` blocks in test files revert DB changes |
| Concurrency | `workers: 1` in CI (sequential, no interference) |
| Env vars | `.env.test` locally; GitHub Secrets in CI |

---

## Coverage Estimate After Automation

| Suite | Tests | Coverage Area |
|-------|-------|---------------|
| Playwright UI | 55 specs | 70% UI coverage |
| Karate API | 65 scenarios | 80% API coverage |
| Security (both) | 25 checks | Auth, RLS, rate limits |
| **Total** | **~145** | **~85% overall** |

---

## Automation vs Manual Decision Map

| Test | Type | Reason |
|------|------|--------|
| Login, OTP, Signup | Automated (Playwright + Karate) | High frequency, stable |
| Rate limiting | Automated (Karate) | Exact threshold checking |
| Payment (happy path) | Automated (Karate mock) | Razorpay test mode |
| Concurrent checkout | Manual | Real browser timing needed |
| Realtime RSVP | Automated (Playwright) | WebSocket observable |
| Multi-tab sync | Manual | Hard to coordinate |
| Push notification on mobile | Manual | Native OS required |
| Leaderboard idempotency | Automated (Karate) | DB state verifiable |
| Admin bulk broadcast | Manual | Side effects (real emails) |
| Coach training plan display | Automated (Playwright) | UI + DB combination |
| Stripe payment replay | Automated (Karate) | Sig tamper via API |
| XSS injection | Automated (Karate) | API response inspection |
| iOS Safari payment flow | Manual | Real device needed |
