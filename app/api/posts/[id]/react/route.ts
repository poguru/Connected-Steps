import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireActiveUser } from "@/lib/active-user";
import { verifyUserToken } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// POST /api/posts/[id]/react  { reaction_type: "like"|"celebrate" }
// Same toggle logic as /api/feed/react
export async function POST(req: NextRequest, { params }: Params) {
  const { id }            = await params;
  const user_email        = verifyUserToken(req.headers.get("x-user-token") ?? "");
  if (!user_email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reaction_type } = await req.json().catch(() => ({})) as {
    reaction_type: "like" | "celebrate";
  };

  if (!["like","celebrate"].includes(reaction_type))
    return NextResponse.json({ error: "Invalid fields" }, { status: 400 });

  const blocked = await requireActiveUser(user_email);
  if (blocked) return blocked;

  const db = getSupabaseServer();
  const { data: existing } = await db
    .from("user_post_likes")
    .select("id, reaction_type")
    .eq("post_id", id).eq("user_email", user_email.toLowerCase()).single();

  let action: "added" | "removed" | "switched";
  if (existing) {
    if (existing.reaction_type === reaction_type) {
      await db.from("user_post_likes").delete().eq("id", existing.id);
      action = "removed";
    } else {
      await db.from("user_post_likes").update({ reaction_type }).eq("id", existing.id);
      action = "switched";
    }
  } else {
    const { error: insertErr } = await db.from("user_post_likes").insert({ post_id: id, user_email: user_email.toLowerCase(), reaction_type });
    if (insertErr) {
      console.error("[posts/react] insert failed:", insertErr.message);
      return NextResponse.json({ error: "Could not save reaction" }, { status: 500 });
    }
    action = "added";
  }

  // Return updated counts
  const { data: all } = await db.from("user_post_likes").select("reaction_type").eq("post_id", id);
  const counts = { like: 0, celebrate: 0 };
  for (const r of all ?? []) counts[r.reaction_type as "like" | "celebrate"]++;

  return NextResponse.json({ action, reaction_type, counts });
}
