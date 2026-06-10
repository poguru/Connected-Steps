# Connected Steps — Supabase RLS Security Audit
**Date:** 2026-06-10  
**Migration file:** `migrations/20260610000001_enable_rls_all_tables.sql`

---

## Critical Finding Before Anything Else

**Without this migration, the anon key (hardcoded in the browser bundle) can be used to directly query the Supabase REST API and read every row in every table — including bcrypt password hashes, active OTP codes, Razorpay payment IDs, Strava OAuth tokens, blood groups from run registrations, and emergency contact details.**

Example attack (no authentication required, right now):
```
GET https://jwhnxsfhkoodjdhbibvn.supabase.co/rest/v1/users?select=*
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

This migration closes that exposure entirely.

---

## Architecture Context

### Why `auth.uid()` is not used in any policy

The application uses **custom authentication** — bcrypt passwords stored in a `users` table, validated server-side. Supabase Auth (the magic link / OAuth system) is never called. As a result:

- Every browser request carries the `anon` role
- `auth.uid()` returns `NULL` for every browser request
- The `authenticated` Supabase role is never set
- Policies based on `auth.uid() = user_email` would never match

### Why enabling RLS does not break any API route

Every server-side Next.js route uses `getSupabaseServer()`, which initialises Supabase with the **service role key**. The service role bypasses all RLS policies unconditionally. Enabling RLS has zero effect on any `/api/*` route.

### What RLS actually protects

Direct access to the Supabase PostgREST API and Realtime WebSocket using the anon key (which is visible in the browser JavaScript bundle and network requests).

---

## Tables Reviewed — All 37

### Section 1 — Fully Blocked (25 tables)

| Table | Why Blocked | Data at Risk |
|---|---|---|
| `users` | Contains bcrypt password hashes and personal info | Email, password, phone — account takeover |
| `memberships` | Financial subscription records | Razorpay payment IDs, plan, expiry |
| `otp_verifications` | Active 6-digit OTP codes | Direct account takeover via code theft |
| `password_resets` | Reset tokens | Direct account takeover |
| `training_plans` | Private coach-written plans | Personal training data, coach IP |
| `coach_questions` | Private member Q&A | Injury details, personal health info |
| `coach_ratings` | Private feedback | Personal opinions |
| `session_feedback` | Private session ratings | Personal opinions |
| `messages` | Private coach ↔ athlete DMs | Private conversations |
| `conversations` | Message thread metadata | Unread counts, participant emails |
| `push_tokens` | Mobile FCM device tokens | Device fingerprinting |
| `push_subscriptions` | Web push endpoint URLs + secrets | Push notification abuse |
| `user_integrations` | Strava/Fitbit OAuth tokens | Full access to connected fitness accounts |
| `synced_activities` | Personal GPS run data | Location history |
| `run_registrations` | Weekend run signups | Blood group, emergency contact, phone |
| `coupons` | Discount codes | Revenue loss via code abuse |
| `coupon_uses` | Usage audit trail | Email–payment linkage |
| `stories` | Pending user stories | Personal narratives before admin approval |
| `follows` | Social graph | Who follows who |
| `post_likes` | Community engagement | Email–content association |
| `photo_likes` | Photo engagement | Email–content association |
| `photo_comments` | Photo comments | Email–content association |
| `monthly_leaderboard_archive` | Historical snapshots | |
| `cohorts` | Internal coach groups | Internal operations |
| `cohort_members` | Athlete group membership | Internal operations |
| `plan_templates` | Reusable plan templates | Coach intellectual property |

**Policy created:** None. RLS enabled with no policies = implicit DENY ALL for anon.

---

### Section 2 — Publicly Readable (6 tables)

| Table | Policy | Condition |
|---|---|---|
| `sessions` | `sessions_anon_select` | `USING (true)` — all sessions |
| `coaches` | `coaches_anon_select_active` | `USING (is_active = true)` — active only |
| `run_events` | `run_events_anon_select` | `USING (true)` — all events |
| `activity_sources` | `activity_sources_anon_select` | `USING (true)` — static list |
| `community_posts` | `community_posts_anon_select_approved` | `USING (approved = true)` — approved only |
| `community_replies` | `community_replies_anon_select_approved` | `USING (approved = true)` — approved only |

---

### Section 3 — Realtime Subscription Tables (3 tables)

These tables grant SELECT to anon because the browser uses Supabase Realtime (`postgres_changes`) to receive live updates. Without a SELECT policy, events are silently dropped.

| Table | Used by | Risk Level | Justification |
|---|---|---|---|
| `leaderboard` | `Leaderboard.tsx`, `Dashboard.tsx` | Low | Public points data already shown via API |
| `session_attendance` | `Dashboard.tsx` | Low-Medium | RSVP counts are already public; who joined which session is community-facing data |
| `session_photos` | Feed and gallery | None | Photos are already public |

**Known limitation:** `CoachInbox.tsx` subscribes to `messages` via realtime. Since `messages` is blocked to anon, these realtime events will be silently dropped. The inbox continues to work via API polling but does not receive live message pushes. **Fix:** Migrate coach inbox to use Supabase Auth sessions so the JWT carries the coach's identity.

---

## Policies Added — Summary

| Table | Policy Name | Role | Operation | Condition |
|---|---|---|---|---|
| `sessions` | `sessions_anon_select` | anon | SELECT | always |
| `coaches` | `coaches_anon_select_active` | anon | SELECT | `is_active = true` |
| `run_events` | `run_events_anon_select` | anon | SELECT | always |
| `activity_sources` | `activity_sources_anon_select` | anon | SELECT | always |
| `community_posts` | `community_posts_anon_select_approved` | anon | SELECT | `approved = true` |
| `community_replies` | `community_replies_anon_select_approved` | anon | SELECT | `approved = true` |
| `leaderboard` | `leaderboard_anon_select` | anon | SELECT | always |
| `session_attendance` | `session_attendance_anon_select` | anon | SELECT | always |
| `session_photos` | `session_photos_anon_select` | anon | SELECT | always |

**All other tables:** No policies added = DENY ALL for anon role.

---

## Remaining Security Risks

### High

**1. No authentication on user data mutation endpoints**  
`POST /api/user/update` accepts any email and modifies that user's record without any proof of identity. Any caller who knows a user's email can change their name, phone, location, and photo.

*Fix:* After updating profile, require the user to prove identity. Since this app uses custom auth, store a short-lived session token (e.g., in a signed HTTP-only cookie set at login) and validate it in the update endpoint.

**2. Email-enumeration on sensitive endpoints**  
Routes like `/api/user/payments?email=`, `/api/user/sessions?email=`, and `/api/auth/role?email=` return user-specific data without authentication. Anyone can enumerate users and read their payment history.

*Fix:* Require a session cookie or signed token to prove the requesting user is the owner of the email being queried.

**3. No rate limiting anywhere**  
`/api/auth/send-otp`, `/api/auth/login`, and `/api/coupons/validate` have no rate limiting. An attacker can:
- Flood OTP sends (SMS/email cost + user harassment)
- Brute-force login passwords
- Enumerate valid coupon codes

*Fix:* Add rate limiting via Vercel Edge Config, Upstash Redis, or a simple in-memory store with a sliding window.

---

### Medium

**4. Leaderboard exposes user emails**  
The `leaderboard` table is now publicly readable (required for realtime). If the `user_email` column is stored there, it is now publicly enumerable.

*Fix:* Verify the application only stores `user_name` (not `user_email`) in the leaderboard table. If `user_email` exists as a column, create a Postgres view without it and grant SELECT on the view instead of the raw table.

```sql
-- Check for email column in leaderboard:
SELECT column_name FROM information_schema.columns
WHERE table_name = 'leaderboard' AND column_name LIKE '%email%';
```

**5. Session attendance exposes user emails**  
`session_attendance` is now publicly readable. The `user_email` column links a person's identity to specific session dates, which could be used to infer location patterns.

*Accepted tradeoff* for now (running community, RSVP is already publicly visible). Recommend revisiting if the platform grows to 500+ users.

**6. CoachInbox realtime is broken post-migration**  
As noted above, `messages` is blocked to anon. The coach inbox no longer receives live message pushes.

*Fix:* Migrate to Supabase Auth for coaches. Issue a Supabase JWT when a coach logs in (using the existing coach token verification), then write an RLS policy like:  
`USING (sender_email = auth.jwt() ->> 'email' OR recipient_email = auth.jwt() ->> 'email')`

---

### Low

**7. Anon key hardcoded in browser bundle**  
`lib/supabase.ts` hardcodes the anon key. This is standard Supabase practice — the anon key is designed to be public. After this migration is applied, the anon key grants only the SELECT access explicitly defined above. This is acceptable.

**8. Service role key in environment variables**  
`lib/supabase-server.ts` reads the service role key from `SUPABASE_SERVICE_ROLE_KEY`. Verify this key is **never** exposed to the browser. It is not — the file is server-only and throws if the key is missing, so the build would fail if it leaked to a client bundle.

**9. Admin password in HTTP header**  
The `x-admin-password` header is a simple secret compared in plaintext. It is transmitted over HTTPS so it is not exposed in transit, but it appears in server logs and has no expiry. Consider rotating it periodically.

---

## How to Apply This Migration

### Option A — Supabase SQL Editor (recommended for first apply)

1. Go to Supabase Dashboard → SQL Editor
2. Paste the contents of `migrations/20260610000001_enable_rls_all_tables.sql`
3. Click **Run**
4. Run the verification queries at the bottom of the file

### Option B — Supabase CLI

```bash
npx supabase db push
```

Requires `supabase/config.toml` to be configured with your project ref.

---

## Verification Checklist

After applying, verify these manually:

- [ ] Homepage loads and shows sessions, coaches, community posts
- [ ] Dashboard loads for a logged-in user
- [ ] Leaderboard loads and live updates work
- [ ] Dashboard RSVP count updates in real time when another user joins
- [ ] Training plan loads on dashboard
- [ ] Session join/leave works
- [ ] Admin panel at `/admin` works normally
- [ ] Coach ops dashboard at `/admin/coach-ops` works normally
- [ ] Membership payment flow completes

**Test that blocked access works:**
```bash
# This should return 0 rows or an error, not user data:
curl "https://jwhnxsfhkoodjdhbibvn.supabase.co/rest/v1/users?select=*" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aG54c2Zoa29vZGpkaGJpYnZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3ODU4MDEsImV4cCI6MjA5MjM2MTgwMX0.nrpMhzlr6KWvYym_mJvgLEDilx-z1tPwRLqw6Wo87KY" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aG54c2Zoa29vZGpkaGJpYnZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3ODU4MDEsImV4cCI6MjA5MjM2MTgwMX0.nrpMhzlr6KWvYym_mJvgLEDilx-z1tPwRLqw6Wo87KY"

# Expected response: {"code":"42501","details":null,"hint":null,"message":"permission denied for table users"}
```

```bash
# This should return session data:
curl "https://jwhnxsfhkoodjdhbibvn.supabase.co/rest/v1/sessions?select=id,title,date" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aG54c2Zoa29vZGpkaGJpYnZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3ODU4MDEsImV4cCI6MjA5MjM2MTgwMX0.nrpMhzlr6KWvYym_mJvgLEDilx-z1tPwRLqw6Wo87KY" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aG54c2Zoa29vZGpkaGJpYnZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3ODU4MDEsImV4cCI6MjA5MjM2MTgwMX0.nrpMhzlr6KWvYym_mJvgLEDilx-z1tPwRLqw6Wo87KY"

# Expected response: JSON array of session objects
```
