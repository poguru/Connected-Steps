import { NextRequest, NextResponse } from "next/server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { processReferral } from "@/lib/referrals";
import { getSupabaseServer } from "@/lib/supabase-server";

// POST /api/admin/referrals/retry
// Body: { referred_email } — re-run referral processing for a specific user.
// Safe to call multiple times — duplicate prevention via UNIQUE(referred_email).
export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { referred_email, referral_code } = await req.json();
  if (!referred_email) return NextResponse.json({ error: "referred_email required" }, { status: 400 });

  const db = getSupabaseServer();

  // Get the referral code from the referrals table if not provided
  let code = referral_code;
  if (!code) {
    const { data: existing } = await db.from("referrals").select("referral_code").eq("referred_email", referred_email.toLowerCase()).maybeSingle();
    code = existing?.referral_code;
  }

  // If no code found anywhere, try to look up from referral_invites (legacy)
  if (!code) {
    const { data: inv } = await db.from("referral_invites").select("referrer_email").eq("invitee_email", referred_email.toLowerCase()).maybeSingle();
    if (inv?.referrer_email) {
      const { data: rc } = await db.from("referral_codes").select("code").eq("user_email", inv.referrer_email).single();
      code = rc?.code;
    }
  }

  if (!code) return NextResponse.json({ error: "No referral code found for this user. Provide referral_code in body." }, { status: 404 });

  // Get the referred user's first name
  const { data: user } = await db.from("users").select("first_name").eq("email", referred_email.toLowerCase()).single();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Delete existing referral row if status is "completed" (not yet rewarded) to allow retry
  const { data: existing } = await db.from("referrals").select("status").eq("referred_email", referred_email.toLowerCase()).maybeSingle();
  if (existing && existing.status === "completed") {
    await db.from("referrals").delete().eq("referred_email", referred_email.toLowerCase());
    console.log(`[referrals/retry] deleted stale 'completed' row for ${referred_email} to allow retry`);
  } else if (existing?.status === "reward_issued") {
    return NextResponse.json({ message: "Referral already processed and reward issued.", status: "reward_issued" });
  }

  await processReferral(code, referred_email.toLowerCase(), user.first_name);

  // Check result
  const { data: result } = await db.from("referrals").select("status, reward_granted, rewarded_at").eq("referred_email", referred_email.toLowerCase()).maybeSingle();

  return NextResponse.json({
    ok:     true,
    result: result ?? { status: "unknown" },
    message: result?.status === "reward_issued"
      ? `✅ Referral processed successfully. Rewards issued.`
      : `⚠️ Referral row created but reward may not have been issued. Check server logs.`,
  });
}
