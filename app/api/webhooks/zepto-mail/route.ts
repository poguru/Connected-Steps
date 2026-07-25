import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// POST /api/webhooks/zepto-mail
//
// Receives delivery event notifications from ZeptoMail.
// Configure in ZeptoMail Dashboard → Mail Agent → Notifications → Webhooks:
//   URL:    https://www.connectedsteps.in/api/webhooks/zepto-mail
//   Events: Sent, Delivery, Open, Click, Bounce, Spam, Unsubscribe
//
// Optional authentication: set ZEPTOMAIL_WEBHOOK_SECRET in Vercel env vars.
// ZeptoMail will send this token in X-ZeptoMail-Token header.
// If the env var is not set the endpoint accepts all POST requests (permissive mode).
//
// Each event is matched back to email_queue via aws_message_id = request_id.
// The endpoint is idempotent — repeated deliveries of the same event are safe.

interface ZetoEvent {
  // ZeptoMail may use different field names across API versions — handle both
  event_type?:    string;   // primary field
  eventtype?:     string;   // alternative casing
  type?:          string;   // alternate fallback
  request_id?:    string;   // message ID (matches aws_message_id column)
  message_id?:    string;   // alternative name
  mid?:           string;   // short form
  recipient?:     string;   // recipient address
  to?:            string;   // alternative
  time_stamp?:    number;   // Unix timestamp (ms or seconds)
  timestamp?:     number;
  bounce_type?:   string;   // "hard" | "soft"
  bounce_reason?: string;
  link?:          string;   // URL clicked
  ip_address?:    string;
  user_agent?:    string;
  location?:      string;
}

function parseEvent(raw: ZetoEvent) {
  const eventType = (raw.event_type ?? raw.eventtype ?? raw.type ?? "").toLowerCase();
  const requestId = raw.request_id ?? raw.message_id ?? raw.mid ?? null;
  return { eventType, requestId };
}

function toTs(raw?: number): string | null {
  if (!raw) return null;
  // ZeptoMail may send seconds or milliseconds
  const ms = raw > 1e12 ? raw : raw * 1000;
  return new Date(ms).toISOString();
}

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const secret = process.env.ZEPTOMAIL_WEBHOOK_SECRET;
  if (secret) {
    const headerToken = req.headers.get("x-zeptomail-token")
                     ?? req.headers.get("x-zepto-mail-token")
                     ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
                     ?? req.nextUrl.searchParams.get("token")
                     ?? "";
    if (headerToken !== secret) {
      console.warn("[zepto-webhook] Invalid or missing token — rejected");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let rawBody: unknown;
  try { rawBody = await req.json(); }
  catch {
    console.warn("[zepto-webhook] Non-JSON body — ignored");
    return NextResponse.json({ ok: true }); // ZeptoMail retries on non-2xx
  }

  // ZeptoMail may send a single object or an array of events
  const events: ZetoEvent[] = Array.isArray(rawBody) ? rawBody : [rawBody as ZetoEvent];

  if (events.length === 0) return NextResponse.json({ ok: true });

  const db = getSupabaseServer();
  let processed = 0;

  for (const raw of events) {
    const { eventType, requestId } = parseEvent(raw);

    if (!requestId) {
      console.warn(`[zepto-webhook] Event missing request_id — type=${eventType}`);
      continue;
    }

    console.log(`[zepto-webhook] event=${eventType} request_id=${requestId}`);

    switch (eventType) {
      case "sent":
        // ZeptoMail accepted the message — already handled by our send flow
        break;

      case "delivery":
      case "delivered": {
        const ts = toTs(raw.time_stamp ?? raw.timestamp);
        await db.from("email_queue")
          .update({ delivered_at: ts ?? new Date().toISOString() })
          .eq("aws_message_id", requestId)
          .is("delivered_at", null); // idempotent — only set once
        processed++;
        break;
      }

      case "open":
      case "opened": {
        const ts = toTs(raw.time_stamp ?? raw.timestamp);
        await db.from("email_queue")
          .update({ opened_at: ts ?? new Date().toISOString() })
          .eq("aws_message_id", requestId)
          .is("opened_at", null); // only record first open
        processed++;
        break;
      }

      case "click":
      case "clicked": {
        const ts = toTs(raw.time_stamp ?? raw.timestamp);
        await db.from("email_queue")
          .update({ clicked_at: ts ?? new Date().toISOString() })
          .eq("aws_message_id", requestId)
          .is("clicked_at", null); // only record first click
        processed++;
        break;
      }

      case "bounce":
      case "bounced": {
        const ts          = toTs(raw.time_stamp ?? raw.timestamp);
        const bounceType  = raw.bounce_type   ?? "unknown";
        const bounceReason = raw.bounce_reason ?? "Bounced";
        // Mark as failed — a bounce means the recipient never got the email
        await db.from("email_queue").update({
          status:        "failed",
          failure_reason: bounceReason,
          failure_code:  `bounce_${bounceType}`,
          is_permanent:  bounceType === "hard",
          bounce_type:   bounceType,
          bounce_reason: bounceReason,
          sent_at:       ts ?? null,
        }).eq("aws_message_id", requestId);
        processed++;
        break;
      }

      case "spam":
      case "spam_complaint":
      case "spamcomplaint": {
        // Spam complaint — treat as permanent failure
        await db.from("email_queue").update({
          status:        "failed",
          failure_reason: "Spam complaint",
          failure_code:  "spam_complaint",
          is_permanent:  true,
        }).eq("aws_message_id", requestId);
        processed++;
        break;
      }

      case "unsubscribe":
      case "unsubscribed": {
        await db.from("email_queue").update({
          status:        "failed",
          failure_reason: "Unsubscribed",
          failure_code:  "unsubscribed",
          is_permanent:  true,
        }).eq("aws_message_id", requestId);
        processed++;
        break;
      }

      default:
        console.log(`[zepto-webhook] Unhandled event type: ${eventType}`);
    }
  }

  console.log(`[zepto-webhook] Processed ${processed}/${events.length} events`);

  // Always return 200 so ZeptoMail doesn't retry unnecessarily
  return NextResponse.json({ ok: true, processed });
}
