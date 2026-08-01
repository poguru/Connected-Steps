// Cron: daily at 9:00 AM IST (03:30 UTC)
// Finds users whose birth_day and birth_month match today's IST date,
// sends them a birthday email and/or WhatsApp based on app_settings toggles,
// and records the send date to prevent duplicate sends on the same calendar day.
//
// vercel.json entry:
// { "path": "/api/cron/birthday-wishes", "schedule": "30 3 * * *" }

import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";
import { sendEmail, sendWhatsApp, birthdayEmailHTML, birthdayWAParams } from "@/lib/notify";

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();

  // Today in IST (UTC+5:30)
  const nowUtc    = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const nowIst    = new Date(nowUtc.getTime() + istOffset);
  const todayDay   = nowIst.getUTCDate();
  const todayMonth = nowIst.getUTCMonth() + 1;
  const todayStr   = nowIst.toISOString().slice(0, 10);   // YYYY-MM-DD in IST

  console.log(`[birthday-wishes] starting for IST date=${todayStr} (day=${todayDay} month=${todayMonth})`);

  // ── Cron lock (dedup across retries) ────────────────────────────────────────
  const locked = await acquireCronLock("birthday-wishes", todayStr);
  if (!locked) {
    console.log(`[birthday-wishes] already ran for ${todayStr} — skipping`);
    return NextResponse.json({ skipped: true, reason: "already_ran_today" });
  }

  try {
    // ── App settings ──────────────────────────────────────────────────────────
    const { data: settings } = await db
      .from("app_settings")
      .select("key, value")
      .in("key", ["birthday_email_enabled", "birthday_wa_enabled", "birthday_wa_template", "birthday_post_enabled"]);

    const settingsMap: Record<string, string> = {};
    for (const row of settings ?? []) settingsMap[row.key] = row.value;

    const emailEnabled = settingsMap["birthday_email_enabled"] !== "false";
    const waEnabled    = settingsMap["birthday_wa_enabled"]    !== "false";
    const waTemplate   = settingsMap["birthday_wa_template"]   ?? "birthday_wishes";
    const postEnabled  = settingsMap["birthday_post_enabled"]  !== "false";

    console.log(`[birthday-wishes] channels: email=${emailEnabled} whatsapp=${waEnabled}`);

    if (!emailEnabled && !waEnabled) {
      await releaseCronLock("birthday-wishes", todayStr);
      console.log("[birthday-wishes] both channels disabled — releasing lock and skipping");
      return NextResponse.json({ skipped: true, reason: "both_channels_disabled" });
    }

    // ── Fetch birthday users ──────────────────────────────────────────────────
    // Match only birth_day and birth_month — never the year.
    // Excludes users who already received the notification today (dedup columns).
    const { data: users, error: fetchError } = await db
      .from("users")
      .select("email, first_name, phone, location, birthday_email_sent, birthday_wa_sent, birthday_post_sent, birthday_privacy")
      .eq("birth_day",   todayDay)
      .eq("birth_month", todayMonth)
      .not("email", "is", null);

    if (fetchError) {
      console.error(`[birthday-wishes] failed to fetch users: ${fetchError.message}`);
      await releaseCronLock("birthday-wishes", todayStr);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const birthday = users ?? [];
    console.log(`[birthday-wishes] matched ${birthday.length} users with birthday today (${todayStr})`);

    const results = {
      total:        birthday.length,
      emailSent:    0,
      emailSkipped: 0,
      emailFailed:  0,
      waSent:       0,
      waSkipped:    0,
      waFailed:     0,
      postCreated:  0,
      postSkipped:  0,
      errors:       [] as string[],
    };

    for (const user of birthday) {
      const firstName = (user.first_name as string | null) ?? "Runner";
      const email     = user.email as string;
      const phone     = (user.phone as string | null) ?? "";

      // ── Birthday email ────────────────────────────────────────────────────
      if (emailEnabled) {
        if (user.birthday_email_sent === todayStr) {
          console.log(`[birthday-wishes] email already sent today for ${email} — skipping`);
          results.emailSkipped++;
        } else {
          // sendEmail never throws — always returns { ok, error }
          const result = await sendEmail(
            email, firstName,
            `🎉 Happy Birthday, ${firstName}! From Connected Steps`,
            birthdayEmailHTML(firstName),
            false,  // isOtp
            false,  // isTransactional — birthday emails are non-transactional
            `${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in"}/api/unsubscribe?email=${encodeURIComponent(email)}`,
          );

          if (result.ok) {
            await db.from("users")
              .update({ birthday_email_sent: todayStr })
              .eq("email", email);
            results.emailSent++;
            console.log(`[birthday-wishes] email sent to ${email}`);
          } else {
            results.emailFailed++;
            const errMsg = `email:${email}:${result.error ?? "unknown"}`;
            results.errors.push(errMsg);
            console.error(`[birthday-wishes] email FAILED for ${email}: ${result.error}`);
          }
        }
      }

      // ── Birthday WhatsApp ─────────────────────────────────────────────────
      if (waEnabled && phone) {
        const phoneDigits = phone.replace(/\D/g, "");
        if (user.birthday_wa_sent === todayStr) {
          console.log(`[birthday-wishes] WhatsApp already sent today for ${email} — skipping`);
          results.waSkipped++;
        } else if (phoneDigits.length >= 10) {
          const normalized = phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits;
          const waResult = await sendWhatsApp(
            normalized,
            birthdayWAParams(firstName),
            waTemplate,
          );

          if (waResult.ok) {
            await db.from("users")
              .update({ birthday_wa_sent: todayStr })
              .eq("email", email);
            results.waSent++;
            console.log(`[birthday-wishes] WhatsApp sent to ${normalized} (${email})`);
          } else {
            results.waFailed++;
            const errMsg = `wa:${email}:${waResult.error ?? "unknown"}`;
            results.errors.push(errMsg);
            console.error(`[birthday-wishes] WhatsApp FAILED for ${email} (${normalized}): ${waResult.error}`);
          }
        } else {
          console.log(`[birthday-wishes] skipping WhatsApp for ${email} — invalid phone: "${phone}"`);
        }
      }

      // ── Birthday community feed post ──────────────────────────────────────
      if (postEnabled) {
        const privacy = (user.birthday_privacy as string | null) ?? "community";
        if (privacy === "hidden") {
          results.postSkipped++;
          console.log(`[birthday-wishes] post skipped for ${email} — privacy=hidden`);
        } else if (user.birthday_post_sent === todayStr) {
          results.postSkipped++;
          console.log(`[birthday-wishes] post already created today for ${email} — skipping`);
        } else {
          // Fetch session count and months active for the post body
          const [{ count: sessionCount }, { data: userData }] = await Promise.all([
            db.from("session_attendance")
              .select("*", { count: "exact", head: true })
              .eq("user_email", email)
              .eq("attended", true),
            db.from("users")
              .select("created_at")
              .eq("email", email)
              .single(),
          ]);

          const monthsActive = userData?.created_at
            ? Math.round((Date.now() - new Date(userData.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30))
            : 0;
          const sessions = sessionCount ?? 0;

          // Look up the user's primary training location
          const { data: locationRow } = await db
            .from("user_location_assignments")
            .select("location_id, training_locations(name)")
            .eq("user_email", email)
            .eq("is_primary", true)
            .single();

          const locationId   = locationRow?.location_id ?? null;
          const locData = locationRow?.training_locations as { name: string }[] | undefined;
          const locationName = locData?.[0]?.name ?? (user.location as string | null) ?? "Connected Steps";

          const bodyLines: string[] = [
            `🎂 Happy Birthday, ${firstName}!`,
            "",
            `Join us in wishing ${firstName} a fantastic year ahead filled with PBs, medals, and strong runs! 🏃‍♂️🏅`,
            "",
            `📍 ${locationName}`,
          ];
          if (monthsActive > 0) bodyLines.push(`🎉 Running with Connected Steps for ${monthsActive} month${monthsActive !== 1 ? "s" : ""}`);
          if (sessions > 0)     bodyLines.push(`🏃 Completed ${sessions} session${sessions !== 1 ? "s" : ""}`);

          const { error: postError } = await db.from("user_posts").insert({
            author_email: email,
            author_name:  firstName,
            post_type:    "birthday",
            body:         bodyLines.join("\n"),
            approved:     true,
            location_id:  locationId,
          });

          if (postError) {
            results.errors.push(`post:${email}:${postError.message}`);
            console.error(`[birthday-wishes] post FAILED for ${email}: ${postError.message}`);
          } else {
            await db.from("users").update({ birthday_post_sent: todayStr }).eq("email", email);
            results.postCreated++;
            console.log(`[birthday-wishes] feed post created for ${email} at location ${locationId ?? "none"}`);

            // Notify community members at the same location (max 50)
            if (locationId) {
              const { data: locationMembers } = await db
                .from("user_location_assignments")
                .select("user_email")
                .eq("location_id", locationId)
                .neq("user_email", email)
                .limit(50);

              if (locationMembers && locationMembers.length > 0) {
                const notifs = locationMembers.map(m => ({
                  user_email: m.user_email,
                  type:       "birthday",
                  title:      `🎂 It's ${firstName}'s birthday!`,
                  body:       `Wish ${firstName} a happy birthday 🎉`,
                  action_url: "/feed",
                }));
                await db.from("notifications").insert(notifs);
                console.log(`[birthday-wishes] sent ${notifs.length} in-app notifications for ${email}'s birthday`);
              }
            }
          }
        }
      }
    }

    console.log(`[birthday-wishes] done date=${todayStr} emailSent=${results.emailSent} emailFailed=${results.emailFailed} waSent=${results.waSent} waFailed=${results.waFailed} postCreated=${results.postCreated} errors=${results.errors.length}`);

    return NextResponse.json({ ok: true, date: todayStr, ...results });
  } catch (err) {
    console.error(`[birthday-wishes] unexpected error:`, err);
    await releaseCronLock("birthday-wishes", todayStr);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
