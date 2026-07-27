# Connected Steps — Public API Guide (v1)

**Version 3.0 · 2026-07-28**

---

## Overview

The Connected Steps v1 API is a RESTful HTTP API scoped to a single organisation. All endpoints are prefixed with `/api/v1/`. Responses always use the JSON envelope described below.

**Base URL:** `https://www.connectedsteps.in`

---

## Authentication

All v1 endpoints require an API key. Obtain one from the Developer Portal at `/admin/developer/api-keys`.

```http
Authorization: Bearer cs_live_<48 hex chars>
```

Or equivalently:

```http
X-API-Key: cs_live_<48 hex chars>
```

API keys carry **scopes** that restrict which endpoints are callable. The key's organisation scope is enforced automatically — you cannot query data belonging to another organisation.

### Key Types
- `cs_live_*` — production keys, billed
- `cs_test_*` — test keys (same behaviour, same data; use for integration testing)

---

## Response Format

### Success (list)

```json
{
  "data": [ ... ],
  "meta": {
    "total": 243,
    "page": 1,
    "per_page": 20,
    "pages": 13
  }
}
```

### Success (single)

```json
{
  "data": { ... }
}
```

### Error

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Event not found."
  }
}
```

### Error Codes

| Code | HTTP Status | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing, invalid, or expired API key |
| `FORBIDDEN` | 403 | API key lacks required scope |
| `NOT_FOUND` | 404 | Resource does not exist or belongs to another org |
| `BAD_REQUEST` | 400 | Malformed request or invalid parameters |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error — retry with exponential back-off |

---

## Pagination

List endpoints accept `?page=` and `?per_page=` (max 100):

```
GET /api/v1/events?page=2&per_page=50
```

The `meta` block in every list response gives `total`, `pages`, and current page.

---

## Endpoints

### Events

#### List Events
```
GET /api/v1/events
Scope: events:read
```

Query params: `?status=`, `?page=`, `?per_page=`

Response: list of event objects with `{ id, name, start_date, end_date, status, capacity, participant_count, location, description, organization_id }`.

---

#### Get Event
```
GET /api/v1/events/:id
Scope: events:read
```

Returns single event with full detail including race categories.

---

#### List Event Registrations
```
GET /api/v1/events/:id/registrations
Scope: registrations:read
```

Query params: `?status=`, `?page=`, `?per_page=`

Returns registrations for a specific event.

---

### Registrations

#### List Registrations
```
GET /api/v1/registrations
Scope: registrations:read
```

Query params: `?event_id=`, `?status=`, `?page=`, `?per_page=`

---

#### Get Registration
```
GET /api/v1/registrations/:id
Scope: registrations:read
```

---

#### Create Registration
```
POST /api/v1/registrations
Scope: registrations:write
Content-Type: application/json
```

```json
{
  "event_id": "uuid",
  "user_email": "participant@example.com",
  "race_id": "uuid",
  "first_name": "Priya",
  "last_name": "Sharma",
  "phone": "+919876543210",
  "tshirt_size": "M"
}
```

Returns 201 with created registration. Payment-required registrations return `payment_status: "pending"`.

---

### Participants

#### List Participants
```
GET /api/v1/participants
Scope: participants:read
```

Query params: `?event_id=`, `?checked_in=true/false`, `?page=`, `?per_page=`

---

### Memberships

#### List Memberships
```
GET /api/v1/memberships
Scope: memberships:read
```

Returns active memberships for the organisation. Query params: `?status=active/expired`, `?page=`, `?per_page=`

---

### Merchandise

#### List Products
```
GET /api/v1/merchandise/products
Scope: merchandise:read
```

Returns product catalogue with variants and stock levels.

---

### Finance

#### Finance Summary
```
GET /api/v1/finance/summary
Scope: finance:read
```

Returns month-by-month revenue summary:

```json
{
  "data": [
    {
      "month": "2026-07",
      "revenue_inr": 158000,
      "registrations": 42,
      "refunds_inr": 2000
    }
  ]
}
```

---

## Webhooks

Subscribe to real-time event notifications by creating a webhook subscription in the Developer Portal (`/admin/developer/webhooks`).

### Payload Format

```json
{
  "event": "registration.created",
  "organization_id": "uuid",
  "timestamp": "2026-07-28T10:00:00.000Z",
  "data": {
    "registration_id": "uuid",
    "event_id": "uuid",
    "user_email": "participant@example.com",
    "payment_status": "free"
  }
}
```

### Signature Verification

Every delivery includes `X-CS-Signature: t=<unix_ms>,sha256=<hex>`.

Verify in your receiver:

```typescript
import crypto from "crypto";

