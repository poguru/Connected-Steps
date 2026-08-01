import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { processEmailBatch } from "@/lib/process-email-batch";

type Params = { params: Promise<{ id: string }> };

// GET — preview recipient count before sending
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getSupabaseServer();

  const [{ data: members }, { data: ev }] = await Promise.all([
    db.from("users").select("email, phone").eq("is_active", true),
    db.from("events")
      .select("id, title, start_date, start_time, location, share_slug")
      .eq("id", id).single(),
  ]);

  const total     = members?.length ?? 0;
  const withPhone = (members ?? []).filter(m => m.phone?.trim()).length;

  return NextResponse.json({
    member_count: total,
    email_count:  total,
    wa_count:     withPhone,
    event:        ev ?? null,
  });
}

// POST — send announcement to all active members via email + WhatsApp
export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { channels: string[]; subject: string; email_body: string };
  const { channels = [], subject, email_body } = body;

  const doEmail = channels.includes("email");
  const doWA    = channels.includes("whatsapp");

  if (!doEmail && !doWA)
    return NextResponse.json({ error: "Select at least one channel" }, { status: 400 });
  if (doEmail && (!subject?.trim() || !email_body?.trim()))
    return NextResponse.json({ error: "Subject and body are required for email" }, { status: 400 });

  const db = getSupabaseServer();

  const [{ data: ev }, { data: userRows }] = await Promise.all([
    db.from("events")
      .select("id, title, start_date, start_time, location, share_slug")
      .eq("id", id).single(),
    db.from("users").select("email, first_name, phone").eq("is_active", true),
  ]);

  if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const members = userRows ?? [];
  if (!members.length) return NextResponse.json({ error: "No active members found" }, { status: 404 });

  const appUrl       = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";
  const registerLink = ev.share_slug ? `${appUrl}/events/${ev.share_slug}` : appUrl;

  // Format for WA template: {{1}}=name, {{2}}=title, {{3}}=date+time, {{4}}=location
  const dateStr = ev.start_date
    ? new Date(ev.start_date + "T12:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "";
  const timeStr = ev.start_time
    ? (() => {
        const [h, m] = ev.start_time.split(":").map(Number);
        return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
      })()
    : "";
  const dateTime = timeStr ? `${dateStr}, ${timeStr}` : dateStr;

  const batchId   = crypto.randomUUID();
  let emailQueued = 0;
  let waTotal     = 0;

  // ── Email channel ─────────────────────────────────────────────────────────
  if (doEmail) {
    const rows = members.map(u => {
      const name = u.first_name?.trim() || "Runner";
      const html = (email_body || "")
        .replace(/\{name\}/gi,           name)
        .replace(/\{event\}/gi,          ev.title)
        .replace(/\{date\}/gi,           dateStr)
        .replace(/\{time\}/gi,           timeStr)
        .replace(/\{location\}/gi,       ev.location)
        .replace(/\{register_link\}/gi,  registerLink)
        .replace(/\n/g, "<br>");

      return {
        batch_id:        batchId,
        event_id:        id,
        recipient_email: u.email,
        recipient_name:  u.first_name ?? null,
        subject,
        html_body: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0a0a0a;color:#f0f0f0;border-radius:8px;">
          <div style="margin-bottom:20px;">
            <img src="https://www.connectedsteps.in/logo.png" width="40" style="border-radius:50%;vertical-align:middle;"/>
            <span style="font-size:16px;font-weight:700;color:#fff;margin-left:10px;">Connected Steps</span>
          </div>
          <p style="margin:0 0 12px;color:#ccc;">Hi <strong style="color:#fff;">${name}</strong>,</p>
          <div style="line-height:1.8;color:#ccc;">${html}</div>
          <div style="margin-top:20px;">
            <a href="${registerLink}" style="display:inline-block;padding:12px 24px;background:#e8620a;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Register Now →</a>
          </div>
          <div style="margin-top:28px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.1);font-size:11px;color:#555;">
            Connected Steps · Hyderabad · <a href="https://www.connectedsteps.in" style="color:#e8620a;text-decoration:none;">connectedsteps.in</a>
          </div>
        </div>`,
      };
    });

    const { error: insertErr } = await db.from("email_queue").insert(rows);
    if (!insertErr) {
      emailQueued = rows.length;

      // Create campaign tracking record — the cron worker and status API read this
      await db.from("email_campaigns").insert({
        batch_id:    batchId,
        event_id:    id,
        subject,
        status:      "running",
        total_count: emailQueued,
        started_at:  new Date().toISOString(),
      });

      const { error: emailHistErr } = await db.from("event_comm_history").insert({
        event_id:         id,
        subject,
        recipients:       emailQueued,
        sent:             0,
        failed:           0,
        status:           "queued",
        filter:           "active_members",
        recipient_filter: "active_members",
        channel:          "email",
        batch_id:         batchId,
      });
      if (emailHistErr) console.error("[announce] email history insert failed:", emailHistErr.message, "batch:", batchId);
      // Fast-start: process emails immediately after response; cron picks up any remainder
      after(() => processEmailBatch(batchId));
    }
  }

  // ── WhatsApp channel ──────────────────────────────────────────────────────
  if (doWA) {
    const withPhone = members.filter(m => m.phone?.trim());
    waTotal         = withPhone.length;
    const waBatchId = `${batchId}-wa`;

    const { error: waHistErr } = await db.from("event_comm_history").insert({
      event_id:         id,
      subject:          `WA: ${ev.title}`,
      recipients:       waTotal,
      sent:             0,
      failed:           0,
      status:           "sending",
      filter:           "active_members",
      recipient_filter: "active_members",
      channel:          "whatsapp",
      batch_id:         waBatchId,
    });
    if (waHistErr) console.error("[announce] WA history insert failed:", waHistErr.message, "batch:", waBatchId);

    after(async () => {
      const templateName = process.env.WHATSAPP_SESSION_TEMPLATE ?? "session_alert_v3";
      let sent = 0, failed = 0;

      // Send in batches of 10 with 300ms between batches (≈ 3 batches/s throughput)
      for (let i = 0; i < withPhone.length; i += 10) {
        const batch   = withPhone.slice(i, i + 10);
        const results = await Promise.allSettled(
          batch.map(u =>
            sendWhatsAppTemplate(
              u.phone!,
              templateName,
              [u.first_name?.trim() || "Runner", ev.title, dateTime, ev.location],
            ),
          ),
        );
        for (const r of results) {
          if (r.status === "fulfilled" && r.value.ok) sent++;
          else failed++;
        }
        if (i + 10 < withPhone.length) await new Promise(res => setTimeout(res, 300));
      }

      await db.from("event_comm_history")
        .update({ sent, failed, status: "sent" })
        .eq("batch_id", waBatchId)
        .eq("event_id", id);
    });
  }

  return NextResponse.json({ batch_id: batchId, email_queued: emailQueued, wa_total: waTotal });
}
