import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { getSupabaseServer } from "@/lib/supabase-server";
import { sendWhatsApp, sessionWAParams } from "@/lib/notify";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { createNotifications } from "@/lib/notify-inapp";

// Lazy VAPID init â€” only called when push is actually needed,
// so missing env vars don't crash the module at build time.
function initWebPush(): boolean {
  const pub  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails("mailto:connected.steps2106@gmail.com", pub, priv);
  return true;
}

export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getSupabaseServer();

  const sp    = req.nextUrl.searchParams;
  const limit = Math.max(0, parseInt(sp.get("limit") ?? "0", 10));
  const page  = Math.max(0, parseInt(sp.get("page")  ?? "0", 10));

  let q = db.from("sessions").select("*").order("date", { ascending: false });
  if (limit > 0) q = q.range(page * limit, page * limit + limit - 1);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Backward-compatible: no pagination params â†’ same { data } shape as before.
  return NextResponse.json(
    limit > 0
      ? { data, page, limit, hasMore: (data?.length ?? 0) >= limit }
      : { data }
  );
}

export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { title, date, time, location, venue } = await req.json();
  if (!title || !date || !location) {
    return NextResponse.json({ error: "title, date and location are required." }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("sessions")
    .insert({ title, date, time: time || null, location, venue: venue || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Fire-and-forget â€” send email to all registered users, don't block the response
  sendSessionAnnouncementEmails(db, {
    id:       data.id,
    title,
    date,
    time:     time || null,
    venue:    venue || null,
    location,
  }).catch(e => console.error("Session announcement email error:", e));

  return NextResponse.json({ data });
}

// â”€â”€ Session announcement emails (Resend) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function sendSessionAnnouncementEmails(
  db: ReturnType<typeof getSupabaseServer>,
  session: { id: string; title: string; date: string; time: string | null; venue: string | null; location: string }
) {
  // Fetch all registered users â€” needed for both in-app notifications and emails
  const { data: users, error } = await db
    .from("users")
    .select("email, first_name, last_name")
    .not("email", "is", null);

  if (error || !users || users.length === 0) {
    console.log("No users found for session announcement");
    return;
  }

  const displayVenueInApp = session.venue || session.location;
  const dateStrShort = new Date(session.date + "T12:00:00Z").toLocaleDateString("en-IN", {
    day: "numeric", month: "short", weekday: "short",
  });

  // In-app + push notifications for all users (always runs, independent of email config)
  createNotifications(
    users.map(u => ({ email: u.email })),
    "new_session",
    `New Session: ${session.title}`,
    `${displayVenueInApp} Â· ${dateStrShort}${session.time ? ` at ${session.time}` : ""}. Tap to register!`,
    `/join/${session.id}`,
  ).catch(e => console.error("[admin/sessions] in-app notification error:", e));

  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";
  const joinUrl   = `${appUrl}/join/${session.id}`;

  const dateStr = new Date(session.date + "T12:00:00Z").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const displayVenue = session.venue || session.location;

  // Resend batch API â€” up to 100 emails per request, avoids per-call rate limits
  const BATCH_SIZE = 100;
  let sent = 0, failed = 0;

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const chunk = users.slice(i, i + BATCH_SIZE);
    const batch = chunk.map(u => {
      const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "there";
      return {
        from:    `${process.env.ZEPTOMAIL_FROM_NAME ?? “Connected Steps”} <${process.env.ZEPTOMAIL_FROM_EMAIL ?? “info@connectedsteps.in”}>`,
        to:      [u.email],
        subject: `New Session: ${session.title} – Connected Steps`,
        html:    buildAnnouncementEmail(name, session.title, dateStr, session.time, displayVenue, joinUrl),
      };
    });

    const { sendBatchEmails } = await import("@/lib/email-service");
    const { sent: s, failed: f } = await sendBatchEmails(batch);
    sent   += s;
    failed += f;
  }

  console.log(`Session announcement emails: ${sent} sent, ${failed} failed (${users.length} total users)`);
}

function buildAnnouncementEmail(
  name: string,
  title: string,
  dateStr: string,
  time: string | null,
  venue: string,
  joinUrl: string
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>New Session â€” Connected Steps</title>
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

      <!-- Body -->
      <tr>
        <td style="padding:40px 40px 32px;">
          <p style="margin:0 0 8px;font-size:15px;color:#555;">Hi <strong>${name}</strong>,</p>
          <p style="margin:0 0 28px;font-size:15px;color:#555;line-height:1.6;">
            A new training session has been scheduled. Lace up and join us! ðŸƒ
          </p>

          <!-- Session card -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden;margin-bottom:32px;">
            <tr>
              <td style="padding:20px 24px;border-bottom:1px solid #e5e5e5;">
                <div style="font-size:11px;color:#e8620a;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Session</div>
                <div style="font-size:20px;font-weight:700;color:#0a0a0a;">${title}</div>
              </td>
            </tr>
            <tr>
              <td>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:16px 24px;border-right:1px solid #e5e5e5;width:50%;vertical-align:top;">
                      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">ðŸ“… Date</div>
                      <div style="font-size:14px;font-weight:600;color:#0a0a0a;">${dateStr}</div>
                      ${time ? `<div style="font-size:12px;color:#666;margin-top:2px;">ðŸ• ${time}</div>` : ""}
                    </td>
                    <td style="padding:16px 24px;width:50%;vertical-align:top;">
                      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">ðŸ“ Venue</div>
                      <div style="font-size:14px;font-weight:600;color:#0a0a0a;">${venue}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- CTA -->
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
            <tr>
              <td style="background:#e8620a;border-radius:6px;">
                <a href="${joinUrl}"
                   style="display:block;padding:14px 40px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;">
                  Register for this session â†’
                </a>
              </td>
            </tr>
          </table>

          <p style="margin:0;font-size:14px;color:#888;line-height:1.6;text-align:center;">
            See you on the track! Keep running, keep growing. ðŸ…
          </p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#f9f9f9;border-top:1px solid #e5e5e5;padding:20px 40px;text-align:center;">
          <p style="margin:0 0 6px;font-size:12px;color:#aaa;">Connected Steps Â· Hyderabad, India</p>
          <p style="margin:0;font-size:11px;color:#ccc;">
            You received this because you are a registered Connected Steps member. Â·
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

// â”€â”€ WhatsApp + push â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function notifyUsers(
  db: ReturnType<typeof import("@/lib/supabase-server").getSupabaseServer>,
  sessionId: string,
  title: string,
  date: string,
  time: string | null,
  displayLocation: string,
  filterLocation: string
) {
  const { data: users } = await db
    .from("users")
    .select("first_name, last_name, email, phone")
    .ilike("location", `%${filterLocation}%`);

  if (!users || users.length === 0) return;

  const waResults = await Promise.allSettled(
    users
      .filter((u) => u.phone?.trim())
      .map((u) => {
        const name = `${u.first_name} ${u.last_name}`.trim() || "there";
        return sendWhatsApp(u.phone!, sessionWAParams(name, title, date, time, displayLocation));
      })
  );
  const waSent = waResults.filter((r) => r.status === "fulfilled" && (r as PromiseFulfilledResult<{ ok: boolean }>).value.ok).length;
  console.log(`WhatsApp: ${waSent}/${waResults.length} sent`);

  const emails = users.map((u) => u.email?.toLowerCase()).filter(Boolean);
  if (emails.length > 0) {
    const { data: subs } = await db
      .from("push_subscriptions")
      .select("subscription")
      .in("user_email", emails);

    if (subs && subs.length > 0 && initWebPush()) {
      const payload = JSON.stringify({
        title: "New Session â€“ Connected Steps",
        body:  `${title} at ${displayLocation}. Tap to register.`,
        icon:  "/logo.png",
        url:   `/join/${sessionId}`,
      });
      const pushResults = await Promise.allSettled(
        subs.map((s) => webpush.sendNotification(s.subscription, payload))
      );
      console.log(`Push: ${pushResults.filter(r => r.status === "fulfilled").length}/${subs.length} sent`);
    }
  }
}

// Keep reference to avoid TS unused warning
void notifyUsers;
