import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

// GET /api/it-run/admin/dashboard
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "support_desk"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();

  const { data: event } = await db
    .from("it_run_events")
    .select("id")
    .eq("slug", "sprint-2")
    .single();

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const eventId = event.id;

  // Run all queries in parallel
  const [regsRes, partsRes, bibRes, checkinRes, catRes] = await Promise.all([
    db.from("it_run_registrations")
      .select("id,payment_status,final_price,created_at")
      .eq("event_id", eventId),
    db.from("it_run_participants")
      .select("id,verification_status")
      .eq("event_id", eventId),
    db.from("it_run_bib_collections").select("id,collected_at"),
    db.from("it_run_checkins").select("id,checked_in_at"),
    db.from("it_run_categories")
      .select("id,name,price_rupees,current_participants,max_participants,color")
      .eq("event_id", eventId)
      .order("sort_order"),
  ]);

  const regs    = regsRes.data  ?? [];
  const parts   = partsRes.data ?? [];
  const bibs    = bibRes.data   ?? [];
  const checkins= checkinRes.data ?? [];
  const cats    = catRes.data   ?? [];

  const paidRegs  = regs.filter(r => r.payment_status === "paid");
  const freeRegs  = regs.filter(r => r.payment_status === "free");
  const pendRegs  = regs.filter(r => r.payment_status === "pending");
  const totalRev  = paidRegs.reduce((s, r) => s + (r.final_price ?? 0), 0);

  const verificationStats = {
    total:              parts.length,
    pending:            parts.filter(p => p.verification_status === "pending").length,
    verified:           parts.filter(p => p.verification_status === "verified").length,
    rejected:           parts.filter(p => p.verification_status === "rejected").length,
    need_clarification: parts.filter(p => p.verification_status === "need_clarification").length,
  };

  // Registrations per day (last 7 days)
  const now = Date.now();
  const dayRegs = Array.from({ length: 7 }, (_, i) => {
    const d   = new Date(now - i * 86400000);
    const day = d.toISOString().split("T")[0];
    return {
      date:  day,
      count: regs.filter(r => r.created_at?.startsWith(day)).length,
    };
  }).reverse();

  return NextResponse.json({
    summary: {
      totalRegistrations: regs.length,
      paidRegistrations:  paidRegs.length,
      freeRegistrations:  freeRegs.length,
      pendingRegistrations: pendRegs.length,
      totalParticipants:  parts.length,
      totalRevenue:       totalRev,
      bibsCollected:      bibs.length,
      checkedIn:          checkins.length,
    },
    verificationStats,
    categoryStats: cats.map(c => ({
      id:               c.id,
      name:             c.name,
      color:            c.color,
      price:            c.price_rupees,
      registered:       c.current_participants,
      maxParticipants:  c.max_participants,
    })),
    dailyRegistrations: dayRegs,
  });
}
