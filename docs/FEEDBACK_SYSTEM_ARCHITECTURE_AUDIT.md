# Post-Event Participant Feedback System — Architecture Audit

**Date:** 2026-09-30  
**Status:** Read-only audit — no code changes made  
**Scope:** Reusable feedback system for IT Run Sprint 2 and all future Connected Steps event types

---

## A. Current Architecture

### Two parallel event systems

**System 1 — CS Generic Platform** (older, community/training events)

| Table | Key columns | Notes |
|-------|-------------|-------|
| `events` | `id`, `title`, `event_type`, `start_date`, `end_date`, `status (draft\|published)` | All event types |
| `event_registrations` | `id`, `registration_code`, `event_id`, `user_email`, `payment_status`, `status` | One row per registration |
| `event_participants` | `id`, `registration_id`, `event_id`, `account_email`, `email`, `qr_token` | Added migration 20260722000005 |
| `event_portal_users` | `id`, `email`, `name`, `password_hash` | Generic portal staff |
| `event_portal_assignments` | `portal_user_id`, `event_id`, `role` | UNIQUE(user, event, role) |
| `event_service_logs` | `event_id`, `participant_id`, `service_name`, `action` | Full audit trail |

**System 2 — IT Run Portal** (newer, race-specific)

| Table | Key columns | Notes |
|-------|-------------|-------|
| `it_run_events` | `id`, `event_id (FK→events)`, `registration_config (JSONB)` | Extends `events` |
| `it_run_registrations` | `id`, `event_id`, `registration_code`, `lead_email`, `payment_status`, `registration_status` | IT Run specific |
| `it_run_participants` | `id`, `registration_id`, `participant_type (solo\|primary\|secondary\|parent\|child)`, `bib_number` | Per-participant |
| `it_run_checkins` | `participant_id`, `checked_in_at`, `checked_in_by` | UNIQUE(participant_id) |
| `it_run_tshirt_issuances` | `participant_id` | UNIQUE(participant_id) |
| `it_run_portal_users` | IT Run-specific staff table | Separate from `event_portal_users` |
| `it_run_audit_logs` | `event_id`, `actor_email`, `actor_role`, `action`, `entity_type` | IT Run audit trail |

### Auth systems

| System | Cookie | Session TTL | Roles |
|--------|--------|-------------|-------|
| CS Platform admin | `cs_admin_session` | 30 days | admin only |
| CS Platform user | `cs_user_session` | 90 days | authenticated user |
| IT Run portal | `it_run_portal_session` | 8 hours | super_admin, event_admin, verification_team, bib_collection, checkin_team, support_desk |

### Lifecycle engine

`lib/event-lifecycle.ts` is shared across both systems:
- States: `registration_not_open → registration_open → registration_closed → event_live → completed`
- `getLifecycle(event)` returns `{ state, isCompleted, canRegister, isLive, ... }`
- **Trigger point for feedback:** `isCompleted === true` (after `end_date` + `end_time` in IST)

---

## B. Existing Reusable Components

### Session feedback precedent (`session_feedback`)

`app/api/sessions/[id]/feedback/route.ts` already implements the exact pattern needed:

```
POST /api/sessions/{id}/feedback
  → checks session_attendance.attended = true
  → upserts UNIQUE(session_id, user_email) in session_feedback
  → rating 1–5, comment required
GET /api/sessions/{id}/feedback
  → strips user_email from public list, returns own feedback separately
```

This is the direct architectural model for event feedback. It proves:
- Gate by attendance (we gate by `payment_status = paid | free` + check-in)
- One submission per user per event
- Admin reads full data; public strip PII

### Email infrastructure (ZeptoMail)

- `lib/email-service.ts`: `sendSingleEmail()`, `sendBatchEmails()`
- `email_queue` → cron `/api/cron/email-sender` (every minute, FOR UPDATE SKIP LOCKED)
- `email_campaigns` → `claim_batch_emails()` with worker mutex
- Both have idempotency protection
- **Can send feedback invitation emails to all confirmed participants post-event**

### WhatsApp infrastructure (Meta Cloud API)

- `lib/whatsapp.ts`: `sendWhatsAppTemplate(phone, templateName, params)`
- Existing templates: `run_registration`, `cs_otp_verification`, etc.
- **A new `event_feedback_invitation` template can be added for feedback nudge**

### Notification/cron infrastructure

