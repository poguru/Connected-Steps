import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";
import {
  resolveSegment,
  filterByConsent,
  queueCampaignEmails,
  processCampaignBatch,
  sendCampaignWhatsApp,
} from "@/lib/campaign-service";

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/campaigns/[id]/send
// Body: { schedule_for?: ISO string }  — omit to send immediately
export async function POST(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db     = getSupabaseServer();
  const body   = await req.json().catch(() => ({})) as Record<string, unknown>;

  const { data: campaign, error: fetchErr } = await db.from("communication_campaigns")
    .select("*").eq("id", id).single();
  if (fetchErr || !campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  if (!["draft", "scheduled"].includes(campaign.status)) {
    return NextResponse.json({ error: `Cannot send a campaign with status '${campaign.status}'` }, { status: 409 });
  }

  if (campaign.channel === "email" && (!campaign.subject || !campaign.html_body)) {
    return NextResponse.json({ error: "Email campaigns require subject and html_body" }, { status: 400 });
  }
  if (campaign.channel === "whatsapp" && !campaign.wa_template_name) {
    return NextResponse.json({ error: "WhatsApp campaigns require wa_template_name" }, { status: 400 });
  }

  const scheduleFor = body.schedule_for ? String(body.schedule_for) : null;

  // If scheduling for future, just mark as scheduled and return
  if (scheduleFor && new Date(scheduleFor) > new Date()) {
    await db.from("communication_campaigns").update({
      status:        "scheduled",
      scheduled_for: scheduleFor,
    }).eq("id", id);
    return NextResponse.json({ scheduled: true, scheduled_for: scheduleFor });
  }

  // Resolve recipients
  const allRecipients = await resolveSegment(campaign.segment_type, campaign.segment_config ?? {});

  const recipients = await filterByConsent(
    allRecipients,
    campaign.channel,
    campaign.message_type,
    campaign.is_transactional,
  );

  if (!recipients.length) {
    await db.from("communication_campaigns").update({
      status: "sent", sent_at: new Date().toISOString(),
      recipient_count: 0, sent_count: 0,
    }).eq("id", id);
    return NextResponse.json({ sent: true, recipientCount: 0, message: "No eligible recipients after consent filtering" });
  }

  if (campaign.channel === "email") {
    const batchId = await queueCampaignEmails({
      campaignId:      id,
      recipients,
      subject:         campaign.subject!,
      htmlBody:        campaign.html_body!,
      attachments:     campaign.attachments ?? [],
      isTransactional: campaign.is_transactional,
    });

    await db.from("communication_campaigns").update({
      status:          "sending",
      batch_id:        batchId,
      recipient_count: recipients.length,
      queued_count:    recipients.length,
      sent_at:         null,
    }).eq("id", id);

    // Process in background after response
    after(() => processCampaignBatch(batchId));

    return NextResponse.json({ sent: true, recipientCount: recipients.length, batchId });

  } else if (campaign.channel === "whatsapp") {
    await db.from("communication_campaigns").update({
      status:          "sending",
      recipient_count: recipients.filter(r => r.phone).length,
    }).eq("id", id);

    after(() => sendCampaignWhatsApp({
      campaignId:     id,
      recipients,
      templateName:   campaign.wa_template_name!,
      templateParams: campaign.wa_template_params ?? [],
    }));

    return NextResponse.json({ sent: true, recipientCount: recipients.length });

  } else {
    return NextResponse.json({ error: "Push campaigns are not yet supported" }, { status: 400 });
  }
}
