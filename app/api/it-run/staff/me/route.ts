import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/staff-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET /api/it-run/staff/me
// Return current staff session
export async function GET(req: NextRequest) {
  const session = getStaffSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Load full staff details
  const db = getSupabaseServer();
  const { data: staff } = await db
    .from("it_run_staff")
    .select("id, full_name, email, role")
    .eq("id", session.staffId)
    .maybeSingle<{ id: string; full_name: string; email: string; role: string }>();

  if (!staff) {
    return NextResponse.json({ error: "Staff not found" }, { status: 404 });
  }

  return NextResponse.json({
    session: {
      staffId: staff.id,
      email: staff.email,
      fullName: staff.full_name,
      role: staff.role,
      permissions: session.permissions,
    },
  });
}
