import { buildDashboardUrl } from "@/lib/it-run-dashboard-link";
import { randomBytes }        from "crypto";
import { getSupabaseServer } from "@/lib/supabase-server";
import { sendEmail }         from "@/lib/notify";
import { APP_URL }           from "@/lib/config";
import { emailWrapper, emailHeader, emailFooter } from "@/lib/email/layout";
import { escapeHtml } from "@/lib/it-run-verification";

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
      id, registration_code, lead_email, linked_user_email, final_price, base_price, discount_amount, early_bird_offer_id,
      confirmation_email_sent_at,
      it_run_categories ( name ),
      it_run_events ( title, event_date, venue_name, report_time )
    `)
    .eq("id", registrationId)
    .single<{
      id: string; registration_code: string; lead_email: string; linked_user_email: string | null;
      final_price: number; base_price: number; discount_amount: number; early_bird_offer_id: string | null;
      confirmation_email_sent_at: string | null;
      it_run_categories: { name: string } | null;
      it_run_events: { title: string; event_date: string; venue_name: string; report_time: string | null } | null;
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

  // Discount line: an early bird offer (named) or a discount code. Only shown when a discount was applied.
  let discount: ConfirmEmailDiscount | undefined;
  if (reg.discount_amount > 0) {
    let label = "Discount code";
    if (reg.early_bird_offer_id) {
      const { data: offer } = await db
        .from("it_run_early_bird_offers")
        .select("name")
        .eq("id", reg.early_bird_offer_id)
        .maybeSingle<{ name: string }>();
      label = offer?.name ?? "Early bird";
    }
    discount = { label, baseAmount: reg.base_price, discountAmount: reg.discount_amount };
  }

  const appUrl      = APP_URL;
  const dashUrl     = buildDashboardUrl(reg.registration_code);
  const ev          = reg.it_run_events;
  const cat         = reg.it_run_categories;
  const primaryName = `${parts[0].first_name} ${parts[0].last_name}`;

  // Build QR URLs pointing to the HTTPS endpoint.
  // Each participant's QR is served from their signed token.
  // Email clients fetch these images on open (cached for 1 year since immutable).
  // This works in Gmail, Apple Mail, mobile, etc. (Data URIs are stripped by email clients).
  const html = buildConfirmEmail({
    primaryName,
    code:         reg.registration_code,
    category:     cat?.name       ?? "IT Run Sprint-2",
    date:         ev?.event_date  ?? "2027-02-07",
    venue:        ev?.venue_name  ?? "Hitec City, Hyderabad",
    reportTime:   ev?.report_time ?? "5:30 AM",
    finalPrice:   reg.final_price,
    discount,
    dashUrl,
    participants: parts.map(p => ({
      name:       `${p.first_name} ${p.last_name}`,
      typeLabel:  PARTICIPANT_TYPE_LABEL[p.participant_type] ?? "",
      tshirtSize: p.tshirt_size ?? null,
      qrUrl:      `${appUrl}/api/it-run/qr/${p.qr_token ?? reg.registration_code}`,
    })),
  });

  const recipients = confirmationRecipients(leadEmail || reg.lead_email, reg.linked_user_email);
  if (recipients.length === 0) {
    await releaseClaim(db, "confirmation_email_sent_at", registrationId);
    console.error(JSON.stringify({ src: "it-run-email", kind: "confirmation", outcome: "no_recipient", reg: reg.registration_code }));
    return;
  }

  const results = await Promise.all(recipients.map(to => sendEmail(
    to,
    primaryName,
    `Registration Confirmed - The IT Run Sprint-2 (${reg.registration_code})`,
    html,
    false,
    true,
  )));
  const failed = results.filter(r => !r.ok);
  if (failed.length > 0) {
    // Release the claim so an admin resend (or a later trigger) can send it again
    await releaseClaim(db, "confirmation_email_sent_at", registrationId);
    console.error(JSON.stringify({
      src: "it-run-email", kind: "confirmation", outcome: "send_failed",
      reg: reg.registration_code, failed: failed.length, of: recipients.length,
      httpStatus: failed[0]?.httpStatus ?? null,
    }));
    return;
  }

  console.log(JSON.stringify({ src: "it-run-email", kind: "confirmation", outcome: "sent", reg: reg.registration_code, recipients: recipients.length }));
}

/**
 * Who receives a booking's emails: the address on the registration and, when a different address belongs to the
 * signed-in account that made the booking, that account too. Each address is listed once, case-insensitively.
 */
export function confirmationRecipients(leadEmail: string | null, linkedUserEmail: string | null): string[] {
  const seen = new Map<string, string>();
  for (const raw of [leadEmail, linkedUserEmail]) {
    const value = (raw ?? "").trim();
    // Keep the first spelling seen (the registration address as typed)
    if (value && !seen.has(value.toLowerCase())) seen.set(value.toLowerCase(), value);
  }
  return Array.from(seen.values());
}

/** Clears a "sent" claim after a failed send, so the email is not recorded as delivered. */
async function releaseClaim(db: ReturnType<typeof getSupabaseServer>, column: string, registrationId: string): Promise<void> {
  await db.from("it_run_registrations").update({ [column]: null }).eq("id", registrationId);
}

// ── Email builder ─────────────────────────────────────────────────────────────

interface ParticipantData {
  name:       string;
  typeLabel:  string;
  tshirtSize: string | null;
  qrUrl:      string;  // HTTPS URL to /api/it-run/qr/{token}
}

export interface ConfirmEmailDiscount {
  label:          string;  // "Early Bird — …" or "Discount code"
  baseAmount:     number;  // rupees, before discount
  discountAmount: number;  // rupees
}

interface ConfirmEmailArgs {
  primaryName:  string;
  code:         string;
  category:     string;
  date:         string;
  venue:        string;
  reportTime:   string;
  finalPrice:   number;
  discount?:    ConfirmEmailDiscount;
  dashUrl:      string;
  participants: ParticipantData[];
}

// ── BIB Booking Invitation Email (Email 2) ────────────────────────────────────
//
// Sent after payment confirmation with a unique token that gates the public
// BIB collection booking page. Idempotency mirrors sendItRunConfirmationEmail:
// only the first call that wins the bib_invite_sent_at IS NULL race proceeds.
//
// Called by: /api/it-run/payment/verify
//            /api/webhooks/razorpay  handleItRunPaymentCaptured
//            /api/it-run/register    (free registrations)
export async function sendItRunBibInviteEmail(
  registrationId: string,
  leadEmail:       string,
): Promise<void> {
  const label = `[it-run-email/bib-invite] reg=${registrationId}`;
  const db    = getSupabaseServer();

  const { data: reg } = await db
    .from("it_run_registrations")
    .select(`
      id, registration_code, lead_email, linked_user_email, participant_count,
      bib_invite_token, bib_invite_sent_at,
      it_run_categories ( name ),
      it_run_events ( title, event_date, venue_name )
    `)
    .eq("id", registrationId)
    .single<{
      id: string; registration_code: string; lead_email: string; linked_user_email: string | null;
      participant_count: number;
      bib_invite_token: string | null; bib_invite_sent_at: string | null;
      it_run_categories: { name: string } | null;
      it_run_events: { title: string; event_date: string; venue_name: string } | null;
    }>();

  if (!reg) { console.warn(`${label} Registration not found`); return; }
  if (reg.bib_invite_sent_at) { console.log(`${label} Already sent — skipping`); return; }

  // ── Ensure bib_invite_token exists ──────────────────────────────────────────
  let token = reg.bib_invite_token;
  if (!token) {
    const candidate = randomBytes(24).toString("hex"); // 192-bit, not guessable
    const { data: tokenSet } = await db
      .from("it_run_registrations")
      .update({ bib_invite_token: candidate })
      .eq("id", registrationId)
      .is("bib_invite_token", null)
      .select("bib_invite_token");

    if (tokenSet?.length) {
      token = (tokenSet[0] as { bib_invite_token: string }).bib_invite_token;
    } else {
      // A concurrent call already set a token — fetch it
      const { data: fetched } = await db
        .from("it_run_registrations")
        .select("bib_invite_token")
        .eq("id", registrationId)
        .single<{ bib_invite_token: string | null }>();
      token = fetched?.bib_invite_token ?? null;
    }
  }

  if (!token) { console.error(`${label} Could not obtain bib_invite_token`); return; }

  // ── Atomic idempotency claim ─────────────────────────────────────────────────
  const { data: claimed } = await db
    .from("it_run_registrations")
    .update({ bib_invite_sent_at: new Date().toISOString() })
    .eq("id", registrationId)
    .is("bib_invite_sent_at", null)
    .select("id");

  if (!claimed?.length) { console.log(`${label} Claimed by concurrent call — skipping`); return; }

  // ── Build + send ─────────────────────────────────────────────────────────────
  const bookUrl = `${APP_URL}/events/it-run-sprint-2/bib-collection/${token}`;
  const isDuo   = (reg.participant_count ?? 1) > 1;

  const html = buildBibInviteEmail({
    code:     reg.registration_code,
    category: reg.it_run_categories?.name ?? "IT Run Sprint-2",
    date:     reg.it_run_events?.event_date ?? "2027-02-07",
    venue:    reg.it_run_events?.venue_name ?? "Hitec City, Hyderabad",
    bookUrl,
    isDuo,
  });

  const recipients = confirmationRecipients(leadEmail || reg.lead_email, reg.linked_user_email);
  if (recipients.length === 0) {
    await releaseClaim(db, "bib_invite_sent_at", registrationId);
    console.error(JSON.stringify({ src: "it-run-email", kind: "bib_invite", outcome: "no_recipient", reg: reg.registration_code }));
    return;
  }

  const results = await Promise.all(recipients.map(to => sendEmail(
    to,
    reg.registration_code,
    `Book Your BIB Collection Slot — IT Run Sprint-2 (${reg.registration_code})`,
    html,
    false,
    true,
  )));
  const failed = results.filter(r => !r.ok);
  if (failed.length > 0) {
    await releaseClaim(db, "bib_invite_sent_at", registrationId);
    console.error(JSON.stringify({
      src: "it-run-email", kind: "bib_invite", outcome: "send_failed",
      reg: reg.registration_code, failed: failed.length, of: recipients.length,
      httpStatus: failed[0]?.httpStatus ?? null,
    }));
    return;
  }

  console.log(JSON.stringify({ src: "it-run-email", kind: "bib_invite", outcome: "sent", reg: reg.registration_code, recipients: recipients.length }));
}

interface BibInviteEmailArgs {
  code:     string;
  category: string;
  date:     string;
  venue:    string;
  bookUrl:  string;
  isDuo:    boolean;
}

function buildBibInviteEmail({ code, category, date, venue, bookUrl, isDuo }: BibInviteEmailArgs): string {
  const dateFormatted = new Date(date + "T12:00:00Z").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const duoNote = isDuo
    ? `<p style="margin:0 0 16px;font-size:13px;color:#888;line-height:1.7;">
         This link covers all participants in your registration.
         Each participant will need to book their own time slot on the page.
       </p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Book Your BIB Collection Slot — The IT Run Sprint-2</title>
