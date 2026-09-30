import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { checkAndRecordEndpointLimit, getClientIp } from "@/lib/rate-limit";

// ── Shared helper: resolve registration from token ────────────────────────────
async function resolveToken(db: ReturnType<typeof getSupabaseServer>, token: string) {
  const { data: reg } = await db
    .from("it_run_registrations")
    .select(`
      id, registration_code, lead_email, participant_count,
      payment_status, registration_status,
      it_run_categories ( id, name, category_type ),
      it_run_events ( title, event_date, venue_name )
    `)
    .eq("bib_invite_token", token)
    .maybeSingle<{
      id: string; registration_code: string; lead_email: string;
      participant_count: number; payment_status: string; registration_status: string;
      it_run_categories: { id: string; name: string; category_type: string } | null;
      it_run_events: { title: string; event_date: string; venue_name: string } | null;
    }>();

  return reg;
}

// ── GET /api/events/it-run-sprint-2/bib-collection/[token] ────────────────────
// Returns registration summary + participants (with booking status) + available slots.
// Public endpoint — token is the only authentication.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

  const db  = getSupabaseServer();
  const reg = await resolveToken(db, token);

  if (!reg) return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });

  if (!["paid", "free"].includes(reg.payment_status)) {
    return NextResponse.json({ error: "Registration not yet confirmed" }, { status: 403 });
  }

  if (reg.registration_status === "cancelled") {
    return NextResponse.json({ error: "This registration has been cancelled" }, { status: 410 });
  }

  // ── Participants (only what the booking page needs — no PII) ─────────────────
  const { data: parts } = await db
    .from("it_run_participants")
    .select(`
      id, first_name, last_name, participant_type,
      it_run_bib_bookings (
        id, status,
        it_run_bib_slots (
          id, location_name, location_address, slot_date, start_time, end_time
        )
      )
    `)
    .eq("registration_id", reg.id)
    .order("created_at");

  // ── Available slots with live capacity ───────────────────────────────────────
  const { data: slots } = await db
    .from("it_run_bib_slots")
    .select("id, location_name, location_address, slot_date, start_time, end_time, capacity, is_active")
    .eq("is_active", true)
    .order("slot_date")
    .order("start_time");

  // Compute available_count from actual bookings (not denormalized counter)
  const slotIds = (slots ?? []).map(s => s.id);
  const { data: bookingCounts } = await db
    .from("it_run_bib_bookings")
    .select("slot_id")
    .in("slot_id", slotIds)
    .eq("status", "confirmed");

  const countMap: Record<string, number> = {};
  for (const b of bookingCounts ?? []) {
    countMap[b.slot_id] = (countMap[b.slot_id] ?? 0) + 1;
  }

  const slotsWithAvailability = (slots ?? []).map(s => ({
    ...s,
    available_count: Math.max(0, s.capacity - (countMap[s.id] ?? 0)),
  }));

  return NextResponse.json({
    registration: {
      id:               reg.id,
      registration_code: reg.registration_code,
      category_name:    reg.it_run_categories?.name ?? "",
      category_type:    reg.it_run_categories?.category_type ?? "solo",
      participant_count: reg.participant_count,
      event_title:      reg.it_run_events?.title ?? "The IT Run Sprint-2",
      event_date:       reg.it_run_events?.event_date ?? "",
      venue_name:       reg.it_run_events?.venue_name ?? "",
    },
    participants: (parts ?? []).map(p => {
      const confirmedBooking = (p.it_run_bib_bookings ?? []).find(
        (b: { status: string }) => b.status === "confirmed"
      ) as { id: string; status: string; it_run_bib_slots: { id: string; location_name: string; location_address: string | null; slot_date: string; start_time: string; end_time: string } | null } | undefined;
      return {
        id:               p.id,
        first_name:       p.first_name,
        last_name:        p.last_name,
        participant_type: p.participant_type,
        current_booking:  confirmedBooking?.it_run_bib_slots ?? null,
      };
    }),
    slots: slotsWithAvailability,
  });
}

