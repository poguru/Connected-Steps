import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { expiryReminderEmailHTML } from "@/lib/notify";
import { createNotification } from "@/lib/notify-inapp";
import { paginateAll } from "@/lib/paginate";
import { acquireCronLock } from "@/lib/cron-lock";

const PLAN_LABELS: Record<string, string> = {
  monthly:   "Monthly",
  quarterly: "3 Months",
  biannual:  "6 Months",
  annual:    "12 Months",
};

// Runs daily at 7am IST via Vercel Cron (vercel.json)
// Sends reminders at 7 days and 1 day before expiry
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startMs = Date.now();
  const db      = getSupabaseServer();
  const now     = new Date();

  // Execution-protection: one run per calendar day (UTC).
  const executionDate = now.toISOString().slice(0, 10);
  const acquired = await acquireCronLock("expiry-reminders", executionDate);
  if (!acquired) {
    console.log(`[expiry-reminders] already ran for ${executionDate} — skipping`);
    return NextResponse.json({ skipped: true, reason: "already_ran", date: executionDate });
  }

  const results: { email: string; days: number; ok: boolean }[] = [];

  let totalPages = 0;

  for (const daysAhead of [7, 1]) {
    const from = new Date(now);
    from.setDate(from.getDate() + daysAhead);
    from.setHours(0, 0, 0, 0);

    const to = new Date(from);
    to.setHours(23, 59, 59, 999);

    // Paginated: unlikely to have 1000+ expirations on a single day today,
    // but guards against bulk imports or future scale.
    const { rows: memberships, pages } = await paginateAll<{ user_email: string; plan: string; expires_at: string }>(
      (rangeFrom, rangeTo) =>
        db.from("memberships")
          .select("user_email, plan, expires_at")
          .eq("status", "active")
          .gte("expires_at", from.toISOString())
          .lte("expires_at", to.toISOString())
          .order("user_email")
          .range(rangeFrom, rangeTo),
    );
    totalPages += pages;

    if (!memberships.length) continue;

    const emails = memberships.map((m) => m.user_email);
    const { data: users } = await db
      .from("users")
      .select("email, first_name, last_name")
      .in("email", emails);

    const userMap = Object.fromEntries((users ?? []).map((u) => [u.email, u]));

    for (const m of memberships) {
      const u = userMap[m.user_email];
      if (!u) continue;

      const name      = `${u.first_name} ${u.last_name}`.trim() || "there";
      const planLabel = PLAN_LABELS[m.plan] ?? m.plan;

      const ok = await sendExpiryEmail(m.user_email, name, planLabel, m.expires_at, daysAhead);

      // In-app notification (fire-and-forget)
      createNotification({
        user_email: m.user_email,
        type:       "membership_expiry",
        title:      `Your membership expires in ${daysAhead} day${daysAhead === 1 ? "" : "s"}`,
        body:       `Your ${planLabel} plan ends soon. Renew to keep your coach, training plan, and free run access.`,
        action_url: "/pricing",
      }).catch(() => {});

      results.push({ email: m.user_email, days: daysAhead, ok });
    }
  }

  console.log(
    `[expiry-reminders] reminded=${results.length} pages=${totalPages}` +
    ` duration=${Date.now() - startMs}ms`,
  );
  return NextResponse.json({ ok: true, reminded: results.length, results });
}

async function sendExpiryEmail(
  email: string,
  name: string,
  plan: string,
  expiresAt: string,
  daysLeft: number,
): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return false;

  const from    = process.env.RESEND_FROM_EMAIL ?? "Connected Steps <noreply@connectedsteps.in>";
  const subject = `Your membership expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"} – Connected Steps`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from,
        to:      [email],
        subject,
        html:    expiryReminderEmailHTML(name, plan, expiresAt, daysLeft),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
