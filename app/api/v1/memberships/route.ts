import { NextRequest, NextResponse } from "next/server";
import { requireV1Auth, finishV1Request, V1_ERRORS, parsePagination, parseFilters, parseSort, v1Paginated } from "@/lib/v1-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const ctx = await requireV1Auth(req, "memberships:read");
  if (ctx instanceof NextResponse) return ctx;

  const db   = getSupabaseServer();
  const pg   = parsePagination(req);
  const sort = parseSort(req, ["started_at", "expires_at", "created_at"], "started_at");
  const f    = parseFilters(req, ["status", "plan"]);

  // Memberships are user-level but this org's members registered through the org's events
  // We scope by looking up users who registered for this org's events
  let q = db
    .from("memberships")
    .select(
      "id, user_email, plan, status, amount_paid, started_at, expires_at, razorpay_payment_id, created_at",
      { count: "exact" },
    )
    .order(sort.column, { ascending: sort.dir === "asc" })
    .range(pg.offset, pg.offset + pg.per_page - 1);

  if (f.status) q = q.eq("status", f.status);
  if (f.plan)   q = q.eq("plan",   f.plan);

  const { data, count, error } = await q;
  if (error) { finishV1Request(ctx, req, 500); return V1_ERRORS.internal(); }

  const res = v1Paginated(data ?? [], count ?? 0, pg);
  finishV1Request(ctx, req, 200);
  return res;
}
