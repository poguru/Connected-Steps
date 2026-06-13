import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw && pw === process.env.ADMIN_PASSWORD;
}

// GET /api/admin/referrals
// Returns summary stats + full referrals table for admin dashboard.
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();

  const { data: rows, error } = await db
    .from("referrals")
    .select("id, referral_code, referrer_email, referred_email, status, reward_granted, created_at, rewarded_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const all            = rows ?? [];
  const total          = all.length;
  const successful     = all.filter(r => r.status === "reward_issued").length;
  const rewardsIssued  = all.filter(r => r.reward_granted).length;

  // Top referrers: count by referrer_email
  const tally: Record<string, number> = {};
  for (const r of all) {
    tally[r.referrer_email] = (tally[r.referrer_email] ?? 0) + 1;
  }
  const topReferrers = Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([email, count]) => ({ email, count }));

  // Enrich with user names
  const emails = [...new Set(all.flatMap(r => [r.referrer_email, r.referred_email]))];
  const { data: users } = await db
    .from("users")
    .select("email, first_name, last_name")
    .in("email", emails);
  const nameMap = Object.fromEntries((users ?? []).map(u => [u.email, `${u.first_name} ${u.last_name}`.trim()]));

  const enriched = all.map(r => ({
    ...r,
    referrer_name: nameMap[r.referrer_email] ?? r.referrer_email,
    referred_name: nameMap[r.referred_email] ?? r.referred_email,
  }));

  return NextResponse.json({
    summary: { total, successful, rewardsIssued },
    topReferrers: topReferrers.map(t => ({ ...t, name: nameMap[t.email] ?? t.email })),
    referrals: enriched,
  });
}
