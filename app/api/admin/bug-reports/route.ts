import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach, getAdminEmail } from "@/lib/admin-auth";
import { createNotification } from "@/lib/notify-inapp";
import { sendEmail, bugStatusUpdateEmailHTML } from "@/lib/notify";

// GET  /api/admin/bug-reports?status=all&category=all&priority=all&search=&page=1
//      or ?id=<uuid> to fetch a single report with history
// PATCH /api/admin/bug-reports  { id, status, priority, assigned_to, admin_notes,
//                                 resolution_summary, version_fixed, internal_notes, comment }

const STATUS_MESSAGES: Record<string, string> = {
  new:          "We've received your bug report and our team is reviewing it.",
  acknowledged: "Your bug report has been acknowledged by our team and is in our queue.",
  in_progress:  "Our engineering team is actively working on your reported issue.",
  testing:      "The fix for your reported issue is being tested and will be released soon.",
  resolved:     "Good news! The issue you reported has been fixed. Please let us know if it's working for you.",
  closed:       "Your reported issue has been verified and closed. Thank you for helping us improve!",
};

export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);

  // Single-report fetch (with history)
  const id = searchParams.get("id");
  if (id) {
    const db = getSupabaseServer();
    const [reportRes, historyRes] = await Promise.all([
      db.from("bug_reports").select("*").eq("id", id).single(),
      db.from("bug_report_history").select("*").eq("bug_report_id", id).order("changed_at", { ascending: true }),
    ]);
    if (reportRes.error) return NextResponse.json({ error: reportRes.error.message }, { status: 500 });
    return NextResponse.json({ report: reportRes.data, history: historyRes.data ?? [] });
  }

  const status   = searchParams.get("status")   ?? "all";
  const category = searchParams.get("category") ?? "all";
  const priority = searchParams.get("priority") ?? "all";
  const search   = searchParams.get("search")   ?? "";
  const page     = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit    = 25;
  const offset   = (page - 1) * limit;

  const db = getSupabaseServer();
  let q = db
    .from("bug_reports")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status   !== "all") q = q.eq("status",   status);
  if (category !== "all") q = q.eq("category", category);
  if (priority !== "all") q = q.eq("priority", priority);

  if (search.trim()) {
    const term = search.trim();
    q = q.or(`user_email.ilike.%${term}%,user_name.ilike.%${term}%,user_phone.ilike.%${term}%,title.ilike.%${term}%`);
  }

  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ reports: data ?? [], total: count ?? 0, page, limit });
}

export async function PATCH(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const changedBy = getAdminEmail(req) ?? "admin";

  const body = await req.json() as Record<string, string | undefined>;
  const {
    id, status, priority, assigned_to, admin_notes,
    resolution_summary, version_fixed, internal_notes, comment,
  } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Resolved/Closed require a resolution summary
  if ((status === "resolved" || status === "closed") && !resolution_summary) {
    return NextResponse.json(
      { error: "Resolution summary is required when marking as Resolved or Closed." },
      { status: 400 },
    );
  }

  const db = getSupabaseServer();

  // Fetch current report to detect status change and get reporter info
  const { data: current, error: fetchErr } = await db
    .from("bug_reports")
    .select("status, user_email, user_name, title, description")
    .eq("id", id)
    .single();

  if (fetchErr || !current) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const update: Record<string, string | null> = { updated_at: new Date().toISOString() };
  if (status      !== undefined) update.status      = status;
  if (priority    !== undefined) update.priority    = priority;
  if (assigned_to !== undefined) update.assigned_to = assigned_to || null;
  if (admin_notes !== undefined) update.admin_notes = admin_notes || null;
  if (resolution_summary !== undefined) update.resolution_summary = resolution_summary || null;
  if (version_fixed      !== undefined) update.version_fixed      = version_fixed      || null;
  if (internal_notes     !== undefined) update.internal_notes     = internal_notes     || null;

  if (status === "resolved" || status === "closed") {
    update.resolved_at = new Date().toISOString();
  }

  const { error: updateErr } = await db.from("bug_reports").update(update).eq("id", id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  const statusChanged = status && status !== current.status;

  // Insert history entry on any status change
  if (statusChanged) {
    void db.from("bug_report_history").insert({
      bug_report_id: id,
      status,
      changed_by:   changedBy,
      comment:      comment || null,
    });
  }

  // Notify reporter when status changes
  if (statusChanged && current.user_email) {
    const reporterEmail = current.user_email;
    const firstName     = current.user_name?.split(" ")[0] || "there";
    const bugTitle      = current.title || current.description?.slice(0, 80) || "your report";
    const message       = STATUS_MESSAGES[status] ?? `The status of your report has been updated to ${status}.`;
    const appBase       = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";
    const confirmUrl    = status === "resolved"
      ? `${appBase}/my-bugs?confirm=${id}`
      : undefined;

    // In-app notification
    createNotification({
      user_email: reporterEmail,
      type:       "bug_update",
      title:      `Bug report ${status === "resolved" ? "resolved ✅" : status === "closed" ? "closed 🔒" : "updated"}`,
      body:       message,
      action_url: status === "resolved" ? `/my-bugs?confirm=${id}` : `/my-bugs`,
    }).catch(err => console.error("[admin/bug-reports] reporter notify failed:", err));

    // Email notification
    sendEmail(
      reporterEmail, current.user_name ?? firstName,
      `Update on your bug report — Connected Steps`,
      bugStatusUpdateEmailHTML({
        firstName,
        bugTitle,
        status,
        statusMessage:     message,
        resolutionSummary: resolution_summary || undefined,
        versionFixed:      version_fixed      || undefined,
        confirmUrl,
      }),
      false, true,
    ).catch(err => console.error("[admin/bug-reports] reporter email failed:", err));
  }

  return NextResponse.json({ ok: true });
}
