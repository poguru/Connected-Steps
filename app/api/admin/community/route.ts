import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

// GET — all posts (pending first)
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("community_posts")
    .select("id, user_email, user_name, category, title, body, approved, created_at")
    .order("approved", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: data ?? [] });
}

// PATCH — approve or reject
export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id, action } = await req.json();
    if (!id && action !== "approve_all") return NextResponse.json({ error: "Missing id" }, { status: 400 });
    if (!action) return NextResponse.json({ error: "Missing action" }, { status: 400 });

    const db = getSupabaseServer();

    if (action === "approve_all") {
      const { error } = await db.from("community_posts").update({ approved: true }).eq("approved", false);
      if (error) { console.error("[admin/community] approve_all error:", error.message); return NextResponse.json({ error: error.message }, { status: 500 }); }
    } else if (action === "reject") {
      console.log("[admin/community] deleting post id:", id);
      const { error, count } = await db.from("community_posts").delete({ count: "exact" }).eq("id", id);
      if (error) { console.error("[admin/community] delete error:", error.message); return NextResponse.json({ error: error.message }, { status: 500 }); }
      console.log("[admin/community] deleted", count, "row(s) for id:", id);
    } else {
      const { error } = await db.from("community_posts").update({ approved: true }).eq("id", id);
      if (error) { console.error("[admin/community] approve error:", error.message); return NextResponse.json({ error: error.message }, { status: 500 }); }
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    console.error("[admin/community] PATCH exception:", String(e));
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
