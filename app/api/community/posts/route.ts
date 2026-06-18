import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireActiveUser } from "@/lib/active-user";
import { verifyUserToken } from "@/lib/admin-auth";

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL ?? "info@connectedsteps.in";

async function notifyAdmin(p: { user_name: string; user_email: string; category: string; title: string; body: string }) {
  const key  = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "Connected Steps <noreply@connectedsteps.in>";
  if (!key) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from, to: [ADMIN_EMAIL],
      subject: `New community question from ${p.user_name}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#111;border-radius:10px;overflow:hidden;">
          <div style="background:#0d0d0d;padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.07);">
            <span style="font-size:1rem;font-weight:700;color:#fff;">Connected Steps</span>
            <span style="font-size:0.8rem;color:#888;margin-left:8px;">Community Q&A</span>
          </div>
          <div style="padding:24px;">
            <p style="margin:0 0 16px;font-size:0.9rem;color:#ccc;">A new question was posted by <strong style="color:#fff;">${p.user_name}</strong> (${p.user_email}).</p>
            <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:16px;margin-bottom:16px;">
              <div style="font-size:10px;color:#e8620a;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">${p.category}</div>
              <div style="font-size:1rem;font-weight:600;color:#fff;margin-bottom:8px;">${p.title}</div>
              <div style="font-size:0.85rem;color:#aaa;line-height:1.6;">${p.body}</div>
            </div>
            <a href="https://www.connectedsteps.in/admin/community" style="display:inline-block;padding:10px 24px;background:#e8620a;color:#fff;border-radius:6px;text-decoration:none;font-size:0.85rem;font-weight:600;">View in Admin →</a>
          </div>
        </div>`,
    }),
  });
}

// GET — approved posts (public)
export async function GET() {
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("community_posts")
    .select("id, user_name, category, title, body, created_at")
    .eq("approved", true)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: data ?? [] });
}

// POST — submit a question/post
export async function POST(req: NextRequest) {
  try {
    const user_email = verifyUserToken(req.headers.get("x-user-token") ?? "");
    if (!user_email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { user_name, category, title, body } = await req.json();
    if (!user_name || !category || !title?.trim() || !body?.trim())
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    if (title.length > 120)
      return NextResponse.json({ error: "Title must be under 120 characters" }, { status: 400 });
    if (body.length > 600)
      return NextResponse.json({ error: "Post must be under 600 characters" }, { status: 400 });

    const blocked = await requireActiveUser(user_email);
    if (blocked) return blocked;

    const db = getSupabaseServer();
    await db.from("community_posts").insert({
      user_email, user_name,
      category, title: title.trim(), body: body.trim(),
      approved: true,
    });

    // Notify admin — fire and forget
    notifyAdmin({ user_name, user_email, category, title: title.trim(), body: body.trim() }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
