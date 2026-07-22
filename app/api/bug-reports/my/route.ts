import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

// GET /api/bug-reports/my?email=&page=1
// Returns the authenticated user's own bug reports.

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-user-token") ?? "";
  const tokenEmail = verifyUserToken(token);
  if (!tokenEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const email  = (searchParams.get("email") ?? "").toLowerCase().trim();
  const page   = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit  = 20;
  const offset = (page - 1) * limit;

  if (email !== tokenEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data, count, error } = await db
    .from("bug_reports")
    .select(
      "id, title, category, severity, priority, status, created_at, updated_at, resolved_at, resolution_summary, version_fixed, description, attachments, screenshot_url",
      { count: "exact" },
    )
    .eq("user_email", email)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ reports: data ?? [], total: count ?? 0, page, limit });
}
