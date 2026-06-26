import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { createNotifications } from "@/lib/notify-inapp";

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/events/[id]/communicate/push
// Sends an in-app + push notification to event registrants.
//
// Body:
//   title             string  notification title
//   body              string  notification body
//   action_url        string  deep link (default /events)
//   recipient_filter  string  all | paid | free | checked_in | not_checked_in

export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const body = await req.json() as Record<string, unknown>;

  const title            = String(body.title   ?? "").trim();
  const notifBody        = String(body.body     ?? "").trim();
  const actionUrl        = String(body.action_url ?? `/events`);
  const recipientFilter  = String(body.recipient_filter ?? "all");

  if (!title || !notifBody) {
    return NextResponse.json({ error: "title and body are required" }, { status: 400 });
  }

  const db = getSupabaseServer();

  // Fetch relevant registrations
  let q = db
    .from("event_registrations")
    .select("user_email, user_name")
    .eq("event_id", eventId)
    .in("payment_status", ["paid", "free"])
    .eq("status", "confirmed");

  if (recipientFilter === "checked_in")     q = q.not("checked_in_at", "is", null) as typeof q;
  if (recipientFilter === "not_checked_in") q = q.is("checked_in_at", null)       as typeof q;
  if (recipientFilter === "paid")           q = q.eq("payment_status", "paid")    as typeof q;
  if (recipientFilter === "free")           q = q.eq("payment_status", "free")    as typeof q;

  const { data: registrants, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!registrants?.length) {
    return NextResponse.json({ sent: 0, message: "No recipients found for this filter" });
  }

  const emails = [...new Set(registrants.map(r => r.user_email.toLowerCase()))];

  // Fetch event name for the notification
  const { data: ev } = await db.from("events").select("title").eq("id", eventId).single();
  const eventTitle = ev?.title ?? "Connected Steps Event";

  // Send in-app notifications (writes to DB + fires web/mobile push)
  await createNotifications(
    emails.map(email => ({
      user_email: email,
      type:       "session_reminder" as const,  // closest type for event notifications
      title,
      body:       notifBody,
      action_url: actionUrl,
    }))
  );

  // Log to comm history
  await db.from("event_comm_history").insert({
    event_id:         eventId,
    subject:          title,
    body:             notifBody,
    recipient_filter: recipientFilter,
    recipients:       emails.length,
    sent:             emails.length,
    failed:           0,
    status:           "sent",
    channel:          "push",
  }).select().maybeSingle();

  console.log(`[communicate/push] event=${eventId} title="${title}" sent=${emails.length} filter=${recipientFilter}`);

  return NextResponse.json({
    sent:        emails.length,
    channel:     "push",
    event_title: eventTitle,
  });
}
