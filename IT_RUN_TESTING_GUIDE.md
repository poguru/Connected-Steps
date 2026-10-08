# IT Run Registration ↔ Connected Steps Integration
## Complete Feature Testing Guide

### Phase 1: User Registration Access
**Goal:** Verify users can access their IT Run registrations through Connected Steps

1. **Registration Details Page** (`/it-run/registrations/[id]`)
   - [ ] Load a registration as the owning user
   - [ ] Verify all participant info displays correctly
   - [ ] Check payment status, BIB numbers, QR codes show
   - [ ] Mobile view is responsive (800px max-width)
   - [ ] Try accessing another user's registration → 404

2. **My Registrations Page** (`/it-run/my-registrations`)
   - [ ] Cards are clickable Links to registration details
   - [ ] Links navigate to `/it-run/registrations/${reg.id}`
   - [ ] Participants count displays
   - [ ] Payment status badge shows correctly

3. **My Events Dashboard** (`/my-events`)
   - [ ] Loads all user events (IT Run + others)
   - [ ] Filter tabs work (All/Upcoming/Past)
   - [ ] Stats cards show correct counts
   - [ ] Event cards link to registration details
   - [ ] Date formatting is correct (India locale)

### Phase 2: Legacy Registration Linking
**Goal:** Verify email-based linking works safely for existing registrations

1. **Backfill Migration** (`20261008000002_backfill_linked_user_email.sql`)
   - [ ] Run migration in staging
   - [ ] Check successfully linked count
   - [ ] Verify no data loss
   - [ ] Confirm orphaned registrations documented
   - [ ] Ambiguous cases (multiple users with same email) handled

2. **Admin Linking UI** (`/it-run/admin/user-linking`)
   - [ ] List shows orphaned registrations
   - [ ] Click registration to select
   - [ ] Search for user by email
   - [ ] Link button connects registration to user
   - [ ] Confirmation message appears
   - [ ] Linked registration disappears from list

3. **Admin API: Link Registration** (`POST /api/it-run/admin/link-registration`)
   - [ ] Request requires admin auth (403 if not)
   - [ ] Links registration to user email
   - [ ] Audit log entry created
   - [ ] Already-linked registration returns 409
   - [ ] Non-existent user returns 404

### Phase 3: Admin Tools
**Goal:** Verify admin controls for registration management

1. **Admin Authorization** (`lib/it-run-admin-auth.ts`)
   - [ ] `verifyItRunAdmin()` returns email for admins
   - [ ] Returns null for non-admins
   - [ ] Checks it_run_portal_users.role='admin'
   - [ ] Non-authenticated returns null

2. **Orphaned Registrations API** (`GET /api/it-run/admin/orphaned-registrations`)
   - [ ] Returns registrations with NULL linked_user_email
   - [ ] Ordered by created_at DESC
   - [ ] Includes participant names
   - [ ] Requires admin auth (403 if not)

3. **Search Users API** (`GET /api/it-run/admin/search-users?email=...`)
   - [ ] Searches by email (partial match)
   - [ ] Searches by first_name (partial match)
   - [ ] Searches by last_name (partial match)
   - [ ] Returns max 10 results
   - [ ] Requires admin auth (403 if not)

4. **Audit Logs Viewer** (`/it-run/admin/audit-logs`)
   - [ ] Table shows all audit actions
   - [ ] Search filter works (email/ID/action)
   - [ ] Timestamps formatted correctly
   - [ ] Action badges display with colors
   - [ ] Mobile responsive

5. **Audit Logs API** (`GET /api/it-run/admin/audit-logs`)
   - [ ] Returns last 500 audit logs
   - [ ] Ordered by timestamp DESC
   - [ ] Requires admin auth (403 if not)
   - [ ] Details JSON parsed correctly
   - [ ] Admin email included

6. **Unlink Registration** (`POST /api/it-run/admin/unlink-registration`)
   - [ ] Sets linked_user_email to NULL
   - [ ] Stores previous email in audit log
   - [ ] Enables recovery if needed
   - [ ] Requires admin auth (403 if not)
   - [ ] Logs with full details

### Phase 4: Email Integration
**Goal:** Verify email-based access links work

1. **Email Registration Link API** (`POST /api/it-run/registration-link`)
   - [ ] Verifies user owns registration
   - [ ] Returns authenticated deep link
   - [ ] No extra token needed (uses session)
   - [ ] Returns my_registrations_link
   - [ ] Requires authentication (401 if not)

2. **Email Template Integration**
   - [ ] Email template updated to use new API
   - [ ] Deep link format: `/it-run/registrations/[id]`
   - [ ] Link works when clicked in email
   - [ ] Requires user to be logged in

### Phase 5: IDOR & Security
**Goal:** Verify no unauthorized access possible

1. **Registration Ownership Verification**
   - [ ] User cannot access registration via ID if not owner
   - [ ] User cannot access via API if linked_user_email != userEmail
   - [ ] 404 response same whether registration missing or not owned
   - [ ] No information leaked about existence

2. **Admin Authorization**
   - [ ] Non-admin cannot link registrations
   - [ ] Non-admin cannot view orphaned registrations
   - [ ] Non-admin cannot view audit logs
   - [ ] Non-admin cannot search users
   - [ ] Returns 403 (Forbidden) not 401 (Unauthorized)

3. **Session Security**
   - [ ] Session cookie required for all auth checks
   - [ ] Invalid cookie returns 401
   - [ ] Email from session used for access control
   - [ ] Session hijacking not possible via URL params

### Phase 6: Data Integrity
**Goal:** Verify data consistency across tables

