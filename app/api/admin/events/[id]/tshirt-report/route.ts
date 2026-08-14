import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] as const;

// GET /api/admin/events/[id]/tshirt-report
// Returns participant-level T-shirt distribution for an event.
//
// Source of truth (matches the ops scanner exactly):
//   size:   event_participants.tshirt_size
//         → event_registrations.tshirt_size         (fallback)
//         → event_registrations.custom_fields.t_shirt_size (fallback)
//   issued: event_participants.tshirt_issued
//           (the scan route writes here, never to event_registrations)
//
// Each event_participants row = one physical person.
// A single registration may cover multiple participants (group booking) —
// each is counted independently, matching the scan route's per-participant model.
//
// Valid participants: ep.status = 'active'
//                    AND er.payment_status IN ('paid', 'free')

export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const db = getSupabaseServer();

  const { data, error } = await db
    .from("event_participants")
    .select(`
      tshirt_size,
      tshirt_issued,
      event_registrations ( tshirt_size, payment_status, custom_fields )
    `)
    .eq("event_id", eventId)
    .eq("status", "active");

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  type ERec = {
    tshirt_size: string | null;
    payment_status: string;
    custom_fields: Record<string, string> | null;
  };
  type EPRow = {
    tshirt_size: string | null;
    tshirt_issued: boolean;
    event_registrations: ERec | ERec[] | null;
  };

  const sizeMap: Record<string, { total: number; issued: number }> = {};
  let total        = 0;
  let issued       = 0;
  let missing_size = 0;

  for (const row of (data ?? []) as EPRow[]) {
    // event_registrations is many-to-one; handle both object and array defensively
    const er: ERec | null = Array.isArray(row.event_registrations)
      ? (row.event_registrations[0] ?? null)
      : (row.event_registrations ?? null);

    // Mirror the scan route: only count paid/free participants
    if (er && er.payment_status !== "paid" && er.payment_status !== "free") continue;

    total++;
    if (row.tshirt_issued) issued++;

    // Three-level size fallback — same order as the ops scan route
    const cf = er?.custom_fields as Record<string, string> | null;
    const size = row.tshirt_size ?? er?.tshirt_size ?? cf?.t_shirt_size ?? null;

    if (!size) {
      missing_size++;
    } else {
      if (!sizeMap[size]) sizeMap[size] = { total: 0, issued: 0 };
      sizeMap[size].total++;
      if (row.tshirt_issued) sizeMap[size].issued++;
    }
  }

  // Canonical size order; append any unexpected sizes at the end
  const knownSizes   = SIZE_ORDER.filter(s => sizeMap[s]);
  const unknownSizes = Object.keys(sizeMap).filter(s => !(SIZE_ORDER as readonly string[]).includes(s));
  const sizes = [...knownSizes, ...unknownSizes].map(s => ({
    size:    s,
    total:   sizeMap[s].total,
    issued:  sizeMap[s].issued,
    pending: sizeMap[s].total - sizeMap[s].issued,
  }));

  // pending = total - issued (includes missing-size participants who cannot receive
  // a t-shirt yet). missing_size is surfaced separately so admins can act on it.
  return NextResponse.json({
    total,
    issued,
    pending: total - issued,
    missing_size,
    sizes,
  });
}
