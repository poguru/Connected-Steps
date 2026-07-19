/**
 * HTML email template for the next-day session reminder.
 * Sent by the session-reminders cron at 6 PM IST the day before each session.
 */
export function sessionReminderEmailHTML(
  name:    string,
  title:   string,
  dateStr: string,  // e.g. "Tuesday, 20 July 2026"
  timeStr: string,  // e.g. "6:00 AM"
  venue:   string,
  joinUrl: string,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Tomorrow's Training Session - Connected Steps</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

      <!-- Header -->
      <tr>
        <td style="background:#0a0a0a;padding:28px 40px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.3px;">Connected Steps</div>
          <div style="font-size:11px;color:#e8620a;letter-spacing:0.12em;text-transform:uppercase;margin-top:4px;">Your Goal, Our Plan</div>
        </td>
      </tr>
      <tr><td style="height:4px;background:#e8620a;"></td></tr>

      <!-- Banner -->
      <tr>
        <td style="background:linear-gradient(135deg,#fff8f3,#fff0e0);padding:22px 40px;text-align:center;border-bottom:1px solid #ffe5cc;">
          <div style="font-size:32px;margin-bottom:6px;">&#127939;</div>
          <div style="font-size:17px;font-weight:800;color:#c05c00;letter-spacing:-0.2px;">Tomorrow's Session is Ready!</div>
          <div style="font-size:13px;color:#d97706;margin-top:5px;">Gear up and show up strong &#128170;</div>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:32px 40px 28px;">
          <p style="margin:0 0 8px;font-size:15px;color:#555;">Hi <strong>${name}</strong>,</p>
          <p style="margin:0 0 26px;font-size:15px;color:#555;line-height:1.6;">
            Your training session is tomorrow. Here are the details &mdash; we can&rsquo;t wait to see you on the track!
          </p>

          <!-- Session card -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e5e5;border-radius:10px;overflow:hidden;margin-bottom:24px;">
            <tr>
              <td style="background:#e8620a;padding:14px 24px;">
                <div style="font-size:11px;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:3px;">Session</div>
                <div style="font-size:18px;font-weight:700;color:#fff;">${title}</div>
              </td>
            </tr>
            <tr>
              <td style="background:#f9f9f9;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:14px 24px;border-right:1px solid #e5e5e5;border-bottom:1px solid #e5e5e5;width:50%;vertical-align:top;">
                      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">&#128197; Date</div>
                      <div style="font-size:14px;font-weight:600;color:#0a0a0a;">${dateStr}</div>
                    </td>
                    <td style="padding:14px 24px;border-bottom:1px solid #e5e5e5;width:50%;vertical-align:top;">
                      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">&#128336; Start Time</div>
                      <div style="font-size:14px;font-weight:600;color:#0a0a0a;">${timeStr}</div>
                    </td>
                  </tr>
                  <tr>
                    <td colspan="2" style="padding:14px 24px;">
                      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">&#128205; Location</div>
                      <div style="font-size:14px;font-weight:600;color:#0a0a0a;">${venue}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- What to bring -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8f0;border:1px solid #fde0bc;border-radius:10px;margin-bottom:28px;">
            <tr>
              <td style="padding:16px 20px;">
                <div style="font-size:12px;font-weight:700;color:#c05c00;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">What to Bring</div>
                <div style="font-size:13px;color:#7a4000;line-height:1.8;">
                  &#128095;&nbsp; Running shoes &amp; comfortable clothes<br/>
                  &#128167;&nbsp; Water bottle &mdash; stay hydrated!<br/>
                  &#9203;&nbsp; Arrive 10 minutes early for warm-up
                </div>
              </td>
            </tr>
          </table>

          <!-- CTA -->
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
            <tr>
              <td style="background:#e8620a;border-radius:8px;">
                <a href="${joinUrl}" style="display:block;padding:14px 40px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;">
                  View Session Details &rarr;
                </a>
              </td>
            </tr>
          </table>

          <p style="margin:0;font-size:14px;color:#888;line-height:1.6;text-align:center;">
            Sleep well tonight and come ready to run! &#127939;
          </p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#f9f9f9;border-top:1px solid #e5e5e5;padding:20px 40px;text-align:center;">
          <p style="margin:0 0 6px;font-size:12px;color:#aaa;">Connected Steps &middot; Hyderabad, India</p>
          <p style="margin:0;font-size:11px;color:#ccc;">
            You received this because you registered for this session. &middot;
            <a href="https://www.connectedsteps.in" style="color:#e8620a;text-decoration:none;">connectedsteps.in</a>
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}
