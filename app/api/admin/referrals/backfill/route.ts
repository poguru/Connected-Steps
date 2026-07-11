import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { getOwnerByCode } from "@/lib/referrals";

/**
 * POST /api/admin/referrals/backfill
 * Retroactively creates a referral record + grants rewards for a signup
 * that happened before the referral system was enabled.
 *
 * Body: { referralCode: string, referredEmail: string }
 */
export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { referralCode, referredEmail } = await req.json();

  if (!referralCode || !referredEmail) {
    return NextResponse.json({ error: "referralCode and referredEmail are required" }, { status: 400 });
  }

  const db = getSupabaseServer();
  const normalizedReferred = (referredEmail as string).toLowerCase().trim();
  const normalizedCode     = (referralCode as string).toUpperCase().trim();

  // Resolve referrer from code
  const referrerEmail = await getOwnerByCode(normalizedCode);
  if (!referrerEmail) {
    return NextResponse.json({ error: `No referral code found: ${normalizedCode}` }, { status: 404 });
  }

  if (referrerEmail === normalizedReferred) {
    return NextResponse.json({ error: "Referrer and referred are the same user" }, { status: 400 });
  }

  // Verify referred user exists
  const { data: referredUser } = await db
    .from("users")
    .select("first_name")
    .eq("email", normalizedReferred)
    .single();

  if (!referredUser) {
    return NextResponse.json({ error: `No user found with email: ${normalizedReferred}` }, { status: 404 });
  }

  // Check for existing referral record
  const { data: existing } = await db
    .from("referrals")
    .select("id, status, reward_granted")
    .eq("referred_email", normalizedReferred)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      error: `Referral already exists for ${normalizedReferred}`,
      existing,
    }, { status: 409 });
  }

  // Insert referral record
  const { error: insertErr } = await db.from("referrals").insert({
    referral_code:  normalizedCode,
    referrer_email: referrerEmail,
    referred_email: normalizedReferred,
    status:         "completed",
    reward_granted: false,
  });

  if (insertErr) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // Extend / grant memberships for both users
  const now = new Date();
  const ms  = 30 * 24 * 60 * 60 * 1000;

  async function extendOrGrant(email: string) {
    const { data: active } = await db
      .from("memberships")
      .select("user_email, expires_at")
      .eq("user_email", email)
      .eq("status", "active")
      .gt("expires_at", now.toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (active?.expires_at) {
      const newExpiry = new Date(new Date(active.expires_at).getTime() + ms).toISOString();
      await db.from("memberships").update({ expires_at: newExpiry }).eq("user_email", email).eq("status", "active");
    } else {
      await db.from("memberships").insert({
        user_email:  email,
        plan:        "referral",
        status:      "active",
        started_at:  now.toISOString(),
        expires_at:  new Date(now.getTime() + ms).toISOString(),
        amount_paid: 0,
      });
    }
  }

  await Promise.all([extendOrGrant(referrerEmail), extendOrGrant(normalizedReferred)]);

  // Mark reward as granted
  const rewarded_at = now.toISOString();
  await db
    .from("referrals")
    .update({ status: "reward_issued", reward_granted: true, rewarded_at })
    .eq("referred_email", normalizedReferred);

  return NextResponse.json({
    success: true,
    referrerEmail,
    referredEmail: normalizedReferred,
    message: `30-day membership granted to both ${referrerEmail} and ${normalizedReferred}`,
  });
}
