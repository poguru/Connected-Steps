# Connected Steps — Deployment Guide

**Version 3.0 · 2026-07-28**

---

## Overview

Connected Steps deploys as a Next.js application on Vercel, backed by Supabase (Postgres + Storage). No Docker, no Kubernetes, no custom infrastructure — the full stack runs on managed services.

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 20 LTS | Build and dev server |
| npm | 10+ | Package management |
| Supabase CLI | latest | Migration management |
| Vercel CLI | latest | Deployment management |
| Git | any | Source control |

---

## First-Time Setup

### 1. Install dependencies

```bash
npm ci
```

### 2. Configure environment variables

Copy the template and fill in all required values:

```bash
# .env.local (never commit this file)
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
ADMIN_PASSWORD=<strong_password>
CRON_SECRET=<random_32_hex>
COACH_TOKEN_SECRET=<random_32_hex>
RAZORPAY_KEY_ID=<razorpay_live_key>
RAZORPAY_KEY_SECRET=<razorpay_secret>
NEXT_PUBLIC_RAZORPAY_KEY_ID=<same_as_RAZORPAY_KEY_ID>
RAZORPAY_WEBHOOK_SECRET=<razorpay_webhook_secret>
ZEPTO_MAIL_API_KEY=<zepto_mail_api_key>
META_WA_TOKEN=<meta_whatsapp_token>
META_WA_PHONE_ID=<meta_phone_number_id>
META_WA_WEBHOOK_SECRET=<meta_webhook_verify_token>
MSG91_AUTH_KEY=<msg91_auth_key>
MSG91_SENDER_ID=CNSTPS
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<vapid_public>
VAPID_PRIVATE_KEY=<vapid_private>
NEXT_PUBLIC_APP_URL=https://www.connectedsteps.in
```

### 3. Run database migrations

```bash
# Link to your Supabase project
supabase link --project-ref <project_ref>

# Apply all pending migrations
supabase db push
```

### 4. Create Supabase Storage buckets

The following buckets must exist (create via Supabase dashboard or CLI):

| Bucket | Access | Purpose |
|---|---|---|
| `images` | Public | Event banners, profile photos |
| `session-media` | Public | Training session photos |
| `invoices` | Private | PDF invoices |
| `certificates` | Private | Race certificates |
| `assets` | Public | Org logos, assets |
| `imports` | Private | CSV upload staging |
| `it-run-media` | Private | IT Run media |

```bash
# Example: create via Supabase CLI
supabase storage create imports --private
```

### 5. Run development server

```bash
npm run dev
# App available at http://localhost:3000
```

---

## Vercel Deployment

### Initial Setup

```bash
# Install Vercel CLI
npm install -g vercel

# Link repository
vercel link

# Set all environment variables in Vercel dashboard or via CLI:
vercel env add SUPABASE_SERVICE_ROLE_KEY
# ... repeat for each variable
```

### Deploy

```bash
# Preview deployment (branch)
vercel

# Production deployment
vercel --prod
```

Alternatively, pushes to `main` branch trigger automatic deployments if the Vercel GitHub integration is configured.

### Required Vercel Configuration

In the Vercel dashboard:
- **Framework Preset**: Next.js
- **Node.js Version**: 20.x
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Install Command**: `npm ci`

### Environment Variables in Vercel

Set all variables from `.env.local` in the Vercel dashboard under **Settings → Environment Variables**. Mark as:
- `NEXT_PUBLIC_*` — available in Browser + Server
- All others — Server only

---

## Database Migrations

### Applying Migrations

```bash
# Check current migration status
supabase db diff --use-migra

# Apply pending migrations
supabase db push

# Apply a specific migration
supabase db push --include-all
```

### Migration Naming Convention

```
supabase/migrations/YYYYMMDDNNNNNN_description.sql
```

Migrations run in filename order. Never reorder or rename applied migrations.

### Rollback Strategy

Supabase does not provide automatic migration rollback. For each forward migration, maintain a corresponding rollback script in `supabase/rollbacks/` (not currently scaffolded — create as needed).

Manual rollback procedure:
1. Connect to Supabase Postgres directly via `supabase db connect`
2. Execute rollback SQL manually
3. Remove the migration file from `supabase/migrations/`
4. Update `supabase_migrations` tracking table if needed

---

## CI/CD Pipeline

Two GitHub Actions workflows:

### `pr-validation.yml` (on PR to main/staging)
1. **Build & Type Check** — `tsc --noEmit` + `next build`
2. **Unit & Integration Tests** — `jest --ci --coverage`
3. **API Smoke Tests** — Karate test suite against local dev server
4. **UI Smoke Tests** — Playwright `@smoke` tagged tests
5. **Security Tests** — Karate security test suite
6. **Deployment Gate** — passes only if all above succeed

### `regression.yml`
- Runs regression Playwright suite on schedule or manual trigger

### Required GitHub Secrets

Set in repository **Settings → Secrets → Actions**:

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
```

---

## Health Check

The health endpoint is at `GET /api/health`:

```json
{
  "ok": true,
  "version": "a1b2c3d",
  "env": "production",
  "ts": "2026-07-28T10:00:00.000Z",
  "uptime_s": 3600,
  "components": {
    "database":  { "ok": true, "latency": 12 },
    "cache":     { "ok": true, "latency": 5 },
    "job_queue": { "ok": true, "latency": 8, "pending": 2, "dead": 0 },
    "email":     { "ok": true, "configured": true },
    "whatsapp":  { "ok": true, "configured": true }
  }
}
```

- **200** — all components healthy
- **503** — database or cache failure (JSON still returned; parse `components` for detail)
- `job_queue.dead > 0` marks `ok: false` — manual review required at `/api/admin/dead-letters`

Configure your uptime monitor (UptimeRobot, Checkly, etc.) to poll `GET /api/health` every 60 seconds and alert on any non-200 response.

---

## Cron Jobs

Scheduled jobs are triggered via Vercel Cron or external scheduler hitting authenticated endpoints:

| Endpoint | Schedule | Purpose |
|---|---|---|
| `POST /api/cron/job-worker` | Every minute | Process pending job_queue entries |
| `POST /api/cron/email-batch` | Every 5 min | Send queued transactional emails |
| `POST /api/cron/membership-reconcile` | Daily 02:00 | Expire lapsed memberships |
| `POST /api/cron/leaderboard` | Daily 03:00 | Recalculate monthly leaderboard |
| `POST /api/cron/streak` | Daily 00:05 | Update user activity streaks |
| `POST /api/cron/weekly-digest` | Monday 08:00 | Send weekly digest emails |

All cron endpoints require: `Authorization: Bearer <CRON_SECRET>`.

---

## Mobile App Build (Capacitor)

```bash
# Sync web build to native projects
npm run cap:sync

# Open Android Studio (Android)
npm run cap:android

# Open Xcode (iOS)
npm run cap:ios
```

Ensure `NEXT_PUBLIC_APP_URL` points to the production URL before building mobile apps, as Capacitor uses it for API calls.

---

## Post-Deployment Checklist

After every production deployment:

- [ ] `GET /api/health` returns `ok: true`
- [ ] Test registration flow for an event end-to-end
- [ ] Verify Razorpay webhook is receiving events
- [ ] Check `/api/admin/dead-letters` for any failed jobs
- [ ] Confirm `/admin/developer/monitoring` shows API usage data
- [ ] Verify email delivery via ZeptoMail dashboard
- [ ] Check Supabase Storage buckets are accessible
