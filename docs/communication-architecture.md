# Connected Steps — Communication Architecture

**Version 1.0 · 2026-08-02**

Covers the end-to-end flow from "send campaign" to "email delivered or dead-lettered", including both the small-campaign and large-campaign paths, retry logic, and recovery procedures.

---

## 1. System Overview

```
Admin triggers send
        │
        ▼
communication_campaigns    ← hub campaigns (admin panel)
   OR event announce        ← one-off event emails
        │
        ▼ queueCampaignEmails()
email_queue                ← one row per recipient, status=queued
        │
   ┌────┴────────────────────────────────────────┐
   │ ≤ 200 recipients           > 200 recipients  │
   │         │                        │            │
   │ after() callback         email_campaigns row  │
   │  processCampaignBatch()   status=running      │
   │         │                        │            │
   └────┬────┘              email-sender cron      │
        │                   (every minute, 300s)   │
        ▼                           │              │
   ZeptoMail API  ◄─────────────────┘              │
        │                                          │
        ▼                                          │
email_queue row updated:                           │
  status = delivered | failed                      │
        │                                          │
        ▼                                          │
email_campaigns completed                          │
  + communication_campaigns synced ─────────────── ┘
```

---

## 2. Tables

### `communication_campaigns`
Central record for admin-created campaigns.

| Column | Purpose |
|---|---|
| `id` | PK |
| `batch_id` | UUID linking to `email_queue` rows |
| `status` | `draft → sending → sent / failed` |
| `sent_count`, `failed_count`, `queued_count`, `recipient_count` | Live counters |
| `subject`, `html_body` | Template content |
| `segment` | Recipient filter definition |
| `sent_at` | Completion timestamp |

### `email_campaigns`
Worker-lock record for large batches processed by the email-sender cron.

| Column | Purpose |
|---|---|
| `id` | PK |
| `batch_id` | FK → `email_queue.batch_id` |
| `status` | `running → completed / failed` |
| `total_count` | Expected recipients |
| `worker_locked_at` | Heartbeat — prevents two cron invocations processing the same batch |
| `worker_last_seen_at` | Staleness detection (lock TTL = 120s) |

### `email_queue`
One row per recipient per batch. The atomic unit of delivery.

| Column | Purpose |
|---|---|
| `id` | PK |
| `batch_id` | Groups rows by campaign |
| `recipient_email`, `recipient_name` | Delivery target |
| `subject`, `html_body` | Final rendered content |
| `status` | `queued → sending → delivered / failed` |
| `attempts` | Retry count |
| `sent_at` | Delivery timestamp |
| `aws_message_id` | ZeptoMail request ID |
| `failure_reason`, `failure_code` | Error detail |
| `is_permanent` | `true` = no retry (bounce/invalid); `null` = unknown |
| `provider` | Always `zeptomail` |
| `http_status` | HTTP status from ZeptoMail |

### `event_comm_history`
Audit log — one row per communication event per event. Stores attachments metadata for rehydration.

---

## 3. Small-Campaign Path (≤ 200 recipients)

```
POST /api/admin/campaigns/[id]/send
  └─ queueCampaignEmails(batchId, recipients)      // inserts email_queue rows
  └─ after(() => processCampaignBatch(batchId))    // fires after response (lib/process-email-batch.ts)
        └─ claim_batch_emails RPC (FOR UPDATE SKIP LOCKED, BATCH_SIZE at a time)
        └─ sendSingleEmail() × BATCH_SIZE concurrently
        └─ email_queue.status = delivered | failed
        └─ communication_campaigns stats updated on completion
```

**Timeout budget:** Vercel `after()` shares the function's `maxDuration`. For campaigns ≤ 200, this completes well within the default timeout.

---

## 4. Large-Campaign Path (> 200 recipients)

