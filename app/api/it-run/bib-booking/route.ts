import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// POST /api/it-run/bib-booking
// Body: { participantId, slotId }
// Uses atomic SQL function to prevent overbooking.
export async function POST(req: NextRequest) {
  try {
    const { participantId, slotId } = await req.json() as { participantId: string; slotId: string };
    if (!participantId || !slotId) return NextResponse.json({ error: "participantId and slotId required" }, { status: 400 });

    const db = getSupabaseServer();

    // Verify participant exists + registration is paid/free
    const { data: part } = await db
      .from("it_run_participants")
      .select("id, registration_id, first_name, last_name, email")
      .eq("id", participantId)
      .single();

    if (!part) return NextResponse.json({ error: "Participant not found" }, { status: 404 });

    const { data: reg } = await db
      .from("it_run_registrations")
      .select("payment_status")
      .eq("id", part.registration_id)
      .single();

    if (!reg || !["paid","free"].includes(reg.payment_status)) {
      return NextResponse.json({ error: "Registration not confirmed" }, { status: 400 });
    }

    // Atomic booking via RPC
    const { data: result, error: rpcErr } = await db
      .rpc("itr_book_bib_slot", { p_participant_id: participantId, p_slot_id: slotId });

    if (rpcErr) {
      console.error("[it-run/bib-booking] RPC error:", rpcErr.message);
      return NextResponse.json({ error: "Booking failed" }, { status: 500 });
    }

    if (result === "full") return NextResponse.json({ error: "This slot is fully booked" }, { status: 409 });
    if (result === "slot_not_found") return NextResponse.json({ error: "Slot not found" }, { status: 404 });
    if (result === "already_booked") return NextResponse.json({ ok: true, already: true, message: "Already booked a slot" });

    // Fetch slot details for confirmation
    const { data: slot } = await db
      .from("it_run_bib_slots")
      .select("location_name,location_address,slot_date,start_time,end_time")
      .eq("id", slotId)
      .single();

    // Send confirmation notification (fire-and-forget)
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

    return NextResponse.json({ ok: true, slot });
  } catch (e: unknown) {
    console.error("[it-run/bib-booking] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
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