</head>
<body style="margin:0;padding:0;background:#f0f0f1;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f1;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#0a0a0a;border-radius:14px;overflow:hidden;">

  <tr><td style="height:5px;background:linear-gradient(90deg,#e8620a,#ff8c42);"></td></tr>

  <tr><td style="padding:28px 40px 20px;text-align:center;">
    <div style="font-size:11px;color:#e8620a;letter-spacing:0.18em;text-transform:uppercase;margin-bottom:6px;">Connected Steps</div>
    <div style="font-size:24px;font-weight:900;color:#fff;letter-spacing:-0.02em;">BIB Collection Booking</div>
    <div style="font-size:13px;color:#888;margin-top:6px;">The IT Run Sprint-2 &middot; ${dateFormatted}</div>
  </td></tr>

  <tr><td style="padding:0 40px 20px;">
    <p style="margin:0 0 12px;font-size:15px;color:#ccc;line-height:1.7;">
      Your registration is confirmed. Now it&rsquo;s time to <strong style="color:#fff;">book your BIB collection slot</strong>
      at a time and location that works for you.
    </p>
    ${duoNote}
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid #262626;border-radius:10px;overflow:hidden;margin-bottom:20px;">
      <tr>
        <td style="padding:14px 24px;border-right:1px solid #222;width:50%;">
          <div style="font-size:10px;color:#666;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Registration Code</div>
          <div style="font-size:16px;font-weight:900;color:#fff;letter-spacing:0.08em;">${code}</div>
        </td>
        <td style="padding:14px 24px;width:50%;">
          <div style="font-size:10px;color:#666;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Category</div>
          <div style="font-size:14px;font-weight:700;color:#fff;">${category}</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="padding:0 40px 28px;text-align:center;">
    <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr><td style="background:#e8620a;border-radius:8px;">
        <a href="${bookUrl}" style="display:block;padding:16px 40px;font-size:16px;font-weight:700;color:#fff;text-decoration:none;letter-spacing:-0.01em;">
          Book BIB Collection Slot &rarr;
        </a>
      </td></tr>
    </table>
    <p style="margin:12px 0 0;font-size:11px;color:#444;line-height:1.6;">
      This link is personal to your registration.<br/>
      <a href="${bookUrl}" style="color:#666;word-break:break-all;">${bookUrl}</a>
    </p>
  </td></tr>

  <tr><td style="padding:0 40px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid #1e2a1e;border-radius:10px;overflow:hidden;">
      <tr><td style="padding:14px 20px;border-bottom:1px solid #1a2a1a;">
        <div style="font-size:11px;color:#10b981;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;">Collection Locations</div>
      </td></tr>
      <tr><td style="padding:14px 20px;">
        <table cellpadding="0" cellspacing="0" style="font-size:13px;color:#888;line-height:1.9;width:100%;">
          <tr><td style="padding-bottom:6px;">&#128205; <strong style="color:#ccc;">Connected Steps Studio, Miyapur</strong></td><td style="text-align:right;color:#666;white-space:nowrap;">Feb 4 &amp; 5, 2027</td></tr>
          <tr><td>&#128205; <strong style="color:#ccc;">Hitec City Collection Counter</strong></td><td style="text-align:right;color:#666;white-space:nowrap;">Feb 6, 2027</td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:0 40px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid #262626;border-radius:10px;overflow:hidden;">
      <tr><td style="padding:14px 20px;border-bottom:1px solid #222;">
        <div style="font-size:11px;color:#e8620a;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;">What to bring at BIB collection</div>
      </td></tr>
      <tr><td style="padding:14px 20px;">
        <table cellpadding="0" cellspacing="0" style="font-size:13px;color:#888;line-height:2;width:100%;">
          <tr><td>&#10003;&nbsp; <strong style="color:#ccc;">Original company / employee ID card</strong> for physical verification</td></tr>
          <tr><td>&#10003;&nbsp; Race-day QR code (from your confirmation email or participant dashboard)</td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:0 40px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid #262626;border-radius:10px;overflow:hidden;">
      <tr><td style="padding:14px 20px;">
        <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">Need help?</div>
        <div style="font-size:13px;color:#888;line-height:1.8;">
          Email: <a href="mailto:info@connectedsteps.in" style="color:#e8620a;text-decoration:none;">info@connectedsteps.in</a><br/>
          <span style="font-size:12px;color:#555;">Include your registration code <strong style="color:#666;">${code}</strong> in all queries.</span>
        </div>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:16px 40px;border-top:1px solid #1a1a1a;text-align:center;">
    <p style="margin:0 0 4px;font-size:12px;color:#444;font-weight:700;">Connected Steps</p>
    <p style="margin:0;font-size:11px;color:#333;">${venue} &nbsp;&middot;&nbsp; connectedsteps.in</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

