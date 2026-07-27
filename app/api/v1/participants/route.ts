import { NextRequest, NextResponse } from "next/server";
import { requireV1Auth, finishV1Request, V1_ERRORS, parsePagination, parseFilters, parseSort, v1Paginated } from "@/lib/v1-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const ctx = await requireV1Auth(req, "participants:read");
  if (ctx instanceof NextResponse) return ctx;

  const db   = getSupabaseServer();
  const pg   = parsePagination(req);
  const sort = parseSort(req, ["name", "created_at", "bib_number"], "created_at");
  const f    = parseFilters(req, ["event_id", "distance_category", "checkin_done"]);

  let q = db
    .from("event_participants")
    .select(
      `id, name, email, phone, distance_category, bib_number, tshirt_size,
       checkin_done, checkin_at, event_id,
       event_registrations!inner (
         registration_code, payment_status,
         events!inner ( title, date, organization_id )
       )`,
      { count: "exact" },
    )
    .eq("event_registrations.events.organization_id", ctx.organization_id)
    .order(sort.column, { ascending: sort.dir === "asc" })
    .range(pg.offset, pg.offset + pg.per_page - 1);

  if (f.event_id)           q = q.eq("event_id",           f.event_id);
  if (f.distance_category)  q = q.eq("distance_category",  f.distance_category);
  if (f.checkin_done)       q = q.eq("checkin_done",        f.checkin_done === "true");

  const { data, count, error } = await q;
  if (error) { finishV1Request(ctx, req, 500); return V1_ERRORS.internal(); }

  const res = v1Paginated(data ?? [], count ?? 0, pg);
  finishV1Request(ctx, req, 200);
  return res;
}
