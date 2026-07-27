import { NextRequest, NextResponse } from "next/server";
import { requireV1Auth, finishV1Request, V1_ERRORS, v1Single } from "@/lib/v1-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireV1Auth(req, "events:read");
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;
  const db = getSupabaseServer();

  const { data, error } = await db
    .from("events")
    .select(`
      id, title, slug, date, start_time, location, description, status,
      max_participants, registration_close_time, created_at,
      event_races ( id, name, distance_km, max_participants, price )
    `)
    .eq("id", id)
    .eq("organization_id", ctx.organization_id)
    .single();

  if (error || !data) {
    finishV1Request(ctx, req, 404);
    return V1_ERRORS.notFound("Event");
  }

  const res = v1Single(data);
  finishV1Request(ctx, req, 200);
  return res;
}
