import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// POST /api/follow — follow or unfollow
export async function POST(req: NextRequest) {
  try {
    const { follower_email, following_email } = await req.json();
    if (!follower_email || !following_email) {
      return NextResponse.json({ error: "Missing emails" }, { status: 400 });
    }
    if (follower_email === following_email) {
      return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
    }

    const db = getSupabaseServer();

    // Check if already following
    const { data: existing } = await db
      .from("follows")
      .select("id")
      .eq("follower_email", follower_email)
      .eq("following_email", following_email)
      .single();

    if (existing) {
      // Unfollow
      await db.from("follows").delete()
        .eq("follower_email", follower_email)
        .eq("following_email", following_email);
      return NextResponse.json({ action: "unfollowed" });
    } else {
      // Follow
      await db.from("follows").insert({ follower_email, following_email });
      return NextResponse.json({ action: "followed" });
    }
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// GET /api/follow?email=x&type=followers|following
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");
    const type  = searchParams.get("type"); // "followers" or "following"

    if (!email || !type) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    const db = getSupabaseServer();

    type UserRow = { first_name: string; last_name: string };
    const getName = (u: unknown, fallback: string) => {
      const row = (Array.isArray(u) ? u[0] : u) as UserRow | null | undefined;
      return `${row?.first_name ?? ""} ${row?.last_name ?? ""}`.trim() || fallback;
    };

    if (type === "followers") {
      const { data } = await db
        .from("follows")
        .select("follower_email, users!follows_follower_email_fkey(first_name, last_name)")
        .eq("following_email", email);
      return NextResponse.json({
        users: (data || []).map((r) => ({
          email: r.follower_email,
          name: getName(r.users, r.follower_email),
        })),
      });
    } else {
      const { data } = await db
        .from("follows")
        .select("following_email, users!follows_following_email_fkey(first_name, last_name)")
        .eq("follower_email", email);
      return NextResponse.json({
        users: (data || []).map((r) => ({
          email: r.following_email,
          name: getName(r.users, r.following_email),
        })),
      });
    }
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
