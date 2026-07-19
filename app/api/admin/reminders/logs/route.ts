import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession, ADMIN_SESSION_COOKIE } from "@/lib/admin-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

function requireAdmin(req: NextRequest): boolean {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  return !!(token && verifyAdminSession(token));
}

// GET /api/admin/reminders/logs
// Query params: page, limit, session_id, channel, status
export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp         = req.nextUrl.searchParams;
  const page       = Math.max(0, parseInt(sp.get("page")  ?? "0", 10));
  const limit      = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "50", 10)));
  const sessionId  = sp.get("session_id");
  const channel    = sp.get("channel");
  const status     = sp.get("status");

  const db = getSupabaseServer();

  let q = db
    .from("session_reminder_log")
    .select("id, user_email, session_id, channel, status, error_msg, sent_at, sessions(title, date)", { count: "exact" })
    .order("sent_at", { ascending: false })
    .range(page * limit, page * limit + limit - 1);

  if (sessionId) q = q.eq("session_id", sessionId);
  if (channel)   q = q.eq("channel",    channel);
  if (status)    q = q.eq("status",     status);

  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  return NextResponse.json({ logs: data ?? [], total: count ?? 0, page, limit });
}
