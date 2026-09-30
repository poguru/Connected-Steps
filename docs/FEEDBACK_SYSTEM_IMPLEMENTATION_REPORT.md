# Post-Event Participant Feedback System — Implementation Report

**Date:** 2026-09-30  
**Status:** Implementation complete — migration pending Supabase Dashboard apply  
**Architect / Implementer:** Claude Sonnet 4.6 (co-authored with connected.steps2106@gmail.com)

---

## 1. Overview

A reusable, ADDITIVE post-event participant feedback system was implemented across 7 phases. The system supports IT Run events (using the standalone `it_run_events` table) and generic Connected Steps events (using `public.events`). No existing production flows were modified.

---

## 2. Architecture Decision: Dual FK

`it_run_events` has NO foreign key to `public.events` — they are separate entities. The `event_feedback` table uses two nullable FK columns with an XOR CHECK constraint:

```sql
event_id        UUID REFERENCES public.events(id) ON DELETE CASCADE,
it_run_event_id UUID REFERENCES public.it_run_events(id) ON DELETE CASCADE,
CONSTRAINT ef_event_xor CHECK (
  (event_id IS NOT NULL AND it_run_event_id IS NULL) OR
  (event_id IS NULL AND it_run_event_id IS NOT NULL)
)
```

Uniqueness is enforced via partial indexes (one per event type), not a single composite UNIQUE.

---

## 3. Files Changed or Created

### 3.1 New Database Migration

| File | Lines | Description |
|------|-------|-------------|
| `supabase/migrations/20261001000001_event_feedback.sql` | 203 | `event_feedback` + `event_feedback_invitations` tables, RLS, service_role policies, triggers |

**⚠️ ACTION REQUIRED:** Apply this migration in the Supabase Dashboard SQL Editor before deploying. It has NOT been applied automatically (local Docker not running).

### 3.2 New API Routes

| File | Lines | Description |
|------|-------|-------------|
| `app/api/it-run/feedback/route.ts` | 333 | GET (check submission) + POST (submit) — registration-code auth, no login required |
| `app/api/it-run/admin/feedback/route.ts` | 175 | GET (list, paginated, filtered) + PATCH (moderation, issue management) |
| `app/api/it-run/admin/feedback/summary/route.ts` | 158 | GET — avg ratings, NPS, distribution, improvement areas frequency |
| `app/api/it-run/admin/feedback/export/route.ts` | 119 | GET — CSV export with Content-Disposition header |
| `app/api/events/[eventId]/feedback/route.ts` | 288 | Generic CS events: GET (public aggregate) + POST (submit via event_registrations) |
| `app/api/cron/send-feedback-invitations/route.ts` | 415 | Cron job: initial invite ~2h post-event, single reminder ~24h later |

### 3.3 New UI Pages

| File | Lines | Description |
|------|-------|-------------|
| `app/it-run/admin/feedback/page.tsx` | 740 | Admin dashboard: Dashboard / Feedback / Issues / Analytics / Export tabs |
| `app/it-run/feedback/page.tsx` | 476 | Participant-facing mobile-first feedback form (no login required) |

### 3.4 Modified Existing Files

| File | Change |
|------|--------|
| `app/it-run/admin/layout.tsx` | Added "Feedback" nav item (roles: super_admin, event_admin) before Staff Management |
| `vercel.json` | Added `send-feedback-invitations` cron at `0 4 * * *` (4 AM IST) |

### 3.5 New Test Specs

| File | Tests | Description |
|------|-------|-------------|
| `tests/it-run/api/feedback/submit.spec.ts` | 18 | Field validation, invalid codes, rate limiting, XSS |
| `tests/it-run/api/feedback/admin.spec.ts` | 17 | Auth blocks, list/summary/export shape, PATCH validation |
| `tests/it-run/security/feedback-idor.spec.ts` | 17 | IDOR, unauthorized access, role escalation, SQL injection, XSS, malformed payloads |

---

## 4. Database Schema

