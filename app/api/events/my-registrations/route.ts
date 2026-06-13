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

  const { data, error } = await db
    .from("event_registrations")
    .select(`
      id, registration_code, payment_status, status, created_at,
      original_price, coupon_discount, final_price,
      events (
        id, title, event_type, cover_image, start_date, start_time,
        location, share_slug
      )
    `)
    .eq("user_email", userEmail.toLowerCase())
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ registrations: data ?? [] });
}