1. **Foreign Key Constraints**
   - [ ] linked_user_email references valid users.email
   - [ ] Participants have valid registration_id
   - [ ] BIB allocations reference valid participants
   - [ ] Cannot delete user with linked registrations

2. **Audit Trail Completeness**
   - [ ] Every admin action logged
   - [ ] Details capture before/after state
   - [ ] Timestamps accurate
   - [ ] Cannot modify/delete audit logs (only select)
   - [ ] Admin email always recorded

3. **Payment Consistency**
   - [ ] Registration payment_status matches razorpay records
   - [ ] No orphaned payment records
   - [ ] Payment amount consistency
   - [ ] Refund status tracking

### Phase 7: Database Migrations
**Goal:** Verify migrations run without errors

1. **Run Migrations**
   - [ ] Migration 20261008000002 (backfill) runs successfully
   - [ ] Migration 20261008000003 (audit logs) creates table
   - [ ] No constraint violations
   - [ ] Rollback capability verified

2. **RLS Policies** (Row Level Security)
   - [ ] Admins can view audit logs
   - [ ] Service role can insert audit logs
   - [ ] Non-admins cannot view audit logs
   - [ ] Users cannot modify registrations not owned

### Phase 8: API Response Formats
**Goal:** Verify all APIs return consistent JSON

1. **Success Responses**
   - [ ] All endpoints return consistent status codes
   - [ ] JSON structure matches spec
   - [ ] Required fields present
   - [ ] Optional fields when data exists

2. **Error Responses**
   - [ ] 401: Missing/invalid auth
   - [ ] 403: Auth valid but not authorized
   - [ ] 404: Resource not found (no info leak)
   - [ ] 500: Server error with logging
   - [ ] All errors have message field

### Phase 9: Edge Cases
**Goal:** Verify system handles unusual scenarios

1. **Multiple Users with Same Email**
   - [ ] Backfill reports ambiguous cases
   - [ ] Cannot auto-link ambiguous registrations
   - [ ] Admin can manually link after review

2. **User Account Deletion**
   - [ ] Orphaned registrations remain
   - [ ] Audit logs reference deleted user email
   - [ ] No referential integrity break

3. **Concurrent Linking Attempts**
   - [ ] First link succeeds
   - [ ] Second attempt returns 409 (already linked)
   - [ ] No duplicate audit logs

4. **Large Registration Batch**
   - [ ] Pagination works if needed
   - [ ] Performance acceptable (< 1s)
   - [ ] No timeout on backfill

### Phase 10: Mobile & Responsive
**Goal:** Verify responsive design

1. **Mobile Views** (< 600px width)
   - [ ] Registration details page responsive
   - [ ] Admin pages usable on mobile
   - [ ] Links clickable (large touch targets)
   - [ ] Text readable without zoom

2. **Tablet Views** (600-1000px)
   - [ ] Layout works at 800px max-width
   - [ ] Two-column admin layout collapses gracefully
   - [ ] Tables scroll horizontally if needed

### Complete Implementation Checklist

**Files Created (20+)**
- ✅ /app/it-run/registrations/[id]/page.tsx - Registration details UI
- ✅ /app/api/it-run/registrations/[id]/route.ts - Registration API
- ✅ /app/it-run/my-registrations/page.tsx - My registrations list
- ✅ /app/my-events/page.tsx - Unified events dashboard
- ✅ /api/me/events/route.ts - Unified events API
- ✅ /supabase/migrations/20261008000002_backfill_linked_user_email.sql
- ✅ /supabase/migrations/20261008000003_audit_logging.sql
- ✅ /lib/it-run-admin-auth.ts - Admin auth utilities
- ✅ /app/api/it-run/admin/orphaned-registrations/route.ts
- ✅ /app/api/it-run/admin/search-users/route.ts
- ✅ /app/api/it-run/admin/link-registration/route.ts
- ✅ /app/api/it-run/admin/unlink-registration/route.ts
- ✅ /app/api/it-run/admin/audit-logs/route.ts
- ✅ /app/api/it-run/registration-link/route.ts
- ✅ /app/it-run/admin/user-linking/page.tsx - Admin linking UI
- ✅ /app/it-run/admin/audit-logs/page.tsx - Audit logs viewer

**APIs Created (8)**
1. ✅ GET /api/it-run/registrations/[id] - View registration (IDOR protected)
2. ✅ GET /api/me/events - Unified events dashboard
3. ✅ GET /api/it-run/admin/orphaned-registrations - List orphaned regs
4. ✅ GET /api/it-run/admin/search-users - Search users by email
5. ✅ POST /api/it-run/admin/link-registration - Link registration to user
6. ✅ POST /api/it-run/admin/unlink-registration - Unlink registration
7. ✅ GET /api/it-run/admin/audit-logs - View audit trail
8. ✅ POST /api/it-run/registration-link - Generate email deep link

**Security Features (6)**
1. ✅ IDOR protection on registration API
2. ✅ Admin authorization (it_run_portal_users.role='admin')
3. ✅ Immutable audit trail with JSON details
4. ✅ RLS on audit logs table
5. ✅ Session-based authentication
6. ✅ Email ownership verification

**Database Changes (2)**
1. ✅ Migration 20261008000002: Safe email-based backfill
2. ✅ Migration 20261008000003: Audit logging infrastructure

---

**Test Status:** Ready for deployment after manual testing
**Build Status:** ✅ npm run build passes
**Commits:** 11 commits covering all phases
**Documentation:** Included (IT_RUN_SECURITY_CHECKLIST.md)
