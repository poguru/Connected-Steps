import { NextRequest, NextResponse } from "next/server";
import { requireV1Auth, finishV1Request, V1_ERRORS, parsePagination, parseFilters, parseSort, v1Paginated } from "@/lib/v1-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireV1Auth(req, "registrations:read");
  if (ctx instanceof NextResponse) return ctx;

  const { id: event_id } = await params;
  const db   = getSupabaseServer();
  const pg   = parsePagination(req);
  const sort = parseSort(req, ["created_at", "user_name", "registration_code"], "created_at");
  const f    = parseFilters(req, ["payment_status", "status"]);

  // Verify event belongs to org
  const { data: ev } = await db.from("events").select("id").eq("id", event_id).eq("organization_id", ctx.organization_id).single();
  if (!ev) { finishV1Request(ctx, req, 404); return V1_ERRORS.notFound("Event"); }

  let q = db
    .from("event_registrations")
    .select(
      "id, registration_code, user_email, user_name, phone, payment_status, final_price, status, created_at, event_participants ( name, distance_category, bib_number, tshirt_size, checkin_done )",
      { count: "exact" },
    )
    .eq("event_id", event_id)
    .order(sort.column, { ascending: sort.dir === "asc" })
    .range(pg.offset, pg.offset + pg.per_page - 1);

  if (f.payment_status) q = q.eq("payment_status", f.payment_status);
  if (f.status)         q = q.eq("status",         f.status);

  const { data, count, error } = await q;
  if (error) { finishV1Request(ctx, req, 500); return V1_ERRORS.internal(); }

  const res = v1Paginated(data ?? [], count ?? 0, pg);
  finishV1Request(ctx, req, 200);
  return res;
}
