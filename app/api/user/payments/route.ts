import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-user-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userEmail = verifyUserToken(token);
  if (!userEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const lc = userEmail.toLowerCase();

  const [{ data: membership }, { data: runs }] = await Promise.all([
    db.from("memberships")
      .select("plan, status, amount_paid, started_at, expires_at, razorpay_payment_id")
      .eq("user_email", lc)
      .single(),
    db.from("run_registrations")
      .select("event_name, event_date, amount_paid, razorpay_payment_id, created_at")
      .eq("email", lc)
      .order("created_at", { ascending: false }),
  ]);

  const transactions = [];

  if (membership?.razorpay_payment_id) {
    transactions.push({
      type:       "membership",
      label:      planLabel(membership.plan),
      date:       membership.started_at,
      amount:     membership.amount_paid ?? 0,
      payment_id: membership.razorpay_payment_id,
      status:     membership.status,
    });
  }

  for (const r of runs ?? []) {
    if (!r.razorpay_payment_id) continue;
    transactions.push({
      type:       "run",
      label:      r.event_name ?? "Weekend Run",
      date:       r.created_at,
      amount:     r.amount_paid ?? 0,
      payment_id: r.razorpay_payment_id,
      status:     "paid",
    });
  }

  transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return NextResponse.json({ transactions });
}

function planLabel(plan: string) {
  const map: Record<string, string> = {
    monthly:   "Monthly Membership",
    quarterly: "3-Month Membership",
    biannual:  "6-Month Membership",
    annual:    "12-Month Membership",
  };
  return map[plan] ?? "Membership";
}
