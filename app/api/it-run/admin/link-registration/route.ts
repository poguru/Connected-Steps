import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyItRunAdmin, logAdminAction } from "@/lib/it-run-admin-auth";

interface LinkRequest {
  registration_id: string;
  user_email: string;
}

// POST /api/it-run/admin/link-registration
// Links an orphaned registration to a Connected Steps user
// Admin access only (requires it_run_portal_users role=admin)
export async function POST(req: NextRequest) {
  // Verify admin authorization
  const adminEmail = await verifyItRunAdmin(req);
  if (!adminEmail) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 }
    );
  }

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
  await logAdminAction(
    "link_registration",
    adminEmail,
    "registration",
    registration_id,
    {
      user_email,
      prev_linked_user_email: null,
      new_linked_user_email: user_email.toLowerCase(),
    }
  );

  return NextResponse.json({
    success: true,
    message: "Registration linked successfully",
    registration_id,
    user_email,
  });
}
