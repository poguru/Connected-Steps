import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET  /api/admin/bug-reports?status=open&category=all&page=1
// PATCH /api/admin/bug-reports  { id, status, priority, assigned_to, admin_notes }

export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status   = searchParams.get("status")   ?? "all";
  const category = searchParams.get("category") ?? "all";
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

  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ reports: data ?? [], total: count ?? 0, page, limit });
}

export async function PATCH(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, status, priority, assigned_to, admin_notes } = await req.json() as Record<string, string>;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = getSupabaseServer();
  const update: Record<string, string | null> = { updated_at: new Date().toISOString() };
  if (status)      update.status      = status;
  if (priority)    update.priority    = priority;
  if (assigned_to !== undefined) update.assigned_to = assigned_to || null;
  if (admin_notes !== undefined) update.admin_notes = admin_notes || null;
  if (status === "fixed" || status === "closed" || status === "released") {
    update.resolved_at = new Date().toISOString();
  }

  const { error } = await db.from("bug_reports").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