- `cron_runs` with UNIQUE(job_name, execution_date) prevents double-fire
- `acquireCronLock()` / `releaseCronLock()` in `lib/cron-lock.ts`
- Pattern: triggered at event completion, process in batches with FOR UPDATE SKIP LOCKED
- **A new cron job `send-feedback-invitations` fits exactly this pattern**

### Rate limiting

- `checkAndRecordEndpointLimit()`: 5 req/min/IP for register/payment, 10/min for coupon
- **Feedback submissions should have their own slot: 3 req/min/IP is sufficient**

---

## C. Existing Notification Infrastructure

| Channel | Mechanism | Batch support | Notes |
|---------|-----------|---------------|-------|
| Email | ZeptoMail via `email_queue` | Yes — `sendBatchEmails()` | Preferred for post-event invitations |
| WhatsApp | Meta Cloud API v19.0 | Sequential only | Template approval required |
| In-app | `notifications` table (20260610000004) | N/A | Push-style, not email |

The `email_campaigns` table can target `event_registered` segment. A new segment type `event_confirmed_participants` would cover IT Run participants by event_id.

---

## D. Existing Database Tables That Can Be Reused

| Table | Role in feedback system |
|-------|------------------------|
| `events` | Source of truth for event identity and lifecycle state |
| `event_registrations` | Links feedback to generic CS platform registrations |
| `it_run_registrations` | Links feedback to IT Run registrations |
| `it_run_participants` | Per-participant gate: paid/free + optionally checked-in |
| `it_run_checkins` | Optional secondary gate: "attended" (parallel to `session_attendance.attended`) |
| `email_queue` | Delivery vehicle for feedback invitation emails |
| `email_logs` | Tracks per-address send status |
| `it_run_audit_logs` | Admin actions on feedback (delete, flag) should be logged here |

**Not reusable as-is:**
- `session_feedback` — scoped to training sessions, not events. Schema does not include `event_id` or `participant_id`. Do not repurpose; create a separate table.

---

## E. New Tables Required

### 1. `event_feedback` — core feedback store

```sql
CREATE TABLE public.event_feedback (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event linkage (always set)
  event_id            UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,

  -- Submitter identity — one of these will be set depending on event type
  registration_code   TEXT,       -- IT Run or generic CS (human-readable, not FK)
  participant_id      UUID,       -- it_run_participants.id (IT Run per-participant)
  registration_id     UUID,       -- event_registrations.id (generic CS events)

  -- Submitter email (always set — used for UNIQUE gate and display)
  submitter_email     TEXT        NOT NULL,
  submitter_name      TEXT,

  -- Content
  overall_rating      SMALLINT    NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  organisation_rating SMALLINT    CHECK (organisation_rating BETWEEN 1 AND 5),
  route_rating        SMALLINT    CHECK (route_rating BETWEEN 1 AND 5),
  support_rating      SMALLINT    CHECK (support_rating BETWEEN 1 AND 5),
  comment             TEXT        NOT NULL DEFAULT '',
  would_recommend     BOOLEAN,
  improvement_areas   TEXT[],     -- ['registration', 'route', 'tshirts', 'checkin', etc.]

  -- Admin fields
  is_flagged          BOOLEAN     NOT NULL DEFAULT false,
  is_published        BOOLEAN     NOT NULL DEFAULT true,
  admin_notes         TEXT,

  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One submission per submitter per event
  UNIQUE (event_id, submitter_email)
);

CREATE INDEX event_feedback_event_idx       ON public.event_feedback (event_id, created_at DESC);
CREATE INDEX event_feedback_submitter_idx   ON public.event_feedback (submitter_email);
CREATE INDEX event_feedback_rating_idx      ON public.event_feedback (event_id, overall_rating);

ALTER TABLE public.event_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.event_feedback
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### 2. `event_feedback_invitations` — invitation send tracking

```sql
CREATE TABLE public.event_feedback_invitations (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  email               TEXT        NOT NULL,
  channel             TEXT        NOT NULL DEFAULT 'email',  -- 'email' | 'whatsapp'
  sent_at             TIMESTAMPTZ,
  send_status         TEXT        NOT NULL DEFAULT 'pending',  -- 'pending' | 'sent' | 'failed'
  feedback_submitted  BOOLEAN     NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (event_id, email, channel)
);

CREATE INDEX efbi_event_pending_idx ON public.event_feedback_invitations (event_id, send_status)
  WHERE send_status = 'pending';

