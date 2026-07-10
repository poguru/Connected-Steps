import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyWebhookSignature } from "@/lib/whatsapp";

/**
 * Meta WhatsApp Cloud API Webhook
 *
 * GET  /api/webhooks/meta-whatsapp — webhook verification challenge
 * POST /api/webhooks/meta-whatsapp — delivery status updates
 *
 * Meta sends status updates with these statuses:
 *   sent      → message accepted by WhatsApp
 *   delivered → device received the message
 *   read      → user opened the message
 *   failed    → delivery failed (error object included)
 *
 * Configuration in Meta Business Manager:
 *   1. Webhook URL: https://www.connectedsteps.in/api/webhooks/meta-whatsapp
 *   2. Verify Token: value of WHATSAPP_VERIFY_TOKEN env var
 *   3. Subscribe to: messages (for status updates)
 */

// ── GET: Webhook verification ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sp          = req.nextUrl.searchParams;
  const mode        = sp.get("hub.mode");
  const token       = sp.get("hub.verify_token");
  const challenge   = sp.get("hub.challenge");
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken && challenge) {
    console.log("[wa-webhook] verification handshake accepted");
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn("[wa-webhook] verification failed — check WHATSAPP_VERIFY_TOKEN");
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ── POST: Delivery status updates ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Verify HMAC signature from Meta
  const signature = req.headers.get("x-hub-signature-256");
  const valid     = await verifyWebhookSignature(rawBody, signature);
  if (!valid) {
    // Signature verification requires WHATSAPP_APP_SECRET.
    // If the env var is not set we log a warning and continue (development mode).
    if (process.env.WHATSAPP_APP_SECRET) {
      console.error("[wa-webhook] invalid signature — rejecting payload");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    console.warn("[wa-webhook] WHATSAPP_APP_SECRET not set — skipping signature check");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const data = payload as WAWebhookPayload;

    for (const entry of data.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "messages") continue;

        const value = change.value;

        // ── Status updates ────────────────────────────────────────────────────
        for (const statusUpdate of value.statuses ?? []) {
          await handleStatusUpdate(statusUpdate);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[wa-webhook] processing error:", e);
    // Always return 200 to Meta so it doesn't keep retrying
    return NextResponse.json({ ok: true });
  }
}

// ── Status handler ────────────────────────────────────────────────────────────

async function handleStatusUpdate(status: WAStatus) {
  const { id: messageId, status: newStatus, errors } = status;
  const db = getSupabaseServer();

  const failureReason = errors?.[0]?.title ?? null;

  const { error } = await db
    .from("wa_message_log")
    .update({
      status:         newStatus,
      failure_reason: failureReason,
      updated_at:     new Date().toISOString(),
    })
    .eq("message_id", messageId);

  if (error) {
    // Row may not exist if message was not tracked (e.g. template test sends)
    console.warn(`[wa-webhook] could not update message_id=${messageId} status=${newStatus}: ${error.message}`);
  } else {
    if (newStatus === "failed") {
      console.error(`[wa-webhook] DELIVERY FAILED message_id=${messageId} reason="${failureReason}"`);
    } else {
      console.log(`[wa-webhook] status update message_id=${messageId} → ${newStatus}`);
    }
  }
}

// ── Payload types ─────────────────────────────────────────────────────────────

interface WAWebhookPayload {
  object:  string;
  entry?: {
    id:       string;
    changes?: {
      value: WAValue;
      field: string;
    }[];
  }[];
}

interface WAValue {
  statuses?: WAStatus[];
  messages?: WAMessage[];
}

interface WAStatus {
  id:         string;     // message_id (wamid)
  status:     "sent" | "delivered" | "read" | "failed";
  timestamp:  string;
  recipient_id: string;
  errors?: { code: number; title: string }[];
}

interface WAMessage {
  from:      string;
  id:        string;
  timestamp: string;
  type:      string;
}
