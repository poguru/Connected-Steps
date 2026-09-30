# IT Run Sprint 2 — Test Architecture
**Event:** The IT Run — Sprint 2 | **Date:** 7 February 2027 | **Document date:** 2026-09-25

---

## 1. Application Architecture Summary

### Technology Stack
- **Frontend/API:** Next.js 16.2.4 (App Router), React 19.2.4
- **Database:** Supabase PostgreSQL (service-role client, RLS enabled, anon/auth blocked)
- **Payments:** Razorpay (server-side SDK + webhook)
- **Email:** ZeptoMail via `lib/email-service.ts`
- **Rate limiting:** Supabase `rate_limit_store` → Upstash Redis → in-process Map (3-tier)
- **Auth (portal):** Custom HMAC-signed cookie sessions (`it_run_portal_session`, 8 h TTL)
- **Storage:** Supabase Storage bucket `it-run-company-ids`
- **Hosting:** Vercel (serverless functions)

### Two Authentication Systems
| System | Used for | Mechanism |
|---|---|---|
| Supabase JWT | Main app (coaching, events) | Supabase session cookie |
| IT Run Portal HMAC | IT Run staff portal only | `it_run_portal_session` HttpOnly cookie, 8 h TTL |

---

## 2. Event & Category Configuration

### Event: sprint-2
- **Event date:** 7 February 2027
- **Slug:** `sprint-2`

### Categories (confirmed from migration 20260925000018)
| Slug | Name | Distance | Type | Price (₹) | Participants | BIB range | Wave |
|---|---|---|---|---|---|---|---|
| `10k-timed` | 10K Timed Run | 10 km | solo | 999 | 1 | 1001-1999 | A |
| `5k-timed` | 5K Timed Run | 5 km | solo | 799 | 1 | 2001-2999 | A |
| `5k-fun-run` | 5K Fun Run | 5 km | solo | 649 | 1 | 3001-3999 | B |
| `5k-duo` | 5K Duo Challenge | 5 km | duo | 1399 | 2 | 4001-4999 | B |
| `2k-kid` | 2K Parent & Child Duo | 2 km | kid | 999 | 2 (parent+child) | 5001-5999 | C |

### T-Shirt Sizes (server-authoritative, from `register/route.ts`)
- **Adult:** `XS`, `S`, `M`, `L`, `XL`, `XXL`, `3XL`
- **Child:** `5-6Y`, `7-8Y`, `9-10Y`, `11-12Y`, `13-14Y`

### Child Age Rule
- Age is calculated **on the event date** (2027-02-07), NOT today
- Child must be **10 years or younger on the event date**
- Rule: `if (ageOnEventDay >= 11)` → rejected
- Edge: a child who turns 11 before 2027-02-07 is ineligible

---

## 3. Database Schema (Key Tables)

### it_run_registrations
```
id                   UUID PK
event_id             UUID FK → it_run_events
category_id          UUID FK → it_run_categories
registration_code    TEXT UNIQUE  (format: ITRUN2-XXXXXXXX, 8 chars from safe alphabet)
lead_email           TEXT
participant_count    INTEGER
base_price           INTEGER
discount_amount      INTEGER DEFAULT 0
final_price          INTEGER
coupon_id            UUID FK nullable
payment_status       TEXT CHECK IN ('pending','paid','failed','free','payment_attempted','expired')
registration_status  TEXT CHECK IN ('active','cancelled')  DEFAULT 'active'
razorpay_order_id    TEXT nullable
razorpay_payment_id  TEXT nullable
qr_token             TEXT nullable
admin_notes          TEXT nullable
cancelled_reason     TEXT nullable
cancelled_at         TIMESTAMPTZ nullable
created_at           TIMESTAMPTZ
updated_at           TIMESTAMPTZ
```

### it_run_participants
```
id                  UUID PK
registration_id     UUID FK → it_run_registrations (CASCADE DELETE)
event_id            UUID FK → it_run_events
participant_type    TEXT
first_name          TEXT
last_name           TEXT
gender              TEXT
dob                 DATE nullable
email               TEXT nullable (null for children)
mobile              TEXT NOT NULL
blood_group         TEXT nullable
emergency_name      TEXT nullable
emergency_phone     TEXT nullable
company_name        TEXT nullable
employee_id         TEXT nullable
company_id_url      TEXT nullable
tshirt_size         TEXT nullable
medical_conditions  TEXT nullable
food_preference     TEXT nullable
bib_number          TEXT nullable
wave                TEXT nullable
qr_token            TEXT nullable
verification_status TEXT  ('pending','verified','rejected','need_clarification')
collection_counter  INTEGER DEFAULT 0
```