ALTER TABLE public.event_feedback_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.event_feedback_invitations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

**Why two tables:** The `event_feedback` table is for submitted feedback; the `event_feedback_invitations` table tracks whether the invitation email was sent. This mirrors the `confirmation_email_sent_at` idempotency pattern already in `it_run_registrations`.

---

## F. APIs That Should Be Created

### Public participant-facing

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/events/[eventId]/feedback` | None | Public aggregate: avg ratings, count, published comments (no emails) |
| `POST` | `/api/events/[eventId]/feedback` | Registration code (body) | Submit feedback. Gate: event completed + code is valid + paid/free + not already submitted |
| `GET` | `/api/events/[eventId]/feedback/my` | Registration code (query param) | Own submitted feedback for pre-fill |

### IT Run participant-facing (separate from generic events)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/it-run/feedback` | registration_code (body) | Submit IT Run feedback. Gate: event completed + code valid + paid/free |
| `GET` | `/api/it-run/feedback` | registration_code (query) | Own submitted feedback |

### Admin (IT Run portal — event_admin + super_admin)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/it-run/admin/feedback` | IT Run portal session | List all feedback for event (full data incl. emails) |
| `PATCH` | `/api/it-run/admin/feedback` | IT Run portal session | Flag/unflag, toggle published, add admin_notes |
| `GET` | `/api/it-run/admin/feedback/summary` | IT Run portal session | Aggregate stats: avg per dimension, NPS-style, improvement areas |
| `POST` | `/api/it-run/admin/feedback/send-invitations` | super_admin only | Manually trigger invitation batch for event |

### Admin (CS platform admin)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/events/[eventId]/feedback` | CS admin session | Generic event feedback list |

### Cron

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/cron/send-feedback-invitations` | Fires daily after events complete. Inserts `event_feedback_invitations` rows, queues emails via `email_queue`. Idempotent via `cron_runs`. |

---

## G. Admin Pages That Should Be Created

### IT Run admin

| Path | Role gate | Description |
|------|-----------|-------------|
| `/it-run/admin/feedback` | event_admin, super_admin | Table of all feedback. Columns: name, category, overall ★, ratings breakdown, comment excerpt, date. Flag/unflag, toggle visibility. |
| `/it-run/admin/feedback/summary` | event_admin, super_admin | Summary dashboard: avg ratings per dimension as bar chart, # responses, response rate %, word frequency from improvement_areas, top/bottom comments. |

### CS platform admin (existing admin layout)

| Path | Role gate | Description |
|------|-----------|-------------|
| `/admin/events/[eventId]/feedback` | CS admin | Same as IT Run variant but for generic events. |

---

## H. Participant Feedback Flow

```
1. EVENT COMPLETES
   └─ getLifecycle(event).isCompleted === true
   └─ Cron job: send-feedback-invitations (fires daily)
       └─ For each event completed in last 48h with no invitation sent:
           └─ INSERT event_feedback_invitations (pending) for each paid/free participant
           └─ Queue email via email_queue → cron/email-sender delivers
           └─ Mark send_status = 'sent'

2. PARTICIPANT RECEIVES EMAIL
   └─ "How was your experience at IT Run 2026?"
   └─ Link: https://connectedsteps.in/it-run/feedback?code=ITRUN2-XXXXXXXX
   └─ Or: https://connectedsteps.in/events/{slug}/feedback?code=CSXXX-XXXXXXXX

3. PARTICIPANT SUBMITS FEEDBACK
   POST /api/it-run/feedback
     body: { registration_code, overall_rating, organisation_rating, route_rating,
             support_rating, comment, would_recommend, improvement_areas }
   Gates:
     ✓ Event status = completed
     ✓ Registration code maps to a real registration
     ✓ payment_status IN ('paid', 'free')
     ✓ registration_status != 'cancelled'
     ✓ No existing feedback for (event_id, submitter_email)
   On success:
     → INSERT event_feedback
     → UPDATE event_feedback_invitations SET feedback_submitted = true
     → 200 { success: true }
   Duplicate:
     → 409 { already: true, feedback: { ... } }

4. ADMIN REVIEWS
   /it-run/admin/feedback
     → Table of all submissions
     → Flag/unflag, toggle published, add notes
     → Export CSV

