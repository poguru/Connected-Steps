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
    if (!id || !action) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const db = getSupabaseServer();
    if (action === "reject") {
      await db.from("community_posts").delete().eq("id", id);
    } else {
      await db.from("community_posts").update({ approved: true }).eq("id", id);
    }
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