function verifyWebhook(body: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(header.split(",").map(p => p.split("=")));
  const ts    = parseInt(parts["t"] ?? "0", 10);
  const sig   = parts["sha256"] ?? "";

  // Reject replays older than 5 minutes
  if (Math.abs(Date.now() - ts) > 300_000) return false;

  const expected = crypto.createHmac("sha256", secret)
    .update(`${ts}.${body}`)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}
```

### Available Events

| Event | Fired when |
|---|---|
| `registration.created` | New registration confirmed |
| `registration.updated` | Registration details changed |
| `registration.cancelled` | Registration cancelled |
| `payment.succeeded` | Payment confirmed via Razorpay |
| `payment.failed` | Payment failed |
| `participant.checked_in` | QR code scanned at event |
| `certificate.generated` | Certificate issued |
| `refund.completed` | Refund processed to original payment method |
| `membership.renewed` | Membership plan renewed |
| `membership.expired` | Membership expired |
| `waitlist.promoted` | Waitlisted participant moved to confirmed |
| `merchandise.order_created` | Merchandise order placed |
| `merchandise.order_updated` | Merchandise order status changed |

### Retry Policy

Failed deliveries are retried with exponential back-off: 30s, 5m, 30m, 2h, 6h (5 attempts total). After 5 failures, delivery is marked `dead` and no further retries occur. Use the `/admin/developer/webhooks/:id/deliveries` endpoint or the Replay button in the portal to re-trigger.

---

## Rate Limits

| Tier | Limit |
|---|---|
| Default | 60 requests/minute |
| Custom | Configurable per subscription |

When rate limited, you receive HTTP 429 with `Retry-After` header.

---

## CSV Import (Bulk Operations)

For bulk imports, use the import API rather than repeated POST calls:

```
POST /api/admin/import
Content-Type: multipart/form-data

Fields:
  org_id:       <organization_id>
  entity_type:  participants | registrations | volunteers | merchandise | sponsors | coupons
  file:         <CSV file>
  event_id:     <uuid>  (required for registrations/volunteers)
```

**Two-phase process:**
1. Upload returns `validation_report` and `can_commit` flag
2. If `can_commit: true`, call `POST /api/admin/import/:id/commit`
3. Poll `GET /api/admin/import/:id` for `status: "done"`

---

## SDK Examples

### Node.js / TypeScript

```typescript
const CS_API_KEY = process.env.CS_API_KEY!;
const BASE = "https://www.connectedsteps.in";

async function getEvents(page = 1) {
  const res = await fetch(`${BASE}/api/v1/events?page=${page}`, {
    headers: { "Authorization": `Bearer ${CS_API_KEY}` },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Pagination helper
async function* allEvents() {
  let page = 1;
  while (true) {
    const { data, meta } = await getEvents(page);
    yield* data;
    if (page >= meta.pages) break;
    page++;
  }
}
```

### Python

```python
import requests

headers = {"Authorization": f"Bearer {CS_API_KEY}"}
base = "https://www.connectedsteps.in"

r = requests.get(f"{base}/api/v1/events", headers=headers)
r.raise_for_status()
events = r.json()["data"]
```

### cURL

```bash
curl https://www.connectedsteps.in/api/v1/events \
  -H "Authorization: Bearer cs_live_<key>"
```

---

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-07-28 | Initial release — events, registrations, participants, memberships, merchandise, finance |
