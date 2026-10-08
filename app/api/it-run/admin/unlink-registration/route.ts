import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyItRunAdmin, logAdminAction } from "@/lib/it-run-admin-auth";

interface UnlinkRequest {
  registration_id: string;
}

// POST /api/it-run/admin/unlink-registration
// Unlinks a registration from a user (repair tool for data issues)
// Admin access only
export async function POST(req: NextRequest) {
  const adminEmail = await verifyItRunAdmin(req);
  if (!adminEmail) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 }
    );
  }

  const { registration_id } = await req.json() as UnlinkRequest;

  if (!registration_id) {
    return NextResponse.json(
      { error: "registration_id is required" },
      { status: 400 }
    );
  }

  const db = getSupabaseServer();

  // Fetch registration to get current linked user
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

  const prevLinkedEmail = reg.linked_user_email;

  // Perform the unlink
  const { error: updateErr } = await db
    .from("it_run_registrations")
    .update({ linked_user_email: null })
    .eq("id", registration_id);

  if (updateErr) {
    console.error("[admin/unlink-registration] update error:", updateErr.message);
    return NextResponse.json(
      { error: "Failed to unlink registration" },
      { status: 500 }
    );
  }

  // Log the unlinking action
  await logAdminAction(
    "unlink_registration",
    adminEmail,
    "registration",
    registration_id,
    {
      prev_linked_user_email: prevLinkedEmail,
      new_linked_user_email: null,
      reason: "admin_unlink",
    }
  );

  return NextResponse.json({
    success: true,
    message: "Registration unlinked successfully",
    registration_id,
    prev_linked_user_email: prevLinkedEmail,
  });
}
