import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export type PostType = "general" | "run" | "achievement" | "race" | "question";

export interface UserPost {
  id:           string;
  author_email: string;
  author_name:  string;
  post_type:    PostType;
  body:         string;
  photo_url:    string | null;
  approved:     boolean;
  created_at:   string;
  likes:        number;
  celebrates:   number;
  comments:     number;
  my_reaction:  "like" | "celebrate" | null;
}

// GET /api/posts?email=&scope=global|following&before=ISO&limit=15
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email  = searchParams.get("email") ?? "";
  const scope  = searchParams.get("scope") ?? "global";
  const before = searchParams.get("before") ?? new Date().toISOString();
  const limit  = Math.min(Number(searchParams.get("limit") ?? 15), 30);

  const db = getSupabaseServer();

  let query = db
    .from("user_posts")
    .select("id, author_email, author_name, post_type, body, photo_url, created_at")
    .eq("approved", true)
    .lt("created_at", before)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (scope === "following" && email) {
    const { data: follows } = await db.from("follows").select("following_email").eq("follower_email", email);
    const following = (follows ?? []).map(f => f.following_email);
    if (following.length === 0) return NextResponse.json({ posts: [], has_more: false, next_cursor: null });
    query = query.in("author_email", following);
  }

  const { data: posts, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!posts?.length) return NextResponse.json({ posts: [], has_more: false, next_cursor: null });

  const postIds = posts.map(p => p.id);

  // Fetch reactions and comment counts in parallel
  const [likesRes, commentsRes] = await Promise.all([
    db.from("user_post_likes").select("post_id, reaction_type, user_email").in("post_id", postIds),
    db.from("user_post_comments").select("post_id").in("post_id", postIds),
  ]);

  // Aggregate
  const likeMap: Record<string, { like: number; celebrate: number; my: "like" | "celebrate" | null }> = {};
  for (const l of likesRes.data ?? []) {
    if (!likeMap[l.post_id]) likeMap[l.post_id] = { like: 0, celebrate: 0, my: null };
    likeMap[l.post_id][l.reaction_type as "like" | "celebrate"]++;
    if (l.user_email === email) likeMap[l.post_id].my = l.reaction_type as "like" | "celebrate";
  }
  const commentMap: Record<string, number> = {};
  for (const c of commentsRes.data ?? []) {
    commentMap[c.post_id] = (commentMap[c.post_id] ?? 0) + 1;
  }

  const enriched: UserPost[] = posts.map(p => ({
    ...p,
    approved:    true,
    likes:       likeMap[p.id]?.like      ?? 0,
    celebrates:  likeMap[p.id]?.celebrate ?? 0,
    comments:    commentMap[p.id]         ?? 0,
    my_reaction: likeMap[p.id]?.my        ?? null,
  }));

  return NextResponse.json({
    posts:       enriched,
    has_more:    posts.length === limit,
    next_cursor: posts.at(-1)?.created_at ?? null,
  });
}

// POST /api/posts  — multipart/form-data: body, post_type, author_email, author_name, photo (optional)
export async function POST(req: NextRequest) {
  try {
    const ct = req.headers.get("content-type") ?? "";
    let body_text = "", post_type = "general", author_email = "", author_name = "";
    let photoUrl: string | null = null;

    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      body_text    = (form.get("body")         as string) ?? "";
      post_type    = (form.get("post_type")    as string) ?? "general";
      author_email = (form.get("author_email") as string) ?? "";
      author_name  = (form.get("author_name")  as string) ?? "";

      const photo = form.get("photo") as File | null;
      if (photo && photo.size > 0) {
        if (photo.size > 5 * 1024 * 1024)
          return NextResponse.json({ error: "Photo must be under 5MB" }, { status: 400 });

        const db  = getSupabaseServer();
        const ext = photo.name.split(".").pop() ?? "jpg";
        const key = `${author_email.replace("@", "_")}_${Date.now()}.${ext}`;
        const buf = Buffer.from(await photo.arrayBuffer());

        const { error: upErr } = await db.storage
          .from("user-posts")
          .upload(key, buf, { contentType: photo.type, upsert: false });

        if (!upErr) {
          const { data: pub } = db.storage.from("user-posts").getPublicUrl(key);
          photoUrl = pub.publicUrl;
        }
      }
    } else {
      const json = await req.json().catch(() => ({}));
      body_text    = json.body         ?? "";
      post_type    = json.post_type    ?? "general";
      author_email = json.author_email ?? "";
      author_name  = json.author_name  ?? "";
    }

    if (!author_email || !author_name || !body_text.trim())
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    if (body_text.length > 800)
      return NextResponse.json({ error: "Post must be under 800 characters" }, { status: 400 });

    const db = getSupabaseServer();
    const { data, error } = await db.from("user_posts").insert({
      author_email: author_email.toLowerCase(),
      author_name,
      post_type,
      body: body_text.trim(),
      photo_url: photoUrl,
      approved: true,
    }).select("id, author_email, author_name, post_type, body, photo_url, created_at").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      post: { ...data, likes: 0, celebrates: 0, comments: 0, my_reaction: null },
    }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
