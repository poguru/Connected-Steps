import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { sendEmail, bugStatusUpdateEmailHTML } from "@/lib/notify";
import { createNotification } from "@/lib/notify-inapp";
import { isRateLimited, recordFailure, getClientIp } from "@/lib/rate-limit";

const ADMIN_EMAIL = "info@connectedsteps.in";
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "rc1";

interface Attachment { path: string; type: string; name: string; size: number; }

function bugReportEmailHTML(r: {
  userName: string; userEmail: string; userPhone: string; membershipType: string;
  title: string; category: string; severity: string; description: string;
  attachments: Attachment[];
  browser: string; device: string; os: string; screenSize: string;
  currentUrl: string; timestamp: string; consoleErrors: string;
}): string {
  const categoryLabel: Record<string, string> = {
    bug: "🐛 Bug", ui: "🎨 UI Issue", payment: "💳 Payment Issue",
    session: "📅 Session Issue", event: "🏁 Event Issue",
    feature: "✨ Feature Request", performance: "⚡ Performance Issue",
  };
  const label  = categoryLabel[r.category] ?? r.category;
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
    <tr><td style="padding:6px 0;color:#6b7280">Membership</td><td style="padding:6px 0">${r.membershipType || "—"}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Category</td><td style="padding:6px 0;font-weight:600">${label}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Severity</td><td style="padding:6px 0;font-weight:600;text-transform:capitalize">${r.severity || "—"}</td></tr>
    <tr style="background:#fef3c7"><td style="padding:8px 6px;color:#6b7280;vertical-align:top">Description</td><td style="padding:8px 6px;white-space:pre-wrap">${r.description}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Current URL</td><td style="padding:6px 0;word-break:break-all">${r.currentUrl || "—"}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Browser</td><td style="padding:6px 0">${r.browser || "—"}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">OS</td><td style="padding:6px 0">${r.os || "—"}</td></tr>
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
  const ip  = getClientIp(req);
  const key = `bug-report:${ip}`;
  if (await isRateLimited(key, 5)) {
    return NextResponse.json({ error: "Too many reports. Please wait before submitting again." }, { status: 429 });
  }
  await recordFailure(key);

  try {
    const body = await req.json() as Record<string, unknown>;

    const title          = String(body.title          ?? "").trim();
    const category       = String(body.category       ?? "");
    const severity       = String(body.severity       ?? "");
    const description    = String(body.description    ?? "").trim();
    const screenshot_url = String(body.screenshot_url ?? "");
    const browser        = String(body.browser        ?? "");
    const device         = String(body.device         ?? "");
    const os             = String(body.os             ?? "");
    const screen_size    = String(body.screen_size    ?? "");
    const current_url    = String(body.current_url    ?? "");
    const console_errors = String(body.console_errors ?? "");
    const user_email     = String(body.user_email     ?? "");
    const user_name      = String(body.user_name      ?? "");
    const user_phone     = String(body.user_phone     ?? "");

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

    const db        = getSupabaseServer();
    const timestamp = new Date().toISOString();

    // Enrich with user profile (name, phone, user_id, membership)
    let enrichedName       = user_name;
    let enrichedPhone      = user_phone;
    let userId: string | null = null;
    let membershipType: string | null = null;

    if (user_email) {
      const { data: userRow } = await db
        .from("users")
        .select("id, first_name, last_name, phone")
        .eq("email", user_email)
        .single();

      if (userRow) {
        enrichedName  = enrichedName  || `${userRow.first_name ?? ""} ${userRow.last_name ?? ""}`.trim();
        enrichedPhone = enrichedPhone || (userRow.phone ?? "");
        userId        = userRow.id ?? null;
      }

      // Fetch active membership plan
      const { data: membershipRow } = await db
        .from("memberships")
        .select("plan")
        .eq("user_email", user_email)
        .eq("status", "active")
        .order("expires_at", { ascending: false })
        .limit(1)
        .single();
      membershipType = membershipRow?.plan ?? null;
    }

    const priority =
      severity === "critical" ? "critical" :
      severity === "high"     ? "high"     :
      severity === "medium"   ? "medium"   :
      severity === "low"      ? "low"      :
      category === "payment"  ? "critical" :
      category === "bug"      ? "high"     :
      category === "session"  ? "high"     :
      category === "event"    ? "high"     : "medium";

    const { data: report, error: dbError } = await db.from("bug_reports").insert({
      user_id:        userId         || null,
      user_email:     user_email     || null,
      user_name:      enrichedName   || null,
      user_phone:     enrichedPhone  || null,
      membership_type: membershipType || null,
      title:          title          || null,
      category,
      severity:       severity       || null,
      description,
      screenshot_url: attachments[0]?.path || screenshot_url || null,
      attachments,
      browser:        browser        || null,
      device:         device         || null,
      os:             os             || null,
      screen_size:    screen_size    || null,
      app_version:    APP_VERSION,
      current_url:    current_url    || null,
      console_errors: console_errors || null,
      priority,
      status:         "new",
    }).select("id").single();

    if (dbError) {
      console.error("[bug-report] DB insert failed:", dbError.message);
      return NextResponse.json({ error: "Failed to save report" }, { status: 500 });
    }

    const reportId = report?.id ?? "";

    // Insert initial history entry
    void db.from("bug_report_history").insert({
      bug_report_id: reportId,
      status:        "new",
      changed_by:    "system",
      comment:       "Bug report received",
    });

    const categoryLabel: Record<string, string> = {
      bug: "Bug", ui: "UI Issue", payment: "Payment Issue",
      session: "Session Issue", event: "Event Issue",
      feature: "Feature Request", performance: "Performance Issue",
    };
    const subject = `[BUG REPORT] ${categoryLabel[category] ?? category} — ${enrichedName || user_email || "Anonymous"}`;

    // Admin email (non-blocking)
    sendEmail(
      ADMIN_EMAIL, "Connected Steps Admin",
      subject,
      bugReportEmailHTML({
        userName: enrichedName, userEmail: user_email, userPhone: enrichedPhone,
        membershipType: membershipType ?? "",
        title, category, severity, description, attachments,
        browser, device, os, screenSize: screen_size,
        currentUrl: current_url, timestamp, consoleErrors: console_errors,
      }),
      false, true,
    ).catch(err => console.error("[bug-report] admin email failed:", err));

    // Admin in-app notification (uses helper so push is also sent)
    createNotification({
      user_email: ADMIN_EMAIL,
      type:       "bug_report",
      title:      `🐛 New ${categoryLabel[category] ?? "Issue"} Report`,
      body:       (title || description).slice(0, 120),
      action_url: `/admin/bug-reports?id=${reportId}`,
    }).catch(err => console.error("[bug-report] admin notify failed:", err));

    // Reporter acknowledgement email (non-blocking)
    if (user_email) {
      const firstName = enrichedName?.split(" ")[0] || "there";
      sendEmail(
        user_email, enrichedName || firstName,
        "We received your bug report — Connected Steps",
        bugStatusUpdateEmailHTML({
          firstName,
          bugTitle:      title || description.slice(0, 80),
          status:        "new",
          statusMessage: "We've received your bug report and our team will review it shortly. We'll keep you updated at every step.",
        }),
        false, true,
      ).catch(err => console.error("[bug-report] reporter ack email failed:", err));

      // Reporter in-app notification
      createNotification({
        user_email,
        type:       "bug_update",
        title:      "Bug report received",
        body:       "We've received your report and our team is reviewing it.",
        action_url: `/my-bugs`,
      }).catch(err => console.error("[bug-report] reporter notify failed:", err));
    }

    return NextResponse.json({ ok: true, id: reportId });
  } catch (err) {
    console.error("[bug-report] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
