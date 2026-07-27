# Changelog

All notable changes to Connected Steps are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) — versions use [Semantic Versioning](https://semver.org/).

---

## [3.0.0] — 2026-07-28

### Overview
Version 3.0 ships the **Integration Platform** — a complete developer-facing layer built on top of the existing Connected Steps product. It adds a versioned public REST API, org-managed API keys, outbound webhooks with HMAC signing, bulk CSV import/export, a third-party connector framework, an event automation rules engine, and a full Developer Portal inside the admin UI. It also completes the Multi-Org SaaS platform (v2.5) and the Commerce & Finance platform (v2.0).

---

### Added — Integration Platform (v3.0)

#### Public API v1
- `GET /api/v1/events` — paginated list of events (scope: `events:read`)
- `GET /api/v1/events/:id` — single event detail
- `GET /api/v1/events/:id/registrations` — event's registrations
- `GET/POST /api/v1/registrations` — list / create registrations
- `GET /api/v1/registrations/:id` — single registration
- `GET /api/v1/participants` — list participants (scope: `participants:read`)
- `GET /api/v1/memberships` — active memberships (scope: `memberships:read`)
- `GET /api/v1/merchandise/products` — product catalogue (scope: `merchandise:read`)
- `GET /api/v1/finance/summary` — monthly revenue summary (scope: `finance:read`)
- All v1 responses follow `{ data, meta }` envelope; errors follow `{ error: { code, message } }`
- Pagination: `?page=&per_page=` (max 100); `meta.total`, `meta.pages` in every list response
- Organisation scoping: every query automatically filters by the API key's `organization_id`

#### API Keys
- `GET/POST /api/admin/api-keys` — list / create keys
- `GET/PATCH/DELETE /api/admin/api-keys/:id` — manage individual keys
- `POST /api/admin/api-keys/:id/rotate` — rotate (creates successor, deactivates predecessor)
- `GET /api/admin/api-keys/:id/usage` — monthly usage stats per key
- Key format: `cs_live_<48 hex chars>`; stored as `sha256(rawKey)` — raw key shown exactly once
- Key prefix (first 12 chars) used for O(log n) DB lookup; constant-time comparison via `crypto.timingSafeEqual`
- Scopes: `events:read/write`, `registrations:read/write`, `participants:read/write`, `memberships:read`, `merchandise:read/write`, `finance:read`, `communications:read/write`, `webhooks:read/write`, `import:write`, `*` (superscope)

#### Outbound Webhooks
- `GET/POST /api/admin/webhooks` — list / create subscriptions
- `GET/PATCH/DELETE /api/admin/webhooks/:id` — manage subscriptions
- `GET /api/admin/webhooks/:id/deliveries` — delivery history (filterable by status, event type)
- `POST /api/admin/webhooks/:id/replay` — re-enqueue a past delivery
- `POST /api/admin/webhooks/:id/test` — live HTTP test with latency measurement
- Signing: `HMAC-SHA256` over `${timestamp}.${body}` → `X-CS-Signature: t=<ms>,sha256=<hex>`
- 5-minute replay window; durable delivery via `job_queue` (Postgres-backed, retries up to 5×)
- Events: `registration.created/updated/cancelled`, `payment.succeeded/failed`, `participant.checked_in`, `certificate.generated`, `refund.completed`, `membership.renewed/expired`, `waitlist.promoted`, `merchandise.order_created/updated`

#### CSV Import / Export
- `GET/POST /api/admin/import` — list jobs / upload CSV
- `GET /api/admin/import/:id` — job status and validation report
- `POST /api/admin/import/:id/commit` — commit a validated import (optimistic lock via status CAS)
- Supported entity types: `participants`, `registrations`, `volunteers`, `merchandise`, `sponsors`, `coupons`
- Two-phase: validate → commit; `can_commit` flag in validate response; first 50 errors returned inline
- File staging: Supabase Storage bucket `imports` at `imports/{org_id}/{timestamp}-{filename}`

#### Third-Party Connectors
- `GET/POST /api/admin/connectors` — list / configure connectors (secrets never returned in GET)
- `GET/PUT/DELETE/POST /api/admin/connectors/:type` — manage / test individual connectors
- Connector types: `google_calendar`, `hubspot`, `quickbooks`, `mailchimp`, `strava`, `s3`
- `ConnectorAdapter` interface: `configSchema()`, `validateConfig()`, `testConnection()`, `executeAction?()`

#### Automation Rules Engine
- `GET/POST /api/admin/automations` — list / create rules
- `GET/PATCH/DELETE /api/admin/automations/:id` — manage rules
- `GET /api/admin/automations/:id/run-log` — execution history
- Triggers: all 13 webhook event types + `participant.waitlisted`, `membership.activated`
- Conditions: AND logic over 6 operators (`eq`, `neq`, `gt`, `lt`, `contains`, `not_contains`)
- Actions: `send_email`, `send_webhook`, `notify_org`, `generate_certificate`, `add_to_waitlist`

#### Developer Portal (Admin UI)
- `/admin/developer` — landing with platform overview and quick links
- `/admin/developer/api-keys` — key management with scope selector and raw-key reveal modal
- `/admin/developer/webhooks` — subscription management with delivery log and test panel
- `/admin/developer/import` — file upload, validation results, commit flow
- `/admin/developer/automations` — rule builder (trigger + condition + action)
- `/admin/developer/docs` — collapsible endpoint reference for all 9 v1 routes
- `/admin/developer/monitoring` — tabbed: API Usage / Webhook Health / Rate Limits

#### Monitoring Endpoints
- `GET /api/admin/monitoring/api-usage` — monthly stats + last-24h endpoint breakdown
- `GET /api/admin/monitoring/webhooks` — per-subscription success rates over last 7 days
- `GET /api/admin/monitoring/rate-limits` — per-key rpm/rph with `at_limit` flag

#### Database Tables (migration `20260728000010`)
- `api_keys` — with partial indexes on `(key_prefix) WHERE is_active` and `(organization_id) WHERE is_active`
- `webhook_subscriptions` — with GIN index on `events` array column
- `webhook_delivery_log` — with partial index on `(status, next_attempt_at) WHERE status IN ('pending','failed')`
- `api_usage_log` — `month_bucket` set via `BEFORE INSERT` trigger (not generated column; `to_char` is STABLE not IMMUTABLE)
- `automation_rules` + `automation_run_log`
- `import_jobs`
- `connector_configs` — unique on `(organization_id, connector_type)`
- `claim_pending_webhooks(p_limit)` RPC — `FOR UPDATE SKIP LOCKED` atomic claim
- `api_usage_stats` view

#### Tests (Integration Platform)
- `__tests__/integration/api-key.test.ts` — 19 tests: key generation, sha256 hashing, scope checking, timing-safe comparison
- `__tests__/integration/webhook-signing.test.ts` — 15 tests: HMAC signing, verification, replay protection, tamper detection
- `__tests__/integration/import-validation.test.ts` — 18 tests: CSV parsing, row validation for 6 entity types
- `__tests__/integration/v1-pagination.test.ts` — 25 tests: pagination math, offset calculation, DB range boundaries

---

### Added — Multi-Org SaaS Platform (v2.5, included in 3.0)

- **Organizations** — `organizations` table; multi-org data isolation via `organization_id` FK on all event/registration/member data
- **RBAC** — 8 roles: `owner`, `admin`, `finance`, `operations`, `volunteer_manager`, `communications`, `support`, `read_only`
- **Permission matrix** — 30+ named permissions enforced in `lib/org-auth.ts`
- **Org member management** — invite / role-change / remove members; audit log on all mutations
- **Feature flags** — per-org feature toggles (e.g. `webhooks`, `api_access`, `import_export`, `automations`)
- **Admin pages**: `/admin/orgs`, `/admin/orgs/:id`, `/admin/orgs/:id/members`, `/admin/orgs/:id/features`, `/admin/orgs/:id/settings`

---

### Added — Commerce & Finance Platform (v2.0, included in 3.0)

- **Merchandise** — products, SKUs, stock tracking, order lifecycle; `decrement_merchandise_stock` + `reserve_merchandise_stock` RPCs
- **Donations** — one-time donor portal with Razorpay payment flow
- **Sponsor packages** — package tiers, custom amounts, contact management
- **Manual payments** — admin-initiated payments with reference codes and audit trail
- **Payouts** — batch payout tracking with bank account details
- **Finance service** (`lib/finance-service.ts`) — centralised revenue aggregation
- **Admin pages**: finance dashboard, manual payments, payouts, reports + merchandise management
- **9 new DB tables** + **50 new tests** covering all commerce flows

---

### Added — Event Management Platform (v1.5, included in 3.0)

- **Event versions** — full version history with inline field editing and diff views
- **Event status timeline** — structured lifecycle: draft → review → published → live → completed → archived
- **Registration config** — per-event registration steps, form fields, pricing rules, coupons
- **T-shirt distribution** — scan-to-collect, size chart, volunteer assignment
- **Certificate distribution** — bulk generation with Razorpay payment gate
- **Category change requests** — participant-initiated; admin review queue
- **Communication templates** — rich-text email templates with variable substitution
- **Scheduled emails** — future-send with cancellation support
- **Notification preferences** — per-user per-event opt-in/out
- **Route maps** — GPX/image upload for race routes
- **Event ops** — volunteer zone assignments, race-day ops dashboard
- **Cancellation + refund policy** — configurable rules; refund to Razorpay or manual
- **Waitlist** — auto-promote on cancellation

---

### Changed

- `app/api/events/register/route.ts` — fires `registration.created` webhook and evaluates automations for free registrations
- `app/api/events/verify-payment/route.ts` — fires `payment.succeeded` webhook and evaluates automations on confirmed payment
- `app/api/events/check-in/route.ts` — fires `participant.checked_in` webhook on successful check-in
- `app/admin/layout.tsx` — added "Developer" nav group with 7 links

---

### Fixed

- PostgreSQL `GENERATED ALWAYS AS ... STORED` column rejected `to_char()` (STABLE not IMMUTABLE); replaced with `DEFAULT` + `BEFORE INSERT` trigger on `api_usage_log.month_bucket`
- Supabase `PostgrestFilterBuilder` returns `PromiseLike` not `Promise`; removed `.catch()` calls, switched to `void` fire-and-forget or `try/await/catch` blocks

---

## [2.5.0] — 2026-07-27

Multi-Org SaaS, Event Management Platform Phase 1 (versions + inline edit + status timeline), Commerce & Finance Platform foundation. See v3.0.0 entry above for full detail.

---

## [2.0.0] — 2026-07-25

Production hardening release: structured logging, dual-secret rotation, health probes, k6 load tests, Playwright volunteer spec, CI Jest job. Score improved from 81 to 95+.

---

## [1.5.0] — 2026-07-21

WhatsApp messaging (Meta Cloud API), T-shirt distribution, email verification, bug reports with attachments.

---

## [1.0.0] — 2026-06-09

Soft launch. Core features: event registration, Razorpay payments, QR code check-in, BIB collection, session management, coaching platform, leaderboard, community feed, fitness integrations (Strava, Garmin, Apple Health, Fitbit, Google Health Connect), push notifications, referrals, membership plans.

---

[3.0.0]: https://github.com/connected-steps/app/compare/v2.5.0...v3.0.0
[2.5.0]: https://github.com/connected-steps/app/compare/v2.0.0...v2.5.0
[2.0.0]: https://github.com/connected-steps/app/compare/v1.5.0...v2.0.0
[1.5.0]: https://github.com/connected-steps/app/compare/v1.0.0...v1.5.0
[1.0.0]: https://github.com/connected-steps/app/releases/tag/v1.0.0
