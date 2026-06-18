import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireActiveUser } from "@/lib/active-user";
import { verifyUserToken } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// POST /api/posts/[id]/report  { reason?, content_type? }
export async function POST(req: NextRequest, { params }: Params) {
  const { id }           = await params;
  const reporter_email   = verifyUserToken(req.headers.get("x-user-token") ?? "");
  if (!reporter_email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reason = "inappropriate", content_type = "user_post" } =
    await req.json().catch(() => ({} as { reason?: string; content_type?: string }));

  const blocked = await requireActiveUser(reporter_email);
  if (blocked) return blocked;

  const db = getSupabaseServer();

  // Prevent duplicate reports from same user
  const { data: existing } = await db
    .from("content_reports")
    .select("id")
    .eq("reporter_email", reporter_email.toLowerCase())
    .eq("content_id", id)
    .single();

  if (existing) return NextResponse.json({ success: true, duplicate: true });

  await db.from("content_reports").insert({
    reporter_email: reporter_email.toLowerCase(),
    content_type,
    content_id:     id,
    reason,
  });

  // Auto-hide post if it has 3+ reports
  const { count } = await db
    .from("content_reports")
    .select("id", { count: "exact", head: true })
    .eq("content_id", id)
    .eq("content_type", "user_post");

  if ((count ?? 0) >= 3) {
    await db.from("user_posts").update({ approved: false }).eq("id", id);
  }

  return NextResponse.json({ success: true });
}
