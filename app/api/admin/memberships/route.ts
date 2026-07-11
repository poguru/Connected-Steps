import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/memberships
// Query params (all optional â€” defaults maintain backward compatibility):
//   page    int  0-based page index          (default 0)
//   limit   int  rows per page, max 200      (default 50)
//   q       str  ilike search on email/name  (default "")
//   status  str  active | expired | expiring (default "" = all)
//   sort    str  column to order by          (default "created_at")
//   order   str  asc | desc                  (default "desc")
//
// Response: { memberships[], stats{}, total, page, limit, has_more }
// Stats always reflect the FULL table (not just the current page) via
// the membership_stats() RPC â€” one SQL pass, no N+1 count queries.

const VALID_SORT = new Set(["created_at", "expires_at", "amount_paid", "plan", "user_email"]);
const PAGE_LIMIT  = 50;
const MAX_LIMIT   = 200;

export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp    = req.nextUrl.searchParams;
  const page  = Math.max(0, parseInt(sp.get("page")  ?? "0",  10));
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(sp.get("limit") ?? String(PAGE_LIMIT), 10)));
  const q      = sp.get("q")?.trim()     ?? "";
  const status = sp.get("status")?.trim() ?? "";
  const sort   = VALID_SORT.has(sp.get("sort") ?? "") ? (sp.get("sort") as string) : "created_at";
  const asc    = sp.get("order") === "asc";

  const db     = getSupabaseServer();
  const now    = new Date();
  const in7    = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const nowISO = now.toISOString();
  const in7ISO = in7.toISOString();

  // â”€â”€ Build paginated data query â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let q1 = db.from("memberships").select("*", { count: "exact" });

  if (q) {
    // Search on email â€” name search handled post-enrich from the users table
    q1 = q1.ilike("user_email", `%${q}%`);
  }

  if (status === "active")   q1 = q1.eq("status", "active").gt("expires_at", nowISO);
  if (status === "expired")  q1 = q1.or(`status.neq.active,expires_at.lte.${nowISO}`);
  if (status === "expiring") q1 = q1.eq("status", "active").gt("expires_at", nowISO).lte("expires_at", in7ISO);

  q1 = q1.order(sort, { ascending: asc }).range(page * limit, page * limit + limit - 1);

  // â”€â”€ Stats RPC (one SQL pass over memberships table) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [{ data: memberships, count, error }, { data: statsRaw }] = await Promise.all([
    q1,
    db.rpc("membership_stats"),
  ]);

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // â”€â”€ Enrich only this page's rows with user details â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const emails = (memberships ?? []).map(m => m.user_email);
  const { data: users } = emails.length
    ? await db.from("users").select("email, first_name, last_name, phone, location").in("email", emails)
    : { data: [] };

  const userMap = Object.fromEntries((users ?? []).map(u => [u.email, u]));

  const enriched = (memberships ?? []).map(m => {
    const u          = userMap[m.user_email] ?? {};
    const expiresAt  = new Date(m.expires_at);
    const isActive   = m.status === "active" && expiresAt > now;
    const expiringSoon = isActive && expiresAt <= in7;
    return {
      ...m,
      first_name:    u.first_name    ?? "",
      last_name:     u.last_name     ?? "",
      phone:         u.phone         ?? "",
      location:      u.location      ?? "",
      isActive,
      expiringSoon,
    };
  });

  // If the caller searched by name (not email), do a secondary name search
  // on the enriched page and return the matched subset.  This is only needed
  // when `q` looks like a name (no @ sign).
  const filtered = (q && !q.includes("@"))
    ? enriched.filter(m => {
        const full = `${m.first_name} ${m.last_name}`.toLowerCase();
        return full.includes(q.toLowerCase()) || m.phone.includes(q);
      })
    : enriched;

  const stats = (statsRaw as Record<string, number>) ?? {
    total: count ?? 0, active: 0, expired: 0, expiringSoon: 0, revenue: 0,
  };

  return NextResponse.json({
    memberships: filtered,
    stats,
    total:    count ?? 0,
    page,
    limit,
    has_more: (page * limit + limit) < (count ?? 0),
  });
}
