import { NextRequest, NextResponse } from "next/server";
import { requireV1Auth, finishV1Request, V1_ERRORS, v1Single } from "@/lib/v1-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireV1Auth(req, "registrations:read");
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;
  const db = getSupabaseServer();

  const { data, error } = await db
    .from("event_registrations")
    .select(`
      id, registration_code, user_email, user_name, phone,
      payment_status, final_price, discount_applied, status, created_at, event_id,
      events!inner ( id, title, date, organization_id ),
      event_participants ( name, distance_category, bib_number, tshirt_size, checkin_done, checkin_at )
    `)
    .eq("id", id)
    .eq("events.organization_id", ctx.organization_id)
    .single();

  if (error || !data) { finishV1Request(ctx, req, 404); return V1_ERRORS.notFound("Registration"); }

  const res = v1Single(data);
  finishV1Request(ctx, req, 200);
  return res;
}