### it_run_coupons
```
id             UUID PK
event_id       UUID FK
code           TEXT  UNIQUE(event_id, code)
discount_type  TEXT CHECK IN ('flat','percent')
discount_value NUMERIC(10,2)
max_uses       INTEGER nullable (null = unlimited)
use_count      INTEGER DEFAULT 0
min_amount     INTEGER nullable
expires_at     TIMESTAMPTZ nullable
is_active      BOOLEAN DEFAULT true
```

### Atomic RPCs
| RPC | Purpose | Lock strategy |
|---|---|---|
| `itr_use_coupon` | Increment use_count, return discount | FOR UPDATE on coupon row |
| `itr_release_coupon` | Decrement use_count on rollback | UPDATE |
| `itr_reserve_capacity` | Increment current_participants, expire stale pending | FOR UPDATE on category row |
| `itr_release_capacity` | Decrement current_participants | UPDATE |
| `itr_book_bib_slot` | Reserve a BIB collection slot | atomic INSERT |

---

## 4. Registration Flow State Machine

```
[POST /register] ─────────────────────────────────────────────────────┐
  │                                                                    │
  ├─ finalPrice > 0 → payment_status = "pending"                      │
  │     │                                                              │
  │     ├─ [POST /payment/create-order] → razorpay_order_id           │
  │     │     └─ payment_status = "payment_attempted"                 │
  │     │                                                              │
  │     ├─ [Client: Razorpay checkout]                                 │
  │     │     │                                                        │
  │     │     ├─ Success:                                              │
  │     │     │   ├─ [POST /payment/verify] → payment_status = "paid" │
  │     │     │   └─ [Webhook: payment.captured] → same (idempotent)  │
  │     │     │                                                        │
  │     │     └─ Failure → payment_status = "failed"                  │
  │     │                                                              │
  │     └─ [Webhook: refund.created] → registration_status="cancelled"│
  │                                                                    │
  └─ finalPrice = 0 → payment_status = "free"                        │
        └─ Email sent immediately in register route                   │
                                                                      │
[Paid/Free] → confirmation email sent (idempotent)                    │
           → QR tokens generated per participant                      │
           → BIB booking → BIB collection → Race-day check-in        │
```

---

## 5. Portal Roles & Access

| Role | Access level |
|---|---|
| `super_admin` | All operations + staff management |
| `event_admin` | All event operations |
| `verification_team` | View + update `verification_status` only |
| `bib_collection` | BIB collection + scan |
| `checkin_team` | Race-day check-in + scan |
| `support_desk` | View + update `admin_notes` only |

---

## 6. Public API Endpoints (no auth required)

| Endpoint | Method | Rate limit | Risk |
|---|---|---|---|
| `/api/it-run/event-config` | GET | None | Low |
| `/api/it-run/categories` | GET | None | Low |
| `/api/it-run/register` | POST | 5/min/IP | High |
| `/api/it-run/payment/create-order` | POST | 5/min/IP | High |
| `/api/it-run/payment/verify` | POST | 5/min/IP | High |
| `/api/it-run/coupons/validate` | POST | 10/min/IP | Medium |
| `/api/it-run/dashboard/[code]` | GET | None | Low |
| `/api/it-run/bib-booking` | POST | None | Medium |
| `/api/it-run/upload/company-id` | POST | None | Medium |
| `/api/it-run/portal/auth` | GET/POST/DELETE | None | High |
| `/api/webhooks/razorpay` | POST | None (HMAC auth) | Critical |

---

## 7. Known Gaps & Findings (pre-test)

| ID | Severity | Finding |
|---|---|---|
| GAP-01 | HIGH | No rate limiting on `/api/it-run/upload/company-id` (unauthenticated file upload) |
| GAP-02 | HIGH | No rate limiting on `/api/it-run/bib-booking` (no auth, no RL) |
| GAP-03 | MEDIUM | `/api/it-run/dashboard/[code]` returns data for cancelled registrations |
| GAP-04 | LOW | `payment_status` does not include `payment_attempted` in original migration CHECK constraint (added by later migration) |
| GAP-05 | INFO | External QR image service (`api.qrserver.com`) — single point of failure for email QR codes (dashboard fallback exists) |
| GAP-06 | INFO | Admin portal has no brute-force protection on login (no lockout after N failures) |

---

## 8. Test Directory Structure

