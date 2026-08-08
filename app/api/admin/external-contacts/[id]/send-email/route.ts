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

// POST /api/admin/external-contacts/[id]/send-email
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

  const { data: contact } = await db.from("external_contacts")
    .select("id, full_name, email, do_not_contact, is_active")
    .eq("id", id).single();

  if (!contact)              return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  if (!contact.email)        return NextResponse.json({ error: "Contact has no email address" }, { status: 400 });
  if (contact.do_not_contact) return NextResponse.json({ error: "This contact is marked Do Not Contact" }, { status: 409 });

  const result = await sendSingleEmail({
    to:      contact.email,
    subject,
    html:    buildEmailHtml(body),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Send failed" }, { status: 500 });
  }

  const now = new Date().toISOString();

  await Promise.all([
    db.from("external_contact_activity").insert({
      contact_id:    id,
      activity_type: "email_sent",
      subject,
      details:       { message_id: result.messageId, to: contact.email },
    }),
    db.from("external_contacts")
      .update({ last_contacted: now }).eq("id", id),
  ]);

  return NextResponse.json({ sent: true, messageId: result.messageId, to: contact.email });
}
