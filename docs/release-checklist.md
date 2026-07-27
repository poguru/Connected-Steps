# Connected Steps — v3.0.0 Release Checklist

**Date:** 2026-07-28  
**Release:** v3.0.0  
**Executor:** Release Manager

Instructions: Work through each section in order. Mark each item ✅ when confirmed, ❌ if it fails (add a note), or ⏭️ if skipped with justification.

---

## Phase 1 — Pre-Release Verification

### 1.1 TypeScript & Build

- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npm run build` completes without errors
- [ ] No new `@ts-ignore` or `@ts-expect-error` comments added without justification

### 1.2 Tests

- [ ] `npx jest --ci` passes — all tests green
- [ ] Test count ≥ 715 (the count confirmed before v3.0 work began)
- [ ] New integration tests (api-key, webhook-signing, import-validation, v1-pagination) all pass
- [ ] No test file skipped with `x.describe` or `x.it` without justification

### 1.3 Linting

- [ ] `npm run lint` passes with zero errors
- [ ] No `// eslint-disable` comments without explanation

### 1.4 Environment Variables

Confirm all of the following are set in Vercel production environment:

- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `ADMIN_PASSWORD` (strong, > 16 chars)
- [ ] `CRON_SECRET` (32+ random hex chars)
- [ ] `COACH_TOKEN_SECRET` (32+ random hex chars)
- [ ] `RAZORPAY_KEY_ID`
- [ ] `RAZORPAY_KEY_SECRET`
- [ ] `NEXT_PUBLIC_RAZORPAY_KEY_ID`
- [ ] `RAZORPAY_WEBHOOK_SECRET`
- [ ] `ZEPTO_MAIL_API_KEY` or `ZEPTO_TOKEN`
- [ ] `META_WA_TOKEN`
- [ ] `META_WA_PHONE_ID`
- [ ] `META_WA_WEBHOOK_SECRET`
- [ ] `MSG91_AUTH_KEY`
- [ ] `MSG91_SENDER_ID`
- [ ] `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- [ ] `VAPID_PRIVATE_KEY`
- [ ] `NEXT_PUBLIC_APP_URL` (points to production URL)

---

## Phase 2 — Database

### 2.1 Migration State

- [ ] All migrations have been applied to the Supabase production database
- [ ] `20260728000010_integration_platform.sql` — applied
- [ ] No pending migrations (check Supabase dashboard → Database → Migrations)

### 2.2 New Tables

Confirm these tables exist in production:

- [ ] `api_keys`
- [ ] `webhook_subscriptions`
- [ ] `webhook_delivery_log`
- [ ] `api_usage_log`
- [ ] `automation_rules`
- [ ] `automation_run_log`
- [ ] `import_jobs`
- [ ] `connector_configs`

### 2.3 RLS

- [ ] RLS enabled on all 8 new tables (query: `SELECT tablename FROM pg_tables WHERE schemaname = 'public'` + `SELECT relrowsecurity FROM pg_class WHERE relname = '<table>'`)
- [ ] `api_usage_stats` view exists
- [ ] `claim_pending_webhooks` RPC exists

### 2.4 Backup

- [ ] Manual database snapshot created before deployment (Supabase → Database → Backups → Create backup)
- [ ] Snapshot timestamp recorded: `____________________`

---

## Phase 3 — Storage

### 3.1 Storage Buckets

Confirm all required buckets exist in Supabase Storage:

- [ ] `images` — public
- [ ] `session-media` — public
- [ ] `invoices` — private
- [ ] `certificates` — private
- [ ] `assets` — public
- [ ] `imports` — private (**new in v3.0**)
- [ ] `it-run-media` — private

---

## Phase 4 — Deployment

### 4.1 Deploy

- [ ] Production deployment triggered (Vercel `--prod` or merge to main)
- [ ] Deployment succeeded (no build errors in Vercel dashboard)
- [ ] Git tag created: `git tag v3.0.0 && git push origin v3.0.0`
- [ ] `package.json` version is `3.0.0`

### 4.2 Health Check

- [ ] `GET https://www.connectedsteps.in/api/health` returns HTTP 200
- [ ] `ok: true` in response body
- [ ] `components.database.ok: true`
- [ ] `components.email.configured: true`
- [ ] `components.whatsapp.configured: true`
- [ ] `components.job_queue.dead: 0`

---

## Phase 5 — Functional Smoke Tests

### 5.1 Critical Flows (must not be broken)

- [ ] Event registration flow — register for a free event end-to-end
- [ ] Payment flow — register for a paid event; payment succeeds
- [ ] QR code check-in — generate QR code for registration; scan at `/admin/events/:id/race-day`
- [ ] BIB collection — assign BIB via admin and confirm assignment
- [ ] T-shirt collection — scan participant QR and mark collected
- [ ] Certificate generation — generate certificate for a test registration
- [ ] Email delivery — send test email from admin communication page; confirm delivery
- [ ] WhatsApp OTP — trigger OTP send; confirm delivery

### 5.2 New v3.0 Flows

- [ ] Create an API key in `/admin/developer/api-keys`
- [ ] Call `GET /api/v1/events` with the new key — verify 200 response
- [ ] Create a webhook subscription in `/admin/developer/webhooks`
- [ ] Use the Test button — verify test delivery shows in delivery log
- [ ] Upload a CSV in `/admin/developer/import` — verify validation report appears
- [ ] Create an automation rule in `/admin/developer/automations`
- [ ] View API usage metrics in `/admin/developer/monitoring`

---

## Phase 6 — Monitoring Setup

- [ ] Uptime monitor configured on `GET /api/health` (60s interval, alert on non-200)
- [ ] Alert recipient email confirmed working
- [ ] Vercel log drain configured (if applicable)
- [ ] Razorpay webhook delivery health checked in Razorpay dashboard

---

## Phase 7 — Documentation

- [ ] `CHANGELOG.md` updated with v3.0.0 entry
- [ ] `docs/release-notes/v3.0.0.md` complete
- [ ] `docs/migration-guide.md` complete
- [ ] `docs/architecture.md` updated
- [ ] `docs/api-guide.md` complete
- [ ] `docs/developer-guide.md` complete
- [ ] `docs/database-schema.md` updated
- [ ] `docs/runbook.md` updated
- [ ] `docs/disaster-recovery.md` updated
- [ ] `docs/manuals/administrator.md` updated
- [ ] `docs/manuals/volunteer.md` updated
- [ ] `docs/manuals/participant.md` updated

---

## Phase 8 — Post-Deploy

- [ ] Communicate release to admin users
- [ ] Update API documentation link in admin portal (if externally hosted)
- [ ] Confirm no P0/P1 alerts in first 30 minutes
- [ ] Mark release as complete in project tracking

---

## Rollback Decision Criteria

Trigger rollback if any of the following occur within 1 hour of deploy:
- `GET /api/health` returns 503 and cannot be resolved in 15 minutes
- Event registration flow broken
- Payment processing returning errors > 1%
- More than 10 dead jobs accumulating per minute

**Rollback procedure:** Vercel dashboard → Deployments → Promote previous deployment.  
Database does not need rollback unless migration caused data issues (new tables can remain).

---

## Sign-Off

| Role | Name | Signed | Date |
|---|---|---|---|
| Release Manager | | | |
| Tech Lead | | | |
