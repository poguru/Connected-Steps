import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach, getAdminEmail } from "@/lib/admin-auth";
import { verifyEventQR } from "@/lib/event-qr";

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/events/[id]/bib/scan
// Scans a participant's QR token to record BIB collection.
//
// Body:
//   token      string  QR token from the participant's email/app
//   volunteer  string  optional override for the volunteer name
//
// Response:
//   valid        boolean
//   already_collected boolean
//   registration object   participant details
//   message      string

export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const body  = await req.json() as { token?: string; volunteer?: string };
  const token = body.token?.trim();

  if (!token) return NextResponse.json({ error: "QR token required" }, { status: 400 });

  // Verify QR signature (same as check-in — uses HMAC-SHA256)
  const decoded = verifyEventQR(token);
  if (!decoded) {
    return NextResponse.json({ valid: false, message: "Invalid or tampered QR code." }, { status: 400 });
  }

  const db          = getSupabaseServer();
  const collectedBy = body.volunteer ?? getAdminEmail(req) ?? "admin";

  // Look up registration by QR token
  const { data: reg } = await db
    .from("event_registrations")
    .select(`
      id, registration_code, user_name, user_email, phone,
      status, payment_status, distance_category,
      bib_number, bib_collected_at, bib_collected_by,
      checked_in_at
    `)
    .eq("qr_token", token)
    .eq("event_id", eventId)
    .single<{
      id:                string;
      registration_code: string;
      user_name:         string;
      user_email:        string;
      phone:             string | null;
      status:            string;
      payment_status:    string;
      distance_category: string | null;
      bib_number:        string | null;
      bib_collected_at:  string | null;
      bib_collected_by:  string | null;
      checked_in_at:     string | null;
    }>();

  if (!reg) {
    return NextResponse.json({
      valid:   false,
      message: "Registration not found for this event.",
    }, { status: 404 });
  }

  if (reg.status === "cancelled") {
    return NextResponse.json({
      valid:        false,
      registration: reg,
      message:      "This registration has been cancelled.",
    }, { status: 400 });
  }

  if (!["paid", "free"].includes(reg.payment_status)) {
    return NextResponse.json({
      valid:        false,
      registration: reg,
      message:      "Payment not completed — BIB not issued.",
    }, { status: 400 });
  }

  if (!reg.bib_number) {
    return NextResponse.json({
      valid:        true,
      already_collected: false,
      registration: reg,
      message:      "⚠️ BIB number not assigned yet. Please assign BIB numbers first.",
    });
  }

  // ── Already collected ────────────────────────────────────────────────────
  if (reg.bib_collected_at) {
    const time = new Date(reg.bib_collected_at).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit",
      day: "numeric", month: "short",
    });
    return NextResponse.json({
      valid:             true,
      already_collected: true,
      registration:      reg,
      message:           `🔴 BIB already collected at ${time} by ${reg.bib_collected_by ?? "admin"}.`,
    });
  }

  // ── Mark BIB as collected ─────────────────────────────────────────────────
  const now = new Date().toISOString();
  const { error: updateErr } = await db
    .from("event_registrations")
    .update({ bib_collected_at: now, bib_collected_by: collectedBy })
    .eq("id", reg.id);

  if (updateErr) {
    console.error(`[bib/scan] DB error reg=${reg.registration_code}:`, updateErr.message);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  console.log(`[bib/scan] ✅ BIB ${reg.bib_number} collected — reg=${reg.registration_code} by=${collectedBy}`);

  return NextResponse.json({
    valid:             true,
    already_collected: false,
    registration:      { ...reg, bib_collected_at: now, bib_collected_by: collectedBy },
    message:           `✅ BIB ${reg.bib_number} issued to ${reg.user_name}`,
  });
}
