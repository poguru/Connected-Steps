# IT Run Registration ↔ Connected Steps Integration
## Security & Production Checklist

### Phase H: Security Audit

**IDOR (Insecure Direct Object Reference) Testing**
- [ ] User A cannot access User B's registration via direct URL
- [ ] User A cannot access User B's registration via API with modified ID
- [ ] 404 response doesn't leak whether registration exists
- [ ] Admin endpoints require verified admin role (not just auth)
- [ ] Admin cannot link registrations to other users without their email

**Authentication & Session Testing**
- [ ] Unauthenticated users get 401 on protected endpoints
- [ ] Session cookie validation works correctly
- [ ] Expired sessions are rejected
- [ ] Session hijacking is not possible via URL parameters
- [ ] User email from session matches database email

**Authorization Testing**
- [ ] Non-admin users cannot access `/it-run/admin/*` pages
- [ ] Non-admin users cannot call admin APIs
- [ ] Admin role is checked server-side (not client-side)
- [ ] Service role can log audit actions
- [ ] Users cannot modify audit logs

**Data Consistency Testing**
- [ ] linked_user_email always points to valid users.email
- [ ] No registrations with NULL linked_user_email after migration (unless intentional orphans)
- [ ] All participants have corresponding registration
- [ ] Payment status is consistent with razorpay records
- [ ] BIB allocations link to valid participants

**Query Injection Testing**
- [ ] SQL injection not possible via email/registration_id parameters
- [ ] Email search uses parameterized queries
- [ ] No raw SQL in registration lookups

**Rate Limiting**
- [ ] Registration endpoint has rate limiting
- [ ] Admin endpoints have rate limiting
- [ ] No brute force possible on registration linking

### Phase I: CI/CD Integration

**Build Verification**
- [ ] `npm run build` passes with no errors
- [ ] TypeScript compilation clean (no ts-ignore overrides)
- [ ] No console.log statements left in production code
- [ ] All imports resolve correctly

**Test Coverage**
- [ ] Unit tests for auth verification functions
- [ ] Unit tests for validation functions
- [ ] Integration tests for registration flow
- [ ] Integration tests for linking flow
- [ ] IDOR tests for direct object access

**Pre-deployment Checks**
- [ ] Database migrations tested locally
- [ ] Migration rollback tested locally
- [ ] No breaking changes to existing APIs
- [ ] Backwards compatibility maintained
- [ ] All new columns have proper indexes

**Production Readiness**
- [ ] Audit logs tested and verified
- [ ] Admin tools tested with real scenario
- [ ] Email links tested (if email integration added)
- [ ] Performance tested (registration API < 200ms)
- [ ] Concurrent registration handling verified

### Test Scenarios

**New User Registration**
```
1. User signs up + verifies email
2. User creates account
3. User starts IT Run registration
4. Registration saved to draft
5. User returns and completes registration
6. Payment processed
7. User sees registration in My Events
8. User can click to view full details
9. User receives confirmation email with link
10. User can click link to view registration
```

**Existing User Registration**
```
1. Existing CS user initiates IT Run registration
2. Email verification detects existing account
3. Account automatically linked (backfill)
4. User sees registration in My Registrations
5. User can click to view details
6. User sees registration in My Events dashboard
```

**Admin Linking**
```
1. Admin goes to user-linking tool
2. Admin sees orphaned registration
3. Admin searches for user by email
4. Admin links registration to user
5. Audit log records the action
6. User can now see registration in My Events
7. Action is visible in audit logs
```

**Legacy Data**
```
1. Migration runs and auto-links by email
2. Orphaned registrations show up in admin tool
3. Admin manually links edge cases
4. All registrations are discoverable
5. No registrations are lost or hidden
```

### Deployment Validation

After deployment, verify:
- [ ] Registration details page loads correctly
- [ ] My Events dashboard shows IT Run registrations
- [ ] Admin linking tool is accessible to admins
- [ ] Audit logs are being recorded
- [ ] Users cannot access other users' registrations
- [ ] Email links work and don't require additional auth
- [ ] All tests pass in production

### Rollback Plan

If issues discovered:
1. Revert last 4 commits (Phase D.1-I)
2. Keep Phase A-C (they're production-safe standalone)
3. Investigate issue with full audit logs
4. Re-fix and redeploy

---

**Approval Required Before Production:**
- [ ] Security audit completed
- [ ] All tests passing
- [ ] Performance verified
- [ ] Admin team trained on new tools
