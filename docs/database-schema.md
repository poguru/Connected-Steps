# Connected Steps — Database Schema

**Version 3.0 · 2026-07-28**

---

## Overview

The database is a Supabase (PostgreSQL 15) instance. All tables use UUIDs as primary keys (`gen_random_uuid()`). Timestamps are `TIMESTAMPTZ`. Row Level Security is enabled on every table — `anon` and `authenticated` roles are revoked; only `service_role` (used by all API routes) has access.

Migrations live in `supabase/migrations/` — ordered by filename (`YYYYMMDDNNNNNN_name.sql`).

---

## Core User & Community Tables

### `profiles`
User profiles linked to Supabase Auth.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | = Supabase auth.users.id |
| email | TEXT UNIQUE | |
| name | TEXT | |
| phone | TEXT | |
| phone_verified | BOOLEAN | |
| dob | DATE | |
| gender | TEXT | |
| avatar_url | TEXT | |
| bio | TEXT | |
| is_active | BOOLEAN | Updated via cron |
| is_admin | BOOLEAN | |
| points | INTEGER | Aggregated from points_ledger |
| created_at | TIMESTAMPTZ | |

### `points_ledger`
Immutable audit trail of all points earned/spent.

### `user_achievements`
Badges and milestones earned by users.

### `user_follows`
Social follow graph between users.

### `posts`, `post_reactions`, `comments`
Community feed.

### `stories`
Time-limited stories (24h TTL concept).

### `referrals`
Referral codes and conversions.

---

## Event Tables

### `events`
The central event table.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK → organizations | |
| name | TEXT | |
| description | TEXT | |
| start_date | TIMESTAMPTZ | |
| end_date | TIMESTAMPTZ | |
| location | TEXT | |
| status | TEXT | draft/review/published/live/completed/archived |
| capacity | INTEGER | |
| participant_count | INTEGER | maintained by trigger |
| registration_close | TIMESTAMPTZ | |
| is_paid | BOOLEAN | |
| price_inr | NUMERIC | |
| banner_url | TEXT | |
| organization_id | UUID FK | |
| created_at | TIMESTAMPTZ | |

### `event_registrations`
Confirmed event registrations.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| event_id | UUID FK → events | |
| user_email | TEXT | |
| race_id | UUID FK → event_races | |
| status | TEXT | confirmed/cancelled/waitlisted |
| payment_status | TEXT | pending/paid/free/refunded |
| final_price | NUMERIC | after discounts |
| razorpay_order_id | TEXT | |
| razorpay_payment_id | TEXT | |
| registration_code | TEXT UNIQUE | QR payload |
| tshirt_size | TEXT | |
| bib_number | TEXT | |
| created_at | TIMESTAMPTZ | |

### `event_participants`
Participants checked in at the event.

### `event_races`
Race categories within an event (5K, 10K, Half, Full).

### `event_distance_categories`
Distance and age-group categories.

### `event_versions`
Full history of event edits with changed fields and actor.

### `event_lifecycle_log`
Status transition history.

### `event_comm_history`
Record of all communications sent for an event.

### `event_slots`
Slot-based capacity management with `FOR UPDATE` locking.

### `event_waitlist`
Waitlisted registrations; auto-promoted when slot opens.

---

## Organisation & Multi-Tenancy Tables

### `organizations`
Top-level tenant.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT | |
| slug | TEXT UNIQUE | |
| logo_url | TEXT | |
| plan | TEXT | free/pro/enterprise |
| feature_flags | JSONB | per-org features |
| created_at | TIMESTAMPTZ | |

### `org_members`
User memberships in an organisation.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | |
| user_email | TEXT | |
| role | TEXT | owner/admin/finance/operations/volunteer_manager/communications/support/read_only |
| is_active | BOOLEAN | |
| invited_by | TEXT | |
| joined_at | TIMESTAMPTZ | |

### `audit_logs`
Immutable record of all org-scoped mutations.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | |
| actor_email | TEXT | |
| action | TEXT | e.g. "event.created" |
| resource_id | UUID | |
| metadata | JSONB | diff/before/after |
| created_at | TIMESTAMPTZ | |

---

## Integration Platform Tables (v3.0)

### `api_keys`
Org-managed API keys for v1 API access.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | |
| name | TEXT | |
| key_prefix | TEXT | first 12 chars of raw key |
| key_hash | TEXT UNIQUE | sha256(raw_key) |
| key_type | TEXT | live/test |
| scopes | TEXT[] | |
| expires_at | TIMESTAMPTZ | NULL = never |
| is_active | BOOLEAN | |
| created_by | TEXT | |
| rotated_from | UUID FK → api_keys | |

Indexes: `(key_prefix) WHERE is_active`, `(organization_id) WHERE is_active`

### `webhook_subscriptions`
Outbound webhook endpoint subscriptions.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | |
| url | TEXT | delivery endpoint |
| events | TEXT[] | subscribed event types |
| signing_secret | TEXT | 32-byte hex; shown once |
| is_active | BOOLEAN | |
| max_attempts | INTEGER | default 5 |
| timeout_seconds | INTEGER | default 30 |

Indexes: GIN on `events`, partial `(organization_id) WHERE is_active`

