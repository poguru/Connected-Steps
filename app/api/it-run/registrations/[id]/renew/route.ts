import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, USER_SESSION_COOKIE } from "@/lib/admin-auth";
import { PAYMENT_WINDOW_MINUTES } from "@/lib/it-run-checkout";

// POST /api/it-run/registrations/[id]/renew
// Renews an expired, unpaid registration if its seats are still free. The database function decides everything:
// it checks capacity, restarts the payment window, and refuses coupon, early-bird and already-paid registrations.
// Only the signed-in account that owns the registration may renew it.
const NO_STORE = { "Cache-Control": "private, no-store" };

const MESSAGES: Record<string, { status: number; error: string }> = {
  not_found:               { status: 404, error: "Registration not found." },
  not_expired:             { status: 409, error: "This registration does not need renewing." },
  cancelled:               { status: 409, error: "This registration has been cancelled and cannot be renewed." },
  discount_not_renewable:  { status: 409, error: "This registration used a discount, so it cannot be renewed online. Email info@connectedsteps.in." },
  payment_recorded:        { status: 409, error: "A payment is already recorded for this registration. Email info@connectedsteps.in." },
  no_runners:              { status: 409, error: "No runners are left on this registration to renew." },
  full:                    { status: 409, error: "Sorry, this category is now full, so the seats cannot be held again." },
  unavailable:             { status: 409, error: "This category is no longer open for registration." },
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const email = verifyUserToken(req.cookies.get(USER_SESSION_COOKIE)?.value ?? "");
  if (!email) {
    return NextResponse.json({ error: "Please sign in to renew your registration.", code: "AUTH_REQUIRED" }, { status: 401, headers: NO_STORE });
  }

  const { id } = await params;
  const db = getSupabaseServer();

  // Ownership: the registration must be linked to this signed-in account. A different account gets "not found".
  const { data: reg } = await db
    .from("it_run_registrations")
    .select("id, linked_user_email")
    .eq("id", id)
    .maybeSingle<{ id: string; linked_user_email: string | null }>();
  if (!reg || !reg.linked_user_email || reg.linked_user_email.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ error: "Registration not found." }, { status: 404, headers: NO_STORE });
  }

  const { data: result, error } = await db.rpc("itr_renew_registration", { p_registration_id: id });
  if (error) {
    console.error("[it-run/renew] rpc failed:", error.message);
    return NextResponse.json({ error: "We couldn't renew your registration right now. Please try again." }, { status: 500, headers: NO_STORE });
  }

  if (result === "renewed") {
    return NextResponse.json({ ok: true, paymentWindowMinutes: PAYMENT_WINDOW_MINUTES }, { headers: NO_STORE });
  }
  const message = MESSAGES[String(result)] ?? { status: 409, error: "This registration could not be renewed." };
  return NextResponse.json({ error: message.error, code: String(result).toUpperCase() }, { status: message.status, headers: NO_STORE });
}
