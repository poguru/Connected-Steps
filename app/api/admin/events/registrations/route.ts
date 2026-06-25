import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/events/registrations?event_id=...
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db      = getSupabaseServer();
  const eventId = req.nextUrl.searchParams.get("event_id");

  let query = db
    .from("event_registrations")
    .select(`
      id, registration_code, user_email, user_name, phone, blood_group,
      emergency_contact, coupon_code, coupon_discount, original_price, final_price,
      payment_status, razorpay_payment_id, status, created_at,
      distance_category, qr_token, checked_in_at,
      events ( id, title, start_date, location )
    `)
    .order("created_at", { ascending: false });

  if (eventId) query = query.eq("event_id", eventId) as typeof query;

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Summary stats
  const total   = data?.length ?? 0;
  const paid    = data?.filter(r => r.payment_status === "paid").length ?? 0;
  const free    = data?.filter(r => r.payment_status === "free").length ?? 0;
  const pending = data?.filter(r => r.payment_status === "pending").length ?? 0;
  const revenue = data?.filter(r => r.payment_status === "paid").reduce((s, r) => s + (r.final_price ?? 0), 0) ?? 0;

  return NextResponse.json({ registrations: data ?? [], summary: { total, paid, free, pending, revenue } });
}

// PATCH /api/admin/events/registrations — cancel or update status
export async function PATCH(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, status } = await req.json();
  if (!id || !status) return NextResponse.json({ error: "id and status required" }, { status: 400 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("event_registrations")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