```
POST /api/admin/campaigns/[id]/send
  └─ queueCampaignEmails(batchId, recipients)
  └─ email_campaigns.INSERT { batch_id, status:'running', total_count }
  └─ Returns 200 immediately — no blocking wait

Every minute → GET /api/cron/email-sender (maxDuration: 300s)
  └─ SELECT email_campaigns WHERE status='running'
  └─ For each campaign (respects worker_locked_at):
       └─ LOOP:
            └─ claim_batch_emails(batch_id, BATCH_SIZE=5)   // SKIP LOCKED atomic claim
            └─ sendSingleEmail() × 5 concurrently (Promise.allSettled)
            └─ email_queue rows updated (delivered | failed | re-queued if transient)
            └─ worker heartbeat refresh
            └─ Break if: no rows remain OR worker_timeout (275s) exceeded
       └─ On completion:
            └─ email_campaigns.status = 'completed'
            └─ event_comm_history synced
            └─ communication_campaigns synced (if large-campaign hub path)
            └─ checkCampaignHealth() → alert if failure rate > 20%
```

**Throughput:** BATCH_SIZE(5) × concurrent VUs in k6 tests = ~50 emails/s theoretical.
Real throughput bounded by ZeptoMail rate limits (typically 20-30 emails/s on standard plan).
At 20/s: 10,000-recipient campaign ≈ 8 minutes.

---

## 5. Retry Flow

```
sendSingleEmail() fails
        │
        ├── result.isTransient === true AND attempts < 3
        │       └─ email_queue.status = 'queued'   ← re-claimed next cron tick
        │
        └── result.isTransient === false OR attempts >= 3
                └─ email_queue.status = 'failed'
                   email_queue.is_permanent = true  ← no further retries
```

Transient failures (rate_limit, network_error, provider_error) re-queue automatically.
Permanent failures (invalid_address, auth_error, quota_exceeded) are marked `is_permanent = true`.

---

## 6. Failure Handling

| Failure | Detection | Response |
|---|---|---|
| ZeptoMail 429 rate limit | `classifyError()` → `rate_limit` | Re-queue (isTransient=true) |
| Invalid email address | `classifyError()` → `invalid_address` | Mark permanent, no retry |
| Network timeout | fetch AbortSignal 5s timeout | Re-queue (isTransient=true) |
| Worker lock stolen | `worker_locked_at` TTL 120s | Next cron tick reclaims |
| Campaign failure rate > 20% | `checkCampaignHealth()` | Alert fired to `ALERT_WEBHOOK_URL` |
| Worker timeout (275s) | Inner loop break | Next cron tick continues where left off |

---

## 7. Recovery Flow

**Stuck campaign** (worker died mid-flight):
1. Lock TTL expires after 120s
2. Next cron invocation claims the campaign
3. `claim_batch_emails` re-claims any rows still in `sending` status (SKIP LOCKED is per-transaction)
4. Delivery continues — no duplicate sends (claim is atomic)

**ZeptoMail outage**:
1. All deliveries fail with transient error
2. All rows return to `queued`
3. Campaign continues automatically once ZeptoMail recovers
4. Monitor via `/admin/system-health` → Campaign throughput

**Batch re-run** (admin wants to retry failed rows):
1. `UPDATE email_queue SET status='queued', attempts=0 WHERE batch_id=? AND status='failed' AND is_permanent=false`
2. Re-set `email_campaigns.status='running'` if completed
3. Email-sender cron picks it up on the next minute

---

## 8. Alert Conditions

| Condition | Key | Cooldown | Channel |
|---|---|---|---|
| Campaign failure rate > 20% | `campaign_failures:<batchId>` | 4 hours | `ALERT_WEBHOOK_URL` |
| Job queue dead-letter jobs | `dead_jobs` | 30 min | `ALERT_WEBHOOK_URL` |
| Job queue backlog > 500 | `queue_backlog` | 1 hour | `ALERT_WEBHOOK_URL` |

Cooldown is persisted in `app_settings` (key: `alert_last_fired:<key>`) to survive serverless cold starts.

---

## 9. Key Invariants

- `claim_batch_emails` uses `FOR UPDATE SKIP LOCKED` — concurrent cron invocations never process the same email row.
- `worker_locked_at` prevents two cron invocations from processing the same `email_campaign` row.
- `email_queue` rows are never deleted — they are the audit trail.
- `communication_campaigns` is always updated at completion even for large (email_campaigns) batches.
- `LARGE_CAMPAIGN_THRESHOLD = 200` (constant in `/api/admin/campaigns/[id]/send/route.ts`).