5. PUBLIC DISPLAY (optional future)
   GET /api/events/[eventId]/feedback
     → published = true, emails stripped
     → avg_rating, count, recent comments
```

---

## I. Automation Requirements

### New Playwright specs needed

| File | Coverage |
|------|----------|
| `tests/it-run/api/feedback/submit.spec.ts` | Happy path submit, duplicate guard (409), wrong code (400), unpaid gate (403), cancelled gate (403), event not completed gate (403) |
| `tests/it-run/api/feedback/admin.spec.ts` | Admin list, flag/unflag, summary endpoint. Requires `ADMIN_CREDS_AVAILABLE` guard. |
| `tests/it-run/security/feedback-idor.spec.ts` | Cannot read another user's feedback details; cannot submit for a code not yours; admin endpoint returns 401 without session |

### DB state verifications required

- After submit: `event_feedback` row exists with correct event_id + submitter_email
- After duplicate attempt: still only 1 row in `event_feedback`
- After admin flag: `is_flagged = true` in DB
- After invitation send: `event_feedback_invitations.send_status = 'sent'`

### Skip guards needed

- `FEEDBACK_EVENT_COMPLETED` — skip tests that require `status = completed` unless env provides a completed event ID
- `ADMIN_CREDS_AVAILABLE` — already established pattern, reuse

---

## J. Security Considerations

### Authentication / authorisation
- **Participants authenticate by registration code**, not by user session. This matches the existing dashboard pattern (`/api/it-run/dashboard/[code]`). No login required to submit feedback — the code IS the credential.
- Registration code must be validated: real code + event matches + paid/free + not cancelled.
- The `UNIQUE (event_id, submitter_email)` constraint prevents two different codes from the same email submitting twice (e.g., if a user registered twice — they still get one feedback slot).
- Admin endpoints: `requireRole('event_admin')` from `lib/it-run-auth.ts`, same pattern as all other admin APIs.

### IDOR risks and mitigations
- `GET /api/it-run/feedback?code=X` returns only the submitter's own feedback. No browsing other registrations' feedback.
- Admin list endpoint is gated by IT Run portal session cookie + role check. No public route exposes emails.
- `is_published = false` rows are not returned by the public aggregate endpoint.

### Rate limiting
- Feedback submit: 3 req/min/IP via `checkAndRecordEndpointLimit`. Prevents bulk scraping / spamming.
- Admin endpoints: no per-IP rate limit needed (portal session is the gate).

### Input validation
- `overall_rating BETWEEN 1 AND 5` enforced at DB level (CHECK constraint) and API level.
- `comment` sanitised: strip HTML, max 2000 chars.
- `improvement_areas` whitelist: only known values accepted (reject unknown strings).
- `would_recommend` boolean only.

### PII handling
- Public aggregate endpoint strips `submitter_email` (same pattern as `session_feedback`).
- Admin CSV export includes emails and is only accessible to event_admin/super_admin.
- `event_feedback_invitations` table contains emails — service role only, RLS blocks all public access.

---

## K. Potential Regression Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| New cron job `send-feedback-invitations` conflicts with existing cron slot | Low | Use UNIQUE(job_name, execution_date) in `cron_runs` with a distinct job name. No interference with `email-sender` or `session-reminders`. |
| `UNIQUE (event_id, submitter_email)` blocks a legitimate second submission from a duo participant with shared email | Medium | IT Run already has one lead_email per registration. Duo participants have separate emails in `it_run_participants`. Feedback submitter is keyed to `lead_email` of registration (not per-participant) — same design as all dashboard access. Document this. |
| New `event_feedback` table rows accumulate for all historical events | None | Table has cascade delete from `events`. Historical events won't get invitations unless admin manually triggers. |
| Admin feedback page added to IT Run admin nav breaks layout for checkin_team / bib_collection | Low | Add to nav only for `event_admin` and `super_admin` roles, mirroring the existing nav gate in `layout.tsx`. |
| `email_queue` throughput: large event (500 participants) queued at once | Low | `sendBatchEmails()` uses `concurrency=5`, `interBatchDelayMs=200` built-in. Cron processor uses FOR UPDATE SKIP LOCKED. No bottleneck for <1000 participants. |
| Feedback invitation email uses `api.qrserver.com` for QR embed → slow email load | N/A | Feedback emails do not need QR codes. Simple HTML email with direct link. |
| Session-scoped `session_feedback` table confused with new event feedback | None | Completely separate table and API routes. No namespace collision. |
| IT Run dashboard link at `/it-run/dashboard/[code]` already uses registration_code — feedback link can reuse same code | None | Deliberate reuse. Same code works for both dashboard and feedback. |

---

## L. Recommended Implementation Sequence

### Phase 1 — Database (1 migration file)
1. Create `event_feedback` table with RLS
2. Create `event_feedback_invitations` table with RLS
3. Add indexes
4. **Do NOT alter any existing table**

### Phase 2 — Core participant API (no UI)
5. `POST /api/it-run/feedback` — submit feedback (IT Run path)
6. `GET /api/it-run/feedback` — own feedback retrieval
7. Rate limit registration
8. Write `tests/it-run/api/feedback/submit.spec.ts`

### Phase 3 — Admin API
9. `GET /api/it-run/admin/feedback` — list with full data
10. `PATCH /api/it-run/admin/feedback` — flag/unflag/notes
11. `GET /api/it-run/admin/feedback/summary` — aggregate stats
12. Write `tests/it-run/api/feedback/admin.spec.ts`

### Phase 4 — Admin UI
13. `/it-run/admin/feedback` page — table with flag/unflag controls
14. `/it-run/admin/feedback/summary` page — ratings dashboard
15. Add nav item to `layout.tsx` for event_admin + super_admin only

### Phase 5 — Participant UI
16. `/it-run/feedback` page — submit form (stars + comment)
17. Show "already submitted" state with their previous answers
18. Mobile-first layout (required by project rules)

### Phase 6 — Email invitation system
19. `POST /api/cron/send-feedback-invitations` cron route
20. `it_run_registrations` export → build invitation list
21. Queue via `email_queue` with idempotency via `event_feedback_invitations`
22. Register in Vercel cron config (daily, morning after event)
23. Write cron spec

### Phase 7 — Generic events (non-IT-Run)
24. `POST /api/events/[eventId]/feedback` (generic CS platform path)
25. `/events/[slug]/feedback` participant page
26. `/admin/events/[eventId]/feedback` admin page
27. Reuse same `event_feedback` table — differentiated by event_id

---

## Proposed Database Schema

```sql
-- Migration: 20261001000001_event_feedback.sql

