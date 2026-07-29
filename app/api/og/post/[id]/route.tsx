import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export const runtime = "edge";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";
const ORANGE  = "#e8620a";
const BLACK   = "#0a0a0a";
const WHITE   = "#ffffff";

const TYPE_EMOJI: Record<string, string> = {
  run: "🏃", achievement: "🏅", race: "🏁", question: "❓", birthday: "🎂", general: "💬",
};

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await Promise.race([
      fetch(url),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]) as Response;
    if (!res.ok) return null;
    const buf  = await res.arrayBuffer();
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
  } catch { return null; }
}

// GET /api/og/post/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db     = getSupabaseServer();

  const { data: post } = await Promise.race([
    db.from("user_posts").select("body, post_type, author_name, photo_url, created_at").eq("id", id).single(),
    new Promise<{ data: null }>(resolve => setTimeout(() => resolve({ data: null }), 4000)),
  ]) as { data: { body: string; post_type: string; author_name: string | null; photo_url: string | null; created_at: string } | null };

  const body      = post?.body ?? "A post from Connected Steps community";
  const snippet   = body.length > 180 ? body.slice(0, 177) + "…" : body;
  const author    = post?.author_name ?? "Community Member";
  const firstName = author.split(" ")[0] || author;
  const emoji     = TYPE_EMOJI[post?.post_type ?? "general"] ?? "💬";

  const [logoDataUrl, photoDataUrl] = await Promise.all([
    fetchImageAsDataUrl(`${APP_URL}/logo.png`),
    post?.photo_url ? fetchImageAsDataUrl(post.photo_url) : Promise.resolve(null),
  ]);

  const W = 1200, H = 630;
  const cacheHeaders = { "Cache-Control": "public, max-age=7200, s-maxage=7200, stale-while-revalidate=86400" };

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", background: BLACK, position: "relative", overflow: "hidden" }}>

        {/* Left panel: photo or gradient */}
        <div style={{ width: 400, height: H, flexShrink: 0, display: "flex", position: "relative" }}>
          {photoDataUrl ? (
            <>
              <img src={photoDataUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, transparent 50%, #0a0a0a 100%)" }} />
            </>
          ) : (
            <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #120700 0%, #2d1200 70%, #0a0a0a 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
              <div style={{ fontSize: 100 }}>{emoji}</div>
              <span style={{ fontSize: 18, color: ORANGE, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>Community</span>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "44px 48px", justifyContent: "space-between" }}>

          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {logoDataUrl
              ? <img src={logoDataUrl} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />
              : <div style={{ width: 36, height: 36, borderRadius: "50%", background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: WHITE }}>C</div>
            }
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: WHITE }}>Connected Steps</span>
              <span style={{ fontSize: 10, color: ORANGE, letterSpacing: "0.1em", textTransform: "uppercase" }}>Community</span>
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 20 }}>
            {/* Author row */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(232,98,10,0.2)", border: "2px solid rgba(232,98,10,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: ORANGE }}>
                {firstName[0]?.toUpperCase() ?? "M"}
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: WHITE }}>{firstName}</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Connected Steps Member</span>
              </div>
              <div style={{ marginLeft: "auto", fontSize: 24 }}>{emoji}</div>
            </div>

            {/* Post text */}
            <div style={{ display: "flex", fontSize: snippet.length > 100 ? 20 : 24, color: "rgba(255,255,255,0.9)", lineHeight: 1.55, fontWeight: 500 }}>
              {snippet}
            </div>
          </div>

          {/* CTA */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ background: ORANGE, borderRadius: 8, padding: "10px 20px", display: "flex", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: WHITE }}>View Post →</span>
            </div>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>connectedsteps.in</span>
          </div>
        </div>

        {/* Top accent bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: ORANGE }} />
      </div>
    ),
    { width: W, height: H, headers: cacheHeaders },
  );
}
