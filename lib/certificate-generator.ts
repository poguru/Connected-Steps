/**
 * Certificate HTML generator for Connected Steps events.
 *
 * Produces a self-contained HTML certificate that:
 *   • Renders beautifully in any browser
 *   • Prints cleanly via Ctrl+P / browser print dialog
 *   • Can be shared as a link (stored in Supabase Storage)
 *   • Works as a PDF when printed (A4, landscape)
 *
 * No external PDF libraries required — the browser does the conversion.
 */

export interface CertificateOptions {
  participantName:   string;
  eventTitle:        string;
  eventDate:         string;        // "2026-06-28"
  eventLocation:     string;
  distance:          string;        // "5K", "10K", "21.1K"
  finishTime?:       string;        // "01:23:45" — null for DNS/DNF
  pace?:             string;        // "5:32 /km"
  overallPosition?:  number;
  categoryPosition?: number;
  status:            string;        // "finisher" | "dnf" | "dns" | "dq"
  registrationCode:  string;
  appUrl?:           string;
}

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function generateCertificateHTML(opts: CertificateOptions): string {
  const {
    participantName, eventTitle, eventDate, eventLocation,
    distance, finishTime, pace, overallPosition, categoryPosition,
    status, registrationCode, appUrl = "https://www.connectedsteps.in",
  } = opts;

  const isFinisher  = status === "finisher";
  const dateStr     = formatDate(eventDate);
  const accentColor = "#e8620a";

  const achievementLine = isFinisher
    ? `Successfully completed the <strong>${distance}</strong> at`
    : `Participated in`;

  const positionBlock = isFinisher && (overallPosition || categoryPosition) ? `
    <div style="display:flex;gap:32px;justify-content:center;margin:20px 0;">
      ${overallPosition ? `<div style="text-align:center;"><div style="font-size:36px;font-weight:900;color:${accentColor};">${ordinal(overallPosition)}</div><div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.1em;font-weight:600;">Overall</div></div>` : ""}
      ${categoryPosition ? `<div style="text-align:center;"><div style="font-size:36px;font-weight:900;color:#555;">${ordinal(categoryPosition)}</div><div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.1em;font-weight:600;">${distance} Category</div></div>` : ""}
    </div>
  ` : "";

  const timingBlock = isFinisher && finishTime ? `
    <div style="margin:20px auto;display:inline-block;background:#f9f9f9;border:1px solid #eee;border-radius:12px;padding:16px 32px;text-align:center;">
      <div style="font-size:13px;color:#888;text-transform:uppercase;letter-spacing:.1em;font-weight:600;margin-bottom:4px;">Finish Time</div>
      <div style="font-size:42px;font-weight:900;color:#0a0a0a;font-variant-numeric:tabular-nums;letter-spacing:2px;">${finishTime}</div>
      ${pace ? `<div style="font-size:14px;color:#888;margin-top:4px;">${pace}</div>` : ""}
    </div>
  ` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Certificate — ${participantName} — ${eventTitle}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', system-ui, sans-serif;
    background: #f4f4f0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
  }

  .cert {
    background: #fff;
    width: 100%;
    max-width: 780px;
    border-radius: 20px;
    box-shadow: 0 4px 48px rgba(0,0,0,0.12);
    overflow: hidden;
    position: relative;
  }

  /* Top accent stripe */
  .cert::before {
    content: '';
    display: block;
    height: 8px;
    background: linear-gradient(90deg, ${accentColor} 0%, #ffa040 100%);
  }

  .inner { padding: 52px 64px; text-align: center; }

  .logo-area { margin-bottom: 32px; display: flex; align-items: center; justify-content: center; gap: 12px; }
  .logo-area img { width: 48px; height: 48px; border-radius: 50%; }
  .logo-area .brand { font-size: 18px; font-weight: 900; color: #0a0a0a; letter-spacing: -.3px; }
  .logo-area .tag   { font-size: 11px; font-weight: 700; color: ${accentColor}; text-transform: uppercase; letter-spacing: .12em; }

  .cert-title { font-size: 11px; font-weight: 700; color: #bbb; text-transform: uppercase; letter-spacing: .2em; margin-bottom: 20px; }

  .participant-name {
    font-size: 44px;
    font-weight: 900;
    color: #0a0a0a;
    letter-spacing: -1px;
    line-height: 1.1;
    margin-bottom: 16px;
  }

  .achievement {
    font-size: 15px;
    color: #555;
    line-height: 1.7;
    margin-bottom: 4px;
  }

  .event-name {
    font-size: 22px;
    font-weight: 800;
    color: #0a0a0a;
    margin-bottom: 6px;
  }

  .event-meta { font-size: 13px; color: #888; margin-bottom: 28px; }

  .divider { border: none; border-top: 1px solid #f0f0f0; margin: 28px 0; }

  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 64px 32px;
    background: #fafafa;
    border-top: 1px solid #f0f0f0;
  }

  .footer-item { text-align: left; }
  .footer-label { font-size: 10px; color: #bbb; text-transform: uppercase; letter-spacing: .1em; font-weight: 700; margin-bottom: 4px; }
  .footer-value { font-size: 13px; color: #333; font-weight: 600; }

  .verify-link { font-size: 11px; color: #bbb; margin-top: 4px; }
  .verify-link a { color: ${accentColor}; text-decoration: none; }

  /* Watermark */
  .watermark {
    position: absolute;
    bottom: 60px;
    right: 60px;
    width: 120px;
    height: 120px;
    opacity: 0.04;
    pointer-events: none;
  }

  @media print {
    @page { size: A4 landscape; margin: 0; }
    body { background: white; padding: 0; }
    .cert { box-shadow: none; border-radius: 0; max-width: 100%; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>

<div class="cert">
  <div class="inner">

    <div class="logo-area">
      <img src="${appUrl}/logo.png" alt="Connected Steps" onerror="this.style.display='none'" />
      <div>
        <div class="brand">Connected Steps</div>
        <div class="tag">Certificate of Achievement</div>
      </div>
    </div>

    <div class="cert-title">Certificate of ${isFinisher ? "Completion" : "Participation"}</div>

    <div class="participant-name">${participantName}</div>

    <p class="achievement">${achievementLine}</p>
    <div class="event-name">${eventTitle}</div>
    <div class="event-meta">📅 ${dateStr} &nbsp;·&nbsp; 📍 ${eventLocation}</div>

    ${timingBlock}
    ${positionBlock}

    <hr class="divider" />

    <p style="font-size:12px;color:#bbb;">This certifies that the above participant completed the event in accordance with the race rules.</p>

  </div>

  <div class="footer">
    <div class="footer-item">
      <div class="footer-label">Registration</div>
      <div class="footer-value" style="font-family:monospace;">${registrationCode}</div>
      <div class="verify-link">Verify at <a href="${appUrl}">${appUrl}</a></div>
    </div>

    <div class="footer-item" style="text-align:center;">
      <div class="footer-label">Distance</div>
      <div class="footer-value" style="font-size:20px;color:${accentColor};">${distance}</div>
    </div>

    <div class="footer-item" style="text-align:right;">
      <div class="footer-label">Event Date</div>
      <div class="footer-value">${dateStr.split(",").slice(-2).join(",").trim()}</div>
      <div class="verify-link" style="margin-top:8px;">
        <button onclick="window.print()" class="no-print" style="padding:6px 16px;background:${accentColor};border:none;border-radius:6px;color:#fff;font-weight:700;font-size:12px;cursor:pointer;">
          🖨 Print / Save PDF
        </button>
      </div>
    </div>
  </div>

  <!-- Decorative watermark -->
  <svg class="watermark" viewBox="0 0 100 100" fill="${accentColor}">
    <circle cx="50" cy="50" r="45" fill="none" stroke="${accentColor}" stroke-width="3"/>
    <text x="50" y="55" text-anchor="middle" font-size="18" font-weight="900" fill="${accentColor}">CS</text>
  </svg>
</div>

</body>
</html>`;
}
