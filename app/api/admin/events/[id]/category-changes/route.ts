import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach, getAdminEmail } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/events/[id]/category-changes
// Returns all category change requests for this event, most recent first.
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("category_change_requests")
    .select("id, registration_id, requested_by_email, old_category, new_category, reason, status, reviewed_by, reviewed_at, admin_note, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Attach registration codes for display
  const regIds = [...new Set((data ?? []).map(r => r.registration_id))];
  const { data: regs } = regIds.length > 0
    ? await db.from("event_registrations").select("id, registration_code, participant_count").in("id", regIds)
    : { data: [] };

  const regMap: Record<string, { registration_code: string; participant_count: number }> = {};
  for (const r of regs ?? []) regMap[r.id] = { registration_code: r.registration_code, participant_count: r.participant_count ?? 1 };

  const requests = (data ?? []).map(r => ({
    ...r,
    registration_code:  regMap[r.registration_id]?.registration_code ?? "—",
    participant_count:  regMap[r.registration_id]?.participant_count  ?? 1,
  }));

  return NextResponse.json({ requests });
}

// PATCH /api/admin/events/[id]/category-changes
// Body: { request_id, action: "approve" | "reject", admin_note? }
// Approve: updates event_registrations.distance_category + all event_participants.distance_category
// Reject: marks request as rejected with optional note
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;

  const adminEmail = getAdminEmail(req);
  const body = await req.json().catch(() => ({})) as {
    request_id?: string;
    action?: "approve" | "reject";
    admin_note?: string;
  };

  if (!body.request_id) return NextResponse.json({ error: "request_id is required" }, { status: 400 });
  if (!["approve", "reject"].includes(body.action ?? "")) return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });

  const db = getSupabaseServer();

  // Load the request — must belong to this event and be pending
  const { data: req2, error: reqErr } = await db
    .from("category_change_requests")
    .select("id, registration_id, old_category, new_category, status")
    .eq("id", body.request_id)
    .eq("event_id", eventId)
    .single();

  if (reqErr || !req2) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (req2.status !== "pending") return NextResponse.json({ error: "Request is already resolved" }, { status: 409 });

  const now = new Date().toISOString();

  if (body.action === "approve") {
    // Update registration category
    const { error: regErr } = await db
      .from("event_registrations")
      .update({ distance_category: req2.new_category })
      .eq("id", req2.registration_id);

    if (regErr) return NextResponse.json({ error: "Failed to update registration" }, { status: 500 });

    // Update all non-cancelled participants in this registration
    const { error: partErr } = await db
      .from("event_participants")
      .update({ distance_category: req2.new_category })
      .eq("registration_id", req2.registration_id)
      .neq("status", "cancelled");

    if (partErr) return NextResponse.json({ error: "Failed to update participants" }, { status: 500 });
  }

  // Mark request as resolved
  const { error: updErr } = await db
    .from("category_change_requests")
    .update({
      status:      body.action === "approve" ? "approved" : "rejected",
      reviewed_by: adminEmail ?? "admin",
      reviewed_at: now,
      admin_note:  body.admin_note?.trim() || null,
    })
    .eq("id", body.request_id);

  if (updErr) return NextResponse.json({ error: "Failed to update request" }, { status: 500 });

  return NextResponse.json({ ok: true, action: body.action });
}