-- ── 1. event_feedback ────────────────────────────────────────────────────────
CREATE TABLE public.event_feedback (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  event_id            UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,

  -- Submitter linkage (one of these set depending on event type)
  registration_code   TEXT,
  participant_id      UUID        REFERENCES public.it_run_participants(id) ON DELETE SET NULL,
  registration_id     UUID        REFERENCES public.event_registrations(id) ON DELETE SET NULL,

  submitter_email     TEXT        NOT NULL,
  submitter_name      TEXT,

  -- Ratings (overall required, others optional)
  overall_rating      SMALLINT    NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  organisation_rating SMALLINT    CHECK (organisation_rating BETWEEN 1 AND 5),
  route_rating        SMALLINT    CHECK (route_rating BETWEEN 1 AND 5),
  support_rating      SMALLINT    CHECK (support_rating BETWEEN 1 AND 5),
  comment             TEXT        NOT NULL DEFAULT '',
  would_recommend     BOOLEAN,
  improvement_areas   TEXT[]      DEFAULT '{}',

  -- Moderation
  is_flagged          BOOLEAN     NOT NULL DEFAULT false,
  is_published        BOOLEAN     NOT NULL DEFAULT true,
  admin_notes         TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (event_id, submitter_email)
);

CREATE INDEX event_feedback_event_idx     ON public.event_feedback (event_id, created_at DESC);
CREATE INDEX event_feedback_submitter_idx ON public.event_feedback (submitter_email);
CREATE INDEX event_feedback_rating_idx    ON public.event_feedback (event_id, overall_rating);

ALTER TABLE public.event_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.event_feedback
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 2. event_feedback_invitations ────────────────────────────────────────────
CREATE TABLE public.event_feedback_invitations (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  email               TEXT        NOT NULL,
  channel             TEXT        NOT NULL DEFAULT 'email',
  sent_at             TIMESTAMPTZ,
  send_status         TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (send_status IN ('pending', 'sent', 'failed')),
  feedback_submitted  BOOLEAN     NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (event_id, email, channel)
);

CREATE INDEX efi_event_pending_idx
  ON public.event_feedback_invitations (event_id, send_status)
  WHERE send_status = 'pending';

