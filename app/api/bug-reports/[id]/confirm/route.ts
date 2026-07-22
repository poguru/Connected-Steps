import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";
import { createNotification } from "@/lib/notify-inapp";

// PATCH /api/bug-reports/[id]/confirm
// Body: { email: string; confirmed: boolean }
// confirmed=true  → closes the bug (user verified fix)
// confirmed=false → reopens to in_progress (user says issue persists)

const ADMIN_EMAIL = "info@connectedsteps.in";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = req.headers.get("x-user-token") ?? "";
  const tokenEmail = verifyUserToken(token);
  if (!tokenEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email, confirmed } = await req.json() as { email: string; confirmed: boolean };
  if ((email ?? "").toLowerCase().trim() !== tokenEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db      = getSupabaseServer();
  const { id }  = await params;

  // Verify the report belongs to this user and is in resolved state
  const { data: report, error: fetchErr } = await db
    .from("bug_reports")
    .select("id, user_email, status, title, description")
    .eq("id", id)
    .eq("user_email", tokenEmail)
    .single();

  if (fetchErr || !report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
  if (report.status !== "resolved") {
    return NextResponse.json({ error: "Report is not in resolved state" }, { status: 400 });
  }

  const newStatus = confirmed ? "closed" : "in_progress";
  const comment   = confirmed
    ? "User confirmed the issue is resolved."
    : "User reported the issue persists — reopened for investigation.";

  await db.from("bug_reports").update({
    status:     newStatus,
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  void db.from("bug_report_history").insert({
    bug_report_id: id,
    status:        newStatus,
    changed_by:    tokenEmail,
    comment,
  });

  if (!confirmed) {
    // Notify admin that user says issue still persists
    createNotification({
      user_email: ADMIN_EMAIL,
      type:       "bug_report",
      title:      "🔄 Bug reopened by user",
      body:       `"${report.title || report.description?.slice(0, 60)}" — user says issue persists.`,
      action_url: `/admin/bug-reports?id=${id}`,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, status: newStatus });
}
