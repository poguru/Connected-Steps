import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyItRunAdmin } from "@/lib/it-run-admin-auth";

// GET /api/it-run/admin/orphaned-registrations
// Returns registrations without linked_user_email (unlinked registrations)
// Admin access only (requires it_run_portal_users role=admin)
export async function GET(req: NextRequest) {
  // Verify admin authorization
  const adminEmail = await verifyItRunAdmin(req);
  if (!adminEmail) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 }
    );
  }

  const db = getSupabaseServer();

  const { data, error } = await db
    .from("it_run_registrations")
    .select(`
      id, registration_code, lead_email, participant_count,
      final_price, created_at,
      it_run_participants ( first_name, last_name )
    `)
    .is("linked_user_email", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[admin/orphaned-registrations] error:", error.message);
    return NextResponse.json(
      { error: "Failed to fetch orphaned registrations" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    registrations: (data ?? []).map((r: any) => ({
      id: r.id,
      registration_code: r.registration_code,
      lead_email: r.lead_email,
      participant_count: r.participant_count,
      final_price: r.final_price,
      created_at: r.created_at,
      participants: r.it_run_participants || [],
    })),
  });
}
