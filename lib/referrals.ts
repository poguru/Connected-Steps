/**
 * Referral system utilities.
 * Reward model: both users receive a 30-day membership extension
 * immediately when the referred user completes registration.
 */

import { getSupabaseServer } from "@/lib/supabase-server";

import { APP_URL } from "@/lib/config";
// ── Code generation ───────────────────────────────────────────────────────────

function generateCode(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O to avoid confusion
  const digits  = "23456789";                  // no 0/1
  let code = "";
  for (let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 4; i++) code += digits [Math.floor(Math.random() * digits.length)];
  return code;
}

/** Returns the user's referral code, creating one if it doesn't exist yet. */
export async function getOrCreateCode(email: string): Promise<string> {
  const db  = getSupabaseServer();
  const key = email.toLowerCase();

  const { data: existing } = await db
    .from("referral_codes")
    .select("code")
    .eq("user_email", key)
    .single();

  if (existing?.code) return existing.code;

  let code = generateCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await db.from("referral_codes").insert({ user_email: key, code });
    if (!error) return code;
    code = generateCode();
  }
  throw new Error("Failed to generate unique referral code");
}

/** Looks up who owns a given referral code. Returns null if not found. */
export async function getOwnerByCode(code: string): Promise<string | null> {
  const db = getSupabaseServer();
  const { data } = await db
    .from("referral_codes")
    .select("user_email")
    .eq("code", code.toUpperCase().trim())
    .single();
  return data?.user_email ?? null;
}

// ── Membership extension ──────────────────────────────────────────────────────

async function extendOrGrantMembership(email: string, days: number): Promise<void> {
  const db  = getSupabaseServer();
  const now = new Date();
  const ms  = days * 24 * 60 * 60 * 1000;

  // Look for any currently active membership
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
    // Extend existing membership by 30 days
    const newExpiry = new Date(new Date(active.expires_at).getTime() + ms).toISOString();
    await db
      .from("memberships")
      .update({ expires_at: newExpiry })
      .eq("user_email", email)
      .eq("status", "active");
  } else {
    // No active membership — grant a fresh 30-day referral membership
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

// ── Process referral at registration ─────────────────────────────────────────

/**
 * Called immediately after a new user successfully registers.
 * Inserts a referrals row, extends both memberships by 30 days,
 * and sends in-app notifications to both users.
 * Safe to call fire-and-forget — all errors are caught internally.
 */
export async function processReferral(
  referralCode:      string,
  referredEmail:     string,
  referredFirstName: string,
): Promise<void> {
  try {
    const referrerEmail = await getOwnerByCode(referralCode);
    if (!referrerEmail) return;

    const normalizedReferred = referredEmail.toLowerCase();
    if (referrerEmail === normalizedReferred) return; // self-referral

    const db = getSupabaseServer();

    // Insert referral record — UNIQUE(referred_email) prevents duplicates
    const { error: insertErr } = await db.from("referrals").insert({
      referral_code:  referralCode.toUpperCase(),
      referrer_email: referrerEmail,
      referred_email: normalizedReferred,
      status:         "completed",
      reward_granted: false,
    });

    if (insertErr) {
      if (insertErr.code === "23505") {
        console.log(`[referrals] already processed for referred=${normalizedReferred} — skipping`);
        return;
      }
      console.error(`[referrals] INSERT FAILED for code=${referralCode} referrer=${referrerEmail} referred=${normalizedReferred}:`, insertErr.message, insertErr.code);
      return;
    }
    console.log(`[referrals] row created: code=${referralCode} referrer=${referrerEmail} referred=${normalizedReferred}`);

    // Extend / grant memberships for both users
    try {
      await Promise.all([
        extendOrGrantMembership(referrerEmail, 30),
        extendOrGrantMembership(normalizedReferred, 30),
      ]);
      console.log(`[referrals] memberships extended for referrer=${referrerEmail} referred=${normalizedReferred}`);
    } catch (memErr) {
      console.error(`[referrals] MEMBERSHIP EXTENSION FAILED for code=${referralCode}:`, memErr);
      // Don't return — still mark reward and send notifications
    }

    // Mark reward as granted
    const rewarded_at = new Date().toISOString();
    await db
      .from("referrals")
      .update({ status: "reward_issued", reward_granted: true, rewarded_at })
      .eq("referred_email", normalizedReferred);

    // Fetch referrer name for the referred user's notification
    const { data: referrerUser } = await db
      .from("users")
      .select("first_name")
      .eq("email", referrerEmail)
      .single();
    const referrerName = referrerUser?.first_name ?? "a friend";

    // Send notifications to both users
    const { createNotification } = await import("@/lib/notify-inapp");
    await Promise.all([
      createNotification({
        user_email: referrerEmail,
        type:       "achievement",
        title:      "Referral reward! 🎉",
        body:       `${referredFirstName} joined Connected Steps using your invite. 1 month has been added to your membership.`,
        action_url: "/dashboard",
      }),
      createNotification({
        user_email: normalizedReferred,
        type:       "achievement",
        title:      "Welcome bonus! 🎁",
        body:       `You joined through ${referrerName}'s invite and received 1 free month of membership.`,
        action_url: "/dashboard",
      }),
    ]);
  } catch (e) {
    console.error(`[referrals] processReferral UNHANDLED ERROR code=${referralCode} referred=${referredEmail}:`, e);
  }
}

// ── Legacy: claim + reward (kept for backward compatibility) ──────────────────

/** @deprecated Use processReferral() instead. Called at registration now. */
export async function claimReferral(inviteeEmail: string, code: string): Promise<boolean> {
  const referrerEmail = await getOwnerByCode(code);
  if (!referrerEmail) return false;
  if (referrerEmail === inviteeEmail.toLowerCase()) return false;

  const db = getSupabaseServer();
  const { error } = await db.from("referral_invites").insert({
    referrer_email: referrerEmail,
    invitee_email:  inviteeEmail.toLowerCase(),
    registered_at:  new Date().toISOString(),
  });

  return !error || error.code === "23505";
}

/** @deprecated Reward now issued at registration via processReferral(). */
export async function triggerReferralReward(inviteeEmail: string): Promise<void> {
  const db  = getSupabaseServer();
  const key = inviteeEmail.toLowerCase();

  const { data: invite } = await db
    .from("referral_invites")
    .select("id, referrer_email, rewarded_at")
    .eq("invitee_email", key)
    .is("rewarded_at", null)
    .single();

  if (!invite) return;

  const now = new Date().toISOString();
  await db
    .from("referral_invites")
    .update({ first_session_at: now, rewarded_at: now })
    .eq("id", invite.id);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export interface ReferralStats {
  code:       string;
  invites:    number;  // total who used your code
  successful: number;  // joined (reward_issued)
  rewards:    number;  // free months earned (= successful)
  shareUrl:   string;
}

export async function getReferralStats(email: string): Promise<ReferralStats> {
  const db   = getSupabaseServer();
  const key  = email.toLowerCase();
  const code = await getOrCreateCode(key);

  const appUrl = APP_URL;
  const shareUrl = `${appUrl}/invite/${code}`;

  const { data: rows } = await db
    .from("referrals")
    .select("status, reward_granted")
    .eq("referrer_email", key);

  const all        = rows ?? [];
  const successful = all.filter(r => r.status === "reward_issued").length;
  const freeMonths = all.filter(r => r.reward_granted === true).length;

  return {
    code,
    invites:    all.length,
    successful,
    rewards:    freeMonths,
    shareUrl,
  };
}
