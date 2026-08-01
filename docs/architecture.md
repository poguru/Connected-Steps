# Connected Steps — Architecture Guide

**Version 4.0 · 2026-08-02**

---

## System Overview

Connected Steps is a multi-tenant SaaS platform for running event management. It serves three primary user groups: **event organizers** (admin UI), **participants** (web + mobile app), and **third-party integrators** (REST API v1 + webhooks).

```
┌─────────────────────────────────────────────────────────┐
│                     Vercel Edge Network                  │
│  ┌─────────────┐   ┌──────────────┐   ┌─────────────┐  │
│  │  Web App    │   │  Admin UI    │   │  API v1     │  │
│  │  (Next.js)  │   │  /admin/**   │   │  /api/v1/** │  │
│  └──────┬──────┘   └──────┬───────┘   └──────┬──────┘  │
└─────────┼────────────────┼──────────────────┼──────────┘
          │                │                  │
          ▼                ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│               Next.js API Routes (/api/**)               │
│  Auth layer → Business logic → Supabase service role    │
└────────────────────────┬────────────────────────────────┘
                         │
          ┌──────────────┼──────────────────┐
          ▼              ▼                  ▼
   ┌─────────────┐ ┌──────────┐    ┌──────────────┐
   │  Supabase   │ │ ZeptoMail│    │   Razorpay   │
   │  (Postgres  │ │  (Email) │    │  (Payments)  │
   │   + Storage │ └──────────┘    └──────────────┘
   │   + RLS)    │
   └──────┬──────┘
          │
   ┌──────▼──────────────────────────────┐
   │         job_queue (Postgres)        │
   │  Webhook delivery · CSV import      │
   │  Email batch · Certificate gen      │
   └─────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js | 16.2.4 |
| Language | TypeScript | 5.x |
| Runtime | Node.js | 20 LTS |
| Database | Supabase (PostgreSQL 15) | latest |
| Storage | Supabase Storage | — |
| Auth | Cookie-based session (bcrypt) | — |
| Email | ZeptoMail (Zoho) | — |
| SMS/WhatsApp | Meta Cloud API + MSG91 | — |
| Payments | Razorpay | — |
| Mobile | Capacitor (iOS + Android) | 8.x |
| Hosting | Vercel | — |
| CSS | Tailwind CSS | 4.x |
| Rich Text | Tiptap | 3.x |
| Testing | Jest + Playwright + Karate | — |

---

## Repository Structure

```
connected-steps/
├── app/                          # Next.js App Router
│   ├── admin/                    # Admin UI pages
│   │   ├── developer/            # Developer portal (API keys, webhooks, automations)
│   │   ├── events/[id]/          # Per-event management pages
│   │   ├── finance/              # Finance dashboard + payouts
│   │   ├── orgs/                 # Multi-org management
│   │   └── ...                   # 60+ admin pages
│   ├── api/                      # API route handlers
│   │   ├── admin/                # Protected admin API (cookie auth)
│   │   │   ├── api-keys/         # API key CRUD + rotate + usage
│   │   │   ├── webhooks/         # Webhook subscription + delivery + test
│   │   │   ├── import/           # CSV import pipeline
│   │   │   ├── connectors/       # Third-party connector management
│   │   │   ├── automations/      # Event automation rules
│   │   │   └── monitoring/       # Usage + webhook + rate limit stats
│   │   ├── v1/                   # Public REST API (API key auth)
│   │   │   ├── events/           # Events + event registrations
│   │   │   ├── registrations/    # Registrations CRUD
│   │   │   ├── participants/     # Participants read
│   │   │   ├── memberships/      # Membership read
│   │   │   ├── merchandise/      # Product catalogue
│   │   │   └── finance/          # Finance summary
│   │   ├── events/               # Public event registration flows
│   │   ├── webhooks/             # Inbound webhooks (Razorpay, ZeptoMail, Meta)
│   │   └── health/               # Health probe endpoint
│   └── ...                       # Public pages (home, achievements, etc.)
├── lib/                          # Server-side shared utilities
│   ├── api-key.ts                # Key generation, hashing, scope checking
│   ├── v1-auth.ts                # v1 API auth middleware + pagination helpers
│   ├── webhook-dispatch.ts       # Outbound webhook dispatch
│   ├── automation-engine.ts      # Rule evaluation engine
│   ├── connectors/index.ts       # Connector registry + adapter interface
│   ├── csv-utils.ts              # CSV parsing + row validation
│   ├── org-auth.ts               # Org session, RBAC, permission matrix
│   ├── admin-auth.ts             # Admin cookie auth
│   ├── job-queue.ts              # Job enqueue
│   ├── job-handlers.ts           # Job type handlers
│   ├── email-service.ts          # ZeptoMail transactional email
│   ├── finance-service.ts        # Revenue aggregation
│   ├── logger.ts                 # Structured JSON logger
│   ├── rate-limit.ts             # Redis-backed rate limiting
│   └── supabase-server.ts        # Service-role Supabase client
├── supabase/migrations/          # 100+ ordered SQL migrations
├── __tests__/                    # Jest test suites
│   ├── api/                      # API-layer tests (27 files)
│   ├── integration/              # Integration tests (4 files)
│   ├── lib/                      # Library unit tests (5 files)
│   └── mobile/                   # Mobile service tests (1 file)
├── mobile/                       # Capacitor mobile app source
├── docs/                         # This documentation
└── .github/workflows/            # CI/CD pipelines
```

---

## Authentication Model

### Admin UI (Cookie Auth)
- `POST /api/admin/auth/login` — bcrypt password check against `ADMIN_PASSWORD`; sets `cs_admin_session` HttpOnly cookie (30-day TTL, `SameSite=Lax`)
- Every admin API route calls `verifyAdminSession(req)` before processing
- Org context: `getOrgContext(req)` reads `cs_org_session` cookie; resolves to an org membership row

### Public API v1 (API Key Auth)
- `Authorization: Bearer cs_live_<48 hex chars>` or `X-API-Key: <key>`
- `requireV1Auth(req, scope)` → looks up `key_prefix` (first 12 chars) in `api_keys` table → `crypto.timingSafeEqual(sha256(raw), stored_hash)` → scope check
- API usage logged to `api_usage_log` after each response (fire-and-forget)

### Inbound Webhooks
- **Razorpay**: HMAC-SHA256 signature on raw body using `RAZORPAY_WEBHOOK_SECRET`
- **Meta WhatsApp**: `X-Hub-Signature-256` verified against `META_WA_WEBHOOK_SECRET`
- **ZeptoMail bounces**: Bearer token in Authorization header

---

## Multi-Tenancy and Data Isolation

All event/registration/participant/member data carries an `organization_id` column. The default organisation `00000000-0000-0000-0000-000000000001` holds pre-multi-org data.

Key isolation guarantees:
1. **v1 API**: every query includes `.eq("organization_id", ctx.organization_id)` — injected by auth middleware, not caller
2. **Admin API**: `getOrgContext(req)` + `canAccessOrg()` gate every route; `writeOrgAudit()` records mutations
3. **Supabase RLS**: all tables have `ENABLE ROW LEVEL SECURITY`; `anon` and `authenticated` roles are revoked; only `service_role` has access (all server routes use the service-role key)

---

## Job Queue

The `job_queue` Postgres table provides durable async processing:

```
Enqueue (enqueueJob)  →  job_queue row (status=pending)
                                ↓
