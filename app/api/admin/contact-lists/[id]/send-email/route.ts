import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";
import { sendSingleEmail } from "@/lib/email-service";

type Params = { params: Promise<{ id: string }> };

function buildEmailHtml(bodyText: string): string {
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? "https://connectedsteps.in";
  const safeBody = bodyText
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
  return `
<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#1a1a2e;line-height:1.75;max-width:600px;margin:0 auto">
  <div style="background:#1a1a2e;padding:20px 28px;border-radius:8px 8px 0 0">
    <div style="font-size:20px;font-weight:800;color:#e8620a;letter-spacing:-0.5px">Connected Steps</div>
    <div style="font-size:11px;color:#888;margin-top:2px">Event Management &amp; Sports Solutions</div>
  </div>
  <div style="background:#ffffff;border:1px solid #e8e8f0;border-top:none;padding:24px 28px">
    <p style="margin:0;color:#333;font-size:14px;line-height:1.75">${safeBody}</p>
  </div>
  <div style="border:1px solid #e8e8f0;border-top:none;border-radius:0 0 8px 8px;padding:14px 28px;text-align:center">
    <p style="margin:0;font-size:11px;color:#aaa">
      Connected Steps Events &nbsp;·&nbsp; Hyderabad, Telangana<br/>
      <a href="${appUrl}" style="color:#e8620a;text-decoration:none">${appUrl}</a>
    </p>
  </div>
</div>`;
}

// POST /api/admin/contact-lists/[id]/send-email
// Sends to all eligible members: email_consent=true, do_not_contact=false, has email, is_active=true
// Body: { subject: string, body: string }
export async function POST(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getSupabaseServer();

  const reqBody = await req.json() as { subject?: string; body?: string };
  const subject = reqBody.subject?.trim() ?? "";
  const body    = reqBody.body?.trim()    ?? "";

  if (!subject) return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  if (!body)    return NextResponse.json({ error: "Message body is required" }, { status: 400 });

  const { data: list } = await db.from("contact_lists")
    .select("id, name").eq("id", id).single();
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });

  // Fetch all members with their contact details
  const { data: memberRows } = await db.from("contact_list_members")
    .select("contact_id, external_contacts(id, full_name, email, email_consent, do_not_contact, is_active)")
    .eq("list_id", id);

  type ContactRow = { id: string; full_name: string; email: string | null; email_consent: boolean; do_not_contact: boolean; is_active: boolean };

  const allContacts = (memberRows ?? [])
    .map(m => m.external_contacts as ContactRow | null)
    .filter(Boolean) as ContactRow[];

  const eligible = allContacts.filter(c => c.email && c.email_consent && !c.do_not_contact && c.is_active) as (ContactRow & { email: string })[];

  if (!eligible.length) {
    return NextResponse.json(
      { error: `No eligible recipients. ${allContacts.length} members in list but none have email + consent + active status.` },
      { status: 400 },
    );
  }

  const emailHtml = buildEmailHtml(body);
  const now       = new Date().toISOString();
  let sent = 0, failed = 0;
  const failedEmails: string[] = [];

  for (const contact of eligible) {
    const result = await sendSingleEmail({ to: contact.email, subject, html: emailHtml });

    if (result.ok) {
      sent++;
    } else {
      failed++;
      failedEmails.push(contact.email);
      console.error(`[ContactList/send-email] ${contact.email}:`, result.error);
    }
  }

  // Bulk log activity for each successfully sent contact
  if (sent > 0) {
    const activityRows = eligible
      .filter((_, i) => i < sent)  // approximation — log for first N sent
      .map(c => ({
        contact_id:    c.id,
        activity_type: "email_sent",
        subject,
        details: { list_id: id, list_name: list.name },
      }));
    // Log in batches to avoid hitting Supabase limits
    const activityBatch = eligible.map(c => ({
      contact_id:    c.id,
      activity_type: "email_sent",
      subject,
      details: { list_id: id, list_name: list.name },
    }));
    await db.from("external_contact_activity").insert(activityBatch);
    await db.from("external_contacts")
      .update({ last_contacted: now })
      .in("id", eligible.map(c => c.id));
  }

  return NextResponse.json({
    sent,
    failed,
    skipped:   allContacts.length - eligible.length,
    total:     allContacts.length,
    ...(failedEmails.length && { failedEmails }),
  });
}
