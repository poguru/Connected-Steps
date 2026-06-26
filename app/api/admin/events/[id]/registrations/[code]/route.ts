import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string; code: string }> };

// GET /api/admin/events/[id]/registrations/[code]
// Returns full details of a single registration for the admin participant view.

export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId, code: registrationCode } = await params;
  const db = getSupabaseServer();

  const { data, error } = await db
    .from("event_registrations")
    .select(`
      id, registration_code, user_email, user_name,
      phone, gender, date_of_birth, blood_group,
      emergency_contact, special_notes,
      distance_category,
      coupon_code, coupon_discount, original_price, final_price,
      payment_status, razorpay_order_id, razorpay_payment_id,
      status, created_at,
      qr_token, qr_generated_at,
      checked_in_at,
      confirmation_email_sent_at, email_status, email_ses_message_id,
      breakfast_availed, breakfast_availed_at, breakfast_verified_by,
      slot_reserved_at, slot_expires_at,
      events (
        id, title, start_date, start_time, end_date, location,
        organizer, price, max_participants, participant_count
      )
    `)
    .eq("registration_code", registrationCode)
    .eq("event_id", eventId)
    .single();

  if (error || !data) return NextResponse.json({ error: "Registration not found" }, { status: 404 });

  // Fetch invoice if exists
  const { data: invoice } = await db
    .from("invoices")
    .select("id, invoice_number, invoice_status, storage_path, email_sent, created_at")
    .or(`registration_id.eq.${data.id},payment_id.eq.${data.razorpay_payment_id ?? "null"}`)
    .maybeSingle();

  // Fetch email logs for this registration
  const { data: emailLogs } = await db
    .from("email_logs")
    .select("id, status, provider, sent_at, error, ses_message_id")
    .eq("registration_id", data.id)
    .order("sent_at", { ascending: false })
    .limit(10);

  return NextResponse.json({
    registration: data,
    invoice:      invoice ?? null,
    email_logs:   emailLogs ?? [],
  });
}

// PATCH /api/admin/events/[id]/registrations/[code]
// Admin updates for a registration (status, notes).

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId, code: registrationCode } = await params;
  const body = await req.json() as Record<string, unknown>;

  const db = getSupabaseServer();

  // Only allow safe admin updates
  const allowed: Record<string, unknown> = {};
  const safeKeys = ["status", "special_notes", "blood_group", "emergency_contact"];
  for (const k of safeKeys) {
    if (k in body) allowed[k] = body[k];
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await db
    .from("event_registrations")
    .update(allowed)
    .eq("registration_code", registrationCode)
    .eq("event_id", eventId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ registration: data });
}
