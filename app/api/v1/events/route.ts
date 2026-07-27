import { NextRequest, NextResponse } from "next/server";
import { requireV1Auth, finishV1Request, V1_ERRORS, parsePagination, parseFilters, parseSort, v1Paginated } from "@/lib/v1-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const ctx = await requireV1Auth(req, "events:read");
  if (ctx instanceof NextResponse) return ctx;

  const db     = getSupabaseServer();
  const pg     = parsePagination(req);
  const sort   = parseSort(req, ["title", "date", "created_at"], "date");
  const filters = parseFilters(req, ["status", "date_from", "date_to"]);

  let q = db
    .from("events")
    .select("id, title, slug, date, start_time, location, description, status, max_participants, created_at", { count: "exact" })
    .eq("organization_id", ctx.organization_id)
    .order(sort.column, { ascending: sort.dir === "asc" })
    .range(pg.offset, pg.offset + pg.per_page - 1);

  if (filters.status)    q = q.eq("status",   filters.status);
  if (filters.date_from) q = q.gte("date",    filters.date_from);
  if (filters.date_to)   q = q.lte("date",    filters.date_to);

  const { data, count, error } = await q;
  if (error) { finishV1Request(ctx, req, 500); return V1_ERRORS.internal(); }

  const res = v1Paginated(data ?? [], count ?? 0, pg);
  finishV1Request(ctx, req, 200);
  return res;
}
