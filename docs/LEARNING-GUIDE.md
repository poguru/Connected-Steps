# Connected Steps — Developer Learning Guide

> **Who this is for:** You, the owner of this application, learning to read, debug, and change it independently.
> **Rule:** Understand before touching. Every section answers "where is it, how does it work, what breaks if I change it."

---

## Table of Contents

1. [Technology Stack](#1-technology-stack)
2. [Project Folder Structure](#2-project-folder-structure)
3. [How a Page Request Works](#3-how-a-page-request-works)
4. [Authentication Architecture](#4-authentication-architecture)
5. [Public Website Architecture](#5-public-website-architecture)
6. [Event System Architecture](#6-event-system-architecture)
7. [Registration & Payment Flow](#7-registration--payment-flow)
8. [Admin Architecture](#8-admin-architecture)
9. [Database Architecture](#9-database-architecture)
10. [Email Architecture](#10-email-architecture)
11. [WhatsApp Architecture](#11-whatsapp-architecture)
12. [Job Queue & Background Workers](#12-job-queue--background-workers)
13. [Cron Jobs](#13-cron-jobs)
14. [File Storage Architecture](#14-file-storage-architecture)
15. [Mobile App Architecture](#15-mobile-app-architecture)
16. [Deployment Architecture](#16-deployment-architecture)
17. [Top 20 Files to Learn First](#17-top-20-files-to-learn-first)
18. [Database Domain Map](#18-database-domain-map)
19. [API Route Map](#19-api-route-map)
20. [Risk Levels for Common Changes](#20-risk-levels-for-common-changes)
21. [Debugging Playbook](#21-debugging-playbook)
22. [Learning Curriculum](#22-learning-curriculum)

---

## 1. Technology Stack

These are the actual confirmed dependencies from `package.json` and the codebase.

| Technology | Version | Role |
|---|---|---|
| **Next.js** | 16.2.4 | Web framework (pages + API routes) |
| **React** | 19.2.4 | UI library |
| **TypeScript** | 5.x | Language |
| **Supabase** | @supabase/supabase-js 2.x | Database client (PostgreSQL) |
| **PostgreSQL** | via Supabase | Database |
| **Vercel** | — | Hosting + serverless functions + cron |
| **Razorpay** | 2.9.6 | Indian payment gateway |
| **ZeptoMail** | via SMTP/REST | Transactional email |
| **Meta WhatsApp API** | via Graph API | WhatsApp notifications |
| **Web Push** | web-push 3.6.7 | Browser push notifications |
| **Capacitor** | 8.4.0 | Wraps the web app into Android/iOS native shell |
| **Tailwind CSS** | 4.x | Utility CSS |
| **Tiptap** | 3.x | Rich text editor (campaigns, descriptions) |
| **Playwright** | 1.60.0 | End-to-end tests |
| **Jest** | 30.x | Unit tests |
| **bcryptjs** | 3.x | Password hashing |
| **qrcode** | 1.5.4 | QR code generation |
| **puppeteer-core + @sparticuz/chromium** | — | PDF generation (invoices, quotations) |
| **xlsx** | 0.18.5 | Excel export |

**Important:** Authentication is **not** Supabase Auth. It is a **custom HMAC token system** built in `lib/admin-auth.ts`. The `users` table is in your own PostgreSQL schema, not Supabase's `auth.users`.

---

## 2. Project Folder Structure

```
connected-steps/
│
├── app/                    ← Next.js App Router (pages + API routes)
│   ├── layout.tsx          ← Root HTML shell (fonts, global providers)
│   ├── page.tsx            ← Home page (/)
│   ├── events/             ← Public event pages
│   ├── dashboard/          ← Logged-in user dashboard
│   ├── admin/              ← Admin portal (protected)
│   ├── auth/               ← Login / OTP / signup pages
│   ├── ops/                ← Volunteer/ops portal
│   ├── coach/              ← Coach portal
│   ├── it-run/             ← Special event portal (IT Run)
│   └── api/                ← All API routes (server-side only)
│       ├── auth/           ← Login, OTP, register
│       ├── events/         ← Public event APIs
│       ├── admin/          ← Admin-only APIs
│       ├── cron/           ← Cron job endpoints
│       ├── webhooks/       ← Razorpay, Meta WA, ZeptoMail
│       └── v1/             ← External/partner API
│
├── components/             ← Reusable React components
│   ├── auth/               ← Login forms, OTP input
│   ├── events/             ← Event cards, registration button
│   ├── dashboard/          ← Dashboard widgets
│   ├── admin/              ← Admin UI components
│   ├── layout/             ← Navbar, footer, app nav
│   └── ui/                 ← Design system (Button, Card, Modal, Toast...)
│       └── ds/             ← Design system primitives
│
├── lib/                    ← Shared server-side utilities
│   ├── admin-auth.ts       ← Token signing/verification (CRITICAL)
│   ├── supabase-server.ts  ← Database client (server-side)
│   ├── supabase.ts         ← Database client (client-side)
│   ├── notify.ts           ← Email + WhatsApp sending
│   ├── job-queue.ts        ← Background job queue
│   ├── job-handlers.ts     ← What each job actually does
│   ├── email-service.ts    ← ZeptoMail email sending
│   ├── whatsapp.ts         ← Meta WhatsApp Graph API
│   ├── razorpay-security.ts← Payment signature verification
│   ├── event-lifecycle.ts  ← Event state machine (open/closed/live)
│   ├── rate-limit.ts       ← Per-IP/per-email rate limiting
│   └── config.ts           ← Environment variable constants
│
├── supabase/
│   └── migrations/         ← 144 SQL migration files (source of truth for schema)
│
├── proxy.ts                ← Next.js middleware (route protection + security headers)
├── vercel.json             ← Cron schedule + function timeouts
├── next.config.ts          ← CSP headers, image domains, redirects
├── capacitor.config.ts     ← Mobile app config
├── docs/                   ← Documentation (this file lives here)
└── __tests__/              ← Jest unit tests
    └── api/                ← API regression tests
```

---

## 3. How a Page Request Works

This is the single most important concept. Every user action follows this path:

```
Browser
  ↓
Vercel Edge (proxy.ts middleware runs first)
  ↓  checks cookies, redirects if protected route + not logged in
Next.js
  ↓
  ├── If URL = /some-page/     → renders app/some-page/page.tsx
  │     Server Component (default) — runs on server, fetches data, returns HTML
  │     OR Client Component ("use client") — runs in browser
  │
  └── If URL = /api/some/route → runs app/api/some/route/route.ts
        Receives NextRequest, returns NextResponse (JSON or HTML)
```

### Server Component vs Client Component

| | Server Component | Client Component |
|---|---|---|
| **Where it runs** | Vercel server | User's browser |
| **Can call DB directly?** | Yes | No |
| **Can use useState/useEffect?** | No | Yes |
| **File marker** | (nothing — default) | `"use client"` at top |
| **Example** | `app/events/[slug]/page.tsx` | `app/events/[slug]/register/page.tsx` |

**The event detail page** (`app/events/[slug]/page.tsx`) is a **Server Component** — it queries the database directly and returns pre-rendered HTML. That's why it loads fast with no loading spinner.

**The registration page** (`app/events/[slug]/register/page.tsx`) starts with `"use client"` — it needs `useState` to manage form steps, `useEffect` to fetch event data, and user interactions.

---

## 4. Authentication Architecture

### How it actually works (confirmed from code)

There is **no** Supabase Auth. Users are stored in your own `users` table in PostgreSQL.

**Login flow:**
```
User enters email + password
  ↓
POST /api/auth/login
  ↓
Look up users table by email or phone
  ↓
bcrypt.compare(password, user.password_hash)
  ↓
If valid → signUserToken(email)  [lib/admin-auth.ts]
  ↓
Token = base64(email).expiry_timestamp.HMAC-SHA256
  ↓
Stored TWO places:
  1. httpOnly cookie "cs_user_session" (secure, browser can't read with JS)
  2. Returned in JSON body as "userToken" (for mobile app localStorage)
```

**What the token contains:**
- The user's email (base64 encoded)
- An expiry timestamp (90 days)
- An HMAC signature using `COACH_TOKEN_SECRET` environment variable

**How APIs verify the user:**
```typescript
// In any API route:
const token = req.headers.get("x-user-token");
const email = verifyUserToken(token);  // returns null if invalid/expired
if (!email) return 401;
```

**The middleware (proxy.ts):**
- Runs on every request BEFORE the page or API loads
- Checks cookies for protected routes (`/dashboard`, `/admin`, `/coach`, `/ops`)
- Does a fast expiry check (not full HMAC — that happens in each API route)
- Redirects to login page if not authenticated

**Three separate auth systems:**

| Portal | Cookie | Token type | Table |
|---|---|---|---|
| Regular users | `cs_user_session` | User token | `users` |
| Admin/Coach | `cs_admin_session` / `cs_coach_session` | Coach token | `users` (role column) |
| Ops (volunteers) | Session-based | Event portal session | `event_portal_users` |

**OTP Login flow:**
```
POST /api/auth/send-otp → sends email OTP via ZeptoMail
POST /api/auth/verify-otp → checks OTP, creates user if new, returns token
```

**Key files:**
- `lib/admin-auth.ts` — signUserToken, verifyUserToken, signCoachToken
- `lib/client-auth.ts` — browser-side helpers (reads localStorage)
- `proxy.ts` — middleware route protection
- `app/api/auth/login/route.ts` — password login
- `app/api/auth/verify-otp/route.ts` — OTP login
- `app/auth/page.tsx` — login/signup UI

---

## 5. Public Website Architecture

**Pages a visitor can see without logging in:**

| URL | File | What it does |
|---|---|---|
| `/` | `app/page.tsx` | Home page — hero, features, sessions, events |
| `/events` | `app/events/page.tsx` | Event listing |
| `/events/[slug]` | `app/events/[slug]/page.tsx` | Single event detail |
| `/coaches` | `app/coaches/page.tsx` | Coach listing |
| `/leaderboard` | `app/leaderboard/page.tsx` | Public leaderboard |
| `/pricing` | `app/pricing/page.tsx` | Membership pricing |
| `/blog` | `app/blog/page.tsx` | Blog |

**Home page data source:**
The home page calls `/api/upcoming` to get upcoming sessions and events. That API returns both in a combined list sorted by date.

**Event detail page (`app/events/[slug]/page.tsx`):**
- Server Component — queries DB directly
- Fetches: event, races, sponsors, route maps, BIB centers
- Renders the complete event page (hero, countdown, race cards, CTA)
- Uses `getLifecycle(ev)` from `lib/event-lifecycle.ts` for state logic

---

## 6. Event System Architecture

### What an "event" is in the database

The `events` table is the master record. Around it:

```
events (master record)
  ├── event_races          ← race categories (5K, 10K, 21K), each with price + slots
  ├── event_registrations  ← one row per registered person
  ├── event_participants   ← participant detail rows (multi-participant support)
  ├── event_sponsors       ← sponsors shown on event page
  ├── event_route_maps     ← route map images/PDFs
  ├── bib_collection_centers ← pickup locations
  ├── event_form_fields    ← custom registration form fields
  ├── event_waitlist       ← waitlist entries
  ├── event_results        ← race result upload (timing)
  ├── event_comm_history   ← communication history (emails/WA sent)
  └── event_portal_users   ← volunteer/ops users for this event
```

### Event lifecycle states (from `lib/event-lifecycle.ts`)

```
registration_not_open  →  registration_open  →  registration_closed  →  event_live  →  completed
```

The transition is driven by:
- `registration_opens_at` — when registration opens (optional)
- `registration_closes_at` — when registration closes
- `start_date` / `start_time` — event start
- `end_date` / `end_time` — event end

### Capacity enforcement

Two levels:
1. **Event-level:** `events.max_participants` — total across all categories
2. **Race-level:** `event_races.max_slots` — per category limit

The `event_races.slot_reserved` column is incremented atomically at registration time using a PostgreSQL RPC function (`reserve_race_slot`) to prevent overselling.

---

## 7. Registration & Payment Flow

This is the most important flow. Every numbered step is confirmed from code.

```
Step 1: Visitor clicks "Register" on /events/[slug]
  ↓ RegisterButton.tsx checks localStorage for cs_user
  ↓ If not logged in → redirect to /auth?redirect=/events/[slug]/register

Step 2: /auth page — user logs in or signs up (OTP or password)
  ↓ On success → token stored in localStorage + httpOnly cookie
  ↓ Redirect to /events/[slug]/register

Step 3: /events/[slug]/register (app/events/[slug]/register/page.tsx)
  ↓ "use client" page — fetches event data via /api/events/by-slug
  ↓ Shows: event info, race category selection, form fields

Step 4: User fills the registration form
  ↓ Category selection → capacity check per category (slot_reserved < max_slots)
  ↓ Coupon entry → POST /api/coupons/validate
  ↓ Multi-participant? → shows participant rows

Step 5: User submits form
  ↓ POST /api/events/register
  ↓ Server validates: auth token, event exists, capacity, no duplicate
  ↓ If FREE event:
      → INSERT event_registrations (payment_status='free')
      → Generate QR code (lib/event-qr.ts)
      → Enqueue job: event_qr_email
      → Return { success: true, registration_code }
  ↓ If PAID event:
      → INSERT event_registrations (payment_status='pending')
      → POST /api/events/create-payment-order → Razorpay creates order
      → Return { requires_payment: true, order_id, final_price }

Step 6 (paid only): Razorpay checkout opens in browser
  ↓ User enters card/UPI details on Razorpay's page
  ↓ Razorpay calls back: { razorpay_order_id, razorpay_payment_id, razorpay_signature }

Step 7 (paid only): Payment verification
  ↓ POST /api/events/verify-payment
  ↓ verifyPaymentSignature(order_id, payment_id, signature) — HMAC-SHA256
  ↓ If valid → UPDATE event_registrations SET payment_status='paid'
  ↓ Enqueue job: event_qr_email + invoice_generate
  ↓ Return { success: true }

Step 8: Success page (/events/[slug]/register/success)
  ↓ Shows registration code, QR code
  ↓ Background job sends confirmation email + WhatsApp

Step 9 (background, via job queue):
  ↓ event_qr_email job → signs QR token → sends email with QR
  ↓ invoice_generate job → generates PDF invoice → sends email
```

**Key files for this flow:**
- `app/events/[slug]/register/page.tsx` — registration form UI
- `app/api/events/register/route.ts` — registration API (700+ lines, most critical)
- `app/api/events/create-payment-order/route.ts` — Razorpay order creation
- `app/api/events/verify-payment/route.ts` — payment verification
- `lib/event-qr.ts` — QR code signing
- `lib/job-queue.ts` — job enqueuing
- `lib/job-handlers.ts` — job execution

**Capacity safety:**
The `reserve_race_slot` RPC in PostgreSQL uses `FOR UPDATE` to atomically increment `slot_reserved`. This prevents two users from getting the last slot simultaneously.

**Duplicate prevention:**
`event_registrations` has a `UNIQUE(event_id, user_email)` constraint. A second registration for the same email + event returns a database error (23505).

---

## 8. Admin Architecture

**Access:** `/admin` — protected by middleware checking `cs_admin_session` cookie.

**Admin login:** `POST /api/admin/auth/login` — separate from user login.

**Key admin areas:**

| URL pattern | What it manages |
|---|---|
| `/admin/events` | Create, edit, publish events |
| `/admin/events/[id]/registrations` | View/manage registrations |
| `/admin/events/[id]/communicate` | Send emails/WhatsApp to participants |
| `/admin/campaigns` | Email campaigns (internal users) |
| `/admin/external-campaigns` | Email campaigns (external contacts) |
| `/admin/users` | User management |
| `/admin/finance` | Payments, invoices, payouts |
| `/admin/developer` | API keys, webhooks, monitoring |
| `/admin/system-health` | System health dashboard |

**Admin-only APIs:** All routes under `/api/admin/*` call `isAdminOrCoach(req)` from `lib/admin-auth.ts` before doing anything.

---

## 9. Database Architecture

**Connection:** `lib/supabase-server.ts` creates a Supabase client using the service role key (bypasses RLS). `lib/supabase.ts` is the client-side version (respects RLS, uses anon key).

**Migrations:** 144 SQL files in `supabase/migrations/`. They run in timestamp order. **Never edit a migration that has already run on production** — always add a new migration.

**How to find a table's full schema:** Search the migrations folder for `CREATE TABLE table_name` and then all `ALTER TABLE table_name ADD COLUMN` statements.

### Domain Map

**Users & Auth**
| Table | Purpose |
|---|---|
| `users` | Core user record: email, phone, password hash, name, role |
| `user_achievements` | Earned achievements |
| `user_integrations` | Fitness tracker connections (Strava, Garmin) |
| `user_notification_preferences` | Per-user notification opt-ins |
| `email_verification_tokens` | Email OTP tokens |
| `rate_limit_store` | Per-IP/per-email rate limit counters |
| `referral_codes` | User referral codes |
| `referrals` | Referral claims |

**Events**
| Table | Purpose |
|---|---|
| `events` | Master event record |
| `event_races` | Race categories (distance, price, slots) |
| `event_registrations` | One row per registered user |
| `event_participants` | Individual participant details (multi-participant) |
| `event_sponsors` | Sponsor logos shown on event page |
| `event_route_maps` | Route map images/PDFs |
| `event_waitlist` | Waitlist entries |
| `event_form_fields` | Custom form fields per event |
| `event_results` | Race results/timing data |
| `event_comm_history` | Record of communications sent |
| `bib_collection_centers` | BIB/kit pickup locations |
| `bib_slot_bookings` | BIB collection slot bookings |
| `event_portal_users` | Ops/volunteer accounts per event |

**Registrations & Payments**
| Table | Purpose |
|---|---|
| `event_registrations` | Registration + payment status + Razorpay IDs |
| `payment_order_log` | Every Razorpay order created |
| `invoices` | Auto-generated invoices for paid registrations |
| `manual_invoices` | Admin-created invoices |
| `manual_payments` | Manual payment records |
| `payouts` | Admin payout records |

**Sessions (training runs)**
| Table | Purpose |
|---|---|
| `sessions` | Training session records |
| `session_attendance` | Who attended which session |
| `session_qr_codes` | Daily QR codes for check-in |
| `daily_attendance_qr` | QR codes generated for each day |

**Membership**
| Table | Purpose |
|---|---|
| `membership_plans` | Plan definitions (price, duration) |
| `memberships` | Active member subscriptions |

**Communication**
| Table | Purpose |
|---|---|
| `email_queue` | Queued emails waiting to send |
| `email_logs` | History of sent emails |
| `email_campaigns` | Campaign records (internal users) |
| `external_contacts` | Non-user email contacts |
| `contact_lists` | Segmented contact lists |
| `wa_message_log` | WhatsApp message history |
| `comm_templates` | Reusable message templates |
| `notifications` | In-app notifications |

**Job Queue**
| Table | Purpose |
|---|---|
| `job_queue` | Background jobs pending/processing/done/dead |
| `cron_runs` | Log of cron executions |

**Finance**
| Table | Purpose |
|---|---|
| `quotations` | Sponsor quotations |
| `manual_invoices` | Manually created invoices |
| `financial_audit_log` | Every financial action |
| `gst_config` | GST rate configuration |

---

## 10. Email Architecture

**Provider:** ZeptoMail (Zoho). AWS SES was an earlier plan but was never adopted.

**Three separate email paths:**

### Path 1: Transactional (immediate, event-triggered)
```
Registration confirmed
  ↓
enqueueJob("event_qr_email", {...})   ← fast, returns immediately
  ↓
job_queue table (Postgres)
  ↓
/api/cron/job-worker (runs every minute via Vercel Cron)
  ↓
handleEventQrEmail() in lib/job-handlers.ts
  ↓
sendEmail() in lib/email-service.ts
  ↓
ZeptoMail API
```

**Key file:** `lib/notify.ts` — `sendEmail()` wraps `lib/email-service.ts`
**Key file:** `lib/job-handlers.ts` — what actually runs for each job type

### Path 2: Campaigns (batch, admin-triggered)
```
Admin creates campaign → /api/admin/campaigns
  ↓
email_campaigns table (status: draft)
  ↓
Admin clicks Send → /api/admin/campaigns/[id]/send
  ↓
Campaign worker splits audience into email_queue rows
  ↓
/api/cron/email-sender (runs every minute)
  ↓
Reads email_queue, sends batches, updates status
```

**Why campaigns can't depend on a browser tab:** The browser POST only starts the campaign. Actual sending happens via the cron job that runs independently every minute, regardless of whether the admin tab is open.

### Path 3: Scheduled emails
```
Admin schedules email → /api/admin/scheduled-emails
  ↓
Stored with future send_at timestamp
  ↓
/api/cron/process-scheduled-emails (runs daily at 18:30 IST)
  ↓
Picks up emails due for today, enqueues them
```

---

## 11. WhatsApp Architecture

**Provider:** Meta Cloud API (Facebook/WhatsApp Business Platform)

**How it works:**
```
lib/whatsapp.ts
  ↓
sendWhatsAppTemplate(phone, templateName, params)
  ↓
HTTP POST to https://graph.facebook.com/v18.0/{phone_number_id}/messages
  with Bearer token = WHATSAPP_TOKEN env var
  ↓
Meta sends the WhatsApp message to the user
  ↓
Delivery callback → POST /api/webhooks/meta-whatsapp
```

**Template-based only:** WhatsApp Business requires pre-approved templates for outbound messages. You cannot send free-form text until the user replies first.

**Key env vars:** `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_BUSINESS_ID`

**Templates used:** Session reminders, event registration confirmation, etc.

---

## 12. Job Queue & Background Workers

**Why a job queue?** API routes on Vercel time out (30 seconds for most routes). Long tasks like PDF generation, sending 500 emails, or generating certificates cannot block the API response. Instead the API enqueues a job and returns immediately.

**How it works:**
```
API route calls: enqueueJob("invoice_generate", { payload... })
  ↓
One INSERT into job_queue table (milliseconds)
  ↓
API returns 200 immediately
  ↓
(Meanwhile, every minute, Vercel Cron hits /api/cron/job-worker)
  ↓
Worker claims one pending job atomically (UPDATE ... RETURNING)
  ↓
Calls the right handler from lib/job-handlers.ts
  ↓
On success → marks job "done"
On failure → increments attempts, schedules retry
After 3 failures → marks job "dead"
```

**Job types** (from `lib/job-queue.ts`):
- `invoice_generate` — PDF invoice + email
- `event_qr_email` — QR code + confirmation email
- `membership_email` — membership confirmation
- `referral_reward` — process referral
- `weekly_digest_email` — weekly summary email
- `bulk_email` — one email in a batch campaign
- `bulk_invoice` — one invoice in a backfill batch
- `certificate_generate` — participation certificate
- `admin_export` — CSV/ZIP data export
- `deliver_webhook` — outbound webhook delivery
- `import_csv` — process CSV import

**Dead letter:** Failed jobs that exhaust retries become `status='dead'`. Admin can see them at `/admin/developer`.

---

## 13. Cron Jobs

All cron jobs are defined in `vercel.json`. Vercel hits these URLs on the schedule. They are protected by `CRON_SECRET` in `lib/cron-auth.ts`.

| URL | Schedule | What it does |
|---|---|---|
| `/api/cron/job-worker` | Every minute | Processes background job queue |
| `/api/cron/email-sender` | Every minute | Sends batches from email_queue |
| `/api/cron/payment-reconcile` | 1am daily | Reconciles Razorpay payments |
| `/api/cron/session-reminders` | 12:30pm daily | Sends session reminder messages |
| `/api/cron/birthday-wishes` | 3:30am daily | Sends birthday emails/WA |
| `/api/cron/streak-at-risk` | 2:30am daily | Warns users whose streak may break |
| `/api/cron/weekly-digest` | 1:30am Monday | Sends weekly activity summary |
| `/api/cron/expiry-reminders` | 7am daily | Membership expiry reminders |
| `/api/cron/slot-expiry` | 2am daily | Expires reserved slots from abandoned registrations |
| `/api/cron/rank-snapshot` | 6pm 1st of month | Saves monthly leaderboard snapshot |
| `/api/cron/hourly-session-alerts` | Every hour | Session start alerts |
| `/api/cron/media-cleanup` | 8:30pm daily | Removes orphaned media files |
| `/api/cron/daily-attendance-qr` | 11:30pm daily | Generates next-day QR codes |
| `/api/cron/daily-attendance-report` | 1:45am daily | Sends attendance report |
| `/api/cron/process-scheduled-emails` | 6:30pm daily | Fires scheduled email sends |

**All times are UTC.** IST = UTC+5:30, so "1am UTC" = "6:30am IST".

---

## 14. File Storage Architecture

**Provider:** Supabase Storage (S3-compatible).

**Where files are used:**
- Event cover images / banner images
- Route map images and PDFs
- T-shirt size charts
- Session photos
- Coach profile photos
- User avatars
- Generated PDF invoices and certificates

**Upload API:** `POST /api/upload` — accepts multipart form data, stores in Supabase Storage, returns public URL.

**Thumbnail URL helper:** `lib/thumb-url.ts` — transforms a Supabase storage URL to use the image resize API (returns smaller thumbnails for listing pages).

---

## 15. Mobile App Architecture

**Technology:** Capacitor — the same Next.js web app is wrapped in a native Android/iOS shell.

**How it works:**
1. `next build` creates the web app
2. `npx cap sync` copies the web build into `android/` and `ios/` native projects
3. Capacitor provides native APIs (camera, push notifications, status bar)
4. `components/mobile/NativeShell.tsx` — detects if running in Capacitor, applies mobile-specific behaviors

**Mobile-specific features:**
- `@capacitor/push-notifications` — native push notifications
- `@capacitor/camera` — photo capture
- Bottom navigation (`components/mobile/BottomNav.tsx`)

**Push notifications:** Separate from web push. Uses `lib/notify.ts` and `/api/integrations/native/push`.

---

## 16. Deployment Architecture

**Platform:** Vercel

**How deployment works:**
```
git push origin main
  ↓
Vercel detects push
  ↓
next build (TypeScript compile + Next.js build)
  ↓
Deploy to Vercel's edge network
  ↓
Vercel Crons activated based on vercel.json schedule
```

**Environment variables** (set in Vercel dashboard, never in code):
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — database access
- `COACH_TOKEN_SECRET` — JWT signing (CRITICAL — never change without dual-secret rotation)
- `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` — payments
- `ZEPTO_MAIL_TOKEN` — transactional email
- `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID` — WhatsApp
- `CRON_SECRET` — cron job authentication
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` — client-side DB

**Database migrations:** Run manually against the Supabase project. Migrations are NOT auto-applied on deploy. You apply them via Supabase dashboard SQL editor or `supabase db push`.

**Function timeouts** (from `vercel.json`):
- Most API routes: 10 seconds (Vercel default)
- Cron jobs: 300 seconds (5 minutes)
- Registration + payment: 30 seconds
- PDF generation: 60 seconds

---

## 17. Top 20 Files to Learn First

Learn these in order. Each one teaches you something essential.

| # | File | What you'll learn |
|---|---|---|
| 1 | `proxy.ts` | How route protection works; what cookies exist |
| 2 | `lib/admin-auth.ts` | How tokens are signed and verified |
| 3 | `lib/supabase-server.ts` | How to connect to the database |
| 4 | `app/api/auth/login/route.ts` | A complete API route from request to response |
| 5 | `app/events/[slug]/page.tsx` | A Server Component that fetches and renders data |
| 6 | `app/events/[slug]/register/page.tsx` | A Client Component with state and API calls |
| 7 | `app/api/events/register/route.ts` | The most complex API route (capacity, coupons, payment) |
| 8 | `lib/event-lifecycle.ts` | State machine pattern; how lifecycle works |
| 9 | `app/api/events/verify-payment/route.ts` | Payment verification and idempotency |
| 10 | `lib/job-queue.ts` | Background job pattern |
| 11 | `lib/job-handlers.ts` | What each background job does |
| 12 | `app/api/cron/job-worker/route.ts` | How the worker claims and processes jobs |
| 13 | `lib/notify.ts` | How email and WhatsApp are sent |
| 14 | `lib/email-service.ts` | ZeptoMail integration |
| 15 | `lib/whatsapp.ts` | Meta WhatsApp API |
| 16 | `vercel.json` | Cron schedule and function timeouts |
| 17 | `next.config.ts` | Security headers, CSP, image domains |
| 18 | `app/layout.tsx` | Root HTML shell, global providers |
| 19 | `components/events/RegisterButton.tsx` | Client component with auth + routing logic |
| 20 | `supabase/migrations/20260613000005_events_v2.sql` | Core schema for events + registrations |

---

## 18. Database Domain Map

When you see a database query in the code, use this map to understand which domain it belongs to.

**To read a table:** Use Supabase dashboard → Table Editor, or SQL: `SELECT * FROM table_name LIMIT 10;`

**SAFE SQL (read-only):**
```sql
SELECT * FROM events WHERE status = 'published' LIMIT 5;
SELECT * FROM event_registrations WHERE event_id = 'xxx' LIMIT 20;
SELECT COUNT(*) FROM users;
```

**DANGEROUS SQL (modifies data — never run without a backup plan):**
```sql
UPDATE, DELETE, INSERT, DROP, TRUNCATE, ALTER
```

---

## 19. API Route Map

**How to find an API when you only know the UI feature:**

1. Open the browser DevTools → Network tab
2. Reproduce the action in the UI
3. Look for `fetch` requests to `/api/...`
4. That URL maps directly to `app/api/[path]/route.ts`

**API groups:**

| Group | Prefix | Who can call it |
|---|---|---|
| Public events | `/api/events/*` | Anyone (some require user token) |
| Auth | `/api/auth/*` | Anyone |
| User | `/api/user/*` | Logged-in users |
| Admin | `/api/admin/*` | Admin/Coach role only |
| Cron | `/api/cron/*` | Vercel Cron (CRON_SECRET) |
| Webhooks | `/api/webhooks/*` | Razorpay / Meta / ZeptoMail |
| External API | `/api/v1/*` | API key holders |
| Ops portal | `/api/ops/*` | Volunteer portal users |

---

## 20. Risk Levels for Common Changes

Before making any change, classify it by risk:

### LOW RISK — safe to do, easy to undo
- Changing text on a page
- Changing CSS/inline styles
- Changing an emoji or icon
- Adding a new static page (no DB)
- Changing a label in the UI

**Test:** Visual check in browser. No automated tests needed.

### MEDIUM RISK — test carefully, can be undone with another deploy
- Changing a React component's output
- Adding a new API route (no schema changes)
- Changing validation in an existing API
- Modifying email templates
- Adding an optional column to a DB query (not to the schema)

**Test:** Test the specific flow manually. Check that existing behavior still works.

### HIGH RISK — backup plan required
- Changing the registration logic
- Changing payment verification
- Changing authentication/token logic
- Changing capacity enforcement
- Adding a database column with constraints
- Changing cron job schedules

**Test:** Manual testing of the full flow. Check edge cases. Verify DB state after.

### CRITICAL — never do without a rollback plan
- Changing `lib/admin-auth.ts` (token format change = all sessions invalidated)
- Running `UPDATE` or `DELETE` on production data
- Changing `COACH_TOKEN_SECRET` without dual-secret rotation
- Dropping a database table or column
- Changing the `UNIQUE` constraint on `event_registrations`
- Changing the Razorpay webhook signature logic

**Process:** Test on a staging environment. Have the rollback commit ready. Notify users if needed.

---

## 21. Debugging Playbook

**When something is broken, follow this process:**

### Step 1: Reproduce it
- What exactly does the user see?
- What URL are they on?
- What did they click?

### Step 2: Browser DevTools
- Open Chrome DevTools (F12)
- **Console tab:** Any red errors?
- **Network tab:** Find the API request. What status code? What response body?

### Step 3: Trace the URL to code
- URL `/events/hawa-freedom-run` → `app/events/[slug]/page.tsx`
- URL `/api/events/register` → `app/api/events/register/route.ts`
- API returns 400 → read the error message in the response body

### Step 4: Read the code at that location
- What does the API validate first?
- What database query runs?
- What could return this error?

### Step 5: Check the database
- Supabase dashboard → Table Editor
- Is the data what you expect?

### Step 6: Check logs
- Vercel dashboard → your project → Functions → Logs
- Look for `logger.error(...)` or `logger.warn(...)` from `lib/logger.ts`

### Step 7: Check external services
- Razorpay dashboard (payment issues)
- ZeptoMail dashboard (email issues)
- Meta Business Manager (WhatsApp issues)

---

## 22. Learning Curriculum

Work through these levels in order. Do the exercises before moving on.

### Level 1 — Read the project
- [ ] Read `package.json` — understand what each dependency does
- [ ] Read `proxy.ts` — understand route protection
- [ ] Read `app/layout.tsx` — understand the HTML shell
- [ ] Exercise: Find where the site title "Connected Steps" comes from

### Level 2 — Follow a page render
- [ ] Read `app/events/[slug]/page.tsx` — understand Server Components
- [ ] Exercise: Find where `ev.title` is rendered. Change its font size. Revert it.
- [ ] Exercise: Without running code, name all the database tables this page queries

### Level 3 — Follow an API call
- [ ] Open `/events/hawa-freedom-run` in browser → DevTools → Network
- [ ] Find the API calls made by the page
- [ ] Read the corresponding route files
- [ ] Exercise: Find what the `/api/upcoming` route returns and why the home page calls it

### Level 4 — Follow authentication
- [ ] Read `app/api/auth/login/route.ts`
- [ ] Read `lib/admin-auth.ts`
- [ ] Exercise: Explain in your own words what the `cs_user_session` cookie contains

### Level 5 — Follow registration
- [ ] Read `app/events/[slug]/register/page.tsx` (first 100 lines)
- [ ] Read `app/api/events/register/route.ts` (first 150 lines)
- [ ] Exercise: What happens if a user tries to register twice for the same event?

### Level 6 — Follow payment
- [ ] Read `app/api/events/create-payment-order/route.ts`
- [ ] Read `app/api/events/verify-payment/route.ts`
- [ ] Exercise: What prevents someone from manually calling verify-payment with a fake signature?

### Level 7 — Follow a background job
- [ ] Read `lib/job-queue.ts`
- [ ] Read `lib/job-handlers.ts`
- [ ] Read `app/api/cron/job-worker/route.ts`
- [ ] Exercise: After a successful registration, what job is enqueued? What does it do?

### Level 8 — Read the database
- [ ] Open Supabase dashboard → SQL editor
- [ ] Run: `SELECT * FROM events WHERE status = 'published' LIMIT 5;`
- [ ] Run: `SELECT COUNT(*) FROM event_registrations WHERE payment_status = 'paid';`
- [ ] Exercise: Write a query to find all registrations for a specific event

### Level 9 — Make a small change
- [ ] Find the "Register Free" label in `components/events/RegisterButton.tsx`
- [ ] Change it to "Register Now — Free"
- [ ] Verify it in the browser
- [ ] Revert it
- [ ] Commit message: what would you write?

### Level 10 — Independent feature
- [ ] Add a "Total registrations" count to any admin event page
- [ ] You will need: the admin event page file, the admin event API, a DB query
- [ ] Do it without help

---

*This document reflects the actual codebase as of the date it was generated. When in doubt, read the actual migration files and route files — they are always the source of truth.*
