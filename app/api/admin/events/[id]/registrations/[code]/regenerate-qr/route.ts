import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { signEventQR } from "@/lib/event-qr";

type Params = { params: Promise<{ id: string; code: string }> };

// POST /api/admin/events/[id]/registrations/[code]/regenerate-qr
// Signs a new QR token for the registration and all its participants.
// The old token is immediately invalidated (overwritten).

export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId, code: registrationCode } = await params;
  const db = getSupabaseServer();

  // Load registration
  const { data: reg, error: regErr } = await db
    .from("event_registrations")
    .select("id, registration_code")
    .eq("event_id", eventId)
    .eq("registration_code", registrationCode)
    .single();

  if (regErr || !reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });

  const newToken = signEventQR(reg.registration_code, eventId);

  // Update registration QR
  const { error: regUpdateErr } = await db
    .from("event_registrations")
    .update({ qr_token: newToken, qr_generated_at: new Date().toISOString() })
    .eq("id", reg.id);

  if (regUpdateErr) return NextResponse.json({ error: "Failed to update registration QR" }, { status: 500 });

  // Regenerate each participant's QR — each gets its own signed token so ops scanning
  // individual participant QRs still works correctly.
  const { data: participants } = await db
    .from("event_participants")
    .select("id, first_name, last_name")
    .eq("registration_id", reg.id)
    .neq("status", "cancelled");

  if (participants && participants.length > 0) {
    for (const p of participants) {
      const pToken = signEventQR(`${reg.registration_code}-${p.id}`, eventId);
      await db.from("event_participants").update({ qr_token: pToken }).eq("id", p.id);
    }
  }

  return NextResponse.json({ ok: true, new_token: newToken });
}
