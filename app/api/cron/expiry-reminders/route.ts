import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { expiryReminderEmailHTML } from "@/lib/notify";
import { createNotification } from "@/lib/notify-inapp";
import { paginateAll } from "@/lib/paginate";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";

const PLAN_LABELS: Record<string, string> = {
  monthly:   "Monthly",
  quarterly: "3 Months",
  biannual:  "6 Months",
  annual:    "12 Months",
};

// Runs daily at 7am IST via Vercel Cron (vercel.json)
// Sends reminders at 7 days and 1 day before expiry
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const startMs = Date.now();
  const db      = getSupabaseServer();
  const now     = new Date();
  const executionDate = now.toISOString().slice(0, 10);

  // ── Phase 1: fetch all data (no lock held) ────────────────────────────────
  // All reads happen before lock acquisition.  A fetch failure here returns 500
  // with no lock written, so Vercel's retry fires against a clean slate.

  interface Pending {
    user_email: string;
    name:       string;
    planLabel:  string;
    expiresAt:  string;
    daysAhead:  number;
  }

  let totalPages = 0;
  const pending: Pending[] = [];

  for (const daysAhead of [7, 1]) {
    const from = new Date(now);
    from.setDate(from.getDate() + daysAhead);
    from.setHours(0, 0, 0, 0);

    const to = new Date(from);
    to.setHours(23, 59, 59, 999);

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
      pending.push({
        user_email: m.user_email,
        name:       `${u.first_name} ${u.last_name}`.trim() || "there",
        planLabel:  PLAN_LABELS[m.plan] ?? m.plan,
        expiresAt:  m.expires_at,
        daysAhead,
      });
    }
  }

  // Nothing expiring — return without writing a lock row.
  if (!pending.length) {
    console.log(`[expiry-reminders] nothing expiring pages=${totalPages} duration=${Date.now() - startMs}ms`);
    return NextResponse.json({ ok: true, reminded: 0, results: [] });
  }

  // ── Phase 2: acquire lock ─────────────────────────────────────────────────
  const acquired = await acquireCronLock("expiry-reminders", executionDate);
  if (!acquired) {
    console.log(`[expiry-reminders] already ran for ${executionDate} — skipping`);
    return NextResponse.json({ skipped: true, reason: "already_ran", date: executionDate });
  }

  // ── Phase 3: send (lock held) ─────────────────────────────────────────────
  // Re-check who was already notified today INSIDE the lock.  This handles the
  // retry scenario: a prior partial run may have sent some notifications before
  // failing.  Those users are in the notifications table — we filter them out
  // so no one gets a duplicate email or in-app notification.
  try {
    const allEmails  = pending.map(p => p.user_email);
    const dayStart   = executionDate + "T00:00:00.000Z";

    const { data: alreadySentRows } = await db
      .from("notifications")
      .select("user_email")
      .eq("type", "membership_expiry")
      .in("user_email", allEmails)
      .gte("created_at", dayStart);

    const alreadySentSet = new Set((alreadySentRows ?? []).map(n => n.user_email.toLowerCase()));
    const toSend = pending.filter(p => !alreadySentSet.has(p.user_email.toLowerCase()));

    if (!toSend.length) {
      // All users were already notified in a prior partial run — idempotent success.
      console.log(`[expiry-reminders] all ${pending.length} already notified today pages=${totalPages} duration=${Date.now() - startMs}ms`);
      return NextResponse.json({ ok: true, reminded: 0, results: [] });
    }

    // Send emails + notifications in parallel per user.
    // Bodies are personalised (plan label, days, expiry date) so we use
    // individual createNotification calls fired concurrently.
    const sendResults = await Promise.allSettled(
      toSend.map(async (p) => {
        const emailOk = await sendExpiryEmail(p.user_email, p.name, p.planLabel, p.expiresAt, p.daysAhead);
        createNotification({
          user_email: p.user_email,
          type:       "membership_expiry",
          title:      `Your membership expires in ${p.daysAhead} day${p.daysAhead === 1 ? "" : "s"}`,
          body:       `Your ${p.planLabel} plan ends soon. Renew to keep your coach, training plan, and free run access.`,
          action_url: "/pricing",
        }).catch(() => {});
        return { email: p.user_email, days: p.daysAhead, ok: emailOk };
      }),
    );

    const results = sendResults
      .filter((r): r is PromiseFulfilledResult<{ email: string; days: number; ok: boolean }> => r.status === "fulfilled")
      .map(r => r.value);

    console.log(
      `[expiry-reminders] reminded=${results.length} skipped=${alreadySentSet.size}` +
      ` pages=${totalPages} duration=${Date.now() - startMs}ms`,
    );
    return NextResponse.json({ ok: true, reminded: results.length, results });

  } catch (err: unknown) {
    await releaseCronLock("expiry-reminders", executionDate);
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[expiry-reminders] send error (lock released):", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function sendExpiryEmail(
  email: string,
  name: string,
  plan: string,
  expiresAt: string,
  daysLeft: number,
): Promise<boolean> {
  const { sendSingleEmail } = await import("@/lib/email-service");
  const subject = `Your membership expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"} – Connected Steps`;
  const result  = await sendSingleEmail({
    to:      email,
    subject,
    html:    expiryReminderEmailHTML(name, plan, expiresAt, daysLeft),
    // Expiry reminders are non-transactional — include unsubscribe header per RFC 2369
    listUnsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in"}/api/unsubscribe?email=${encodeURIComponent(email)}`,
  });
  return result.ok;
}
