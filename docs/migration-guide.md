# Connected Steps — Migration Guide (v2.x → v3.0)

**Date:** 2026-07-28

---

## Overview

v3.0 is a purely additive release. No existing database columns are removed or renamed. No existing API contracts change. No admin UI pages are removed.

**Existing integrations**: no changes required.  
**Existing mobile apps**: no changes required.  
**Existing Razorpay/ZeptoMail/WhatsApp config**: no changes required.

---

## Required Migration Steps

### Step 1: Apply the integration platform migration

```bash
supabase db push
```

This applies `supabase/migrations/20260728000010_integration_platform.sql`, which:
- Creates 7 new tables: `api_keys`, `webhook_subscriptions`, `webhook_delivery_log`, `api_usage_log`, `automation_rules`, `automation_run_log`, `import_jobs`, `connector_configs`
- Creates 1 view: `api_usage_stats`
- Creates 1 RPC: `claim_pending_webhooks(limit)`
- Creates 1 trigger function: `set_api_usage_log_month_bucket()`
- All new tables have RLS enabled; `anon`/`authenticated` roles are revoked

**Time estimate:** < 30 seconds. No locks on existing tables.

### Step 2: Create the imports Storage bucket

New for v3.0: CSV files are staged in Supabase Storage before processing.

In Supabase dashboard:
1. Storage → New bucket
2. Name: `imports`
3. Access: **Private** (not public)
4. Click Save

Or via CLI:
```bash
supabase storage create imports --private
```

### Step 3: Deploy the new application

```bash
vercel --prod
# or: git push main (if Vercel auto-deploy is configured)
```

### Step 4: Verify

```bash
curl https://www.connectedsteps.in/api/health
```

Expected: `{ "ok": true, ... }`

---

## New Environment Variables

No new env vars are **required** for core functionality. The integration platform uses existing DB credentials.

Optional new vars (only needed if these features are actively used):
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — Redis cache for rate limiting (webhook subscription `rate_limit_rpm`). Without these, rate limiting falls back to Postgres.

---

## Database Changes Summary

### New Tables

| Table | Migration | Purpose |
|---|---|---|
| `api_keys` | `20260728000010` | Org-managed API keys |
| `webhook_subscriptions` | `20260728000010` | Outbound webhook endpoints |
| `webhook_delivery_log` | `20260728000010` | Per-delivery attempt records |
| `api_usage_log` | `20260728000010` | Per-request usage tracking |
| `automation_rules` | `20260728000010` | Event automation definitions |
| `automation_run_log` | `20260728000010` | Automation execution history |
| `import_jobs` | `20260728000010` | CSV import pipeline state |
| `connector_configs` | `20260728000010` | Third-party connector configs |

### Modified Tables

None.

### Removed Tables

None.

---

## New API Endpoints

All new — no existing endpoints changed:

| Endpoint | Purpose |
|---|---|
| `GET/POST /api/admin/api-keys` | API key management |
| `GET/PATCH/DELETE /api/admin/api-keys/:id` | Individual key management |
| `POST /api/admin/api-keys/:id/rotate` | Key rotation |
| `GET /api/admin/api-keys/:id/usage` | Usage stats |
| `GET/POST /api/admin/webhooks` | Webhook subscriptions |
| `GET/PATCH/DELETE /api/admin/webhooks/:id` | Individual subscription |
| `GET /api/admin/webhooks/:id/deliveries` | Delivery history |
| `POST /api/admin/webhooks/:id/replay` | Replay delivery |
| `POST /api/admin/webhooks/:id/test` | Live test |
| `GET/POST /api/admin/import` | Import jobs |
| `GET /api/admin/import/:id` | Import status |
| `POST /api/admin/import/:id/commit` | Commit import |
| `GET/POST /api/admin/connectors` | Connector configs |
| `GET/PUT/DELETE/POST /api/admin/connectors/:type` | Individual connector |
| `GET/POST /api/admin/automations` | Automation rules |
| `GET/PATCH/DELETE /api/admin/automations/:id` | Individual rule |
| `GET /api/admin/automations/:id/run-log` | Rule execution log |
| `GET /api/admin/monitoring/api-usage` | API usage monitoring |
| `GET /api/admin/monitoring/webhooks` | Webhook health |
| `GET /api/admin/monitoring/rate-limits` | Rate limit status |
| `GET /api/v1/events` | Public: list events |
| `GET /api/v1/events/:id` | Public: single event |
| `GET /api/v1/events/:id/registrations` | Public: event registrations |
| `GET/POST /api/v1/registrations` | Public: registrations |
| `GET /api/v1/registrations/:id` | Public: single registration |
| `GET /api/v1/participants` | Public: participants |
| `GET /api/v1/memberships` | Public: memberships |
| `GET /api/v1/merchandise/products` | Public: products |
| `GET /api/v1/finance/summary` | Public: finance summary |

---

## Admin UI Changes

A new **Developer** section is added to the admin sidebar navigation. All existing nav items are unchanged.

New pages:
- `/admin/developer` — landing
- `/admin/developer/api-keys`
- `/admin/developer/webhooks`
- `/admin/developer/import`
- `/admin/developer/automations`
- `/admin/developer/docs`
- `/admin/developer/monitoring`

---

## Rollback Procedure

If v3.0 needs to be rolled back:

1. **Application**: Vercel dashboard → Deployments → Promote previous deployment
2. **Database**: The new tables have no impact on existing functionality — they can remain without causing issues. If removal is required:
   ```sql
   DROP TABLE IF EXISTS connector_configs;
   DROP TABLE IF EXISTS import_jobs;
   DROP TABLE IF EXISTS automation_run_log;
   DROP TABLE IF EXISTS automation_rules;
   DROP TABLE IF EXISTS api_usage_log;
   DROP TABLE IF EXISTS webhook_delivery_log;
   DROP TABLE IF EXISTS webhook_subscriptions;
   DROP TABLE IF EXISTS api_keys;
   DROP VIEW IF EXISTS api_usage_stats;
   DROP FUNCTION IF EXISTS claim_pending_webhooks;
   DROP FUNCTION IF EXISTS set_api_usage_log_month_bucket;
   ```
   **Warning:** this permanently deletes all API keys, webhook subscriptions, and delivery logs.