### `event_feedback`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `event_id` | UUID nullable FK → `public.events` | XOR with it_run_event_id |
| `it_run_event_id` | UUID nullable FK → `it_run_events` | XOR with event_id |
| `registration_id` | UUID nullable | |
| `registration_code` | TEXT nullable | |
| `submitter_email` | TEXT NOT NULL | |
| `submitter_name` | TEXT nullable | |
| `overall_rating` | INT 1–5 | |
| `organisation_rating` | INT 1–5 nullable | |
| `route_rating` | INT 1–5 nullable | |
| `support_rating` | INT 1–5 nullable | |
| `comment` | TEXT default '' | HTML-stripped server-side |
| `would_recommend` | BOOLEAN nullable | |
| `nps_score` | INT 0–10 nullable | |
| `improvement_areas` | TEXT[] default '{}' | 19 valid values enforced server-side |
| `is_flagged` | BOOLEAN default false | |
| `is_published` | BOOLEAN default true | |
| `admin_notes` | TEXT nullable | |
| `issue_status` | TEXT default 'none' | none / open / in_progress / resolved / closed |
| `issue_priority` | TEXT nullable | low / medium / high / critical |
| `issue_assigned_to` | TEXT nullable | |
| `issue_resolved_at` | TIMESTAMPTZ nullable | Auto-set on transition to resolved/closed |
| `issue_resolution` | TEXT nullable | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | Auto-updated via trigger |

**Partial unique indexes:**
- `UNIQUE (event_id, submitter_email) WHERE event_id IS NOT NULL`
- `UNIQUE (it_run_event_id, submitter_email) WHERE it_run_event_id IS NOT NULL`

### `event_feedback_invitations`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `event_id` / `it_run_event_id` | UUID nullable (XOR) | Same dual-FK pattern |
| `registration_id` | UUID nullable | |
| `email` | TEXT NOT NULL | |
| `channel` | TEXT default 'email' | |
| `invite_type` | TEXT default 'initial' | initial / reminder |
| `send_status` | TEXT default 'pending' | pending / sent / failed |
| `sent_at` | TIMESTAMPTZ nullable | |
| `feedback_submitted` | BOOLEAN default false | Marked true when feedback inserted |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

---

## 5. API Contract

### Participant API (IT Run)

```
GET  /api/it-run/feedback?code={regCode}
  → 200 { feedback: {...} | null }  — own feedback if already submitted
  → 400 missing code
  → 404 code not found

POST /api/it-run/feedback
  Body: { registration_code, overall_rating, organisation_rating?, route_rating?,
          support_rating?, comment?, would_recommend?, nps_score?, improvement_areas? }
  → 200 { success: true }
  → 400 validation error
  → 403 event not completed | unpaid | cancelled
  → 409 already submitted
  → 429 rate limited (3 req / 60s per IP)
```

### Admin API (IT Run)

```
GET    /api/it-run/admin/feedback?event_id=&page=&per_page=&flagged_only=&issue_status=&min_rating=&max_rating=&search=
GET    /api/it-run/admin/feedback/summary?event_id=
GET    /api/it-run/admin/feedback/export?event_id=   → CSV
PATCH  /api/it-run/admin/feedback
  Body: { id, is_flagged?, is_published?, admin_notes?, issue_status?,
          issue_priority?, issue_assigned_to?, issue_resolution? }
```

All admin endpoints: `requireRole(req, ["event_admin"])` — super_admin bypasses.

### Generic CS Events API

```
GET  /api/events/{eventId}/feedback?email=   → public aggregate (no PII) + own feedback
POST /api/events/{eventId}/feedback
  Body: { registration_code, overall_rating, ... }  — same shape as IT Run
```

---

## 6. Cron Job

**Path:** `/api/cron/send-feedback-invitations`  
**Schedule:** `0 4 * * *` (04:00 IST daily)  
**Max duration:** 300s  
**Idempotency:** `acquireCronLock("send-feedback-invitations", today)` → `cron_runs` table  
**Logic:**
1. Find IT Run events whose `event_date` ended 2–48 hours ago
2. For each eligible event: send initial invite to all paid, non-cancelled participants (skipping if already sent)
3. Send reminder to participants who received initial invite >24h ago and haven't submitted feedback
4. Max 200 sends per run; releases lock on fatal error

**Does NOT modify:** `email_campaigns`, `claim_batch_emails`, or `email-sender` cron.

---

## 7. Security Controls

| Control | Implementation |
|---------|---------------|
| Auth (participant) | Registration code in body; validated against `it_run_registrations` |
| Auth (admin) | `requireRole(req, ["event_admin"])` — portal session cookie |
| Rate limiting | `checkAndRecordEndpointLimit("itr:feedback:{ip}", 3, 60_000)` |
| IDOR prevention | Registration code → email tied together; no client-supplied event_id accepted |
| Duplicate prevention | DB partial unique index + 409 response; catches race via pg error code `23505` |
| Input validation | `overall_rating` 1–5, `nps_score` 0–10, `improvement_areas` whitelist (19 values), `organisation/route/support_rating` 1–5 |
| XSS prevention | `sanitizeComment()` strips all HTML tags before insert |
| SQL injection | Supabase parameterized queries throughout; no string interpolation in queries |
| Oversized payload | `comment` truncated to 2000 chars server-side |
| PII protection | Admin export includes email; public aggregate strips emails entirely |
| Audit logging | Best-effort `it_run_audit_logs` insert on every admin PATCH |

