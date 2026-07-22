import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

/**
 * GET /api/admin/auth-diagnostics
 *
 * Returns users stuck in the registration funnel:
 *   - "verified_no_account": email verified but no users row (need to complete Step 3)
 *   - "unverified_accounts": accounts with email_verified=false (should be zero after migrations)
 *
 * Also returns a summary count for the admin dashboard.
 */
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const now = new Date().toISOString();

  // Emails with a VERIFIED (and not-yet-expired) token but no account
  const { data: verifiedTokens } = await db
    .from("email_verification_tokens")
    .select("email, verified_at, expires_at, created_at")
    .eq("verified", true)
    .gt("expires_at", now)
    .order("verified_at", { ascending: false });

  const tokenEmails = (verifiedTokens ?? []).map(t => t.email);

  // Of those, which ones do NOT have a users row?
  const activeTokenList = verifiedTokens ?? [];
  let stuckUsers = activeTokenList;
  if (tokenEmails.length > 0) {
    const { data: existingUsers } = await db
      .from("users")
      .select("email")
      .in("email", tokenEmails);
    const registeredEmails = new Set((existingUsers ?? []).map(u => u.email.toLowerCase()));
    stuckUsers = activeTokenList.filter(t => !registeredEmails.has(t.email.toLowerCase()));
  }

  // Expired verified tokens with no account (informational — these users need to restart)
  const { data: expiredTokens } = await db
    .from("email_verification_tokens")
    .select("email, verified_at, expires_at")
    .eq("verified", true)
    .lte("expires_at", now)
    .order("expires_at", { ascending: false })
    .limit(50);

  const expiredEmails = (expiredTokens ?? []).map(t => t.email);
  const expiredTokenList = expiredTokens ?? [];
  let expiredStuck = expiredTokenList;
  if (expiredEmails.length > 0) {
    const { data: expiredExisting } = await db
      .from("users")
      .select("email")
      .in("email", expiredEmails);
    const registeredEmails = new Set((expiredExisting ?? []).map(u => u.email.toLowerCase()));
    expiredStuck = expiredTokenList.filter(t => !registeredEmails.has(t.email.toLowerCase()));
  }

  // Users with email_verified=false (should be 0 after migrations)
  const { data: unverifedAccounts, count: unverifiedCount } = await db
    .from("users")
    .select("email, first_name, last_name, created_at", { count: "exact" })
    .eq("email_verified", false)
    .limit(50);

  return NextResponse.json({
    summary: {
      stuck_verified_token_valid:   stuckUsers?.length ?? 0,
      stuck_verified_token_expired: expiredStuck?.length ?? 0,
      unverified_accounts:          unverifiedCount ?? 0,
    },
    stuck_users_active_token: stuckUsers ?? [],
    stuck_users_expired_token: expiredStuck ?? [],
    unverified_accounts: unverifedAccounts ?? [],
  });
}
