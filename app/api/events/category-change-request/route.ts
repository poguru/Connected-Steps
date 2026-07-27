import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

// POST /api/events/category-change-request
// Header: x-user-token
// Body: { registration_code, new_category, reason? }
// Creates a pending category change request for admin review.
// Only allowed when: registration is confirmed, event has multiple categories,
// no pending request already exists.
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-user-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userEmail = await verifyUserToken(token);
  if (!userEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    registration_code?: string;
    new_category?: string;
    reason?: string;
  };

  if (!body.registration_code?.trim())
    return NextResponse.json({ error: "registration_code is required" }, { status: 400 });
  if (!body.new_category?.trim())
    return NextResponse.json({ error: "new_category is required" }, { status: 400 });

  const db = getSupabaseServer();

  // Load the registration — must belong to this user and be confirmed
  const { data: reg, error: regErr } = await db
    .from("event_registrations")
    .select("id, event_id, user_email, distance_category, status, payment_status, participant_count")
    .eq("registration_code", body.registration_code.trim())
    .single();

  if (regErr || !reg)
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  if (reg.user_email.toLowerCase() !== userEmail.toLowerCase())
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (reg.status === "cancelled")
    return NextResponse.json({ error: "Cannot change category for a cancelled registration" }, { status: 400 });
  if (!["confirmed", "pending"].includes(reg.payment_status ?? ""))
    return NextResponse.json({ error: "Registration is not yet confirmed" }, { status: 400 });

  // Validate new_category against event's distance_categories
  const { data: ev } = await db
    .from("events")
    .select("distance_categories, registration_closes_at")
    .eq("id", reg.event_id)
    .single();

  const cats = ev?.distance_categories ?? [];
  if (cats.length <= 1)
    return NextResponse.json({ error: "This event does not support category changes" }, { status: 400 });
  if (!cats.includes(body.new_category))
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  if (body.new_category === reg.distance_category)
    return NextResponse.json({ error: "You are already in this category" }, { status: 400 });

  // Prevent multiple pending requests for the same registration
  const { data: existing } = await db
    .from("category_change_requests")
    .select("id")
    .eq("registration_id", reg.id)
    .eq("status", "pending")
    .maybeSingle();

  if (existing)
    return NextResponse.json({ error: "You already have a pending category change request for this registration" }, { status: 409 });

  // Create the request
  const { data: created, error: insertErr } = await db
    .from("category_change_requests")
    .insert({
      registration_id:    reg.id,
      event_id:           reg.event_id,
      requested_by_email: userEmail.toLowerCase(),
      old_category:       reg.distance_category ?? "",
      new_category:       body.new_category,
      reason:             body.reason?.trim() || null,
      status:             "pending",
    })
    .select("id, old_category, new_category, status, created_at")
    .single();

  if (insertErr) return NextResponse.json({ error: "Failed to submit request" }, { status: 500 });

  return NextResponse.json({ ok: true, request: created });
}