---

## 8. Test Results

### TypeScript
- **Result:** 0 errors
- **Scope:** All 9 new files + 2 modified files

### Jest (unit tests)
- **Result:** 824 passed, 7 failed
- **Note:** All 7 failures are pre-existing in unrelated test files:
  - `__tests__/lib/streak-utils.test.ts` (pre-existing)
  - `__tests__/api/guest-registration.test.ts` (pre-existing)
  - `__tests__/api/event-registration.test.ts` (pre-existing)
- **Confirmed:** Failures are identical with and without feedback system files (git stash verified)
- **Zero feedback-related unit test failures**

### Playwright — New Feedback Specs (discovered, require live server)
- **`tests/it-run/api/feedback/submit.spec.ts`** — 18 tests
- **`tests/it-run/api/feedback/admin.spec.ts`** — 17 tests
- **`tests/it-run/security/feedback-idor.spec.ts`** — 17 tests
- **Total:** 52 tests discovered by Playwright config
- **Status:** Require `ITR_TEST_BASE_URL` (running Next.js instance) + `ITR_TEST_ADMIN_EMAIL` / `ITR_TEST_ADMIN_PASSWORD`

### Playwright — Existing Regression Suite (last run)
- **4 passed** (concurrency: capacity, coupon, participant count)
- **3 failed** (pre-existing: webhook dedup, duplicate check-in) — not related to feedback system
- **Note:** These failures pre-date this implementation

---

## 9. Production Deployment Steps

1. **Apply migration** in Supabase Dashboard SQL Editor:
   ```
   supabase/migrations/20261001000001_event_feedback.sql
   ```
   This creates `event_feedback`, `event_feedback_invitations`, their RLS policies, indexes, and triggers.

2. **Verify Vercel cron** — `send-feedback-invitations` at `0 4 * * *` is already in `vercel.json`.

3. **Deploy to Vercel** — standard `git push`. All new routes are additive.

4. **Verify feedback page** at `/it-run/feedback?code={validCode}` (after event completes).

5. **Verify admin page** at `/it-run/admin/feedback` (requires event_admin or super_admin session).

6. **Run Playwright feedback tests** against staging/production:
   ```bash
   ITR_TEST_BASE_URL=https://staging.connectedsteps.in \
   ITR_TEST_ADMIN_EMAIL=admin@example.com \
   ITR_TEST_ADMIN_PASSWORD=... \
   npm run test:itr:api -- --grep @feedback
   ```

---

## 10. Known Limitations

1. **Feedback window not enforced on the upper end** — participants can submit feedback any time after event completion, indefinitely.
2. **No CAPTCHA** — rate limiting (3/60s per IP) is the only bot protection.
3. **Supabase generated types** — `event_feedback` and `event_feedback_invitations` are not in generated TypeScript types until `supabase gen types` is re-run. Current code uses explicit type casts (`as unknown as TypeName`).
4. **Generic events feedback UI** — Phase 7 API is complete, but no dedicated participant UI page exists for generic CS events. The IT Run feedback page (`/it-run/feedback`) is IT Run-specific. Future work: create `/events/{eventId}/feedback` page reusing the same form components.
5. **Cron sends initial invite on first run only** — if the cron misses the 48h window (e.g., deployment lag), no invite is sent. This is intentional to avoid late surprises.
6. **No read receipts** — invitation `feedback_submitted` flag is set when feedback is inserted, not when the email is opened.

---

## 11. Existing Systems — Regression Verification

The following systems were NOT modified and remain intact:

| System | Files Touched | Verdict |
|--------|--------------|---------|
| IT Run registration | ✗ | Safe |
| Payment / Razorpay | ✗ | Safe |
| Coupon validation | ✗ | Safe |
| Capacity management | ✗ | Safe |
| QR generation / validation | ✗ | Safe |
| Check-in logic | ✗ | Safe |
| BIB allocation | ✗ | Safe |
| T-shirt distribution | ✗ | Safe |
| Event lifecycle | ✗ | Safe |
| Email sender cron | ✗ | Safe |
| Session feedback system | ✗ | Safe |
| Admin auth / RBAC | ✗ | Safe |
| IT Run admin layout | ✓ (nav item added only) | Safe |
| vercel.json | ✓ (cron entry added only) | Safe |
