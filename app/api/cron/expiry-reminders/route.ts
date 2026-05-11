import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { sendEmail, sendWhatsApp, expiryReminderEmailHTML } from "@/lib/notify";

const PLAN_LABELS: Record<string, string> = {
  monthly:   "Monthly",
  quarterly: "3 Months",
  biannual:  "6 Months",
  annual:    "12 Months",
};

// Runs daily at 7am IST via Vercel Cron (vercel.json)
export async function GET(req: NextRequest) {
  // Verify this is called by Vercel Cron or an authorised trigger
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db  = getSupabaseServer();
  const now = new Date();

  // Find memberships expiring in exactly 7 days and exactly 1 day (two reminder windows)
  const results: { email: string; days: number; sent: string[] }[] = [];

  for (const daysAhead of [7, 1]) {
    const from = new Date(now);
    from.setDate(from.getDate() + daysAhead);
    from.setHours(0, 0, 0, 0);

    const to = new Date(from);
    to.setHours(23, 59, 59, 999);

    const { data: memberships } = await db
      .from("memberships")
      .select("user_email, plan, expires_at")
      .eq("status", "active")
      .gte("expires_at", from.toISOString())
      .lte("expires_at", to.toISOString());

    if (!memberships || memberships.length === 0) continue;

    // Get user details
    const emails = memberships.map((m) => m.user_email);
    const { data: users } = await db
      .from("users")
      .select("email, first_name, last_name, phone")
      .in("email", emails);

    const userMap = Object.fromEntries((users ?? []).map((u) => [u.email, u]));

    for (const m of memberships) {
      const u = userMap[m.user_email];
      if (!u) continue;

      const name      = `${u.first_name} ${u.last_name}`.trim() || "there";
      const planLabel = PLAN_LABELS[m.plan] ?? m.plan;
      const sent: string[] = [];

      // Email reminder
      const emailResult = await sendEmail(
        m.user_email,
        name,
        `Your membership expires in ${daysAhead} day${daysAhead === 1 ? "" : "s"} – Connected Steps`,
        expiryReminderEmailHTML(name, planLabel, m.expires_at, daysAhead)
      );
      if (emailResult.ok) sent.push("email");

      // WhatsApp reminder (uses membership_expiry template — create in MSG91)
      if (u.phone?.trim()) {
        const waResult = await sendWhatsApp(u.phone, [
          name,
          planLabel,
          new Date(m.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
          String(daysAhead),
        ]);
        if (waResult.ok) sent.push("whatsapp");
      }

      results.push({ email: m.user_email, days: daysAhead, sent });
    }
  }

  console.log("Expiry reminders sent:", JSON.stringify(results));
  return NextResponse.json({ ok: true, reminded: results.length, results });
}
