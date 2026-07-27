# Connected Steps — Disaster Recovery Plan

**Version 3.0 · 2026-07-28**

---

## Recovery Objectives

| Metric | Target |
|---|---|
| Recovery Time Objective (RTO) | 2 hours |
| Recovery Point Objective (RPO) | 1 hour (Supabase PITR window) |

---

## Backup Strategy

### Database
Supabase Pro/Team plans include:
- **Continuous WAL archiving** — point-in-time recovery (PITR) within the retention window (7 days on Pro, 30 days on Team)
- **Daily automated backups** — retained for the plan retention period
- **On-demand backups** — trigger via Supabase dashboard before major changes

**Action required before each release:** Create a manual snapshot in Supabase dashboard → Database → Backups → Create backup.

### Storage
Supabase Storage is backed by S3-compatible object storage. No additional backup configuration needed beyond the default S3 durability (11 nines).

### Application Code
All code is in Git (GitHub). Deployments are immutable Vercel artifacts — every production deploy is addressable and can be re-promoted.

### Environment Variables
Store a copy of all Vercel env vars in a team password manager (Bitwarden, 1Password). **Never commit `.env.local` to Git.**

---

## Failure Scenarios

### Scenario 1: Vercel Deployment Failure

**Impact:** Application unavailable.  
**Detection:** Uptime monitor alert on `GET /api/health`.

**Recovery:**
1. Vercel dashboard → Deployments → Identify last working deployment
2. Click ••• → Promote to Production
3. Estimated recovery: 5–10 minutes

---

### Scenario 2: Supabase Database Unavailable

**Impact:** All features broken (cannot query or write).  
**Detection:** `/api/health` returns `components.database.ok: false` with 503.

**Recovery:**
1. Check `status.supabase.com` for active incident
2. If Supabase-side incident: wait for resolution (typically < 30 min for auto-recovery)
3. If connection issue (credentials): rotate service role key, update Vercel, redeploy
4. Estimated recovery: 5–60 minutes depending on root cause

---

### Scenario 3: Data Corruption or Accidental Deletion

**Impact:** Incorrect data in production.  
**Detection:** User reports; admin audit log shows unexpected mutation.

**Recovery:**
1. Supabase dashboard → Database → Backups → Restore to point-in-time before corruption
2. **PITR process:**
   - Select restore point (before the incident)
   - Supabase spins up a new database instance from WAL
   - Swap connection strings in Vercel env vars
   - Redeploy
3. Data written after the restore point will be lost (RPO = time since restore point)
4. Estimated recovery: 1–2 hours

---

### Scenario 4: Compromised Admin Password or API Keys

**Impact:** Unauthorised access to admin panel or API.  
**Detection:** Unexpected entries in `audit_logs`; user reports.

**Recovery:**
1. Immediately rotate `ADMIN_PASSWORD` in Vercel
2. Identify and revoke all compromised API keys in `/admin/developer/api-keys`
3. Check `audit_logs` to understand the scope of access
4. Review `org_members` for any unauthorised additions
5. Rotate `CRON_SECRET` and `COACH_TOKEN_SECRET`
6. File incident report
7. Estimated recovery: 15–30 minutes to contain

---

### Scenario 5: Storage Bucket Deletion

**Impact:** Missing event banners, invoices, certificates, imported files.  
**Detection:** 404s on image/file URLs.

**Recovery:**
1. Recreate missing bucket(s) in Supabase Storage
2. Re-upload critical files from any local backups or re-generate (certificates, invoices)
3. For event banners: re-upload from original sources
4. Note: S3-backed storage has high durability; accidental deletion is the primary risk, not storage failure
5. Estimated recovery: 30 min – 4 hours depending on volume of content to restore

---

### Scenario 6: Razorpay Webhook Failure (Extended)

**Impact:** Paid registrations stuck in `payment_status = 'pending'`.  
**Detection:** User complaints; monitoring shows no `payment.succeeded` webhook events.

**Recovery:**
1. Check Razorpay dashboard for webhook delivery failures
2. Fix webhook endpoint issues (see Runbook: Payment Webhook Not Processing)
3. For missed events: Razorpay supports webhook replay — replay from dashboard
4. As last resort: manually reconcile using `payment_order_log` against Razorpay transaction list
5. Estimated recovery: 30 min – 2 hours

---

## Communication Template (Incident)

```
Subject: Connected Steps — Service Disruption Notice

Dear Admin Team,

We are currently experiencing [describe impact] affecting [specific features].

Estimated time to resolution: [ETR]

Affected users: [scope]

Current status: Investigating / Mitigating / Monitoring

We will provide an update in [30 minutes / 1 hour].

— Connected Steps Operations
```

---

## Post-Incident Review

After every P0/P1 incident, complete within 24 hours:

1. Timeline of events (when detected, when mitigated, when resolved)
2. Root cause
3. Impact (users affected, data at risk, duration)
4. What worked well in the response
5. What could be improved
6. Action items with owners and due dates

Store in `docs/incidents/` (create as needed).

---

## Disaster Recovery Test Schedule

| Test | Frequency | Owner |
|---|---|---|
| Verify PITR backup restore to staging | Quarterly | Platform Lead |
| Verify secret rotation procedure | Quarterly | Developer on-call |
| Full DR simulation (Scenario 1 + 2) | Semi-annually | Platform Lead |
| Review this document for accuracy | Before each major release | Developer |
