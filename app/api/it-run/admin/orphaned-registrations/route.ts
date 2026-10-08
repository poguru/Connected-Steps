import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET /api/it-run/admin/orphaned-registrations
// Returns registrations without linked_user_email (unlinked registrations)
// Admin access only
export async function GET(req: NextRequest) {
  // TODO: Add admin authorization check
  // For now, this endpoint is open - should be protected in production

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
