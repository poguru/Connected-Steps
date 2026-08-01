import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { sendEmail } from "@/lib/notify";

import { APP_URL } from "@/lib/config";
// POST /api/admin/invoices/[id]/resend — resend invoice email to user
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const { data: inv } = await db
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single();

  if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const appUrl = APP_URL;
  const viewUrl = `${appUrl}/invoices/${encodeURIComponent(inv.invoice_number)}`;

  const result = await sendEmail(
    inv.user_email,
    inv.user_name,
    `Invoice ${inv.invoice_number} — ${inv.product_name}`,
    `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0a0a0a;color:#f0f0f0;border-radius:8px;">
      <div style="font-size:18px;font-weight:700;color:#e8620a;margin-bottom:16px;">Connected Steps — Invoice Resend</div>
      <p style="color:#aaa;margin-bottom:20px;">Hi ${inv.user_name}, here is your invoice for ${inv.product_name}.</p>
      <a href="${viewUrl}" style="display:inline-block;padding:12px 28px;background:#e8620a;color:#fff;border-radius:6px;text-decoration:none;font-weight:700;">View Invoice ${inv.invoice_number} →</a>
      <p style="font-size:11px;color:#555;margin-top:16px;">${viewUrl}</p>
    </div>`,
    false, true,
  );

  if (result.ok) {
    await db.from("invoices").update({ email_sent: true, email_sent_at: new Date().toISOString(), email_ses_message_id: result.messageId ?? null, invoice_status: "sent" }).eq("id", id);
    return NextResponse.json({ ok: true, message: `Invoice resent to ${inv.user_email}`, messageId: result.messageId });
  } else {
    await db.from("invoices").update({ email_error: result.error, email_retry_count: (inv.email_retry_count ?? 0) + 1 }).eq("id", id);
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
}
