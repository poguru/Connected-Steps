# Connected Steps — Operational Runbook

**Version 3.0 · 2026-07-28**

---

## On-Call Overview

**Primary alert channel**: monitor `/api/health` — 503 means DB or cache failure.

**Quick check**: always start with `GET /api/health` and `GET /api/admin/dead-letters`.

**Escalation path**: Developer (on-call) → Platform Lead → Supabase Support.

---

## Alert: Health Check Returns 503

### Symptoms
- Uptime monitor alerts on `GET /api/health` returning 503
- `components.database.ok = false`

### Diagnostic Steps

1. Open Supabase dashboard → check project status
2. Check Vercel function logs for connection errors
3. Verify `SUPABASE_SERVICE_ROLE_KEY` in Vercel env has not expired
4. Try `GET /api/health` from browser to check if it's network-specific

### Resolution

- **Supabase outage**: wait for Supabase status page (`status.supabase.com`) to clear
- **Connection pool exhausted**: Supabase auto-scales connections; check for N+1 queries in logs causing connection churn
- **Expired service role key**: rotate in Supabase dashboard → update Vercel env var → redeploy

---

## Alert: Dead Jobs Accumulating

### Symptoms
- `/api/health` shows `job_queue.dead > 0`
- Webhooks not being delivered
- CSV imports stuck in "committing" status

### Diagnostic Steps

1. `GET /api/admin/dead-letters` — review `job_type` and `last_error` of dead jobs
2. For `deliver_webhook` jobs: check if the target URL is reachable; look at `webhook_delivery_log.last_error`
3. For `import_csv` jobs: check `import_jobs.error_message`
4. For `send_email_batch` jobs: verify ZeptoMail API key and quota

### Resolution

1. Fix the underlying cause (URL, credentials, quota)
2. For webhook jobs: use replay button in `/admin/developer/webhooks/:id/deliveries`
3. For email jobs: re-queue via email admin panel or re-trigger the event
4. For import jobs: re-upload the CSV and retry commit

To manually reset a dead job for one more attempt:
```sql
UPDATE job_queue
SET status = 'pending', attempts = 0, next_run_at = now(), last_error = NULL
WHERE id = '<job_id>';
```

---

## Alert: Payment Webhook Not Processing

### Symptoms
- Registrations stuck in `payment_status = 'pending'` after payment is confirmed in Razorpay
- No `payment.succeeded` entries in webhook delivery log

### Diagnostic Steps

1. Check Razorpay dashboard → Webhooks → Recent deliveries for failures
2. Verify `RAZORPAY_WEBHOOK_SECRET` in Vercel matches Razorpay dashboard
3. Check Vercel logs for `POST /api/webhooks/razorpay` errors
4. Check `payment_order_log` table for the order

### Resolution

1. If signature mismatch: rotate `RAZORPAY_WEBHOOK_SECRET` in both Razorpay and Vercel, then redeploy
2. For missed events: manually trigger the payment verification from Razorpay dashboard (resend webhook)
3. As last resort: manually update `event_registrations.payment_status = 'paid'` in Supabase and trigger certificate/email flows

---

## Alert: Email Delivery Failures

### Symptoms
- Users reporting they didn't receive confirmation/certificate emails
- ZeptoMail dashboard showing bounces or rejections

### Diagnostic Steps

1. Check `email_logs` table for `status = 'bounced'` or `'rejected'`
2. Check `email_queue` for stuck entries
3. Verify `ZEPTO_MAIL_API_KEY` is valid (ZeptoMail dashboard → API Tokens)
4. Check ZeptoMail daily sending quota

### Resolution

1. For bounced emails: address likely invalid; update user profile
2. For quota exceeded: ZeptoMail plan upgrade or wait for reset
3. For API key issues: regenerate in ZeptoMail → update Vercel → redeploy
4. Re-send confirmation: use `/admin/events/:id/communicate` to send manual confirmation to affected users

---

## Alert: WhatsApp Messages Failing

