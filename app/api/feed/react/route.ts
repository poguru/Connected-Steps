import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireActiveUser } from "@/lib/active-user";
import { verifyUserToken } from "@/lib/admin-auth";

// POST /api/feed/react
// Body: { feed_event_id, reaction_type: "like" | "celebrate" }
// Toggles the reaction: if already set to same type â†’ remove it.
// If set to different type â†’ switch it.
// Returns: { action: "added" | "removed" | "switched", reaction_type, counts: {like, celebrate} }

export async function POST(req: NextRequest) {
  try {
    const user_email = verifyUserToken(req.headers.get("x-user-token") ?? "");
    if (!user_email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { feed_event_id, reaction_type } = await req.json() as {
      feed_event_id: string;
      reaction_type: "like" | "celebrate";
    };

    if (!feed_event_id || !["like", "celebrate"].includes(reaction_type))
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });

    const blocked = await requireActiveUser(user_email);
    if (blocked) return blocked;

    const db = getSupabaseServer();

    // Check existing reaction
    const { data: existing } = await db
      .from("feed_reactions")
      .select("id, reaction_type")
      .eq("feed_event_id", feed_event_id)
      .eq("user_email", user_email.toLowerCase())
      .single();

    let action: "added" | "removed" | "switched";

    if (existing) {
      if (existing.reaction_type === reaction_type) {
        // Same type â†’ remove (toggle off)
        await db.from("feed_reactions").delete().eq("id", existing.id);
        action = "removed";
      } else {
        // Different type â†’ switch
        await db.from("feed_reactions").update({ reaction_type }).eq("id", existing.id);
        action = "switched";
      }
    } else {
      // No existing â†’ add
      await db.from("feed_reactions").insert({
        feed_event_id,
        user_email: user_email.toLowerCase(),
        reaction_type,
      });
      action = "added";
    }

    // Return updated counts for this event
    const { data: all } = await db
      .from("feed_reactions")
      .select("reaction_type")
      .eq("feed_event_id", feed_event_id);

    const counts = { like: 0, celebrate: 0 };
    for (const r of all ?? []) counts[r.reaction_type as "like" | "celebrate"]++;

    return NextResponse.json({ action, reaction_type, counts });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
