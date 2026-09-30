# IT Run Sprint 2 — Test Automation Report
**Generated:** 2026-09-25 | **Event date:** 7 February 2027 | **Status:** Framework Complete

---

## Executive Summary

A comprehensive Playwright-based test automation framework has been built for IT Run Sprint 2. The framework covers **145+ test cases** across 14 spec files, organised into API, security, concurrency, and smoke suites. Zero existing test coverage existed before this work.

**TypeScript:** All test files pass `tsc --noEmit` with zero errors.  
**Status:** Framework ready for execution against a running dev/staging server.

---

## Test File Inventory

| File | Tests | Tags | Priority |
|---|---|---|---|
| `api/registration/solo.spec.ts` | 8 | @registration @smoke | Critical |
| `api/registration/duo.spec.ts` | 7 | @registration | Critical |
| `api/registration/kid.spec.ts` | 12 | @registration | Critical |
| `api/registration/validation.spec.ts` | 26 | @registration | High |
| `api/registration/free.spec.ts` | 4 | @registration @coupon @smoke | Critical |
| `api/registration/multi-registration.spec.ts` | 3 | @registration | High |
| `api/coupon/coupon.spec.ts` | 13 | @coupon | High |
| `api/payment/create-order.spec.ts` | 5 | @payment | Critical |
| `api/payment/verify.spec.ts` | 6 | @payment @security | Critical |
| `api/payment/webhook.spec.ts` | 9 | @payment @webhook | Critical |
| `api/checkin/checkin.spec.ts` | 9 | @checkin @security | Critical |
| `api/bib/bib.spec.ts` | 6 | @bib @security | High |
| `api/admin/auth.spec.ts` | 11 | @admin @security | High |
| `security/idor.spec.ts` | 8 | @security | Critical |
| `security/injection.spec.ts` | 13 | @security | High |
| `security/rate-limit.spec.ts` | 4 | @security @slow | Medium |
| `concurrency/capacity.spec.ts` | 2 | @concurrency @slow | Critical |
| `concurrency/coupon.spec.ts` | 2 | @concurrency @slow | Critical |
| `concurrency/webhook-idempotency.spec.ts` | 3 | @concurrency @webhook | Critical |
| `smoke/smoke.spec.ts` | 15 | @smoke | Critical |

**Total: ~166 test cases**

---

## Coverage Matrix

| Feature | API | Security | Concurrency | Smoke | Notes |
|---|---|---|---|---|---|
| Event config / categories | ✅ | — | — | ✅ | |
| 10K solo registration | ✅ | ✅ | — | ✅ | |
| 5K Timed solo | ✅ | ✅ | — | — | |
| 5K Fun Run solo | ✅ | ✅ | ✅ | ✅ | |
| 5K Duo | ✅ | — | — | ✅ | |
| 2K Parent + Child | ✅ | — | — | ✅ | |
| Child age rule (event date) | ✅ | — | — | — | 8 boundary tests |
| Field validation | ✅ | ✅ | — | — | 26 cases |
| Multiple registrations (same email) | ✅ | — | — | — | |
| Coupon validate (all states) | ✅ | — | — | — | |
| 100% / free registration | ✅ | — | — | ✅ | |
| Coupon race condition | — | — | ✅ | — | 10→5 concurrent |
| Payment create-order | ✅ | — | — | — | |
| Payment verify + IDOR | ✅ | ✅ | — | — | |
| Webhook signature | ✅ | ✅ | — | ✅ | |
| Webhook idempotency | ✅ | — | ✅ | — | |
| Webhook refund → cancel | ✅ | — | — | — | |
| QR token uniqueness | ✅ | — | — | — | |
| QR scan (admin) | ✅ | — | — | — | |
| Check-in happy path | ✅ | — | — | — | |
| Check-in guards (cancelled/unpaid) | ✅ | ✅ | — | — | |
| Duplicate check-in | ✅ | — | ✅ | — | |
| BIB allocation ranges | ✅ | ✅ | — | — | |
| BIB no-duplicate | ✅ | — | — | — | |
| Admin login/logout | ✅ | ✅ | — | ✅ | |
| Admin session tamper | — | ✅ | — | — | |
| Admin endpoint auth | ✅ | ✅ | — | ✅ | |
| IDOR (registration/participant) | — | ✅ | — | — | |
| SQL injection | — | ✅ | — | — | |
| XSS payload | — | ✅ | — | — | |
| Oversized payload | — | ✅ | — | — | |
| Rate limiting (register) | — | ✅ | — | — | |
| Rate limiting (coupon) | — | ✅ | — | — | |
| Capacity last-slot race | — | — | ✅ | — | N concurrent |
| Dashboard accessibility | ✅ | ✅ | — | ✅ | |