export function buildConfirmEmail(args: ConfirmEmailArgs): string {
  const { primaryName, code, category, date, venue, reportTime, finalPrice, discount, dashUrl, participants } = args;

  const dateFormatted = new Date(date + "T12:00:00Z").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const amountLine = finalPrice > 0
    ? `₹${finalPrice.toLocaleString("en-IN")}`
    : "Free";

  const discountLine = discount && discount.discountAmount > 0
    ? `<div style="font-size:12px;color:#888;margin-top:4px;">Base ₹${discount.baseAmount.toLocaleString("en-IN")} &minus; ${escapeHtml(discount.label)} ₹${discount.discountAmount.toLocaleString("en-IN")}</div>`
    : "";

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
                <img src="${p.qrUrl}" width="120" height="120" alt="QR for ${p.name}" style="display:block;" />
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
      We are excited to run with you on ${dateFormatted}!
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
            ${discountLine}
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
            ["4", "Report at the venue by <strong style=\"color:#ccc;\">" + reportTime + "</strong> on " + dateFormatted + "."],
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

// ── Refund Confirmation Email ──────────────────────────────────────────────────
//
// Sent when an admin issues a refund. Idempotency: similar to confirmation email,
// uses a flag in the refund record to prevent duplicate sends.
export async function sendRefundConfirmationEmail(
  registrationId: string,
  registrationCode: string,
  leadEmail: string,
  refundAmount: number,
): Promise<void> {
  const label = `[it-run-email/refund] reg=${registrationCode}`;
  const db    = getSupabaseServer();

  const { data: reg } = await db
    .from("it_run_registrations")
    .select(`
      id, registration_code, lead_email, category_id, base_price,
      it_run_participants ( first_name, last_name ),
      it_run_categories ( name )
    `)
    .eq("id", registrationId)
    .single<{
      id: string; registration_code: string; lead_email: string;
      category_id: string; base_price: number;
      it_run_participants: Array<{ first_name: string; last_name: string }>;
      it_run_categories: { name: string } | null;
    }>();

  if (!reg) {
    console.warn(`${label} Registration not found`);
    return;
  }

  const recipient = leadEmail || reg.lead_email;
  const primaryName = reg.it_run_participants?.[0]
    ? `${reg.it_run_participants[0].first_name} ${reg.it_run_participants[0].last_name}`
    : "Participant";

  const html = `
${emailWrapper(`
${emailHeader()}
<tr><td style="padding:40px 40px 32px;">
  <p style="margin:0 0 8px;font-size:15px;color:#555;">Hi <strong>${primaryName}</strong>,</p>
  <p style="margin:0 0 28px;font-size:15px;color:#555;line-height:1.6;">Your refund for The IT Run Sprint-2 has been processed successfully.</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden;margin-bottom:32px;">
    <tr><td style="padding:20px 24px;border-bottom:1px solid #e5e5e5;">
      <div style="font-size:11px;color:#10b981;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Refund Confirmed</div>
      <div style="font-size:24px;font-weight:800;color:#10b981;">₹${(refundAmount / 100).toLocaleString("en-IN")}</div>
    </td></tr>
    <tr><td>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:16px 24px;border-right:1px solid #e5e5e5;width:50%;">
            <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Registration Code</div>
            <div style="font-size:14px;font-weight:600;color:#0a0a0a;font-family:monospace;">${registrationCode}</div>
          </td>
          <td style="padding:16px 24px;width:50%;">
            <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Category</div>
            <div style="font-size:14px;font-weight:600;color:#0a0a0a;">${reg.it_run_categories?.name ?? "IT Run Sprint-2"}</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
  <div style="background:#e8f5e9;border:1px solid #81c784;border-radius:8px;padding:14px 16px;margin-bottom:20px;font-size:13px;color:#2e7d32;line-height:1.6;">
    ✓ Refund amount will be credited to your original payment method within 3-5 business days.
  </div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden;margin-bottom:32px;">
    <tr><td style="padding:16px 20px;border-bottom:1px solid #e5e5e5;">
      <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;">Need help?</div>
    </td></tr>
    <tr><td style="padding:16px 20px;">
      <div style="font-size:13px;color:#666;line-height:1.8;">
        If you have questions about this refund, please contact us at <a href="mailto:info@connectedsteps.in" style="color:#e8620a;text-decoration:none;">info@connectedsteps.in</a>.<br/>
        Include your registration code <strong style="color:#0a0a0a;">${registrationCode}</strong> in your message.
      </div>
    </td></tr>
  </table>
  <p style="margin:0;font-size:13px;color:#888;line-height:1.6;text-align:center;">
    Thank you for being part of the Connected Steps community. We hope to see you at a future event!
  </p>
</td></tr>
${emailFooter()}
`)}
  `;

  await sendEmail(
    recipient,
    primaryName,
    `Refund Processed — The IT Run Sprint-2 (${registrationCode})`,
    html,
    false,
    true,
  );

  console.log(`${label} Refund confirmation email sent to ${recipient}`);
}


// ── One confirmation for a shared payment (stage 4) ───────────────────────────
//
// A checkout that paid for several registrations sends ONE email, with a section per registration: its code,
// category, runners with their own QR codes, and its dashboard link. Single registrations use the email above.

export interface CheckoutSection {
  code: string;
  category: string;
  date: string;
  venue: string;
  reportTime: string;
  finalPrice: number;
  discount?: ConfirmEmailDiscount;
  dashUrl: string;
  participants: ParticipantData[];
}

export function buildCheckoutConfirmEmail(sections: CheckoutSection[]): string {
  const total = sections.reduce((sum, s) => sum + s.finalPrice, 0);
  const blocks = sections.map(s => {
    const discountLine = s.discount && s.discount.discountAmount > 0
      ? `<div style="font-size:12px;color:#888;margin-top:4px;">Base ₹${s.discount.baseAmount.toLocaleString("en-IN")} &minus; ${escapeHtml(s.discount.label)} ₹${s.discount.discountAmount.toLocaleString("en-IN")}</div>`
      : "";
    const people = s.participants.map(p => `
      <tr><td style="padding:12px 24px;border-top:1px solid #2a2a2a;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:top;padding-right:16px;">
            <div style="font-size:15px;font-weight:700;color:#fff;">${escapeHtml(p.name)}</div>
            ${p.tshirtSize ? `<div style="font-size:12px;color:#888;margin-top:4px;">T-Shirt: <strong style="color:#ccc;">${escapeHtml(p.tshirtSize)}</strong></div>` : ""}
          </td>
          <td style="vertical-align:top;text-align:right;width:150px;">
            <div style="display:inline-block;background:#fff;padding:6px;border-radius:6px;">
              <img src="${p.qrUrl}" width="110" height="110" alt="QR for ${escapeHtml(p.name)}" style="display:block;" />
            </div>
            <div style="font-size:10px;color:#666;margin-top:4px;">Race-day QR</div>
          </td>
        </tr></table>
      </td></tr>`).join("");
    return `
  <tr><td style="padding:0 40px 24px;">
    <div style="background:#111;border:1px solid #2a2a2a;border-radius:12px;overflow:hidden;">
      <div style="padding:16px 24px;border-bottom:1px solid #2a2a2a;">
        <div style="font-size:10px;color:#e8620a;text-transform:uppercase;letter-spacing:0.12em;">${escapeHtml(s.category)}</div>
        <div style="font-size:14px;color:#fff;font-weight:700;margin-top:4px;">Registration ${escapeHtml(s.code)}</div>
        <div style="font-size:12px;color:#888;margin-top:4px;">${escapeHtml(s.date)} · ${escapeHtml(s.venue)} · Report ${escapeHtml(s.reportTime)}</div>
        <div style="font-size:14px;font-weight:900;color:#10b981;margin-top:6px;">₹${s.finalPrice.toLocaleString("en-IN")}</div>
        ${discountLine}
      </div>
      <table width="100%" cellpadding="0" cellspacing="0">${people}</table>
      <div style="padding:12px 24px;border-top:1px solid #2a2a2a;"><a href="${s.dashUrl}" style="font-size:12px;color:#e8620a;font-weight:700;text-decoration:none;">Open dashboard for ${escapeHtml(s.code)} &rarr;</a></div>
    </div>
  </td></tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Registrations Confirmed — The IT Run Sprint-2</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#141414;border-radius:16px;overflow:hidden;">
  <tr><td style="padding:40px 40px 24px;text-align:center;">
    <div style="font-size:11px;color:#e8620a;text-transform:uppercase;letter-spacing:0.14em;margin-bottom:10px;">The IT Run Sprint-2</div>
    <div style="font-size:24px;font-weight:900;color:#fff;">${sections.length} registrations confirmed</div>
    <div style="font-size:14px;color:#888;margin-top:8px;">Total paid <strong style="color:#10b981;">₹${total.toLocaleString("en-IN")}</strong> in one payment</div>
  </td></tr>
  ${blocks}
  <tr><td style="padding:0 40px 32px;font-size:12px;color:#555;line-height:1.7;">
    Each registration has its own code and QR codes. Bring the QR code of each runner on race day. Your BIB collection invites are sent separately.
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Sends one confirmation for the registrations a shared payment just confirmed. Each registration's "sent" marker is
 * claimed first, so a repeated delivery sends nothing. A failed send releases the claims so an admin resend works.
 */
export async function sendItRunCheckoutConfirmationEmail(registrationIds: string[]): Promise<void> {
  if (registrationIds.length === 0) return;
  const db = getSupabaseServer();
  const label = `[it-run-email/checkout] regs=${registrationIds.length}`;

  const { data: claimed } = await db
    .from("it_run_registrations")
    .update({ confirmation_email_sent_at: new Date().toISOString() })
    .in("id", registrationIds)
    .is("confirmation_email_sent_at", null)
    .select("id");
  const claimedIds = (claimed ?? []).map(r => (r as { id: string }).id);
  if (claimedIds.length === 0) { console.log(`${label} Already sent — skipping`); return; }

  const { data: regs } = await db
    .from("it_run_registrations")
    .select(`
      id, registration_code, lead_email, linked_user_email, final_price, base_price, discount_amount, early_bird_offer_id,
      it_run_categories ( name ),
      it_run_events ( title, event_date, venue_name, report_time ),
      it_run_participants ( first_name, last_name, participant_type, tshirt_size, qr_token, created_at )
    `)
    .in("id", claimedIds)
    .returns<Array<{
      id: string; registration_code: string; lead_email: string; linked_user_email: string | null;
      final_price: number; base_price: number; discount_amount: number; early_bird_offer_id: string | null;
      it_run_categories: { name: string } | null;
      it_run_events: { title: string; event_date: string; venue_name: string; report_time: string | null } | null;
      it_run_participants: Array<{ first_name: string; last_name: string; participant_type: string; tshirt_size: string | null; qr_token: string | null; created_at: string }> | null;
    }>>();

  const ordered = (regs ?? []).sort((a, b) => a.registration_code.localeCompare(b.registration_code));
  const sections: CheckoutSection[] = ordered.map(r => {
    const ev = r.it_run_events;
    return {
      code: r.registration_code,
      category: r.it_run_categories?.name ?? "IT Run Sprint-2",
      date: ev?.event_date ?? "2027-02-07",
      venue: ev?.venue_name ?? "Hitec City, Hyderabad",
      reportTime: ev?.report_time ?? "5:30 AM",
      finalPrice: r.final_price,
      discount: r.discount_amount > 0
        ? { label: "Discount applied", baseAmount: r.base_price, discountAmount: r.discount_amount }
        : undefined,
      dashUrl: buildDashboardUrl(r.registration_code),
      participants: [...(r.it_run_participants ?? [])]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map(p => ({
          name: `${p.first_name} ${p.last_name}`,
          typeLabel: PARTICIPANT_TYPE_LABEL[p.participant_type] ?? "",
          tshirtSize: p.tshirt_size ?? null,
          qrUrl: `${APP_URL}/api/it-run/qr/${p.qr_token ?? r.registration_code}`,
        })),
    };
  });

  const first = ordered[0];
  const recipients = confirmationRecipients(first.lead_email, first.linked_user_email);
  if (recipients.length === 0) {
    await db.from("it_run_registrations").update({ confirmation_email_sent_at: null }).in("id", claimedIds);
    console.error(JSON.stringify({ src: "it-run-email", kind: "checkout_confirmation", outcome: "no_recipient" }));
    return;
  }

  const html = buildCheckoutConfirmEmail(sections);
  const results = await Promise.all(recipients.map(to => sendEmail(
    to,
    first.registration_code,
    `Registrations Confirmed - The IT Run Sprint-2 (${sections.length} registrations)`,
    html,
    false,
    true,
  )));
  const failed = results.filter(r => !r.ok);
  if (failed.length > 0) {
    await db.from("it_run_registrations").update({ confirmation_email_sent_at: null }).in("id", claimedIds);
    console.error(JSON.stringify({ src: "it-run-email", kind: "checkout_confirmation", outcome: "send_failed", failed: failed.length, of: recipients.length, httpStatus: failed[0]?.httpStatus ?? null }));
    return;
  }
  console.log(JSON.stringify({ src: "it-run-email", kind: "checkout_confirmation", outcome: "sent", registrations: sections.length, recipients: recipients.length }));
}
