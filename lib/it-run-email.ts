import { getSupabaseServer } from "@/lib/supabase-server";
import { sendEmail }         from "@/lib/notify";
import { APP_URL } from "@/lib/config";

// QR image URL — uses an external rendering service so inline HTML email
// clients display the code without needing Canvas or server-side PNG generation.
// The token encodes no PII (only regCode + participantId).
function qrImageUrl(token: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(token)}&size=150x150&color=000000&bgcolor=ffffff&margin=8&format=png`;
}

// Shared confirmation email helper for IT Run Sprint-2.
// Used by both the client-side payment verify route and the Razorpay webhook fallback.
export async function sendItRunConfirmationEmail(
  registrationId:   string,
  registrationCode: string,
  leadEmail:        string,
  _qrToken:         string,
): Promise<void> {
  const db = getSupabaseServer();

  const { data: reg } = await db
    .from("it_run_registrations")
    .select("id, registration_code, lead_email, final_price, it_run_categories(name), it_run_events(title, event_date, venue_name)")
    .eq("id", registrationId)
    .single<{
      id: string; registration_code: string; lead_email: string; final_price: number;
      it_run_categories: { name: string } | null;
      it_run_events: { title: string; event_date: string; venue_name: string } | null;
    }>();

  if (!reg) { console.warn(`[it-run-email] Registration ${registrationCode} not found`); return; }

  const { data: parts } = await db
    .from("it_run_participants")
    .select("id, first_name, last_name, email, qr_token")
    .eq("registration_id", reg.id)
    .order("created_at");

  if (!parts?.length) { console.warn(`[it-run-email] No participants for ${registrationCode}`); return; }

  const appUrl  = APP_URL;
  const dashUrl = `${appUrl}/it-run/dashboard/${reg.registration_code}`;
  const ev      = reg.it_run_events;
  const cat     = reg.it_run_categories;

  const primaryName = `${parts[0].first_name} ${parts[0].last_name}`;

  const html = buildConfirmEmail(
    primaryName,
    reg.registration_code,
    cat?.name ?? "IT Run Sprint-2",
    ev?.event_date ?? "2027-02-07",
    ev?.venue_name ?? "Hitec City, Hyderabad",
    dashUrl,
    parts.map(p => ({
      name:    `${p.first_name} ${p.last_name}`,
      qrToken: p.qr_token ?? reg.registration_code,
    })),
  );

  await sendEmail(
    leadEmail || reg.lead_email,
    primaryName,
    `Registration Confirmed - The IT Run Sprint-2 (${reg.registration_code})`,
    html,
    false,
    true,
  );
}

interface ParticipantQR {
  name:    string;
  qrToken: string;
}

export function buildConfirmEmail(
  name:         string,
  code:         string,
  category:     string,
  date:         string,
  venue:        string,
  dashUrl:      string,
  participants: ParticipantQR[],
): string {
  const dateFormatted = new Date(date + "T12:00:00Z").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  // Build one QR block per participant
  const qrBlocks = participants.length === 1
    ? `
      <tr><td style="padding:0 40px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:10px;overflow:hidden;">
          <tr><td style="padding:16px;text-align:center;">
            <div style="font-size:11px;color:#e8620a;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px;">Your Race-Day QR Code</div>
            <div style="display:inline-block;background:#fff;padding:8px;border-radius:6px;">
              <img src="${qrImageUrl(participants[0].qrToken)}" width="150" height="150" alt="QR Code" style="display:block;" />
            </div>
            <div style="font-size:11px;color:#888;margin-top:8px;">Show this at BIB collection and race-day check-in</div>
          </td></tr>
        </table>
      </td></tr>`
    : `
      <tr><td style="padding:0 40px 28px;">
        <div style="font-size:11px;color:#e8620a;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px;text-align:center;">Race-Day QR Codes</div>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>${participants.map(p => `
            <td style="width:${Math.floor(100 / participants.length)}%;text-align:center;padding:0 8px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:10px;">
                <tr><td style="padding:16px;text-align:center;">
                  <div style="font-size:12px;color:#ccc;font-weight:600;margin-bottom:10px;">${p.name}</div>
                  <div style="display:inline-block;background:#fff;padding:8px;border-radius:6px;">
                    <img src="${qrImageUrl(p.qrToken)}" width="130" height="130" alt="QR Code for ${p.name}" style="display:block;" />
                  </div>
                  <div style="font-size:10px;color:#666;margin-top:6px;">Individual check-in QR</div>
                </td></tr>
              </table>
            </td>`).join("")}
          </tr>
        </table>
        <div style="font-size:11px;color:#888;text-align:center;margin-top:10px;">Each participant must show their own QR at BIB collection and race-day check-in</div>
      </td></tr>`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Registration Confirmed</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#0a0a0a;border-radius:12px;overflow:hidden;">
      <tr><td style="height:4px;background:#e8620a;"></td></tr>
      <tr><td style="padding:32px 40px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:#fff;">The IT Run Sprint-2</div>
        <div style="font-size:11px;color:#e8620a;letter-spacing:0.12em;text-transform:uppercase;margin-top:4px;">Registration Confirmed</div>
      </td></tr>
      <tr><td style="padding:0 40px 24px;">
        <p style="margin:0 0 16px;font-size:15px;color:#ccc;">Hi <strong style="color:#fff;">${name}</strong>,</p>
        <p style="margin:0 0 24px;font-size:15px;color:#888;line-height:1.6;">You are officially registered for The IT Run Sprint-2! We are excited to run with you.</p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:10px;overflow:hidden;margin-bottom:24px;">
          <tr><td style="padding:20px 24px;border-bottom:1px solid #333;">
            <div style="font-size:11px;color:#e8620a;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Registration Code</div>
            <div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:0.08em;">${code}</div>
          </td></tr>
          <tr><td><table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="padding:16px 24px;border-right:1px solid #333;width:50%;">
              <div style="font-size:11px;color:#888;text-transform:uppercase;margin-bottom:4px;">Category</div>
              <div style="font-size:14px;font-weight:600;color:#fff;">${category}</div>
            </td>
            <td style="padding:16px 24px;width:50%;">
              <div style="font-size:11px;color:#888;text-transform:uppercase;margin-bottom:4px;">Date</div>
              <div style="font-size:14px;font-weight:600;color:#fff;">${dateFormatted}</div>
            </td>
          </tr></table></td></tr>
          <tr><td style="padding:16px 24px;border-top:1px solid #333;">
            <div style="font-size:11px;color:#888;text-transform:uppercase;margin-bottom:4px;">Venue</div>
            <div style="font-size:14px;font-weight:600;color:#fff;">${venue}</div>
          </td></tr>
        </table>
      </td></tr>
      ${qrBlocks}
      <tr><td style="padding:0 40px 24px;">
        <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
          <tr><td style="background:#e8620a;border-radius:8px;">
            <a href="${dashUrl}" style="display:block;padding:14px 32px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;">View Participant Dashboard</a>
          </td></tr>
        </table>

        <div style="background:#1a1a1a;border-radius:8px;padding:16px 20px;margin-bottom:16px;">
          <p style="margin:0;font-size:13px;color:#888;line-height:1.7;">
            <strong style="color:#ccc;">Next steps:</strong><br/>
            1. Book your BIB collection slot from your dashboard<br/>
            2. Carry original company ID for physical verification if not yet verified<br/>
            3. Report at the venue by 5:30 AM on ${dateFormatted}
          </p>
        </div>

        <p style="margin:0;font-size:14px;color:#666;text-align:center;line-height:1.7;">See you at the start line! Questions? Email info@connectedsteps.in</p>
      </td></tr>
      <tr><td style="padding:20px 40px;border-top:1px solid #222;text-align:center;">
        <p style="margin:0;font-size:12px;color:#555;">Connected Steps - Hyderabad, India</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