### Symptoms
- OTP delivery failing for phone verification
- WhatsApp message logs showing errors

### Diagnostic Steps

1. Check `wa_message_log.error` column for recent failures
2. Verify `META_WA_TOKEN` hasn't expired (Meta tokens expire; see template `project_whatsapp_templates.md`)
3. Check Meta Business Manager → WhatsApp → Phone Numbers → Status

### Resolution

1. Refresh Meta access token: System Users → Generate new token → update `META_WA_TOKEN` in Vercel
2. For template rejections: check Meta → Message Templates for approval status

---

## Procedure: Rotating Secrets

### Admin Password

1. Generate new bcrypt hash (or set plaintext — the app hashes it on comparison)
2. Update `ADMIN_PASSWORD` in Vercel → Redeploy
3. Inform all admin users

### Cron Secret

1. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Update `CRON_SECRET` in Vercel env var
3. Update `CRON_SECRET` in GitHub Actions secrets
4. Redeploy

### API Key Rotation (org user request)

1. In admin UI: `/admin/developer/api-keys` → Rotate
2. Or via API: `POST /api/admin/api-keys/:id/rotate`
3. Rotated key is deactivated; new key returned immediately
4. Inform the external integrator of the new key

### Supabase Service Role Key

1. Supabase dashboard → Settings → API → Reveal/Regenerate service role key
2. Update `SUPABASE_SERVICE_ROLE_KEY` in Vercel
3. Redeploy
4. Verify `/api/health` returns 200 after deploy

---

## Procedure: Reverting a Bad Deployment

Vercel retains all previous deployments:

1. Vercel dashboard → Deployments
2. Find last known-good deployment
3. Click ••• → Promote to Production
4. Verify `/api/health` after promotion

If database migration was applied and needs reverting:
1. Connect via `supabase db connect`
2. Execute manual rollback SQL
3. Update migration tracking if needed

---

## Procedure: Investigating a Slow Query

1. Supabase dashboard → SQL Editor → run `pg_stat_statements` query:
   ```sql
   SELECT query, calls, mean_exec_time, total_exec_time
   FROM pg_stat_statements
   ORDER BY mean_exec_time DESC
   LIMIT 20;
   ```
2. Identify the slow query
3. Run `EXPLAIN ANALYZE <query>` to see the plan
4. Add missing index if needed:
   ```sql
   CREATE INDEX CONCURRENTLY idx_... ON ...;
   ```
   (Use `CONCURRENTLY` to avoid table lock in production)

---

## Procedure: CSV Import Failure

1. Open `/admin/developer/import` — find the failed job
2. Check `validation_report` — fix the CSV errors listed
3. Re-upload corrected CSV
4. Commit the new import job

If stuck in `committing` status:
```sql
-- Check job queue
SELECT * FROM job_queue WHERE job_type = 'import_csv' ORDER BY created_at DESC LIMIT 5;

-- Reset if dead
UPDATE job_queue
SET status = 'pending', attempts = 0, next_run_at = now()
WHERE job_type = 'import_csv' AND payload->>'import_job_id' = '<id>';
```

---

## Procedure: Org Access Issues

If an admin cannot access the org portal:

1. Check `org_members` table: `SELECT * FROM org_members WHERE user_email = '<email>'`
2. Verify `is_active = true` and `role` is appropriate
3. If session expired: clear `cs_org_session` cookie in browser or re-login

---

## Monitoring Checklist (Daily)

- [ ] `/api/health` returns `ok: true`
- [ ] `job_queue.dead = 0`
- [ ] ZeptoMail bounce rate < 5%
- [ ] Razorpay webhook delivery rate 100%
- [ ] No errors in Vercel function logs

## Monitoring Checklist (Weekly)

- [ ] Review `/admin/developer/monitoring` — API usage trends
- [ ] Review webhook success rates
- [ ] Check for any rate-limited API keys
- [ ] Review `audit_logs` for unexpected org mutations
- [ ] Verify Supabase Storage usage within plan limits