Job worker (cron, /api/cron/*)  →  handler function  →  marks done/failed
```

Job types:
- `deliver_webhook` — outbound webhook HTTP delivery with retry + signing
- `import_csv` — commit a validated CSV import into target tables
- `send_email_batch` — bulk email dispatch via ZeptoMail
- `generate_certificate` — PDF certificate generation
- `process_refund` — async Razorpay refund processing

Dead jobs (5 failed attempts) appear in `/api/admin/dead-letters` for manual review. The `/api/health` endpoint counts dead jobs and returns 503 if any exist.

---

## Webhook Architecture (Outbound)

```
Business event (registration, payment, check-in)
        ↓
dispatchWebhookEvent(org_id, event_type, payload)
        ↓
Query active subscriptions for org + event type
        ↓ (for each subscription)
Create webhook_delivery_log row (status=pending)
        ↓
enqueueJob("deliver_webhook", { delivery_id })
        ↓
Job worker: sign payload, HTTP POST, update log
        ↓
On failure: exponential back-off, max 5 attempts → "dead"
```

Signing: `HMAC-SHA256("${timestamp}.${JSON.stringify(payload)}")` → `X-CS-Signature: t=<ms>,sha256=<hex>`

---

## Integration Platform — API Key Lifecycle

```
POST /api/admin/api-keys
  → crypto.randomBytes(24).hex()  →  cs_live_<48 hex>
  → key_prefix = rawKey.slice(0,12)
  → key_hash   = sha256(rawKey)
  → Store prefix + hash (raw key returned ONCE)

GET /api/v1/... (Authorization: Bearer cs_live_...)
  → Extract key_prefix
  → SELECT * FROM api_keys WHERE key_prefix = $1 AND is_active
  → timingSafeEqual(sha256(incoming), stored hash)
  → Check scope + expiry
  → Log to api_usage_log (fire-and-forget)
```

---

## Automation Rules Engine

```
Trigger event fires (same events as webhooks)
        ↓
evaluateAutomations(org_id, event_type, context)
        ↓
Fetch active rules WHERE trigger_event = $1 AND org_id = $2
        ↓ (for each rule)
Evaluate conditions (AND logic):
  - eq, neq, gt, lt, contains, not_contains
  - Skip rule if any condition fails
        ↓
Execute actions in sequence:
  - send_email → email-service.ts
  - send_webhook → dispatchWebhookEvent
  - notify_org → notify-inapp.ts
  - generate_certificate → certificate-generator.ts
  - add_to_waitlist → insert waitlist row
        ↓
Write automation_run_log (status, actions_taken, duration_ms)
```

---

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key (client-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role (server-side only) |
| `ADMIN_PASSWORD` | Yes | Admin portal password (bcrypt compared) |
| `CRON_SECRET` | Yes | Bearer token for cron job routes |
| `COACH_TOKEN_SECRET` | Yes | JWT secret for coach session tokens |
| `RAZORPAY_KEY_ID` | Yes | Razorpay live key ID |
| `RAZORPAY_KEY_SECRET` | Yes | Razorpay secret (never exposed client-side) |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Yes | Razorpay public key for checkout widget |
| `RAZORPAY_WEBHOOK_SECRET` | Yes | Razorpay inbound webhook verification |
| `ZEPTO_MAIL_API_KEY` | Yes | ZeptoMail transactional email |
| `META_WA_TOKEN` | Yes | Meta WhatsApp Cloud API bearer token |
| `META_WA_PHONE_ID` | Yes | Meta WhatsApp phone number ID |
| `META_WA_WEBHOOK_SECRET` | Yes | Meta webhook verify token |
| `MSG91_AUTH_KEY` | Yes | MSG91 OTP SMS auth key |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Yes | Web push VAPID public key |
| `VAPID_PRIVATE_KEY` | Yes | Web push VAPID private key |
| `NEXT_PUBLIC_APP_URL` | Yes | Canonical app URL |
| `UPSTASH_REDIS_REST_URL` | Optional | Redis cache (rate limiting) |
| `UPSTASH_REDIS_REST_TOKEN` | Optional | Redis auth token |
| `STRAVA_CLIENT_ID` | Optional | Strava OAuth client ID |
| `STRAVA_CLIENT_SECRET` | Optional | Strava OAuth client secret |
| `ADMIN_NOTIFY_EMAIL` | Optional | Fallback admin notification address (default: SUPPORT_EMAIL) |
| `ALERT_WEBHOOK_URL` | Optional | Slack/Discord URL for system alerts |
| `ZEPTOMAIL_FROM_EMAIL` | Optional | Verified sender address (default: info@connectedsteps.in) |
| `ZEPTOMAIL_FROM_NAME` | Optional | Sender display name (default: Connected Steps) |

---

## Cron Architecture

All crons require `Authorization: Bearer <CRON_SECRET>` (verified by `isCronAuthorized()` in `lib/cron-auth.ts`). On Vercel Pro, minute-level crons are available. `maxDuration: 300` applies to all cron routes.

| Route | Schedule | Purpose |
|---|---|---|
| `/api/cron/job-worker` | `* * * * *` (every minute) | Process `job_queue` rows: webhooks, CSV imports, certificates, refunds |
| `/api/cron/email-sender` | `* * * * *` (every minute) | Process large-campaign `email_campaigns` rows |
| `/api/cron/hourly-session-alerts` | `0 * * * *` (every hour) | Session reminders + daily QR distribution (05:00 IST check) |
| `/api/cron/daily-attendance-report` | `45 1 * * *` (1:45 AM UTC = 7:15 AM IST) | Daily attendance + system summary email |
| `/api/cron/birthday-emails` | Configured in settings | Birthday greeting emails |
| `/api/cron/weekly-digest` | `0 8 * * 0` (Sunday 8 AM UTC) | Weekly activity digest for active members |
| `/api/cron/media-cleanup` | Daily | Remove orphan uploaded files from storage |
| `/api/health` (Kubernetes probe) | External | Liveness check, returns 503 if dead jobs exist |

---

## Event Registration Flow

```
User loads /events/[slug]
        ↓
GET /api/events/[slug]  → event + race details + pricing

User selects race + fills form
        ↓
POST /api/events/[slug]/register
  └─ Validate capacity, user not already registered
  └─ razorpay.orders.create({ amount, currency, receipt })
  └─ Return { order_id, amount, key_id }
        ↓
Razorpay Checkout widget (client-side)
  └─ User completes payment
  └─ razorpay_payment_id, razorpay_order_id, razorpay_signature returned to client
        ↓
POST /api/payment/verify
  └─ HMAC verify: sha256(order_id + "|" + payment_id, RAZORPAY_KEY_SECRET)
  └─ INSERT event_registrations (status=confirmed, payment_status=paid)
  └─ INSERT event_participants (QR token generated)
  └─ sendEmail (confirmation with QR code PDF link)
  └─ dispatchWebhookEvent("registration.created", payload)
  └─ evaluateAutomations("registration.created", context)
        ↓
QR Code PDF at /api/registrations/[code]/qr
```

**Free events:** skip Razorpay entirely — `POST /api/events/[slug]/register-free` inserts directly.

**Race-day check-in:**
```
Volunteer scans QR → POST /api/admin/events/[id]/participants/check-in
  └─ Verify QR token → mark checked_in = true, checked_in_at = now()
  └─ Idempotent: duplicate scans are no-ops
```

---

## Payment Flow (General)

```
1. Order creation
   POST /api/events/[slug]/register
   └─ razorpay.orders.create → order_id stored in event_registrations.razorpay_order_id

2. Payment capture (client-side Razorpay)
   └─ razorpay_payment_id, razorpay_order_id, razorpay_signature returned

3. Signature verification
   POST /api/payment/verify
   └─ HMAC: sha256(`${order_id}|${payment_id}`, RAZORPAY_KEY_SECRET)
   └─ Registration marked paid, participant record created

4. Razorpay webhook (async, backup)
   POST /api/webhooks/razorpay
   └─ HMAC verify against RAZORPAY_WEBHOOK_SECRET
   └─ payment.captured → mark paid if not already
   └─ refund.processed → update refund_status

5. Refund
   POST /api/admin/events/[id]/registrations/[code]/cancel
   └─ razorpay.refunds.create({ payment_id, amount })
   └─ Refund ID stored, refund_status tracked
   └─ Idempotent: double-refund guard on refund_id column
```

---

## Leaderboard & Points Flow

```
Points sources:
  - Event registration: enqueueJob("award_points", { user_email, event_id, type:"event" })
  - Session attendance: enqueueJob("award_points", ..., type:"session")
  - Community post likes: incremental award
  - Referral: awarded on referred user's first event

Job handler (award_points):
  └─ INSERT INTO user_points (user_email, points, reason, awarded_at)
  └─ UPDATE leaderboard_summary (total_points, rank recomputed)
  └─ createNotification (in-app: "You earned X points!")

Leaderboard query:
  GET /api/leaderboard
  └─ SELECT user_email, total_points, rank FROM leaderboard_summary ORDER BY rank
  └─ Cached in app_settings for 15 minutes (avoid full table scan per request)

Admin leaderboard page:
  /admin/leaderboard → shows full leaderboard, manual point adjustments
```

---

## Coach / Volunteer Architecture

```
Coach portal: /coach/**
Auth: cs_user_token in localStorage (HMAC token, 30-day TTL)
  └─ Header: x-user-token: <base64url(email)>.<exp>.<hmac-sha256>
  └─ Server: verifyUserToken(token) → lowercase email or null

Coach home /coach → session schedule + attendance stats
Coach sessions /coach/sessions → create/manage sessions
Coach attendance /coach/sessions/[id]/attendance → QR check-in + manual mark

Sessions:
  sessions table (id, date, location, coach_email, capacity)
  session_attendance (session_id, user_email, checked_in_at, is_manual)
  UNIQUE INDEX: (session_id, user_email)

Volunteer portal (race-day):
  /admin/runs → race-day check-in for admin/volunteer
  GET /api/admin/events/[id]/participants?search=&status=
  POST /api/admin/events/[id]/participants/check-in { participant_ids: [] }
  Supports bulk check-in, search by name/bib/email
```

---

## Communication Architecture Reference

See [docs/communication-architecture.md](./communication-architecture.md) for the full email campaign system documentation, including:
- Small-campaign path (≤200 recipients via `after()`)
- Large-campaign path (>200 via email-sender cron)
- Retry flow, failure handling, recovery procedures
- Alert conditions and cooldown logic
