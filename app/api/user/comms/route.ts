import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

// GET /api/user/comms
// Returns the authenticated participant's complete communication history
// (email + WhatsApp) across all events, newest first.
// Supports ?event_id= filter.
export async function GET(req: NextRequest) {
  const token = req.headers.get("x-user-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userEmail = await verifyUserToken(token);
  if (!userEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const eventIdFilter = searchParams.get("event_id");

  const db = getSupabaseServer();

  // Resolve phones for this user (may have multiple registrations)
  const { data: regRows } = await db
    .from("event_registrations")
    .select("phone")
    .eq("user_email", userEmail.toLowerCase())
    .not("phone", "is", null)
    .limit(20);

  const phones = [...new Set((regRows ?? []).map(r => r.phone).filter(Boolean) as string[])];

  // Fetch email_queue and wa_message_log in parallel
  let emailQ = db
    .from("email_queue")
    .select("id, subject, status, sent_at, delivered_at, opened_at, clicked_at, bounce_type, created_at, event_id, batch_id")
    .eq("recipient_email", userEmail.toLowerCase())
    .order("created_at", { ascending: false })
    .limit(200);

  let waQ = phones.length > 0
    ? db
        .from("wa_message_log")
        .select("id, phone, template_name, purpose, status, sent_at, event_id")
        .in("phone", phones)
        .order("sent_at", { ascending: false })
        .limit(200)
    : null;

  if (eventIdFilter) {
    emailQ = emailQ.eq("event_id", eventIdFilter);
    if (waQ) waQ = waQ.eq("event_id", eventIdFilter);
  }

  const [emailRes, waRes] = await Promise.all([
    emailQ,
    waQ ?? Promise.resolve({ data: [], error: null }),
  ]);

  // Fetch event titles for context
  const eventIds = [
    ...new Set([
      ...(emailRes.data ?? []).map(r => r.event_id).filter(Boolean),
      ...(waRes.data ?? []).map(r => r.event_id).filter(Boolean),
    ]),
  ] as string[];

  const { data: eventRows } = eventIds.length > 0
    ? await db.from("events").select("id, title, share_slug").in("id", eventIds)
    : { data: [] };

  const eventMap = Object.fromEntries((eventRows ?? []).map(e => [e.id, { title: e.title, slug: e.share_slug }]));

  // Unified timeline
  type CommItem = {
    id: string; type: "email" | "whatsapp"; channel: string;
    subject: string | null; status: string; sent_at: string | null;
    delivered_at?: string | null; opened_at?: string | null; clicked_at?: string | null;
    bounce_type?: string | null; event_id: string | null;
    event_title: string | null; event_slug: string | null;
  };

  const emailItems: CommItem[] = (emailRes.data ?? []).map(r => ({
    id:           r.id,
    type:         "email",
    channel:      "email",
    subject:      r.subject,
    status:       r.status,
    sent_at:      r.sent_at ?? r.created_at,
    delivered_at: r.delivered_at,
    opened_at:    r.opened_at,
    clicked_at:   r.clicked_at,
    bounce_type:  r.bounce_type,
    event_id:     r.event_id,
    event_title:  r.event_id ? (eventMap[r.event_id]?.title ?? null) : null,
    event_slug:   r.event_id ? (eventMap[r.event_id]?.slug  ?? null) : null,
  }));

  const waItems: CommItem[] = (waRes.data ?? []).map(r => ({
    id:          r.id,
    type:        "whatsapp",
    channel:     "whatsapp",
    subject:     r.purpose ?? r.template_name,
    status:      r.status,
    sent_at:     r.sent_at,
    event_id:    r.event_id,
    event_title: r.event_id ? (eventMap[r.event_id]?.title ?? null) : null,
    event_slug:  r.event_id ? (eventMap[r.event_id]?.slug  ?? null) : null,
  }));

  const timeline = [...emailItems, ...waItems].sort((a, b) => {
    const ta = a.sent_at ?? "";
    const tb = b.sent_at ?? "";
    return tb.localeCompare(ta);
  });

  return NextResponse.json({ timeline, total: timeline.length });
}
