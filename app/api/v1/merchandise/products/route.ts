import { NextRequest, NextResponse } from "next/server";
import { requireV1Auth, finishV1Request, V1_ERRORS, parsePagination, parseFilters, parseSort, v1Paginated } from "@/lib/v1-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const ctx = await requireV1Auth(req, "merchandise:read");
  if (ctx instanceof NextResponse) return ctx;

  const db   = getSupabaseServer();
  const pg   = parsePagination(req);
  const sort = parseSort(req, ["name", "created_at"], "created_at");
  const f    = parseFilters(req, ["is_active"]);

  let q = db
    .from("merchandise_products")
    .select(
      `id, name, description, category, is_active, created_at,
       merchandise_variants ( id, size, color, price_paise, stock_qty, reserved_qty, sold_qty )`,
      { count: "exact" },
    )
    .eq("organization_id", ctx.organization_id)
    .order(sort.column, { ascending: sort.dir === "asc" })
    .range(pg.offset, pg.offset + pg.per_page - 1);

  if (f.is_active !== undefined) q = q.eq("is_active", f.is_active === "true");

  const { data, count, error } = await q;
  if (error) { finishV1Request(ctx, req, 500); return V1_ERRORS.internal(); }

  const res = v1Paginated(data ?? [], count ?? 0, pg);
  finishV1Request(ctx, req, 200);
  return res;
}
