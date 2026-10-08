import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

interface LinkRequest {
  registration_id: string;
  user_email: string;
}

// POST /api/it-run/admin/link-registration
// Links an orphaned registration to a Connected Steps user
// Admin access only
export async function POST(req: NextRequest) {
  // TODO: Add admin authorization check
  // For now, this endpoint is open - should be protected in production

  const { registration_id, user_email } = await req.json() as LinkRequest;

  if (!registration_id || !user_email) {
    return NextResponse.json(
      { error: "Missing registration_id or user_email" },
      { status: 400 }
    );
  }

  const db = getSupabaseServer();

  // Verify user exists
  const { data: user, error: userErr } = await db
    .from("users")
    .select("email")
    .eq("email", user_email.toLowerCase())
    .single();

  if (userErr || !user) {
    return NextResponse.json(
      { error: "User not found" },
      { status: 404 }
    );
  }

  // Verify registration exists and is currently unlinked
  const { data: reg, error: regErr } = await db
    .from("it_run_registrations")
    .select("id, linked_user_email")
    .eq("id", registration_id)
    .single();

  if (regErr || !reg) {
    return NextResponse.json(
      { error: "Registration not found" },
      { status: 404 }
    );
  }

  if (reg.linked_user_email !== null) {
    return NextResponse.json(
      { error: "Registration is already linked" },
      { status: 409 }
    );
  }

  // Perform the link
  const { error: updateErr } = await db
    .from("it_run_registrations")
    .update({ linked_user_email: user_email.toLowerCase() })
    .eq("id", registration_id);

  if (updateErr) {
    console.error("[admin/link-registration] update error:", updateErr.message);
    return NextResponse.json(
      { error: "Failed to link registration" },
      { status: 500 }
    );
  }

  // Log the linking action (audit trail)
  // TODO: Create audit_log table and record this action
  console.info(
    `[admin/link-registration] Registration ${registration_id} linked to ${user_email}`
  );

  return NextResponse.json({
    success: true,
    message: "Registration linked successfully",
    registration_id,
    user_email,
  });
}
