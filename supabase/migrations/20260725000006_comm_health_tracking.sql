-- ============================================================
-- Connected Steps — Communication Health & Delivery Tracking
-- File: 20260725000006_comm_health_tracking.sql
-- ============================================================
--
-- Adds ZeptoMail webhook-sourced delivery events to email_queue.
-- All new columns are nullable — backward compatible with every
-- existing row. No changes to the sending flow or history tables.

ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS delivered_at  TIMESTAMPTZ,   -- ZeptoMail "delivery" event
  ADD COLUMN IF NOT EXISTS opened_at     TIMESTAMPTZ,   -- ZeptoMail "open" event (first)
  ADD COLUMN IF NOT EXISTS clicked_at    TIMESTAMPTZ,   -- ZeptoMail "click" event (first)
  ADD COLUMN IF NOT EXISTS bounce_type   TEXT,           -- 'hard' | 'soft'
  ADD COLUMN IF NOT EXISTS bounce_reason TEXT;           -- provider bounce reason

-- Fast lookup by ZeptoMail request_id (stored in aws_message_id column)
-- Used by the webhook handler to match events back to queue rows.
CREATE INDEX IF NOT EXISTS idx_email_queue_message_id
  ON public.email_queue (aws_message_id)
  WHERE aws_message_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
