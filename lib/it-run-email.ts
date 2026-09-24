import { getSupabaseServer } from "@/lib/supabase-server";
import { sendEmail }         from "@/lib/notify";
import { APP_URL }           from "@/lib/config";

// QR image rendered by an external service — email clients cannot run JS,
// so we can't use the qrcode npm package here.
// The token encodes no PII (only regCode:participantId + HMAC).
function qrImageUrl(token: string): string {
  return (
    `https://api.qrserver.com/v1/create-qr-code/` +
    `?data=${encodeURIComponent(token)}&size=160x160` +
    `&color=000000&bgcolor=ffffff&margin=8&format=png`
  );
}

const PARTICIPANT_TYPE_LABEL: Record<string, string> = {
  solo:      "",
  parent:    "Parent",
  child:     "Child",
  primary:   "Runner 1",
  secondary: "Runner 2",
};

// ── Shared confirmation email for IT Run Sprint-2 ────────────────────────────
//
// Idempotency: before sending, the function does an atomic
//   UPDATE it_run_registrations SET confirmation_email_sent_at = now()
//   WHERE id = ? AND confirmation_email_sent_at IS NULL
// Only the call that wins this race (returns 1 row) proceeds to send.
// All subsequent calls (webhook retries, client retries, page refresh) see
// a non-NULL timestamp and return immediately — at most one email per registration.
//
// Called by: /api/it-run/payment/verify (client-side confirm)
//            /api/webhooks/razorpay handleItRunPaymentCaptured (server-side fallback)
export async function sendItRunConfirmationEmail(
  registrationId:   string,
  registrationCode: string,
  leadEmail:        string,
  _qrToken:         string,  // kept for backward-compatible call sites; unused
): Promise<void> {
  const label = `[it-run-email] reg=${registrationCode}`;
  const db    = getSupabaseServer();

  // Fetch registration — include confirmation_email_sent_at for the idempotency check
  const { data: reg } = await db
    .from("it_run_registrations")
    .select(`
      id, registration_code, lead_email, final_price,
      confirmation_email_sent_at,
      it_run_categories ( name ),
      it_run_events ( title, event_date, venue_name )
    `)
    .eq("id", registrationId)
    .single<{
      id: string; registration_code: string; lead_email: string;
      final_price: number; confirmation_email_sent_at: string | null;
      it_run_categories: { name: string } | null;
      it_run_events: { title: string; event_date: string; venue_name: string } | null;
    }>();

  if (!reg) {
    console.warn(`${label} Registration not found`);
    return;
  }

  // ── Atomic idempotency claim ─────────────────────────────────────────────
  // The UPDATE only succeeds (returns 1 row) when confirmation_email_sent_at
  // IS NULL — i.e., when this is the first call. Concurrent or repeated calls
  // see a non-NULL value and are silently skipped.
  const { data: claimed } = await db
    .from("it_run_registrations")
    .update({ confirmation_email_sent_at: new Date().toISOString() })
    .eq("id", registrationId)
    .is("confirmation_email_sent_at", null)
    .select("id");

  if (!claimed?.length) {
    console.log(`${label} Confirmation email already sent — skipping`);
    return;
  }

  // ── Fetch all participants ───────────────────────────────────────────────
  const { data: parts } = await db
    .from("it_run_participants")
    .select("id, first_name, last_name, participant_type, tshirt_size, qr_token")
    .eq("registration_id", reg.id)
    .order("created_at");

  if (!parts?.length) {
    console.warn(`${label} No participants found`);
    return;
  }

  const appUrl      = APP_URL;
  const dashUrl     = `${appUrl}/it-run/dashboard/${reg.registration_code}`;
  const ev          = reg.it_run_events;
  const cat         = reg.it_run_categories;
  const primaryName = `${parts[0].first_name} ${parts[0].last_name}`;

  const html = buildConfirmEmail({
    primaryName,
    code:         reg.registration_code,
    category:     cat?.name    ?? "IT Run Sprint-2",
    date:         ev?.event_date  ?? "2027-02-07",
    venue:        ev?.venue_name  ?? "Hitec City, Hyderabad",
    finalPrice:   reg.final_price,
    dashUrl,
    participants: parts.map(p => ({
      name:          `${p.first_name} ${p.last_name}`,
      typeLabel:     PARTICIPANT_TYPE_LABEL[p.participant_type] ?? "",
      tshirtSize:    p.tshirt_size ?? null,
      qrToken:       p.qr_token   ?? reg.registration_code,
    })),
  });

  await sendEmail(
    leadEmail || reg.lead_email,
    primaryName,
    `Registration Confirmed - The IT Run Sprint-2 (${reg.registration_code})`,
    html,
    false,
    true,
  );

  console.log(`${label} Confirmation email sent to ${leadEmail || reg.lead_email}`);
}

