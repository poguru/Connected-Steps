/**
 * Referral system utilities.
 * All functions are no-ops when ENABLE_REFERRALS !== "true".
 */

import { getSupabaseServer } from "@/lib/supabase-server";

export function referralsEnabled(): boolean {
  return process.env.ENABLE_REFERRALS === "true";
}

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

  // Generate a collision-free code
  let code = generateCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await db
      .from("referral_codes")
      .insert({ user_email: key, code });
    if (!error) return code;
    code = generateCode(); // retry on collision
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

// ── Claim ─────────────────────────────────────────────────────────────────────

/**
 * Called after a referred user signs up and loads the dashboard.
 * Links the invitee email to the referral invite row.
 * Safe to call multiple times — the unique constraint prevents duplicates.
 */
export async function claimReferral(inviteeEmail: string, code: string): Promise<boolean> {
  if (!referralsEnabled()) return false;

  const referrerEmail = await getOwnerByCode(code);
  if (!referrerEmail) return false;
  if (referrerEmail === inviteeEmail.toLowerCase()) return false; // can't self-refer

  const db = getSupabaseServer();
  const { error } = await db.from("referral_invites").insert({
    referrer_email: referrerEmail,
    invitee_email:  inviteeEmail.toLowerCase(),
    registered_at:  new Date().toISOString(),
  });

  // Ignore unique-constraint violations (already claimed)
  return !error || error.code === "23505";
}

// ── Reward ────────────────────────────────────────────────────────────────────

/**
 * Called when an invitee attends their first session.
 * Marks the invite as rewarded and notifies the referrer.
 * No-op if this user wasn't referred or was already rewarded.
 */
export async function triggerReferralReward(inviteeEmail: string): Promise<void> {
  if (!referralsEnabled()) return;

  const db  = getSupabaseServer();
  const key = inviteeEmail.toLowerCase();

  const { data: invite } = await db
    .from("referral_invites")
    .select("id, referrer_email, rewarded_at")
    .eq("invitee_email", key)
    .is("rewarded_at", null)
    .single();

  if (!invite) return; // not referred, or already rewarded

  const now = new Date().toISOString();

  // Mark first session + reward timestamps
  await db
    .from("referral_invites")
    .update({ first_session_at: now, rewarded_at: now })
    .eq("id", invite.id);

  // Notify the referrer (fire-and-forget — import inline to avoid circular deps)
  try {
    const { createNotification } = await import("@/lib/notify-inapp");
    const { data: invitee } = await db
      .from("users")
      .select("first_name")
      .eq("email", key)
      .single();
    const name = invitee?.first_name ?? "Your friend";

    await createNotification({
      user_email: invite.referrer_email,
      type:       "achievement",
      title:      "Referral reward unlocked! 🎉",
      body:       `${name} attended their first session. You've earned a reward — contact us to redeem.`,
      action_url: "/dashboard",
    });
  } catch {}
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export interface ReferralStats {
  code:       string;
  invites:    number;  // total people who claimed this code
  successful: number;  // those who attended first session
  rewards:    number;  // rewards earned (= successful)
  shareUrl:   string;
}

export async function getReferralStats(email: string): Promise<ReferralStats> {
  const db   = getSupabaseServer();
  const key  = email.toLowerCase();
  const code = await getOrCreateCode(key);

  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";
  const shareUrl = `${appUrl}/invite/${code}`;

  const { data: invites } = await db
    .from("referral_invites")
    .select("first_session_at, rewarded_at")
    .eq("referrer_email", key);

  const rows       = invites ?? [];
  const successful = rows.filter(r => r.first_session_at !== null).length;

  return {
    code,
    invites:    rows.length,
    successful,
    rewards:    successful,
    shareUrl,
  };
}
