import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

const PLAN_MONTHS: Record<string, number> = {
  monthly:   1,
  quarterly: 3,
  biannual:  6,
  annual:    12,
};

// POST /api/admin/memberships/grant â€” manually grant a paid membership
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email, plan } = await req.json();

  if (!email?.trim() || !plan) {
    return NextResponse.json({ error: "email and plan are required." }, { status: 400 });
  }

  const months = PLAN_MONTHS[plan];
  if (!months) {
    return NextResponse.json(
      { error: "Invalid plan. Use: monthly, quarterly, biannual, or annual." },
      { status: 400 },
    );
  }

  const db = getSupabaseServer();
  const emailClean = email.toLowerCase().trim();

  const { data: user } = await db.from("users").select("email").eq("email", emailClean).single();
  if (!user) {
    return NextResponse.json({ error: "No user found with this email." }, { status: 404 });
  }

  const now     = new Date();
  const expires = new Date(now);
  expires.setMonth(expires.getMonth() + months);

  // Expire any current active memberships first
  await db
    .from("memberships")
    .update({ status: "expired" })
    .eq("user_email", emailClean)
    .eq("status", "active");

  // Insert new active membership
  const { error } = await db.from("memberships").insert({
    user_email:          emailClean,
    plan,
    status:              "active",
    started_at:          now.toISOString(),
    expires_at:          expires.toISOString(),
    amount_paid:         0,
    razorpay_payment_id: "manual_grant",
  });

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  return NextResponse.json({ ok: true, expires_at: expires.toISOString() });
}
