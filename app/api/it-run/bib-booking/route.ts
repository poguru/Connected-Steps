import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { randomUUID } from "crypto";

// POST /api/it-run/bib-booking
// Body: { participantId, slotId, registrationCode }
// registrationCode is REQUIRED — it is the ownership proof that ties this request
// to the caller's registration. Without it, any caller knowing a participantId
// (which is discoverable via the public dashboard API) could book any participant's slot.
// Uses an atomic SQL function (itr_book_bib_slot) to prevent overbooking.
//
// Retry-safe: a participant who already holds a confirmed booking gets that booking back (no second booking, no
// capacity change). A database error is reported as an error with a retry, never as "not confirmed".
//
// Slots open once the registration is confirmed (paid AND every adult's ID verified). A registration that is still
// awaiting verification gets 409 REGISTRATION_PENDING.
const SLOT_COLUMNS = "location_name,location_address,slot_date,start_time,end_time";

type Log = (stage: string, extra?: Record<string, unknown>) => void;

export async function POST(req: NextRequest) {
  const rid = randomUUID();
  const log: Log = (stage, extra = {}) => console.log(JSON.stringify({ src: "it-run-bib-booking", rid, stage, ...extra }));
  const fail = (status: number, body: Record<string, unknown>, stage: string, extra: Record<string, unknown> = {}) => {
    log(stage, { status, ...extra });
    return NextResponse.json({ ...body, requestId: rid }, { status, headers: { "x-request-id": rid } });
  };

  let body: { participantId?: string; slotId?: string; registrationCode?: string };
  try {
    body = await req.json();
  } catch {
    return fail(400, { error: "Invalid request" }, "bad_json");
  }
  const { participantId, slotId, registrationCode } = body;
  if (!participantId || !slotId) return fail(400, { error: "participantId and slotId required" }, "missing_fields");
  if (!registrationCode) return fail(400, { error: "registrationCode required" }, "missing_code");

  const db = getSupabaseServer();

  const { data: part, error: partErr } = await db
    .from("it_run_participants")
    .select("id, registration_id, first_name, last_name, email, cancelled_at")
    .eq("id", participantId)
    .maybeSingle<{ id: string; registration_id: string; first_name: string; last_name: string; email: string | null }>();
  if (partErr) {
    return fail(500, { error: "We couldn't book your slot right now. Your registration is unchanged. Please try again." }, "participant_query", { dbCode: partErr.code ?? null });
  }
  if (!part) return fail(404, { error: "Participant not found" }, "participant_missing");
  if ((part as { cancelled_at?: string | null }).cancelled_at) return fail(409, { error: "This runner's category was cancelled.", code: "RUNNER_CANCELLED" }, "runner_cancelled");

  const { data: reg, error: regErr } = await db
    .from("it_run_registrations")
    .select("id, payment_status, registration_status, registration_code")
    .eq("id", part.registration_id)
    .maybeSingle<{ id: string; payment_status: string; registration_status: string; registration_code: string }>();
  if (regErr) {
    return fail(500, { error: "We couldn't book your slot right now. Your registration is unchanged. Please try again." }, "registration_query", { dbCode: regErr.code ?? null });
  }
  // Ownership check: the registration code must match (prevents IDOR). A mismatch looks like a missing participant.
  if (!reg || reg.registration_code !== registrationCode) return fail(404, { error: "Participant not found" }, "ownership_mismatch");

  log("registration_state", { registrationId: reg.id, paymentStatus: reg.payment_status, registrationStatus: reg.registration_status });
  if (reg.registration_status === "cancelled") return fail(400, { error: "This registration is cancelled." }, "cancelled");
  if (!["paid", "free"].includes(reg.payment_status)) return fail(400, { error: "Registration not confirmed" }, "unpaid");
  if (reg.registration_status !== "active") {
    return fail(409, {
      error: "Your BIB collection slot can be booked once your ID is verified and your registration is confirmed.",
      code: "REGISTRATION_PENDING",
    }, "awaiting_verification");
  }

  // Atomic booking. Returns confirmed | already_booked | full | slot_not_found.
  const { data: result, error: rpcErr } = await db.rpc("itr_book_bib_slot", { p_participant_id: participantId, p_slot_id: slotId });
  if (rpcErr) {
    return fail(500, { error: "We couldn't book that slot. Your registration is unchanged, so please try again." }, "rpc_error", { dbCode: rpcErr.code ?? null });
  }
  log("rpc_result", { slotId, result });

  if (result === "full") return fail(409, { error: "This slot is fully booked. Please choose another slot." }, "full", { slotId });
  if (result === "slot_not_found") return fail(404, { error: "Slot not found" }, "slot_not_found", { slotId });

  // Slot details for the response and the confirmation email. For a retry, the slot the participant already holds.
  let bookedSlotId = slotId;
  if (result === "already_booked") {
    const { data: existing } = await db
      .from("it_run_bib_bookings")
      .select("slot_id")
      .eq("participant_id", participantId)
      .eq("status", "confirmed")
      .maybeSingle<{ slot_id: string }>();
    bookedSlotId = existing?.slot_id ?? slotId;
  }
  const { data: slot, error: slotErr } = await db
    .from("it_run_bib_slots")
    .select(SLOT_COLUMNS)
    .eq("id", bookedSlotId)
    .maybeSingle<{ location_name: string; location_address: string | null; slot_date: string; start_time: string; end_time: string }>();
  if (slotErr) log("slot_detail_error", { dbCode: slotErr.code ?? null });

  if (result === "already_booked") {
    log("already_booked", { slotId: bookedSlotId });
    return NextResponse.json({ ok: true, already: true, message: "Already booked a slot", slot: slot ?? null, requestId: rid }, { headers: { "x-request-id": rid } });
  }

  log("booked", { slotId: bookedSlotId });

  // Confirmation email (fire-and-forget; a failed email never undoes the booking)
  if (part.email && slot) {
    import("@/lib/notify").then(({ sendEmail }) =>
      sendEmail(
        part.email!,
        `${part.first_name} ${part.last_name}`,
        "BIB Collection Slot Confirmed - The IT Run Sprint-2",
        buildSlotConfirmEmail(`${part.first_name} ${part.last_name}`, slot),
        false,
        true,
      ).catch(e => console.error("[it-run/bib-booking] email error:", e))
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true, slot, requestId: rid }, { headers: { "x-request-id": rid } });
}

function buildSlotConfirmEmail(name: string, slot: { location_name: string; location_address: string | null; slot_date: string; start_time: string; end_time: string }): string {
  const date = new Date(slot.slot_date + "T12:00:00Z").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
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
      <div style="font-size:14px;font-weight:600;color:#fff;">${slot.start_time} - ${slot.end_time}</div>
    </td></tr>
  </table>
  <p style="color:#888;font-size:13px;margin:0;line-height:1.7;">Carry your QR code (from the participant dashboard) and original company ID if not yet verified. Volunteers will scan your QR and hand over your race kit.</p>
</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #222;text-align:center;">
  <p style="margin:0;font-size:11px;color:#555;">Connected Steps - info@connectedsteps.in</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
