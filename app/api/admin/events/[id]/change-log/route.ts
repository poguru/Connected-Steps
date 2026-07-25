import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/events/[id]/change-log?limit=50&offset=0
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const url    = new URL(req.url);
  const limit  = Math.min(parseInt(url.searchParams.get("limit")  ?? "100", 10), 200);
  const offset = parseInt(url.searchParams.get("offset") ?? "0",   10);

  const db = getSupabaseServer();
  const { data, error, count } = await db
    .from("event_change_log")
    .select("*", { count: "exact" })
    .eq("event_id", id)
    .order("changed_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ log: data ?? [], total: count ?? 0 });
}
