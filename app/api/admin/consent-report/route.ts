import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

// GET /api/admin/consent-report?format=csv|json&filter=all|opted_in|opted_out
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const format = searchParams.get("format") ?? "json";
  const filter = searchParams.get("filter") ?? "all";

  const db = getSupabaseServer();

  // Join users with their preferences and consent state
  const { data: users, error } = await db.from("users")
    .select(`
      email, first_name, last_name, phone,
      marketing_consent, marketing_consent_at, marketing_consent_source,
      created_at,
      user_notification_preferences (
        email_events, email_training, email_reminders, email_marketing,
        email_community, email_partners, email_birthday, email_festive,
        wa_events, wa_training, wa_reminders, wa_marketing,
        wa_community, wa_partners, wa_birthday, wa_festive,
        updated_at
      )
    `)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(10000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type UserRow = NonNullable<typeof users>[number];

  let rows = (users ?? []).map((u: UserRow) => {
    const prefRaw = u.user_notification_preferences;
    const pref = (Array.isArray(prefRaw) ? prefRaw[0] : prefRaw) as Record<string, unknown> | null;
    return {
      email:                  u.email,
      name:                   `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim(),
      phone:                  u.phone ?? "",
      marketing_consent:      u.marketing_consent,
      marketing_consent_at:   u.marketing_consent_at,
      marketing_consent_source: u.marketing_consent_source,
      registered_at:          u.created_at,
      email_marketing:        (pref?.["email_marketing"] ?? false) as boolean,
      email_events:           (pref?.["email_events"]   ?? true)  as boolean,
      email_training:         (pref?.["email_training"] ?? true)  as boolean,
      email_community:        (pref?.["email_community"] ?? true) as boolean,
      email_birthday:         (pref?.["email_birthday"] ?? true)  as boolean,
      email_festive:          (pref?.["email_festive"]  ?? true)  as boolean,
      email_partners:         (pref?.["email_partners"] ?? false) as boolean,
      wa_marketing:           (pref?.["wa_marketing"]   ?? false) as boolean,
      wa_events:              (pref?.["wa_events"]      ?? true)  as boolean,
      prefs_updated_at:       (pref?.["updated_at"]     ?? null)  as string | null,
    };
  });

  // Filter
  if (filter === "opted_in") {
    rows = rows.filter(r => r.marketing_consent === true || r.email_marketing === true);
  } else if (filter === "opted_out") {
    rows = rows.filter(r => r.marketing_consent === false || r.email_marketing === false);
  }

  if (format === "csv") {
    const headers = Object.keys(rows[0] ?? {}).join(",");
    const body    = rows.map(r => Object.values(r).map(v =>
      v === null || v === undefined ? "" : `"${String(v).replace(/"/g, '""')}"`,
    ).join(",")).join("\n");
    const csv = `${headers}\n${body}`;
    return new NextResponse(csv, {
      headers: {
        "Content-Type":        "text/csv",
        "Content-Disposition": 'attachment; filename="consent-report.csv"',
      },
    });
  }

  return NextResponse.json({ rows, total: rows.length });
}
