import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/events/[id]/comm-analytics
// Per-event batch-level analytics: group email_queue by batch_id, compute rates.
// Also includes WA stats for this event and campaign-level history.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const db = getSupabaseServer();

  const [emailBatchRes, waRes, historyRes] = await Promise.all([
    // All emails for this event (grouped client-side)
    db.from("email_queue")
      .select("batch_id, status, sent_at, delivered_at, opened_at, clicked_at, bounce_type, subject")
      .eq("event_id", eventId)
      .order("sent_at", { ascending: false })
      .limit(5000),

    // WhatsApp for this event
    db.from("wa_message_log")
      .select("template_name, purpose, status, sent_at")
      .eq("event_id", eventId)
      .order("sent_at", { ascending: false })
      .limit(5000),

    // Campaign history batches
    db.from("event_comm_history")
      .select("id, channel, status, subject, message, recipient_filter, recipient_count, delivered_count, failed_count, opened_count, sent_at, scheduled_for, batch_id")
      .eq("event_id", eventId)
      .order("sent_at", { ascending: false })
      .limit(100),
  ]);

  // ── Email batch aggregation ───────────────────────────────────────────────
  const emailRows = emailBatchRes.data ?? [];

  // Group by batch_id (null-batch rows grouped under "unbatched")
  const batchMap = new Map<string, {
    batch_id: string | null;
    subject: string | null;
    sent_at: string | null;
    total: number;
    delivered: number;
    opened: number;
    clicked: number;
    failed: number;
    bounced: number;
  }>();

  for (const row of emailRows) {
    const key = row.batch_id ?? "__unbatched__";
    if (!batchMap.has(key)) {
      batchMap.set(key, {
        batch_id: row.batch_id ?? null,
        subject:  row.subject,
        sent_at:  row.sent_at,
        total: 0, delivered: 0, opened: 0, clicked: 0, failed: 0, bounced: 0,
      });
    }
    const b = batchMap.get(key)!;
    b.total++;
    if (row.status === "delivered")         b.delivered++;
    if (row.opened_at)                      b.opened++;
    if (row.clicked_at)                     b.clicked++;
    if (row.status === "failed")            b.failed++;
    if (row.bounce_type)                    b.bounced++;
    // keep earliest sent_at per batch (sort order is desc, so last row is earliest)
    if (row.sent_at && (b.sent_at === null || row.sent_at < b.sent_at)) b.sent_at = row.sent_at;
  }

  const emailBatches = [...batchMap.values()]
    .filter(b => b.batch_id !== null)
    .sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? ""))
    .map(b => ({
      ...b,
      delivery_rate: b.total > 0  ? Math.round((b.delivered / b.total)   * 100) : null,
      open_rate:     b.delivered > 0 ? Math.round((b.opened   / b.delivered) * 100) : null,
      click_rate:    b.opened > 0  ? Math.round((b.clicked  / b.opened)    * 100) : null,
    }));

  // ── Event-level email totals ──────────────────────────────────────────────
  const emailTotals = {
    total:     emailRows.length,
    delivered: emailRows.filter(r => r.status === "delivered").length,
    opened:    emailRows.filter(r => r.opened_at).length,
    clicked:   emailRows.filter(r => r.clicked_at).length,
    failed:    emailRows.filter(r => r.status === "failed").length,
    bounced:   emailRows.filter(r => r.bounce_type).length,
  };

  // ── WhatsApp totals ───────────────────────────────────────────────────────
  const waRows = waRes.data ?? [];
  const waTotals = {
    total:     waRows.length,
    sent:      waRows.filter(r => r.status !== "failed").length,
    delivered: waRows.filter(r => r.status === "delivered" || r.status === "read").length,
    read:      waRows.filter(r => r.status === "read").length,
    failed:    waRows.filter(r => r.status === "failed").length,
  };

  // Template breakdown for WA
  const templateMap = new Map<string, { name: string; total: number; failed: number }>();
  for (const row of waRows) {
    const k = row.template_name ?? row.purpose ?? "unknown";
    if (!templateMap.has(k)) templateMap.set(k, { name: k, total: 0, failed: 0 });
    const t = templateMap.get(k)!;
    t.total++;
    if (row.status === "failed") t.failed++;
  }
  const waTemplates = [...templateMap.values()].sort((a, b) => b.total - a.total);

  return NextResponse.json({
    event_id:       eventId,
    email: {
      totals:  emailTotals,
      batches: emailBatches,
    },
    whatsapp: {
      totals:    waTotals,
      templates: waTemplates,
    },
    campaigns:   historyRes.data ?? [],
    as_of: new Date().toISOString(),
  });
}