### `webhook_delivery_log`
Per-delivery attempt records.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| subscription_id | UUID FK | |
| status | TEXT | pending/success/failed/dead |
| attempts | INTEGER | |
| next_attempt_at | TIMESTAMPTZ | |
| last_status_code | INTEGER | |
| last_response_body | TEXT | |
| payload | JSONB | |
| payload_hash | TEXT | sha256 for dedup |

Indexes: partial `(status, next_attempt_at) WHERE status IN ('pending','failed')`, `(payload_hash)`

### `api_usage_log`
Per-request API usage (time-series).

| Column | Type | Notes |
|---|---|---|
| api_key_id | UUID FK | |
| organization_id | UUID | |
| endpoint | TEXT | |
| method | TEXT | |
| status_code | INTEGER | |
| latency_ms | INTEGER | |
| month_bucket | TEXT | YYYY-MM; set by BEFORE INSERT trigger |

**Note:** `month_bucket` is set by trigger `trg_api_usage_log_month_bucket` — `to_char()` is STABLE not IMMUTABLE so cannot be a generated column.

### `automation_rules`
Event-driven automation rules.

| Column | Type | Notes |
|---|---|---|
| trigger_event | TEXT | |
| conditions | JSONB | array of {field, operator, value} |
| actions | JSONB | array of {type, params} |
| is_active | BOOLEAN | |
| run_count | INTEGER | |
| last_run_at | TIMESTAMPTZ | |

### `automation_run_log`
Execution history per rule invocation.

### `import_jobs`
CSV import pipeline state.

| Column | Type | Notes |
|---|---|---|
| entity_type | TEXT | participants/registrations/volunteers/merchandise/sponsors/coupons |
| status | TEXT | validating/validated/committing/done/error |
| total_rows | INTEGER | |
| valid_rows | INTEGER | |
| error_rows | INTEGER | |
| validation_report | JSONB | array of {row, errors[]} |
| storage_path | TEXT | Supabase Storage path |

### `connector_configs`
Third-party integration configurations (unique per org+type).

---

## Commerce & Finance Tables (v2.0)

### `merchandise_products`
Product catalogue.

### `merchandise_variants`
SKU variants (size, colour).

### `merchandise_stock`
Per-variant stock levels with `reserve_merchandise_stock()` and `decrement_merchandise_stock()` RPCs for atomic updates.

### `merchandise_orders` + `merchandise_order_items`
Order and line item records.

### `donations`
One-time donor records.

### `sponsor_packages`
Sponsorship tiers and custom amounts.

### `manual_payments`
Admin-initiated payment records with reference codes.

### `payout_batches` + `payout_items`
Batch payout tracking.

---

## Communication Tables

### `email_queue`
Queued transactional emails (processed by cron).

### `email_logs`
Delivery status from ZeptoMail (sent, bounced, opened, clicked).

### `wa_message_log`
WhatsApp message delivery records.

### `comm_templates`
Rich-text email templates with variable substitution.

### `scheduled_emails`
Future-send emails with cancellation support.

### `notification_prefs`
Per-user per-event notification opt-in/out.

---

## Membership Tables

### `membership_plans`
Subscription plan definitions (monthly/annual pricing).

### `memberships`
User membership records (active, expired, cancelled).

---

## Session & Coaching Tables

### `training_sessions`
Group training sessions.

### `session_rsvps`
User RSVPs to sessions.

### `session_media`
Photos and videos from sessions.

### `coaches`
Coach profiles.

### `coach_assignments`
Coach → athlete assignments.

### `training_plans`
Personalised training plan records.

---

## Infrastructure Tables

### `job_queue`
Durable async job queue (Postgres-backed).

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| job_type | TEXT | |
| payload | JSONB | |
| status | TEXT | pending/running/done/failed/dead |
| attempts | INTEGER | |
| max_attempts | INTEGER | |
| idempotency_key | TEXT UNIQUE | |
| next_run_at | TIMESTAMPTZ | |
| last_error | TEXT | |
| created_at | TIMESTAMPTZ | |

### `cron_runs`
Cron job execution history (prevents overlapping runs via cron_lock).

### `rate_limit_store`
Redis fallback: rate limit counters in Postgres when Redis is unavailable.

---

## Key RPCs and Functions

| Name | Purpose |
|---|---|
| `claim_pending_webhooks(limit)` | Atomic `FOR UPDATE SKIP LOCKED` claim for job worker |
| `decrement_merchandise_stock(variant_id, qty)` | Atomic stock decrement |
| `reserve_merchandise_stock(variant_id, qty)` | Atomic reservation |
| `get_rank_snapshot(user_id)` | Leaderboard ranking query |
| `event_stats(event_id)` | Aggregate event registration stats |
| `redeem_coupon(code, event_id, user_email)` | Atomic coupon claim |
| `set_api_usage_log_month_bucket()` | BEFORE INSERT trigger — sets month_bucket |

---

## Key Views

| Name | Purpose |
|---|---|
| `api_usage_stats` | Aggregated monthly usage per API key |

---

## Index Strategy

Performance-critical indexes follow this pattern:
- **Partial indexes** on high-cardinality boolean columns: `WHERE is_active`, `WHERE status IN (...)`
- **GIN indexes** on array/JSONB columns used in contains queries
- **Composite indexes** for the most frequent filter combinations: `(organization_id, created_at)`
- See `supabase/migrations/20260611000003_index_optimization.sql` and `20260626000006_db_optimization.sql` for bulk index additions
