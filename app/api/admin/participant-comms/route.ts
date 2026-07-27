import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/participant-comms?email=xxx
// Returns all communications sent to a participant — email and WhatsApp — in a unified timeline.
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email")?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

  const db = getSupabaseServer();

  // Resolve phone numbers for this email (there may be multiple registrations)
  const { data: regRows } = await db
    .from("event_registrations")
    .select("phone")
    .eq("email", email)
    .not("phone", "is", null)
    .limit(10);

  const phones = [...new Set((regRows ?? []).map(r => r.phone).filter(Boolean) as string[])];

  // Fetch email_queue + wa_message_log in parallel
  const [emailRes, waRes] = await Promise.all([
    db.from("email_queue")
      .select("id, subject, status, sent_at, delivered_at, opened_at, clicked_at, bounce_type, bounce_reason, created_at, batch_id, event_id")
      .eq("recipient_email", email)
      .order("created_at", { ascending: false })
      .limit(200),

    phones.length > 0
      ? db.from("wa_message_log")
          .select("id, phone, user_email, template_name, purpose, status, sent_at, message_id, event_id")
          .in("phone", phones)
          .order("sent_at", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (emailRes.error) {
    console.error("[participant-comms] email query error:", emailRes.error.message);
    return NextResponse.json({ error: "Failed to load email history" }, { status: 500 });
  }

  // Build unified timeline
  const emailItems = (emailRes.data ?? []).map(r => ({
    type:          "email" as const,
    id:            r.id,
    channel:       "email",
    subject:       r.subject,
    status:        r.status,
    sent_at:       r.sent_at ?? r.created_at,
    delivered_at:  r.delivered_at,
    opened_at:     r.opened_at,
    clicked_at:    r.clicked_at,
    bounce_type:   r.bounce_type,
    bounce_reason: r.bounce_reason,
    batch_id:      r.batch_id,
    event_id:      r.event_id,
  }));

  const waItems = (waRes.data ?? []).map(r => ({
    type:         "whatsapp" as const,
    id:           r.id,
    channel:      "whatsapp",
    subject:      r.purpose ?? r.template_name,
    status:       r.status,
    sent_at:      r.sent_at,
    delivered_at: null,
    opened_at:    null,
    clicked_at:   null,
    bounce_type:  null,
    bounce_reason:null,
    batch_id:     null,
    event_id:     r.event_id,
    meta:         { template_name: r.template_name, message_id: r.message_id, phone: r.phone },
  }));

  // Merge and sort by sent_at desc
  const timeline = [...emailItems, ...waItems].sort((a, b) => {
    const ta = a.sent_at ?? "";
    const tb = b.sent_at ?? "";
    return tb.localeCompare(ta);
  });

  return NextResponse.json({
    email,
    phones,
    total:    timeline.length,
    timeline,
  });
}