// ── POST /api/events/it-run-sprint-2/bib-collection/[token] ───────────────────
// Books a BIB collection slot for one participant.
// Body: { participantId, slotId }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

    // Rate limit: 10 booking attempts per IP per minute
    const ip = getClientIp(req);
    const rl = await checkAndRecordEndpointLimit(`itr:bib-book-token:${ip}`, 10, 60_000);
    if (rl.limited) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    const body = await req.json() as { participantId?: string; slotId?: string };
    const { participantId, slotId } = body;
    if (!participantId || !slotId) {
      return NextResponse.json({ error: "participantId and slotId are required" }, { status: 400 });
    }

    const db  = getSupabaseServer();
    const reg = await resolveToken(db, token);

    if (!reg) return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });

    if (!["paid", "free"].includes(reg.payment_status)) {
      return NextResponse.json({ error: "Registration not yet confirmed" }, { status: 403 });
    }

    if (reg.registration_status === "cancelled") {
      return NextResponse.json({ error: "This registration has been cancelled" }, { status: 410 });
    }

    // IDOR guard: verify participantId belongs to this registration
    const { data: part } = await db
      .from("it_run_participants")
      .select("id, first_name, last_name, email")
      .eq("id", participantId)
      .eq("registration_id", reg.id)
      .maybeSingle<{ id: string; first_name: string; last_name: string; email: string | null }>();

    if (!part) {
      return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    }

    // Atomic booking via RPC (same as /api/it-run/bib-booking)
    const { data: result, error: rpcErr } = await db
      .rpc("itr_book_bib_slot", { p_participant_id: participantId, p_slot_id: slotId });

    if (rpcErr) {
      console.error("[bib-collection/token] RPC error:", rpcErr.message);
      return NextResponse.json({ error: "Booking failed" }, { status: 500 });
    }

    if (result === "full")           return NextResponse.json({ error: "This slot is fully booked" }, { status: 409 });
    if (result === "slot_not_found") return NextResponse.json({ error: "Slot not found" }, { status: 404 });
    if (result === "already_booked") return NextResponse.json({ ok: true, already: true });

    // Fetch slot details for confirmation response
    const { data: slot } = await db
      .from("it_run_bib_slots")
      .select("id, location_name, location_address, slot_date, start_time, end_time")
      .eq("id", slotId)
      .single();

    // Send BIB slot confirmation email (fire-and-forget)
    if (part.email && slot) {
      import("@/lib/notify").then(({ sendEmail }) =>
        sendEmail(
          part.email!,
          `${part.first_name} ${part.last_name}`,
          "BIB Collection Slot Confirmed - The IT Run Sprint-2",
          buildSlotConfirmEmail(`${part.first_name} ${part.last_name}`, slot),
          false,
          true,
        ).catch(e => console.error("[bib-collection/token] email error:", e))
      ).catch(() => {});
    }

    return NextResponse.json({ ok: true, slot });
  } catch (e: unknown) {
    console.error("[bib-collection/token] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

function buildSlotConfirmEmail(
  name: string,
  slot: { location_name: string; location_address: string | null; slot_date: string; start_time: string; end_time: string },
): string {
  const date = new Date(slot.slot_date + "T12:00:00Z").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long",
  });
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;"><tr><td align="center">
<table width="560" style="background:#0a0a0a;border-radius:12px;overflow:hidden;">
<tr><td style="height:4px;background:#e8620a;"></td></tr>
<tr><td style="padding:28px 32px;text-align:center;">
  <div style="font-size:18px;font-weight:700;color:#fff;">BIB Collection Confirmed</div>
  <div style="font-size:11px;color:#e8620a;letter-spacing:0.1em;text-transform:uppercase;margin-top:4px;">The IT Run Sprint-2</div>
</td></tr>
<tr><td style="padding:0 32px 28px;">
  <p style="color:#ccc;font-size:14px;margin:0 0 20px;">Hi <strong style="color:#fff;">${name}</strong>, your BIB collection slot is confirmed!</p>
  <table width="100%" style="background:#1a1a1a;border-radius:8px;overflow:hidden;margin-bottom:20px;">
    <tr><td style="padding:14px 20px;border-bottom:1px solid #333;">
      <div style="font-size:10px;color:#888;text-transform:uppercase;margin-bottom:4px;">Location</div>
      <div style="font-size:14px;font-weight:600;color:#fff;">${slot.location_name}</div>
      ${slot.location_address ? `<div style="font-size:12px;color:#888;margin-top:2px;">${slot.location_address}</div>` : ""}
    </td></tr>
    <tr><td style="padding:14px 20px;border-bottom:1px solid #333;">
      <div style="font-size:10px;color:#888;text-transform:uppercase;margin-bottom:4px;">Date</div>
      <div style="font-size:14px;font-weight:600;color:#fff;">${date}</div>
    </td></tr>
    <tr><td style="padding:14px 20px;">
      <div style="font-size:10px;color:#888;text-transform:uppercase;margin-bottom:4px;">Time</div>
      <div style="font-size:14px;font-weight:600;color:#fff;">${slot.start_time} – ${slot.end_time}</div>
    </td></tr>
  </table>
  <p style="color:#888;font-size:13px;margin:0;line-height:1.7;">Carry your QR code and original company ID. Volunteers will scan your QR and hand over your race kit.</p>
</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #222;text-align:center;">
  <p style="margin:0;font-size:11px;color:#555;">Connected Steps &mdash; info@connectedsteps.in</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
