import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, USER_SESSION_COOKIE } from "@/lib/admin-auth";

// GET /api/it-run/my-registrations
// Returns all IT Run registrations linked to the authenticated CS user.
// Requires cs_user_session cookie.
export async function GET(req: NextRequest) {
  const userEmail = verifyUserToken(req.cookies.get(USER_SESSION_COOKIE)?.value ?? "");
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabaseServer();

  const { data, error } = await db
    .from("it_run_registrations")
    .select(`
      id, registration_code, payment_status, registration_status,
      final_price, created_at, lead_email,
      it_run_categories ( name, distance_km, color, category_type ),
      it_run_events ( title, event_date ),
      it_run_participants ( first_name, last_name, qr_token ),
      it_run_bib_collections ( bib_number )
    `)
    .eq("linked_user_email", userEmail)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[it-run/my-registrations] query error:", error.message);
    return NextResponse.json({ error: "Failed to load registrations" }, { status: 500 });
  }

  return NextResponse.json({ registrations: data ?? [] });
}
