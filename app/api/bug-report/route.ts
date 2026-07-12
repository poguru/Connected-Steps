import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/notify";

const ADMIN_EMAIL = "info@connectedsteps.in";
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "rc1";

function bugReportEmailHTML(r: {
  userName: string; userEmail: string; userPhone: string;
  category: string; description: string; screenshotUrl: string;
  browser: string; device: string; screenSize: string;
  currentUrl: string; timestamp: string; consoleErrors: string;
}): string {
  const categoryLabel: Record<string, string> = {
    bug: "🐛 Bug", ui: "🎨 UI Issue", payment: "💳 Payment Issue",
    session: "📅 Session Issue", event: "🏁 Event Issue",
    feature: "✨ Feature Request", performance: "⚡ Performance Issue",
  };
  const label = categoryLabel[r.category] ?? r.category;

  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f5f5f5">
<div style="background:#fff;border-radius:8px;padding:24px;border:1px solid #e5e7eb">
  <h2 style="margin:0 0 16px;color:#1a1a1a">[BUG REPORT] ${label}</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:6px 0;color:#6b7280;width:160px">User Name</td><td style="padding:6px 0;font-weight:600">${r.userName || "—"}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">User Email</td><td style="padding:6px 0">${r.userEmail || "—"}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">User Phone</td><td style="padding:6px 0">${r.userPhone || "—"}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Category</td><td style="padding:6px 0;font-weight:600">${label}</td></tr>
    <tr style="background:#fef3c7"><td style="padding:8px 6px;color:#6b7280;vertical-align:top">Description</td><td style="padding:8px 6px;white-space:pre-wrap">${r.description}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Current URL</td><td style="padding:6px 0;word-break:break-all">${r.currentUrl || "—"}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Browser</td><td style="padding:6px 0">${r.browser || "—"}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Device</td><td style="padding:6px 0">${r.device || "—"}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Screen Size</td><td style="padding:6px 0">${r.screenSize || "—"}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Timestamp</td><td style="padding:6px 0">${r.timestamp}</td></tr>
    ${r.screenshotUrl ? `<tr><td style="padding:6px 0;color:#6b7280">Screenshot</td><td style="padding:6px 0"><a href="${r.screenshotUrl}" style="color:#e8620a">View Screenshot</a></td></tr>` : ""}
    ${r.consoleErrors ? `<tr style="background:#fef2f2"><td style="padding:6px;color:#6b7280;vertical-align:top">Console Errors</td><td style="padding:6px;font-family:monospace;font-size:11px;white-space:pre-wrap">${r.consoleErrors.slice(0, 500)}</td></tr>` : ""}
  </table>
  <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb">
    <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in"}/admin/bug-reports"
       style="display:inline-block;padding:10px 20px;background:#e8620a;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">
      View in Admin Dashboard →
    </a>
  </div>
</div></body></html>`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      category, description, screenshot_url,
      browser, device, screen_size, current_url, console_errors,
      user_email, user_name, user_phone,
    } = body as Record<string, string>;

    if (!category || !description?.trim()) {
      return NextResponse.json({ error: "category and description are required" }, { status: 400 });
    }

    const db = getSupabaseServer();
    const timestamp = new Date().toISOString();

    // Enrich with user profile if email provided
    let enrichedName = user_name ?? "";
    let enrichedPhone = user_phone ?? "";
    if (user_email && (!enrichedName || !enrichedPhone)) {
      const { data: userRow } = await db
        .from("users")
        .select("first_name, last_name, phone")
        .eq("email", user_email)
        .single();
      if (userRow) {
        enrichedName  = enrichedName  || `${userRow.first_name ?? ""} ${userRow.last_name ?? ""}`.trim();
        enrichedPhone = enrichedPhone || (userRow.phone ?? "");
      }
    }

    // Auto-assign priority based on category
    const priority =
      category === "payment" ? "critical" :
      category === "bug"     ? "high"     :
      category === "session" ? "high"     :
      category === "event"   ? "high"     : "medium";

    // Save to DB
    const { data: report, error: dbError } = await db.from("bug_reports").insert({
      user_email:     user_email    || null,
      user_name:      enrichedName  || null,
      user_phone:     enrichedPhone || null,
      category,
      description:    description.trim(),
      screenshot_url: screenshot_url || null,
      browser:        browser  || null,
      device:         device   || null,
      screen_size:    screen_size || null,
      app_version:    APP_VERSION,
      current_url:    current_url || null,
      console_errors: console_errors || null,
      priority,
    }).select("id").single();

    if (dbError) {
      console.error("[bug-report] DB insert failed:", dbError.message);
      return NextResponse.json({ error: "Failed to save report" }, { status: 500 });
    }

    // Send admin email (non-blocking)
    const categoryLabel: Record<string, string> = {
      bug: "Bug", ui: "UI Issue", payment: "Payment Issue",
      session: "Session Issue", event: "Event Issue",
      feature: "Feature Request", performance: "Performance Issue",
    };
    const subject = `[BUG REPORT] ${categoryLabel[category] ?? category} — ${enrichedName || user_email || "Anonymous"}`;

    sendEmail(
      ADMIN_EMAIL, "Connected Steps Admin",
      subject,
      bugReportEmailHTML({
        userName: enrichedName, userEmail: user_email ?? "", userPhone: enrichedPhone,
        category, description: description.trim(),
        screenshotUrl: screenshot_url ?? "",
        browser: browser ?? "", device: device ?? "", screenSize: screen_size ?? "",
        currentUrl: current_url ?? "", timestamp, consoleErrors: console_errors ?? "",
      }),
      false, true,
    ).catch(err => console.error("[bug-report] admin email failed:", err));

    // Create admin in-app notification
    db.from("notifications").insert({
      user_email: ADMIN_EMAIL,
      type:       "bug_report",
      title:      `🐛 New ${categoryLabel[category] ?? "Issue"} Report`,
      body:       description.trim().slice(0, 120),
      action_url: `/admin/bug-reports?id=${report?.id ?? ""}`,
    }).then(() => {}).catch(() => {});

    return NextResponse.json({ ok: true, id: report?.id });
  } catch (err) {
    console.error("[bug-report] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
