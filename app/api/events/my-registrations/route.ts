import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

// GET /api/events/my-registrations
// Header: x-user-token
export async function GET(req: NextRequest) {
  const token = req.headers.get("x-user-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userEmail = await verifyUserToken(token);
  if (!userEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();

  // Step 1: fetch registrations (no FK join — avoids PostgREST schema-cache issues)
  const { data: regs, error: regErr } = await db
    .from("event_registrations")
    .select("id, registration_code, payment_status, status, created_at, original_price, coupon_discount, final_price, event_id")
    .eq("user_email", userEmail.toLowerCase())
    .order("created_at", { ascending: false });

  if (regErr) return NextResponse.json({ error: regErr.message }, { status: 500 });
  if (!regs || regs.length === 0) return NextResponse.json({ registrations: [] });

  // Step 2: fetch the events for those registration IDs
  const eventIds = [...new Set(regs.map(r => r.event_id))];
  const { data: events } = await db
    .from("events")
    .select("id, title, event_type, cover_image, start_date, start_time, end_date, end_time, location, share_slug")
    .in("id", eventIds);

  type EvRow = NonNullable<typeof events>[number];
  const evMap: Record<string, EvRow> = {};
  for (const ev of events ?? []) evMap[ev.id] = ev;

  const registrations = regs.map(r => ({
    ...r,
    events: evMap[r.event_id] ?? null,
  }));

  return NextResponse.json({ registrations });
}
