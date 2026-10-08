import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, USER_SESSION_COOKIE } from "@/lib/admin-auth";

/**
 * IT Run Admin Authorization
 *
 * Verifies user has admin access to IT Run portal.
 * Checks: authenticated user + admin role
 */
export async function verifyItRunAdmin(req: NextRequest): Promise<string | null> {
  const userEmail = verifyUserToken(req.cookies.get(USER_SESSION_COOKIE)?.value ?? "");
  if (!userEmail) {
    return null;
  }

  const db = getSupabaseServer();

  // Check if user has admin access to IT Run
  const { data: admin, error } = await db
    .from("it_run_portal_users")
    .select("email, role")
    .eq("email", userEmail)
    .eq("role", "admin")
    .single();

  if (error || !admin) {
    console.warn(`[it-run-admin-auth] Unauthorized access attempt by ${userEmail}`);
    return null;
  }

  return userEmail;
}

/**
 * Audit Log - Records admin actions for compliance
 */
export async function logAdminAction(
  action: string,
  admin_email: string,
  resource_type: string,
  resource_id: string,
  details: Record<string, any> = {}
): Promise<void> {
  const db = getSupabaseServer();

  try {
    await db.from("it_run_audit_logs").insert({
      action,
      admin_email,
      resource_type,
      resource_id,
      details: JSON.stringify(details),
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    // Log error but don't fail the operation
    console.error("[it-run-admin-auth] Failed to log audit action:", e);
  }
}

/**
 * Check consistency between IT Run and Connected Steps
 * Identifies potential data issues
 */
export async function checkRegistrationConsistency(registration_id: string): Promise<{
  is_consistent: boolean;
  issues: string[];
}> {
  const db = getSupabaseServer();
  const issues: string[] = [];

  // Fetch registration
  const { data: reg } = await db
    .from("it_run_registrations")
    .select("id, linked_user_email, payment_status, created_at")
    .eq("id", registration_id)
    .single();

  if (!reg) {
    issues.push("Registration not found");
    return { is_consistent: false, issues };
  }

  // Check 1: If linked_user_email exists, verify user exists
  if (reg.linked_user_email) {
    const { data: user } = await db
      .from("users")
      .select("email")
      .eq("email", reg.linked_user_email)
      .single();

    if (!user) {
      issues.push(`Linked user not found: ${reg.linked_user_email}`);
    }
  }

  // Check 2: If paid, verify payment record exists
  if (reg.payment_status === "paid") {
    const { data: payment } = await db
      .from("it_run_registrations")
      .select("razorpay_payment_id")
      .eq("id", registration_id)
      .single();

    if (!payment?.razorpay_payment_id) {
      issues.push("Payment status is 'paid' but no Razorpay payment ID");
    }
  }

  // Check 3: Verify participants exist
  const { data: participants, error: partErr } = await db
    .from("it_run_participants")
    .select("id")
    .eq("registration_id", registration_id);

  if (partErr || !participants || participants.length === 0) {
    issues.push("Registration has no participants");
  }

  return {
    is_consistent: issues.length === 0,
    issues,
  };
}
