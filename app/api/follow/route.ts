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

    // Step 1: get emails
    let emails: string[] = [];
    if (type === "followers") {
      const { data } = await db.from("follows").select("follower_email").eq("following_email", email);
      emails = (data || []).map((r) => r.follower_email);
    } else {
      const { data } = await db.from("follows").select("following_email").eq("follower_email", email);
      emails = (data || []).map((r) => r.following_email);
    }

    if (emails.length === 0) return NextResponse.json({ users: [] });

    // Step 2: look up names
    const { data: userRows } = await db
      .from("users")
      .select("email, first_name, last_name")
      .in("email", emails);

    const nameMap = new Map((userRows || []).map((u) => [u.email, `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim()]));

    return NextResponse.json({
      users: emails.map((e) => ({ email: e, name: nameMap.get(e) || e })),
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
