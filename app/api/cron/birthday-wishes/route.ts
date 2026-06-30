// Cron: daily at 7:00 AM IST (01:30 UTC)
// Finds users whose birth_day and birth_month match today's IST date,
// sends them a birthday email and/or WhatsApp based on app_settings toggles,
// and records the send date to prevent duplicate sends on the same day.
//
// vercel.json entry:
// { "path": "/api/cron/birthday-wishes", "schedule": "30 1 * * *" }

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";
import { sendEmail, sendWhatsApp, birthdayEmailHTML, birthdayWAParams } from "@/lib/notify";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabaseServer();

  // Today in IST (UTC+5:30)
  const nowUtc   = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const nowIst   = new Date(nowUtc.getTime() + istOffset);
  const todayDay   = nowIst.getUTCDate();
  const todayMonth = nowIst.getUTCMonth() + 1;
  const todayStr   = nowIst.toISOString().slice(0, 10);   // YYYY-MM-DD in IST

  // ── Cron lock (dedup across retries) ────────────────────────────────────────
  const locked = await acquireCronLock("birthday-wishes", todayStr);
  if (!locked) {
    return NextResponse.json({ skipped: true, reason: "already_ran_today" });
  }

  try {
    // ── App settings ──────────────────────────────────────────────────────────
    const { data: settings } = await db
      .from("app_settings")
      .select("key, value")
      .in("key", ["birthday_email_enabled", "birthday_wa_enabled", "birthday_wa_template"]);

    const settingsMap: Record<string, string> = {};
    for (const row of settings ?? []) settingsMap[row.key] = row.value;

    const emailEnabled = settingsMap["birthday_email_enabled"] !== "false";
    const waEnabled    = settingsMap["birthday_wa_enabled"]    !== "false";
    const waTemplate   = settingsMap["birthday_wa_template"]   ?? "birthday_wishes";

    if (!emailEnabled && !waEnabled) {
      await releaseCronLock("birthday-wishes", todayStr);
      return NextResponse.json({ skipped: true, reason: "both_channels_disabled" });
    }

    // ── Fetch birthday users ──────────────────────────────────────────────────
    // Exclude users who already received the notification today (dedup columns).
    const { data: users, error: fetchError } = await db
      .from("users")
      .select("email, first_name, phone, birthday_email_sent, birthday_wa_sent")
      .eq("birth_day",   todayDay)
      .eq("birth_month", todayMonth);

    if (fetchError) {
      await releaseCronLock("birthday-wishes", todayStr);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const birthday = users ?? [];

    const results = {
      total:        birthday.length,
      emailSent:    0,
      emailSkipped: 0,
      waSent:       0,
      waSkipped:    0,
      errors:       [] as string[],
    };

    for (const user of birthday) {
      const firstName = (user.first_name as string) ?? "Runner";
      const email     = user.email as string;
      const phone     = (user.phone as string) ?? "";

      // ── Birthday email ────────────────────────────────────────────────────
      if (emailEnabled) {
        if (user.birthday_email_sent === todayStr) {
          results.emailSkipped++;
        } else {
          try {
            await sendEmail(
              email, firstName,
              `🎉 Happy Birthday, ${firstName}! From Connected Steps`,
              birthdayEmailHTML(firstName),
              false,  // isOtp
              false,  // isTransactional — birthday emails are non-transactional
              `${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in"}/api/unsubscribe?email=${encodeURIComponent(email)}`,
            );
            await db.from("users")
              .update({ birthday_email_sent: todayStr })
              .eq("email", email);
            results.emailSent++;
          } catch (err) {
            results.errors.push(`email:${email}:${String(err)}`);
          }
        }
      }

      // ── Birthday WhatsApp ─────────────────────────────────────────────────
      if (waEnabled && phone) {
        const phoneDigits = phone.replace(/\D/g, "");
        if (user.birthday_wa_sent === todayStr) {
          results.waSkipped++;
        } else if (phoneDigits.length === 10) {
          try {
            await sendWhatsApp(
              `91${phoneDigits}`,
              birthdayWAParams(firstName),
              waTemplate,
            );
            await db.from("users")
              .update({ birthday_wa_sent: todayStr })
              .eq("email", email);
            results.waSent++;
          } catch (err) {
            results.errors.push(`wa:${email}:${String(err)}`);
          }
        }
      }
    }

    return NextResponse.json({ ok: true, date: todayStr, ...results });
  } catch (err) {
    await releaseCronLock("birthday-wishes", todayStr);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