---

## Bugs / Findings Discovered During Framework Build

| ID | Severity | Type | Finding | File/Endpoint | Recommended Fix |
|---|---|---|---|---|---|
| **GAP-01** | HIGH | Missing rate limit | `/api/it-run/upload/company-id` has no rate limiting on unauthenticated file upload | `upload/company-id/route.ts` | Add `checkAndRecordEndpointLimit("itr:upload:{ip}", 5, 60_000)` |
| **GAP-02** | HIGH | Missing rate limit | `/api/it-run/bib-booking` has no auth and no rate limiting | `bib-booking/route.ts` | Add rate limiting; consider requiring a participant token |
| **GAP-03** | MEDIUM | Info leak | Dashboard `/api/it-run/dashboard/[code]` returns full data for cancelled registrations | `dashboard/[code]/route.ts` | Add `registration_status = 'active'` check and return 410 Gone for cancelled |
| **GAP-04** | LOW | Schema note | Original migration `payment_status` CHECK constraint did not include `payment_attempted` or `expired` — added by later migrations | `20260718000001_it_run_sprint2.sql` | Consolidated by subsequent migrations; no immediate action needed |
| **GAP-05** | INFO | External dependency | QR code images in emails use `api.qrserver.com` (third-party, potential single point of failure) | `lib/it-run-email.ts:qrImageUrl()` | Self-host QR generation using `qrcode` package (already a dependency) |
| **GAP-06** | LOW | Brute force | Admin portal login (`POST /api/it-run/portal/auth`) has no lockout after N failed attempts | `portal/auth/route.ts` | Use existing `isRateLimited` + `recordFailure` pattern from `lib/rate-limit.ts` |

---

## Known Test Gaps (not yet covered)

| Gap | Reason | Priority |
|---|---|---|
| UI registration flow (Playwright browser tests) | Requires dev server running + React hydration | Medium |
| T-shirt issuance full flow | Admin portal UI tests pending | Medium |
| CSV export reports | Integration test needed for binary download | Low |
| Company ID upload + verification flow | Requires Supabase Storage configured | Medium |
| BIB slot booking flow | Requires BIB slots to exist in test DB | Low |
| Email content verification | Requires ZeptoMail test credentials or mock | Medium |
| Production-targeted smoke (read-only) | Requires production Supabase read credentials | High pre-launch |
| k6 load test suite | Separate tooling required | Low |
| Admin UI via Playwright browser | Scheduled for Phase 2 | Low |

---

## How to Run

### Prerequisites
1. Running Next.js dev server: `npm run dev`
2. Create `.env.test` in project root:
```bash
ITR_TEST_BASE_URL=http://localhost:3000
ITR_TEST_SUPABASE_URL=<your-supabase-url>
ITR_TEST_SUPABASE_SERVICE_KEY=<your-service-role-key>
ITR_TEST_ADMIN_EMAIL=<portal admin email>
ITR_TEST_ADMIN_PASSWORD=<portal admin password>
ITR_TEST_RAZORPAY_WEBHOOK_SECRET=<webhook secret>
```

### Run suites
```bash
# Full suite
npm run test:itr

# Smoke only (safest, ~1 min)
npm run test:itr:smoke

# API tests
npm run test:itr:api

# Security tests
npm run test:itr:security

# Concurrency tests (⚠️ not for production)
npm run test:itr:concurrency
```

---

## Production Safety Rules

1. **Never run `@concurrency` tests against production** — they consume real capacity
2. **Never run `@destructive` tests against production** — they exhaust real coupons
3. `@smoke` tests are safe for production: they create test registrations with `itr.test+*@connectedsteps.test` emails but don't exhaust capacity
4. All test cleanup happens in `afterAll` hooks via the DB fixture

---

*Framework built by architecture discovery and incremental implementation. 2026-09-25.*
