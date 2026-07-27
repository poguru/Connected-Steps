import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

type Params = { params: Promise<{ id: string }> };
type RecipientFilter = "all" | "paid" | "free" | "checked_in" | "not_checked_in";

// GET /api/admin/events/[id]/communicate/whatsapp?filter=all
// Returns recipient count preview before sending.
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const filter = (req.nextUrl.searchParams.get("filter") ?? "all") as RecipientFilter;
  const db = getSupabaseServer();

  const { registrants, error } = await getRegistrants(db, id, filter);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const total      = registrants.length;
  const with_phone = registrants.filter(r => r.phone?.trim()).length;

  return NextResponse.json({ total, with_phone });
}

// POST /api/admin/events/[id]/communicate/whatsapp
// Body: { recipient_filter }
// Sends session_alert_v3 to matched registrants who have a phone number.
export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { recipient_filter?: RecipientFilter };
  const filter = body.recipient_filter ?? "all";

  const db = getSupabaseServer();

  const [{ registrants, error: regErr }, { data: ev }] = await Promise.all([
    getRegistrants(db, id, filter),
    db.from("events").select("title, start_date, start_time, location").eq("id", id).single(),
  ]);

  if (regErr || !ev) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const withPhone = registrants.filter(r => r.phone?.trim());
  if (!withPhone.length) return NextResponse.json({ total: 0, sent: 0, failed: 0, message: "No recipients with a phone number matched the filter." });

  const dateStr  = ev.start_date
    ? new Date(ev.start_date + "T12:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "";
  const timeStr  = ev.start_time
    ? (() => { const [h, m] = (ev.start_time as string).split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; })()
    : "";
  const dateTime = timeStr ? `${dateStr}, ${timeStr}` : dateStr;

  const batchId      = crypto.randomUUID();
  const templateName = process.env.WHATSAPP_SESSION_TEMPLATE ?? "session_alert_v3";
  const total        = withPhone.length;

  // Insert history record immediately so it appears in the hub during sending
  await db.from("event_comm_history").insert({
    event_id:         id,
    subject:          `WA Registrant Blast: ${ev.title}`,
    recipients:       total,
    sent:             0,
    failed:           0,
    status:           "sending",
    filter:           filter,
    recipient_filter: filter,
    channel:          "whatsapp",
    batch_id:         batchId,
  });

  // Send in background after response — batch of 10 with 300ms between batches
  after(async () => {
    let sent = 0, failed = 0;

    for (let i = 0; i < withPhone.length; i += 10) {
      const batch   = withPhone.slice(i, i + 10);
      const results = await Promise.allSettled(
        batch.map(r =>
          sendWhatsAppTemplate(
            r.phone!,
            templateName,
            // {{1}}=name  {{2}}=event title  {{3}}=date+time  {{4}}=location
            [r.user_name?.split(" ")[0] ?? "Runner", ev.title, dateTime, ev.location],
          ),
        ),
      );
      for (const result of results) {
        if (result.status === "fulfilled" && result.value.ok) sent++;
        else failed++;
      }
      if (i + 10 < withPhone.length) await new Promise(res => setTimeout(res, 300));
    }

    await db.from("event_comm_history")
      .update({ sent, failed, status: "sent" })
      .eq("batch_id", batchId)
      .eq("event_id", id);
  });

  return NextResponse.json({ batch_id: batchId, total, message: `Sending to ${total} recipients in background.` });
}

// ── Shared helper: get registrants matching a filter ──────────────────────────

async function getRegistrants(
  db: ReturnType<typeof import("@/lib/supabase-server").getSupabaseServer>,
  eventId: string,
  filter: RecipientFilter,
) {
  // For check-in based filters we need event_participants — the authoritative table.
  if (filter === "checked_in" || filter === "not_checked_in") {
    const [regsRes, partsRes] = await Promise.all([
      db.from("event_registrations")
        .select("id, user_name, phone")
        .eq("event_id", eventId)
        .in("status", ["confirmed"])
        .in("payment_status", ["paid", "free"]),
      db.from("event_participants")
        .select("registration_id, checked_in_at")
        .eq("event_id", eventId)
        .neq("status", "cancelled"),
    ]);

    if (regsRes.error) return { registrants: [], error: regsRes.error };

    const checkedInIds = new Set(
      (partsRes.data ?? []).filter(p => p.checked_in_at).map(p => p.registration_id)
    );

    const registrants = (regsRes.data ?? []).filter(r =>
      filter === "checked_in" ? checkedInIds.has(r.id) : !checkedInIds.has(r.id)
    );

    return { registrants, error: null };
  }

  // Simple payment-status filters
  let query = db.from("event_registrations")
    .select("id, user_name, phone")
    .eq("event_id", eventId)
    .in("status", ["confirmed"])
    .neq("payment_status", "cancelled");

  if (filter === "paid") query = query.eq("payment_status", "paid");
  if (filter === "free") query = query.eq("payment_status", "free");

  const { data, error } = await query;
  return { registrants: data ?? [], error };
}
