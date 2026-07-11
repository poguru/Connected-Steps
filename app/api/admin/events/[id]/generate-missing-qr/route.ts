import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { signEventQR } from "@/lib/event-qr";

// POST /api/admin/events/[id]/generate-missing-qr
// Generates qr_token for every confirmed registration that is missing one.
// Safe to call multiple times — skips registrations that already have a token.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;

  const db = getSupabaseServer();

  const { data: regs, error } = await db
    .from("event_registrations")
    .select("id, registration_code")
    .eq("event_id", eventId)
    .eq("status", "confirmed")
    .is("qr_token", null);          // only those without a token

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!regs?.length) return NextResponse.json({ generated: 0, message: "All confirmed registrations already have a QR token." });

  let generated = 0, failed = 0;
  for (const reg of regs) {
    try {
      const qrToken = signEventQR(reg.registration_code, eventId);
      const { error: upErr } = await db
        .from("event_registrations")
        .update({ qr_token: qrToken })
        .eq("id", reg.id);
      if (upErr) { failed++; console.error(`[generate-qr] update failed for ${reg.id}:`, upErr.message); }
      else generated++;
    } catch (e) {
      failed++;
      console.error(`[generate-qr] exception for ${reg.id}:`, e);
    }
  }

  return NextResponse.json({ generated, failed, total: regs.length });
}
