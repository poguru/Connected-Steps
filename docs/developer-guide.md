# Connected Steps — Developer Guide

**Version 3.0 · 2026-07-28**

---

## Getting Started

### Prerequisites
- Node.js 20 LTS
- npm 10+
- Access to the Supabase project

### Quick Start

```bash
git clone <repo>
cd connected-steps
npm ci
cp .env.example .env.local  # fill in required values
npm run dev                  # http://localhost:3000
```

### Running Tests

```bash
# All tests
npm test

# With coverage
npx jest --coverage

# Specific test file
npx jest __tests__/integration/api-key.test.ts

# Watch mode
npx jest --watch
```

### Type Checking

```bash
npx tsc --noEmit
```

---

## Project Structure

All server-side shared code lives in `lib/`. Next.js API routes live in `app/api/`. UI pages live in `app/`.

The `lib/` directory is the source of truth for business logic — API routes are thin wrappers that parse requests, call lib functions, and format responses.

---

## Adding a New API Route

### Admin API route (cookie auth)

```typescript
// app/api/admin/my-feature/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, canAccessOrg, writeOrgAudit, actorEmail } from "@/lib/org-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessOrg(ctx, "my_feature:read")) 
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("my_table")
    .select("*")
    .eq("organization_id", ctx.organization_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Query failed" }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessOrg(ctx, "my_feature:write"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as { name: string };
  // validate...

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("my_table")
    .insert({ name: body.name, organization_id: ctx.organization_id, created_by: actorEmail(ctx) })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Insert failed" }, { status: 500 });

  await writeOrgAudit(ctx, "my_table.created", { id: data.id });
  return NextResponse.json({ data }, { status: 201 });
}
```

### v1 Public API route

```typescript
// app/api/v1/my-resource/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireV1Auth, parsePagination, v1Paginated, finishV1Request, V1_ERRORS } from "@/lib/v1-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const ctx = await requireV1Auth(req, "my_resource:read");
  if (ctx instanceof NextResponse) return ctx;

  const pg = parsePagination(req);
  const db = getSupabaseServer();

  const { data, count, error } = await db
    .from("my_table")
    .select("*", { count: "exact" })
    .eq("organization_id", ctx.organization_id)
    .order("created_at", { ascending: false })
    .range(pg.offset, pg.offset + pg.per_page - 1);

  const status = error ? 500 : 200;
  const response = error
    ? V1_ERRORS.internal()
    : v1Paginated(data ?? [], count ?? 0, pg);

  finishV1Request(ctx, req, status);
  return response;
}
```

---

## Adding a Database Migration

1. Create a new file in `supabase/migrations/`:
   ```
   supabase/migrations/20260728NNNNNN_my_feature.sql
   ```

2. Always include RLS in the same migration:
   ```sql
   CREATE TABLE IF NOT EXISTS my_table (
     id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
     name            TEXT NOT NULL,
     created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   
   -- Indexes
   CREATE INDEX idx_my_table_org ON my_table(organization_id);
   
   -- RLS (REQUIRED — every new table must have this)
   ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;
   REVOKE ALL ON my_table FROM anon, authenticated;
   -- service_role has full access by default (no explicit grant needed)
   ```

3. Apply locally:
   ```bash
   supabase db push
   ```

**Rules:**
- Every new table MUST have `ENABLE ROW LEVEL SECURITY` + `REVOKE ALL ... FROM anon, authenticated` in the same migration
- Never modify applied migrations — always add a new one
- Name migrations with the next sequential number for the same date

---

## Working with the Job Queue

```typescript
import { enqueueJob } from "@/lib/job-queue";

// Enqueue a job
await enqueueJob("my_job_type", {
  some_param: "value",
}, {
  idempotencyKey: "my_job:unique-key",  // optional; prevents duplicates
  maxAttempts: 3,                        // optional; default 5
});
```

Add a handler in `lib/job-handlers.ts`:
```typescript
case "my_job_type": {
  const { some_param } = payload as { some_param: string };
  // ... process job
  break;
}
```

---

## Org Auth Utilities

```typescript
import { 
  getOrgContext,    // Resolve org from request cookies
  canAccessOrg,     // Check permission in permission matrix
  writeOrgAudit,    // Write to audit_logs table
  actorEmail,       // Extract actor email from context
  DEFAULT_ORG_ID,   // "00000000-0000-0000-0000-000000000001"
} from "@/lib/org-auth";
```

Available permissions: see `lib/org-auth.ts` — the `PM` constant defines the full permission matrix.

---

## Firing Webhook Events

After any business-logic mutation, fire the corresponding webhook:

```typescript
import { dispatchWebhookEvent } from "@/lib/webhook-dispatch";
import { evaluateAutomations }  from "@/lib/automation-engine";

// Fire-and-forget pattern (non-critical path)
dispatchWebhookEvent(organization_id, "registration.created", {
  registration_id: reg.id,
  event_id: reg.event_id,
  user_email: reg.user_email,
}).catch(() => {});

evaluateAutomations(organization_id, "registration.created", {
  registration_id: reg.id,
  event_id: reg.event_id,
}).catch(() => {});
```

Use `after()` (Next.js 16 background task) if available, so the webhook dispatch doesn't block the HTTP response.

---

## API Key Scopes

When adding a new v1 route, add the required scope to `ApiKeyScope` in `lib/api-key.ts` and the `ALL_SCOPES` array in the API key management UI.

Available scopes: `events:read`, `events:write`, `registrations:read`, `registrations:write`, `participants:read`, `participants:write`, `memberships:read`, `merchandise:read`, `merchandise:write`, `finance:read`, `communications:read`, `communications:write`, `webhooks:read`, `webhooks:write`, `import:write`, `*`

---

## Logging

```typescript
import { logger } from "@/lib/logger";

logger.info("Operation completed", { user_id, event_id, duration_ms: 42 });
logger.warn("Slow query detected", { table: "registrations", duration_ms: 5000 });
logger.error("Payment failed", { order_id, error: err.message });
```

Logs are structured JSON. In production they go to Vercel's log drain. Do not use `console.log` in production code — use `logger`.

---

## Common TypeScript Pitfalls

### Supabase returns `PromiseLike`, not `Promise`

```typescript
// WRONG — .catch() doesn't exist on PromiseLike
db.from("table").update({}).eq("id", id).catch(() => {});

// CORRECT — use void for fire-and-forget
void db.from("table").update({}).eq("id", id);

// CORRECT — await in try/catch
try {
  await db.from("table").update({}).eq("id", id);
} catch { /* non-critical */ }
```

### v1 route context narrowing

```typescript
// WRONG — "error" is not a reliable discriminant
if ("error" in ctx) return ctx;

// CORRECT — instanceof check
if (ctx instanceof NextResponse) return ctx;
```

### Supabase joined columns are arrays, not scalars

When joining with `select("*, relation(col)")`, the joined data is typed as an array even if one-to-one. Use explicit casting when you know the relationship is unique:

```typescript
const org = ((row as unknown) as { organizations: { id: string } }).organizations;
```

---

## Code Style

- TypeScript strict mode is enabled — no `any` without justification
- No `console.log` in production code
- No comments explaining what code does; only WHY if non-obvious
- No error messages from the database exposed directly to clients
- Rate-limit user-facing endpoints that could be abused
- All admin mutations write to `audit_logs` via `writeOrgAudit()`
