import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/notify";
import { isRateLimited, recordFailure, getClientIp } from "@/lib/rate-limit";

const ADMIN_EMAIL = "info@connectedsteps.in";
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "rc1";

interface Attachment { path: string; type: string; name: string; size: number; }

function bugReportEmailHTML(r: {
  userName: string; userEmail: string; userPhone: string;
  title: string; category: string; severity: string; description: string;
  attachments: Attachment[];
  browser: string; device: string; screenSize: string;
  currentUrl: string; timestamp: string; consoleErrors: string;
}): string {
  const categoryLabel: Record<string, string> = {
    bug: "🐛 Bug", ui: "🎨 UI Issue", payment: "💳 Payment Issue",
    session: "📅 Session Issue", event: "🏁 Event Issue",
    feature: "✨ Feature Request", performance: "⚡ Performance Issue",
  };
  const label = categoryLabel[r.category] ?? r.category;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";

  const attachmentRows = r.attachments.map((a, i) =>
    `<tr><td style="padding:6px 0;color:#6b7280">Screenshot ${i + 1}</td><td style="padding:6px 0"><a href="${appUrl}/api/admin/bug-reports/screenshot?path=${encodeURIComponent(a.path)}" style="color:#e8620a">${a.name}</a></td></tr>`
  ).join("");

  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f5f5f5">
<div style="background:#fff;border-radius:8px;padding:24px;border:1px solid #e5e7eb">
  <h2 style="margin:0 0 4px;color:#1a1a1a">[BUG REPORT] ${label}</h2>
  ${r.title ? `<div style="font-size:16px;font-weight:700;color:#111;margin-bottom:16px">${r.title}</div>` : ""}
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:6px 0;color:#6b7280;width:160px">User Name</td><td style="padding:6px 0;font-weight:600">${r.userName || "—"}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">User Email</td><td style="padding:6px 0">${r.userEmail || "—"}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">User Phone</td><td style="padding:6px 0">${r.userPhone || "—"}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Category</td><td style="padding:6px 0;font-weight:600">${label}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Severity</td><td style="padding:6px 0;font-weight:600;text-transform:capitalize">${r.severity || "—"}</td></tr>
    <tr style="background:#fef3c7"><td style="padding:8px 6px;color:#6b7280;vertical-align:top">Description</td><td style="padding:8px 6px;white-space:pre-wrap">${r.description}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Current URL</td><td style="padding:6px 0;word-break:break-all">${r.currentUrl || "—"}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Browser</td><td style="padding:6px 0">${r.browser || "—"}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Device</td><td style="padding:6px 0">${r.device || "—"}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Screen Size</td><td style="padding:6px 0">${r.screenSize || "—"}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Screenshots</td><td style="padding:6px 0">${r.attachments.length}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Timestamp</td><td style="padding:6px 0">${r.timestamp}</td></tr>
    ${attachmentRows}
    ${r.consoleErrors ? `<tr style="background:#fef2f2"><td style="padding:6px;color:#6b7280;vertical-align:top">Console Errors</td><td style="padding:6px;font-family:monospace;font-size:11px;white-space:pre-wrap">${r.consoleErrors.slice(0, 500)}</td></tr>` : ""}
  </table>
  <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb">
    <a href="${appUrl}/admin/bug-reports"
       style="display:inline-block;padding:10px 20px;background:#e8620a;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">
      View in Admin Dashboard →
    </a>
  </div>
</div></body></html>`;
}

export async function POST(req: NextRequest) {
  // 5 submissions per 15 minutes per IP — prevents DB spam and admin email floods
  const ip  = getClientIp(req);
  const key = `bug-report:${ip}`;
  if (await isRateLimited(key, 5)) {
    return NextResponse.json({ error: "Too many reports. Please wait before submitting again." }, { status: 429 });
  }
  await recordFailure(key); // each submission counts as one "failure" towards the limit

  try {
    const body = await req.json() as Record<string, unknown>;

    const title         = String(body.title         ?? "").trim();
    const category      = String(body.category      ?? "");
    const severity      = String(body.severity      ?? "");
    const description   = String(body.description   ?? "").trim();
    const screenshot_url= String(body.screenshot_url ?? "");
    const browser       = String(body.browser       ?? "");
    const device        = String(body.device        ?? "");
    const screen_size   = String(body.screen_size   ?? "");
    const current_url   = String(body.current_url   ?? "");
    const console_errors= String(body.console_errors ?? "");
    const user_email    = String(body.user_email    ?? "");
    const user_name     = String(body.user_name     ?? "");
    const user_phone    = String(body.user_phone    ?? "");

    const attachments: Attachment[] = Array.isArray(body.attachments)
      ? (body.attachments as Attachment[]).filter(a => a?.path)
      : [];

    if (!category || !description) {
      return NextResponse.json({ error: "category and description are required" }, { status: 400 });
    }
    if (attachments.length === 0) {
      return NextResponse.json(
        { error: "Please attach at least one screenshot so we can investigate the issue." },
        { status: 400 },
      );
    }

    const db = getSupabaseServer();
    const timestamp = new Date().toISOString();

    // Enrich with user profile if email provided
    let enrichedName  = user_name;
    let enrichedPhone = user_phone;
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

    // Priority: user-selected severity wins; fall back to category-based auto-assign
    const priority =
      severity === "critical" ? "critical" :
      severity === "high"     ? "high"     :
      severity === "medium"   ? "medium"   :
      severity === "low"      ? "low"      :
      category === "payment"  ? "critical" :
      category === "bug"      ? "high"     :
      category === "session"  ? "high"     :
      category === "event"    ? "high"     : "medium";

    // Save to DB
    const { data: report, error: dbError } = await db.from("bug_reports").insert({
      user_email:     user_email     || null,
      user_name:      enrichedName   || null,
      user_phone:     enrichedPhone  || null,
      title:          title          || null,
      category,
      severity:       severity       || null,
      description,
      screenshot_url: attachments[0]?.path || screenshot_url || null,
      attachments,
      browser:        browser        || null,
      device:         device         || null,
      screen_size:    screen_size    || null,
      app_version:    APP_VERSION,
      current_url:    current_url    || null,
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
        userName: enrichedName, userEmail: user_email, userPhone: enrichedPhone,
        title, category, severity, description, attachments,
        browser, device, screenSize: screen_size,
        currentUrl: current_url, timestamp, consoleErrors: console_errors,
      }),
      false, true,
    ).catch(err => console.error("[bug-report] admin email failed:", err));

    // Create admin in-app notification (fire-and-forget)
    void (async () => {
      await db.from("notifications").insert({
        user_email: ADMIN_EMAIL,
        type:       "bug_report",
        title:      `🐛 New ${categoryLabel[category] ?? "Issue"} Report`,
        body:       description.slice(0, 120),
        action_url: `/admin/bug-reports?id=${report?.id ?? ""}`,
      });
    })();

    return NextResponse.json({ ok: true, id: report?.id });
  } catch (err) {
    console.error("[bug-report] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