ALTER TABLE public.event_feedback_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.event_feedback_invitations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

---

## Proposed API Contract

### `POST /api/it-run/feedback`

**Request**
```json
{
  "registration_code": "ITRUN2-A7BC9D2E",
  "overall_rating": 4,
  "organisation_rating": 5,
  "route_rating": 4,
  "support_rating": 3,
  "comment": "Great event! The route was well-marked but the water stations were a bit sparse.",
  "would_recommend": true,
  "improvement_areas": ["water_stations", "bag_drop"]
}
```

**Success `200`**
```json
{ "success": true }
```

**Duplicate `409`**
```json
{
  "already": true,
  "feedback": {
    "overall_rating": 4,
    "comment": "Great event!...",
    "created_at": "2026-09-28T09:14:00Z"
  }
}
```

**Gate failures**
```json
// 400 — invalid code
{ "error": "Invalid registration code" }

// 403 — not paid/free
{ "error": "Feedback is only available for confirmed registrations" }

// 403 — cancelled
{ "error": "This registration has been cancelled" }

// 403 — event not yet completed
{ "error": "Feedback opens after the event ends" }

// 400 — rating out of range
{ "error": "overall_rating must be between 1 and 5" }
```

---

### `GET /api/it-run/feedback?code=ITRUN2-A7BC9D2E`

**Success `200`** (own feedback found)
```json
{
  "feedback": {
    "overall_rating": 4,
    "organisation_rating": 5,
    "route_rating": 4,
    "support_rating": 3,
    "comment": "Great event!...",
    "would_recommend": true,
    "improvement_areas": ["water_stations"],
    "created_at": "2026-09-28T09:14:00Z"
  }
}
```

**`200`** (not yet submitted)
```json
{ "feedback": null }
```

---

### `GET /api/it-run/admin/feedback` (admin session required)

Query params: `event_id` (required), `page` (default 1), `per_page` (default 50), `flagged_only` (boolean)

**Success `200`**
```json
{
  "feedback": [
    {
      "id": "uuid",
      "registration_code": "ITRUN2-A7BC9D2E",
      "submitter_email": "runner@example.com",
      "submitter_name": "Aditya Kumar",
      "overall_rating": 4,
      "organisation_rating": 5,
      "route_rating": 4,
      "support_rating": 3,
      "comment": "Great event!...",
      "would_recommend": true,
      "improvement_areas": ["water_stations"],
      "is_flagged": false,
      "is_published": true,
      "created_at": "2026-09-28T09:14:00Z"
    }
  ],
  "total": 124,
  "page": 1
}
```

---

### `GET /api/it-run/admin/feedback/summary` (admin session required)

Query param: `event_id` (required)

**Success `200`**
```json
{
  "total_responses": 124,
  "response_rate_pct": 31.7,
  "avg_overall": 4.2,
  "avg_organisation": 4.5,
  "avg_route": 3.9,
  "avg_support": 3.7,
  "would_recommend_pct": 84.7,
  "improvement_areas_frequency": {
    "water_stations": 34,
    "bag_drop": 18,
    "checkin_queue": 12
  },
  "rating_distribution": {
    "1": 3,
    "2": 8,
    "3": 22,
    "4": 51,
    "5": 40
  }
}
```

---

### `PATCH /api/it-run/admin/feedback` (admin session required)

**Request**
```json
{
  "id": "feedback-uuid",
  "is_flagged": true,
  "is_published": false,
  "admin_notes": "Abusive content — removed from public display"
}
```

**Success `200`**
```json
{ "success": true }
```

---

### `POST /api/cron/send-feedback-invitations`

Triggered by Vercel Cron. Protected by `CRON_SECRET` header (same pattern as `email-sender`).

**Process:**
1. Acquire `cron_runs` lock for `send-feedback-invitations` + today's date
2. Query events where `getLifecycle` state = completed within the last 48 hours
3. For each event: fetch all paid/free, non-cancelled registrations (or IT Run participants)
4. `INSERT INTO event_feedback_invitations ... ON CONFLICT DO NOTHING`
5. For pending invitations: queue email via `email_queue`
6. Mark `send_status = 'sent'`
7. Release cron lock

**No response body** — returns `200 { ok: true }` on success, `409 { error: 'lock_held' }` if already running.

---

*This document is an audit output only. No code was modified during its production.*