// ── Email builder ─────────────────────────────────────────────────────────────

interface ParticipantData {
  name:       string;
  typeLabel:  string;
  tshirtSize: string | null;
  qrToken:    string;
}

interface ConfirmEmailArgs {
  primaryName:  string;
  code:         string;
  category:     string;
  date:         string;
  venue:        string;
  finalPrice:   number;
  dashUrl:      string;
  participants: ParticipantData[];
}

export function buildConfirmEmail(args: ConfirmEmailArgs): string {
  const { primaryName, code, category, date, venue, finalPrice, dashUrl, participants } = args;

  const dateFormatted = new Date(date + "T12:00:00Z").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const amountLine = finalPrice > 0
    ? `₹${finalPrice.toLocaleString("en-IN")}`
    : "Free";

  // ── Participant details rows ───────────────────────────────────────────────
  const participantRows = participants.map((p, i) => {
    const label = p.typeLabel
      ? `<span style="font-size:10px;color:#e8620a;text-transform:uppercase;letter-spacing:0.08em;">${p.typeLabel}</span><br/>`
      : "";
    const tshirt = p.tshirtSize
      ? `<div style="font-size:12px;color:#888;margin-top:4px;">T-Shirt: <strong style="color:#ccc;">${p.tshirtSize}</strong></div>`
      : "";

    return `
    <tr>
      <td style="padding:16px 24px;${i < participants.length - 1 ? "border-bottom:1px solid #2a2a2a;" : ""}">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:top;padding-right:16px;">
              ${label}
              <div style="font-size:15px;font-weight:700;color:#fff;">${p.name}</div>
              ${tshirt}
            </td>
            <td style="vertical-align:top;text-align:right;width:180px;">
              <div style="display:inline-block;background:#fff;padding:6px;border-radius:6px;">
                <img src="${qrImageUrl(p.qrToken)}" width="120" height="120" alt="QR for ${p.name}" style="display:block;" />
              </div>
              <div style="font-size:10px;color:#666;margin-top:4px;">Race-day QR</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
  }).join("");

  // ── Full HTML ──────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Registration Confirmed — The IT Run Sprint-2</title>
</head>
<body style="margin:0;padding:0;background:#f0f0f1;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f1;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#0a0a0a;border-radius:14px;overflow:hidden;">

  <!-- Top accent bar -->
  <tr><td style="height:5px;background:linear-gradient(90deg,#e8620a,#ff8c42);"></td></tr>

  <!-- Header -->
  <tr><td style="padding:28px 40px 20px;text-align:center;">
    <div style="font-size:11px;color:#e8620a;letter-spacing:0.18em;text-transform:uppercase;margin-bottom:6px;">Connected Steps</div>
    <div style="font-size:24px;font-weight:900;color:#fff;letter-spacing:-0.02em;">The IT Run Sprint-2</div>
    <div style="display:inline-block;margin-top:8px;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);border-radius:20px;padding:5px 16px;">
      <span style="font-size:12px;font-weight:700;color:#10b981;letter-spacing:0.06em;text-transform:uppercase;">&#10003;&nbsp; Registration Confirmed</span>
    </div>
  </td></tr>

  <!-- Greeting -->
  <tr><td style="padding:0 40px 20px;">
    <p style="margin:0 0 6px;font-size:16px;color:#ccc;">Hi <strong style="color:#fff;">${primaryName}</strong>,</p>
    <p style="margin:0;font-size:14px;color:#777;line-height:1.7;">
      You are officially registered for The IT Run Sprint-2.
      We are excited to run with you on February 7, 2027!
    </p>
  </td></tr>

  <!-- Registration summary card -->
  <tr><td style="padding:0 40px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid #262626;border-radius:10px;overflow:hidden;">

      <!-- Registration code -->
      <tr><td style="padding:18px 24px;border-bottom:1px solid #222;text-align:center;">
        <div style="font-size:11px;color:#e8620a;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:6px;">Registration Code</div>
        <div style="font-size:30px;font-weight:900;color:#fff;letter-spacing:0.1em;font-variant-numeric:tabular-nums;">${code}</div>
      </td></tr>

      <!-- Category + Date -->
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="padding:14px 24px;border-right:1px solid #222;width:50%;">
            <div style="font-size:10px;color:#666;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Category</div>
            <div style="font-size:14px;font-weight:700;color:#fff;">${category}</div>
          </td>
          <td style="padding:14px 24px;width:50%;">
            <div style="font-size:10px;color:#666;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Date</div>
            <div style="font-size:14px;font-weight:700;color:#fff;">${dateFormatted}</div>
          </td>
        </tr></table>
      </td></tr>

      <!-- Venue + Amount -->
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #222;"><tr>
          <td style="padding:14px 24px;border-right:1px solid #222;width:50%;">
            <div style="font-size:10px;color:#666;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Venue</div>
            <div style="font-size:14px;font-weight:700;color:#fff;">${venue}</div>
          </td>
          <td style="padding:14px 24px;width:50%;">
            <div style="font-size:10px;color:#666;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Amount Paid</div>
            <div style="font-size:18px;font-weight:900;color:#10b981;">${amountLine}</div>
          </td>
        </tr></table>
      </td></tr>

    </table>
  </td></tr>

  <!-- Participant details + QR codes -->
  <tr><td style="padding:0 40px 24px;">
    <div style="font-size:11px;color:#e8620a;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:10px;">
      Participant${participants.length > 1 ? "s" : ""} &amp; Race-Day QR Code${participants.length > 1 ? "s" : ""}
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid #262626;border-radius:10px;overflow:hidden;">
      ${participantRows}
    </table>
    <div style="font-size:11px;color:#555;margin-top:8px;text-align:center;line-height:1.6;">
      Screenshot this email or save your QR${participants.length > 1 ? "s" : ""} for offline access on race day.<br/>
      Each participant must present <strong style="color:#888;">their own QR</strong> at BIB collection and race-day check-in.
    </div>
  </td></tr>

  <!-- BIB collection section -->
  <tr><td style="padding:0 40px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid #1e2a1e;border-radius:10px;overflow:hidden;">
      <tr><td style="padding:16px 20px;border-bottom:1px solid #1a2a1a;">
        <div style="font-size:11px;color:#10b981;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;">BIB Collection</div>
      </td></tr>
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 10px;font-size:13px;color:#888;line-height:1.7;">
          Visit your <strong style="color:#ccc;">Participant Dashboard</strong> to book a BIB collection slot at a time and location convenient for you.
        </p>
        <p style="margin:0;font-size:13px;color:#888;line-height:1.7;">
          Bring your <strong style="color:#ccc;">original company / employee ID card</strong> for physical verification at the BIB counter.
          Your BIB number and wave assignment will be confirmed at collection.
        </p>
      </td></tr>
    </table>
  </td></tr>

  <!-- Next steps -->
  <tr><td style="padding:0 40px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid #262626;border-radius:10px;overflow:hidden;">
      <tr><td style="padding:16px 20px;border-bottom:1px solid #222;">
        <div style="font-size:11px;color:#e8620a;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;">Next Steps</div>
      </td></tr>
      <tr><td style="padding:16px 20px;">
        <table cellpadding="0" cellspacing="0">
          ${[
            ["1", "Book your BIB collection slot from your Participant Dashboard."],
            ["2", "Carry original company / employee ID for physical verification at BIB collection."],
            ["3", "Save or screenshot your race-day QR code for offline access."],
            ["4", "Report at the venue by <strong style=\"color:#ccc;\">5:30 AM</strong> on " + dateFormatted + "."],
          ].map(([n, text]) => `
          <tr>
            <td style="vertical-align:top;padding:0 12px 10px 0;">
              <div style="width:22px;height:22px;background:#e8620a;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:800;color:#fff;">${n}</div>
            </td>
            <td style="vertical-align:top;padding:0 0 10px;font-size:13px;color:#888;line-height:1.6;">${text}</td>
          </tr>`).join("")}
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- Dashboard CTA -->
  <tr><td style="padding:0 40px 24px;text-align:center;">
    <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr><td style="background:#e8620a;border-radius:8px;">
        <a href="${dashUrl}" style="display:block;padding:14px 36px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;letter-spacing:-0.01em;">
          View Participant Dashboard &rarr;
        </a>
      </td></tr>
    </table>
  </td></tr>

  <!-- Contact / support -->
  <tr><td style="padding:0 40px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid #262626;border-radius:10px;overflow:hidden;">
      <tr><td style="padding:16px 20px;">
        <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">Need help?</div>
        <div style="font-size:13px;color:#888;line-height:1.8;">
          Email: <a href="mailto:info@connectedsteps.in" style="color:#e8620a;text-decoration:none;">info@connectedsteps.in</a><br/>
          Dashboard: <a href="${dashUrl}" style="color:#e8620a;text-decoration:none;">connectedsteps.in/it-run/dashboard</a><br/>
          <span style="font-size:12px;color:#555;">Please include your registration code <strong style="color:#666;">${code}</strong> in all queries.</span>
        </div>
      </td></tr>
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:16px 40px;border-top:1px solid #1a1a1a;text-align:center;">
    <p style="margin:0 0 4px;font-size:12px;color:#444;font-weight:700;">Connected Steps</p>
    <p style="margin:0;font-size:11px;color:#333;">Hyderabad, India &nbsp;·&nbsp; connectedsteps.in</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