```
tests/it-run/
  playwright.config.ts          # IT Run-specific Playwright config
  fixtures/
    auth.ts                     # Portal auth helpers (login, get cookie)
    db.ts                       # Direct DB helpers for test setup/teardown
    api.ts                      # API request context helpers
  helpers/
    data-factory.ts             # createParticipant(), createRegistration(), etc.
    assertions.ts               # Custom assertion helpers
    webhook.ts                  # Webhook payload builder + HMAC signer
    time.ts                     # Date calculation helpers (child age, event date)
  data/
    valid-participants.ts       # Pre-defined valid participant sets
    categories.ts               # Category IDs/slugs (fetched from live config)
  api/
    registration/
      solo.spec.ts              # Solo categories (10K, 5K timed, 5K fun)
      duo.spec.ts               # 5K Duo Challenge
      kid.spec.ts               # Parent + Child Duo
      validation.spec.ts        # Field validation exhaustive tests
      multi-registration.spec.ts# Same email multiple registrations
      free.spec.ts              # 100% coupon / free path
    coupon/
      coupon.spec.ts            # Coupon validation + all states
    payment/
      create-order.spec.ts      # Order creation
      verify.spec.ts            # Payment verification + IDOR protection
      webhook.spec.ts           # Webhook handler + idempotency
    checkin/
      checkin.spec.ts           # Check-in flow + guards
    bib/
      bib.spec.ts               # BIB allocation + collection
    admin/
      auth.spec.ts              # Portal login/logout/session
      registrations.spec.ts     # Admin registrations CRUD
      participants.spec.ts      # Admin participants CRUD
      tshirt.spec.ts            # T-shirt report + issuance
      coupons.spec.ts           # Coupon CRUD
      staff.spec.ts             # Staff management + RBAC
  security/
    auth.spec.ts                # Session tampering, expired tokens
    idor.spec.ts                # IDOR across registrations/participants
    injection.spec.ts           # SQL injection, XSS, oversized payloads
    rate-limit.spec.ts          # Rate limit enforcement
  concurrency/
    capacity.spec.ts            # Last-slot race (10 concurrent requests)
    coupon.spec.ts              # Over-redemption (20 concurrent, max 10)
    webhook-idempotency.spec.ts # Duplicate webhook delivery
    duplicate-register.spec.ts  # Double-submit detection
  smoke/
    smoke.spec.ts               # ~12 critical tests (@smoke tag)
  regression/
    regression.spec.ts          # Full regression suite
```

---

## 9. Test Data Strategy

- All test emails: `itr.test+{timestamp}@connectedsteps.test` (never delivered)
- All test mobiles: `9{9-digit-timestamp-suffix}` (never called)
- Test admin credentials: from `.env.test` only, never production
- Cleanup: every test that inserts data records IDs for deletion in `afterEach`
- Production guard: tests check `BASE_URL` and abort if pointing at production domain

---

## 10. Environment Variables Required for Testing

```bash
# .env.test (create locally, never commit)
ITR_TEST_BASE_URL=http://localhost:3000
ITR_TEST_SUPABASE_URL=<supabase project url>
ITR_TEST_SUPABASE_SERVICE_KEY=<service role key>
ITR_TEST_ADMIN_EMAIL=<portal admin email>
ITR_TEST_ADMIN_PASSWORD=<portal admin password>
ITR_TEST_RAZORPAY_WEBHOOK_SECRET=<webhook secret>
ITR_TEST_COACH_TOKEN_SECRET=<COACH_TOKEN_SECRET value>
```

---

## 11. Test Tags

| Tag | Scope |
|---|---|
| `@smoke` | ~12 critical tests for deployment verification |
| `@registration` | All registration API tests |
| `@payment` | Payment lifecycle tests |
| `@coupon` | Coupon logic tests |
| `@qr` | QR generation and verification |
| `@checkin` | Check-in system tests |
| `@admin` | Admin portal tests |
| `@security` | Auth, IDOR, injection tests |
| `@concurrency` | Race condition tests |
| `@slow` | Tests taking >10 s |
| `@destructive` | Tests that consume real coupons/capacity — NOT for production |

---

## 12. Production Safety Rules

1. **Never run `@destructive` tests against production**
2. All test data uses `itr.test+*` email domains
3. All capacity tests use a dedicated test category with large max_participants
4. Coupon concurrency tests use a test-only coupon created and deleted in the test
5. No real Razorpay payments in automated tests — webhook payloads are locally signed
6. `smoke.spec.ts` is read-only — it only verifies existing data/config, never mutates

---

*Generated 2026-09-25 via architecture discovery phase.*
