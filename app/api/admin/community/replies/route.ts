import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET — all pending replies with their parent post title
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("community_replies")
    .select("id, post_id, user_email, user_name, body, approved, created_at, community_posts(title, category)")
    .order("approved", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ replies: data ?? [] });
}

// PATCH — approve or reject a reply
export async function PATCH(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id, action } = await req.json();
    if (!id || !action) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const db = getSupabaseServer();
    if (action === "reject") {
      await db.from("community_replies").delete().eq("id", id);
    } else {
      await db.from("community_replies").update({ approved: true }).eq("id", id);
    }
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
