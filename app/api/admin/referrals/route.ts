import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/referrals
// Query params:
//   page    int  0-based (default 0)
//   limit   int  rows per page, max 200 (default 50)
//   q       str  ilike on referrer_email, referred_email
//   status  str  reward_issued | completed | pending
//   sort    str  column (default "created_at")
//   order   str  asc | desc (default "desc")
//
// Response: { referrals[], summary{}, topReferrers[], total, page, limit, has_more }
// summary uses referral_summary() RPC â€” one SQL pass.
// topReferrers loaded separately (top 10 only, no pagination needed).

const VALID_SORT = new Set(["created_at", "rewarded_at", "referrer_email", "referred_email", "status"]);
const PAGE_LIMIT  = 50;
const MAX_LIMIT   = 200;

export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp     = req.nextUrl.searchParams;
  const page   = Math.max(0, parseInt(sp.get("page")  ?? "0",  10));
  const limit  = Math.min(MAX_LIMIT, Math.max(1, parseInt(sp.get("limit") ?? String(PAGE_LIMIT), 10)));
  const q      = sp.get("q")?.trim()      ?? "";
  const status = sp.get("status")?.trim() ?? "";
  const sort   = VALID_SORT.has(sp.get("sort") ?? "") ? (sp.get("sort") as string) : "created_at";
  const asc    = sp.get("order") === "asc";

  const db = getSupabaseServer();

  // â”€â”€ Paginated referrals + summary RPC (parallel) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let q1 = db
    .from("referrals")
    .select("id, referral_code, referrer_email, referred_email, status, reward_granted, created_at, rewarded_at", { count: "exact" })
    .order(sort, { ascending: asc });

  if (q) q1 = q1.or(`referrer_email.ilike.%${q}%,referred_email.ilike.%${q}%`) as typeof q1;
  if (status) q1 = q1.eq("status", status) as typeof q1;

  q1 = q1.range(page * limit, page * limit + limit - 1) as typeof q1;

  const [{ data: rows, count, error }, { data: summaryRaw }, { data: topRows }] = await Promise.all([
    q1,
    db.rpc("referral_summary"),
    // Top referrers: one aggregation query limited to the 10 most active
    db.from("referrals")
      .select("referrer_email")
      .eq("status", "reward_issued")
      .order("created_at", { ascending: false }),
  ]);

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Compute top referrers from the lightweight referrer_email-only result
  const tally: Record<string, number> = {};
  for (const r of topRows ?? []) {
    tally[r.referrer_email] = (tally[r.referrer_email] ?? 0) + 1;
  }
  const topEmails = Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([email, count]) => ({ email, count }));

  // Enrich only this page + top-10 emails with user names
  const pageEmails = new Set(
    (rows ?? []).flatMap(r => [r.referrer_email, r.referred_email])
  );
  const enrichEmails = [...new Set([...pageEmails, ...topEmails.map(t => t.email)])];
  const { data: users } = enrichEmails.length
    ? await db.from("users").select("email, first_name, last_name").in("email", enrichEmails)
    : { data: [] };

  const nameMap = Object.fromEntries(
    (users ?? []).map(u => [u.email, `${u.first_name} ${u.last_name}`.trim()])
  );

  const enriched = (rows ?? []).map(r => ({
    ...r,
    referrer_name: nameMap[r.referrer_email] ?? r.referrer_email,
    referred_name: nameMap[r.referred_email] ?? r.referred_email,
  }));

  const topReferrers = topEmails.map(t => ({
    ...t, name: nameMap[t.email] ?? t.email,
  }));

  const summary = (summaryRaw as Record<string, number>) ?? {
    total: count ?? 0, successful: 0, rewardsIssued: 0,
  };

  return NextResponse.json({
    referrals: enriched,
    summary,
    topReferrers,
    total:    count ?? 0,
    page,
    limit,
    has_more: (page * limit + limit) < (count ?? 0),
  });
}
