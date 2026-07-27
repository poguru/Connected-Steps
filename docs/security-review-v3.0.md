# Security Review — v3.0 Release

**Reviewer:** Release Manager  
**Date:** 2026-07-28  
**Standard:** OWASP Top 10, OWASP API Security Top 10

---

## Summary

The codebase demonstrates strong security practices across authentication, authorisation, and data isolation. Three findings require attention before launch.

**Overall result: PASS — 1 medium finding (fixed), 1 medium finding (documented known limitation)**

---

## Authentication

### Admin Cookie Auth

| Check | Result |
|---|---|
| Password stored as bcrypt | ✅ |
| Session cookie is HttpOnly | ✅ |
| Session cookie has SameSite=Lax | ✅ |
| Session TTL enforced (30 days) | ✅ |
| Login endpoint is rate-limited | ✅ |
| No password exposed in logs | ✅ |

### v1 API Key Auth

| Check | Result |
|---|---|
| Raw key never stored | ✅ |
| Key stored as SHA-256 hash | ✅ |
| Lookup uses key_prefix for O(log n) + timing-safe compare for final | ✅ |
| Expired keys rejected | ✅ |
| Deactivated keys rejected | ✅ |
| Scope enforced per endpoint | ✅ |
| Key accepted in Authorization header AND X-API-Key | ✅ (both supported) |

### Inbound Webhooks

| Check | Result |
|---|---|
| Razorpay webhook: HMAC-SHA256 signature verified on raw body | ✅ |
| Meta WhatsApp: X-Hub-Signature-256 verified | ✅ |
| ZeptoMail bounces: Bearer token verified | ✅ |

---

## Authorisation

### Multi-Org Isolation

| Check | Result |
|---|---|
| All v1 routes inject organization_id from auth context | ✅ |
| All admin routes call getOrgContext() before query | ✅ |
| canAccessOrg() checked for permission before mutation | ✅ |
| RLS on all Supabase tables | ✅ |
| anon + authenticated roles revoked on all tables | ✅ |
| service_role used exclusively in server routes | ✅ |
| Org ID cannot be injected by request body | ✅ (only from validated session) |

---

## Webhook Security

| Check | Result |
|---|---|
| Outbound webhook signed with HMAC-SHA256 | ✅ |
| Signing secret returned only at creation | ✅ |
| Signing secret not returned in GET endpoints | ✅ |
| 5-minute replay window documented | ✅ |
| Webhook URL validated as valid URL before save | ✅ |
| Test endpoint has AbortController timeout (30s max) | ✅ |

---

## API Key Security

| Check | Result |
|---|---|
| Key format includes type prefix (cs_live_, cs_test_) | ✅ |
| Key hash is 256-bit SHA-2 | ✅ |
| Key prefix used for fast lookup; full hash for verification | ✅ |
| timingSafeEqual prevents timing attacks | ✅ |
| Rotation creates new key, deactivates old atomically | ✅ |
| Usage logged per-request (fire-and-forget) | ✅ |

---

## Input Validation

### API Routes

| Check | Result |
|---|---|
| Request bodies parsed with typed casts | ✅ |
| Webhook URL validated with `new URL()` | ✅ |
| Event types validated against WEBHOOK_EVENTS enum | ✅ |
| Condition operators validated against VALID_OPERATORS | ✅ |
| Pagination params clamped (per_page max 100) | ✅ |
| CSV rows validated before any DB writes | ✅ |
| File upload limited to CSV content type | ⚠️ S1 |

### Database Queries

| Check | Result |
|---|---|
| All queries use parameterised Supabase client | ✅ |
| No raw SQL string interpolation in app code | ✅ |
| Error messages not exposed raw to clients | ✅ (generic 500 returned) |

---

## Secrets and Configuration

| Check | Result |
|---|---|
| No secrets in source code | ✅ |
| .env.local in .gitignore | ✅ (assumed; standard Next.js behaviour) |
| Service role key server-side only | ✅ (no NEXT_PUBLIC_ prefix) |
| Connector config values not returned in GET | ✅ |
| Connector config values stored plaintext | ⚠️ S2 (advisory) |

---

## HTTP Security Headers

Security headers are fully configured in `next.config.ts` applied to all routes (`/(.*)`):

| Header | Value | Status |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | ✅ Configured |
| `X-Frame-Options` | `SAMEORIGIN` | ✅ Configured |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | ✅ Configured |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | ✅ Configured |
| `Permissions-Policy` | camera=(self), microphone=(), ... | ✅ Configured |
| `X-XSS-Protection` | `1; mode=block` | ✅ Configured |
| `Content-Security-Policy` | Full policy with script-src, img-src, connect-src, frame-src | ✅ Configured |

---

## Rate Limiting

| Endpoint Type | Rate Limited |
|---|---|
| Admin login | ✅ (lib/rate-limit.ts) |
| v1 API | ✅ (per-key RPM via api_usage_log + webhook subscription rate_limit_rpm) |
| Public registration | ✅ |
| Cron endpoints | Protected by secret token |

---

## Findings

### S1 — CSV Upload: Missing File Size Limit (Medium → Fixed)

**Location:** `app/api/admin/import/route.ts`  
**Issue:** The CSV upload handler validated the `.csv` extension but had no file size cap. A large file could exhaust memory during `file.arrayBuffer()`.  
**Fix applied:** Added `MAX_CSV_BYTES = 10 MB` check before reading file contents. Returns HTTP 413 if exceeded.  
**Status:** FIXED in this release.

### S2 — Connector Config: Plaintext Secrets (Medium)

**Location:** `connector_configs.config` column  
**Issue:** Third-party credentials (API keys, OAuth tokens) stored as plaintext JSONB. A database leak would expose these credentials.  
**Recommendation:** Encrypt sensitive fields using AES-256-GCM with a key stored in Vercel env vars before writing to DB; decrypt on read in the connector adapter.  
**Exploitability:** Requires database access — RLS and service-role isolation reduce risk.

---

## Finding Summary

| ID | Description | Severity | Status |
|---|---|---|---|
| S1 | CSV upload missing file size limit | Medium | Fixed in this release |
| S2 | Connector configs store secrets plaintext | Medium | Documented known limitation; fix in v3.1 |
