import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * POST /api/webhooks/ses
 *
 * Receives Amazon SES event notifications via Amazon SNS.
 * Handles: bounces, complaints, and delivery confirmations.
 *
 * AWS Setup (required ONCE in Console):
 * 1. SNS → Create Topic → Standard → name: ses-events
 * 2. SNS → Topic → Create Subscription → HTTPS → https://connectedsteps.in/api/webhooks/ses
 * 3. Confirm the subscription (AWS will POST a SubscriptionConfirmation — handled below)
 * 4. SES → Account Dashboard → Notifications → Configure SNS topic for Bounces + Complaints
 *
 * Why this matters for SES production approval:
 * - AWS requires demonstrable bounce and complaint handling
 * - High bounce rates (>5%) or complaint rates (>0.1%) get accounts suspended
 * - This endpoint logs all events so we can suppress bad addresses
 */

interface SnsMessage {
  Type:             string;   // "SubscriptionConfirmation" | "Notification" | "UnsubscribeConfirmation"
  MessageId:        string;
  TopicArn:         string;
  Message:          string;
  SubscribeURL?:    string;   // present on SubscriptionConfirmation
  Timestamp:        string;
  Signature:        string;
  SigningCertURL:   string;
}

interface SesNotification {
  notificationType: "Bounce" | "Complaint" | "Delivery";
  mail: {
    messageId:   string;
    timestamp:   string;
    source:      string;
    destination: string[];
  };
  bounce?: {
    bounceType:        "Permanent" | "Transient" | "Undetermined";
    bounceSubType:     string;
    bouncedRecipients: Array<{ emailAddress: string; status?: string; diagnosticCode?: string }>;
    timestamp:         string;
  };
  complaint?: {
    complainedRecipients:  Array<{ emailAddress: string }>;
    complaintFeedbackType: string;
    timestamp:             string;
  };
  delivery?: {
    recipients: string[];
    timestamp:  string;
    smtpResponse: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();

    // SNS sends JSON with Content-Type: text/plain
    let sns: SnsMessage;
    try {
      sns = JSON.parse(body) as SnsMessage;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // ── SNS Subscription Confirmation ─────────────────────────────────────────
    // When you first create the SNS → HTTPS subscription, SNS sends a
    // SubscriptionConfirmation with a URL to visit to activate it.
    // We auto-confirm by fetching that URL.
    if (sns.Type === "SubscriptionConfirmation" && sns.SubscribeURL) {
      console.log("[ses-webhook] SNS subscription confirmation received — auto-confirming");
      await fetch(sns.SubscribeURL).catch(e =>
        console.error("[ses-webhook] Failed to confirm SNS subscription:", e)
      );
      return NextResponse.json({ confirmed: true });
    }

    if (sns.Type !== "Notification") {
      return NextResponse.json({ ok: true, note: "Non-notification message ignored" });
    }

    // ── Parse the SES event inside the SNS notification ───────────────────────
    let sesEvent: SesNotification;
    try {
      sesEvent = JSON.parse(sns.Message) as SesNotification;
    } catch {
      return NextResponse.json({ error: "Invalid SES notification JSON" }, { status: 400 });
    }

    const db  = getSupabaseServer();
    const now = new Date().toISOString();

    // ── Bounce handling ────────────────────────────────────────────────────────
    if (sesEvent.notificationType === "Bounce" && sesEvent.bounce) {
      const bounce     = sesEvent.bounce;
      const isPermanent = bounce.bounceType === "Permanent";

      for (const recipient of bounce.bouncedRecipients) {
        const email = recipient.emailAddress.toLowerCase();

        console.log(
          `[ses-webhook] BOUNCE email=${email} type=${bounce.bounceType}/${bounce.bounceSubType} permanent=${isPermanent}`
        );

        // Log the bounce event
        try {
          await db.from("ses_events").insert({
            event_type:       "bounce",
            email,
            ses_message_id:   sesEvent.mail.messageId,
            bounce_type:      bounce.bounceType,
            bounce_sub_type:  bounce.bounceSubType,
            diagnostic_code:  recipient.diagnosticCode ?? null,
            is_permanent:     isPermanent,
            raw_event:        JSON.stringify(sesEvent),
            received_at:      now,
          });
        } catch (e) { console.error("[ses-webhook] Failed to log bounce:", e); }

        // Suppress permanent bounces from future sends by adding to suppression table
        if (isPermanent) {
          try {
            await db.from("email_suppression").upsert({
              email,
              reason:      "bounce",
              bounce_type: `${bounce.bounceType}/${bounce.bounceSubType}`,
              suppressed_at: now,
            }, { onConflict: "email" });
          } catch (e) { console.error("[ses-webhook] Failed to suppress bounced email:", e); }
        }
      }
    }

    // ── Complaint handling ─────────────────────────────────────────────────────
    if (sesEvent.notificationType === "Complaint" && sesEvent.complaint) {
      const complaint = sesEvent.complaint;

      for (const recipient of complaint.complainedRecipients) {
        const email = recipient.emailAddress.toLowerCase();

        console.warn(
          `[ses-webhook] COMPLAINT email=${email} type=${complaint.complaintFeedbackType}`
        );

        // Log the complaint
        try {
          await db.from("ses_events").insert({
            event_type:    "complaint",
            email,
            ses_message_id: sesEvent.mail.messageId,
            complaint_type: complaint.complaintFeedbackType,
            is_permanent:   true,
            raw_event:      JSON.stringify(sesEvent),
            received_at:    now,
          });
        } catch (e) { console.error("[ses-webhook] Failed to log complaint:", e); }

        try {
          await db.from("email_suppression").upsert({
            email,
            reason:       "complaint",
            bounce_type:  complaint.complaintFeedbackType,
            suppressed_at: now,
          }, { onConflict: "email" });
        } catch (e) { console.error("[ses-webhook] Failed to suppress complained email:", e); }
      }
    }

    // ── Delivery confirmation (optional, informational) ────────────────────────
    if (sesEvent.notificationType === "Delivery" && sesEvent.delivery) {
      console.log(
        `[ses-webhook] DELIVERY to=${sesEvent.delivery.recipients.join(",")} msgId=${sesEvent.mail.messageId}`
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[ses-webhook] Unexpected error:", e);
    // Always return 200 to SNS — returning non-200 causes SNS to retry endlessly
    return NextResponse.json({ ok: true, error: String(e) });
  }
}
