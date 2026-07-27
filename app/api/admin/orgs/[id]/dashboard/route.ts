import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getOrgContext, canAccessOrg, canDo } from "@/lib/org-auth";

type Params = { params: Promise<{ id: string }> };

/** Organization dashboard statistics — scoped to org's events. */
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessOrg(ctx, id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (ctx.type === "org_member" && ctx.role && !canDo(ctx.role, "analytics:read")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const db   = getSupabaseServer();
  const now  = new Date().toISOString();
  const ago30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // All event IDs for this org (needed for join queries)
  const { data: eventRows } = await db
    .from("events")
    .select("id, status, start_date")
    .eq("organization_id", id);

  const eventIds   = (eventRows ?? []).map(e => e.id);
  const published  = (eventRows ?? []).filter(e => e.status === "published");
  const upcoming   = published.filter(e => e.start_date >= now.substring(0, 10));
  const past       = published.filter(e => e.start_date < now.substring(0, 10));

  // Run queries in parallel
  const [regRes, revenueRes, commRes, emailRes, memberRes] = await Promise.all([
    // Registrations (30d + total)
    eventIds.length > 0
      ? db.from("event_registrations")
          .select("id, status, created_at, price_paid")
          .in("event_id", eventIds)
      : Promise.resolve({ data: [] }),

    // Revenue from paid registrations
    eventIds.length > 0
      ? db.from("event_registrations")
          .select("price_paid")
          .in("event_id", eventIds)
          .eq("payment_status", "paid")
      : Promise.resolve({ data: [] }),

    // Communications (30d)
    eventIds.length > 0
      ? db.from("event_comm_history")
          .select("id, status, channel")
          .in("event_id", eventIds)
          .gte("sent_at", ago30)
      : Promise.resolve({ data: [] }),

    // Email delivery health (30d)
    eventIds.length > 0
      ? db.from("email_queue")
          .select("status, delivered_at")
          .in("event_id", eventIds)
          .gte("created_at", ago30)
      : Promise.resolve({ data: [] }),

    // Org members
    db.from("organization_members")
      .select("id, role, is_active")
      .eq("organization_id", id),
  ]);

  const regs  = (regRes.data  ?? []) as Array<{ id: string; status: string; created_at: string; price_paid?: number }>;
  const revRows = (revenueRes.data ?? []) as Array<{ price_paid?: number }>;
  const comms = (commRes.data ?? []) as Array<{ id: string; status: string; channel: string }>;
  const emails = (emailRes.data ?? []) as Array<{ status: string; delivered_at?: string }>;
  const members = (memberRes.data ?? []) as Array<{ id: string; role: string; is_active: boolean }>;

  const regs30d  = regs.filter(r => r.created_at >= ago30);
  const revenue  = revRows.reduce((s, r) => s + (r.price_paid ?? 0), 0);

  const emailDelivered = emails.filter(e => e.delivered_at).length;
  const emailTotal     = emails.length;
  const deliveryRate   = emailTotal > 0 ? Math.round((emailDelivered / emailTotal) * 100) : null;

  // Simple health score: 100 - penalties
  let healthScore = 100;
  const failed = emails.filter(e => e.status === "failed").length;
  if (emailTotal > 0 && failed / emailTotal > 0.1) healthScore -= 20;
  if ((eventRows ?? []).length === 0) healthScore -= 10;
  healthScore = Math.max(0, healthScore);

  return NextResponse.json({
    events: {
      total:    (eventRows ?? []).length,
      published: published.length,
      upcoming:  upcoming.length,
      past:      past.length,
    },
    registrations: {
      total:   regs.length,
      last_30d: regs30d.length,
      active:  regs.filter(r => r.status !== "cancelled").length,
    },
    revenue: {
      total_inr: revenue,
      currency: "INR",
    },
    communications: {
      last_30d:     comms.length,
      email_sent:   comms.filter(c => c.channel === "email").length,
      wa_sent:      comms.filter(c => c.channel === "whatsapp").length,
      delivery_rate: deliveryRate,
    },
    members: {
      total:  members.length,
      active: members.filter(m => m.is_active).length,
      owners: members.filter(m => m.role === "owner").length,
    },
    health_score: healthScore,
    as_of: new Date().toISOString(),
  });
}
