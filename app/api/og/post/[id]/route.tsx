import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export const runtime = "edge";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";
const ORANGE  = "#e8620a";
const BLACK   = "#0a0a0a";
const WHITE   = "#ffffff";

async function fetchImageAsDataUrl(url: string, timeoutMs = 4000): Promise<string | null> {
  try {
    const res = await Promise.race([
      fetch(url),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ]) as Response;
    if (!res.ok) return null;
    const buf  = await res.arrayBuffer();
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
  } catch { return null; }
}

// GET /api/og/post/[id]               → 1200×630 full-bleed OG image
// GET /api/og/post/[id]?format=story  → 1080×1920 Instagram Story
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id }  = await params;
  const format  = new URL(req.url).searchParams.get("format");
  const isStory = format === "story";
  const W = isStory ? 1080 : 1200;
  const H = isStory ? 1920 : 630;

  const db = getSupabaseServer();
  const { data: post } = await Promise.race([
    db.from("user_posts").select("body, post_type, author_name, photo_url").eq("id", id).single(),
    new Promise<{ data: null }>(resolve => setTimeout(() => resolve({ data: null }), 4000)),
  ]) as { data: { body: string; post_type: string; author_name: string | null; photo_url: string | null } | null };

  const body      = post?.body ?? "";
  const author    = post?.author_name ?? "Community Member";
  const firstName = author.split(" ")[0] || "Member";
  const initial   = (firstName[0] ?? "M").toUpperCase();

  const photoDataUrl = post?.photo_url
    ? await fetchImageAsDataUrl(post.photo_url, isStory ? 6000 : 4000)
    : null;

  const cacheHeaders = { "Cache-Control": "public, max-age=7200, s-maxage=7200, stale-while-revalidate=86400" };

  // ──────────────────────────────────────────────────────────────────────────────
  // INSTAGRAM STORY  1080 × 1920
  // Photo fills the entire canvas. Minimal branding at bottom.
  // ──────────────────────────────────────────────────────────────────────────────
  if (isStory) {
    const caption = body.length > 130 ? body.slice(0, 127) + "…" : body;

    return new ImageResponse(
      (
        <div style={{ width: W, height: H, display: "flex", position: "relative", background: "#0f0f0f", overflow: "hidden", fontFamily: "sans-serif" }}>

          {/* Full-bleed photo — objectFit cover ensures no black bars */}
          {photoDataUrl ? (
            <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex" }}>
              <img src={photoDataUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          ) : (
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: `linear-gradient(160deg, #1a0800 0%, #2d1200 50%, ${BLACK} 100%)`, display: "flex" }} />
          )}

          {/* Bottom gradient — covers bottom 55% for text legibility */}
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: 1056,
            background: "linear-gradient(to top, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.82) 25%, rgba(0,0,0,0.4) 55%, transparent 100%)",
            display: "flex",
          }} />

          {/* Top gradient — subtle, keeps logo readable over any photo */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 320,
            background: "linear-gradient(to bottom, rgba(0,0,0,0.68) 0%, transparent 100%)",
            display: "flex",
          }} />

          {/* Top-left branding */}
          <div style={{ position: "absolute", top: 84, left: 72, display: "flex", alignItems: "center", gap: 22 }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 900, color: WHITE, border: "2.5px solid rgba(255,255,255,0.22)" }}>
              C
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: WHITE, letterSpacing: "0.02em" }}>Connected Steps</span>
              <span style={{ fontSize: 17, color: "rgba(255,255,255,0.42)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Community</span>
            </div>
          </div>

          {/* Bottom content */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 72px 100px", display: "flex", flexDirection: "column", gap: 22 }}>

            {/* Author */}
            <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
              <div style={{ width: 68, height: 68, borderRadius: "50%", background: "rgba(232,98,10,0.22)", border: "2.5px solid rgba(232,98,10,0.62)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800, color: ORANGE, flexShrink: 0 }}>
                {initial}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 32, fontWeight: 700, color: WHITE }}>{firstName}</span>
                <span style={{ fontSize: 19, color: "rgba(255,255,255,0.42)", letterSpacing: "0.02em" }}>Connected Steps Member</span>
              </div>
            </div>

            {/* Caption */}
            {caption && (
              <div style={{ display: "flex", fontSize: caption.length > 80 ? 32 : 38, fontWeight: 500, color: "rgba(255,255,255,0.92)", lineHeight: 1.5, letterSpacing: "0.01em" }}>
                {caption}
              </div>
            )}

            {/* Domain */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 6 }}>
              <div style={{ width: 3, height: 30, background: ORANGE, borderRadius: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 22, color: "rgba(255,255,255,0.36)", fontWeight: 500, letterSpacing: "0.05em" }}>connectedsteps.in</span>
            </div>
          </div>

        </div>
      ),
      { width: W, height: H, headers: cacheHeaders },
    );
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // OG IMAGE  1200 × 630  — photo as full-bleed hero, text at bottom
  // Shown by WhatsApp, Facebook, Twitter, LinkedIn, Telegram link previews.
  // ──────────────────────────────────────────────────────────────────────────────
  const snippet = body.length > 90 ? body.slice(0, 87) + "…" : body;

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", position: "relative", background: BLACK, overflow: "hidden", fontFamily: "sans-serif" }}>

        {/* Full-bleed photo */}
        {photoDataUrl ? (
          <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex" }}>
            <img src={photoDataUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        ) : (
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: `linear-gradient(135deg, #1a0800 0%, #2d1200 60%, ${BLACK} 100%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
            <div style={{ width: 90, height: 90, borderRadius: "50%", background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 50, fontWeight: 900, color: WHITE }}>C</div>
            <span style={{ fontSize: 18, color: ORANGE, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>Connected Steps</span>
          </div>
        )}

        {/* Top gradient — logo legibility */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 160, background: "linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, transparent 100%)", display: "flex" }} />

        {/* Bottom gradient — text legibility */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 280, background: "linear-gradient(to top, rgba(0,0,0,0.94) 0%, rgba(0,0,0,0.62) 55%, transparent 100%)", display: "flex" }} />

        {/* Orange accent bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: ORANGE, display: "flex" }} />

        {/* Top-left branding */}
        <div style={{ position: "absolute", top: 22, left: 30, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 900, color: WHITE, border: "1.5px solid rgba(255,255,255,0.18)" }}>
            C
          </div>
          <span style={{ fontSize: 15, fontWeight: 800, color: WHITE, letterSpacing: "0.03em" }}>Connected Steps</span>
        </div>

        {/* Bottom: author + caption + footer */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 36px 28px", display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Author */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(232,98,10,0.2)", border: "2px solid rgba(232,98,10,0.55)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: ORANGE, flexShrink: 0 }}>
              {initial}
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: WHITE }}>{author}</span>
          </div>

          {/* Caption */}
          {snippet && (
            <div style={{ display: "flex", fontSize: snippet.length > 60 ? 17 : 21, fontWeight: 500, color: "rgba(255,255,255,0.9)", lineHeight: 1.5 }}>
              {snippet}
            </div>
          )}

          {/* Footer */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.06em" }}>connectedsteps.in</span>
            <div style={{ background: ORANGE, borderRadius: 6, padding: "5px 12px", display: "flex", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: WHITE }}>View Post →</span>
            </div>
          </div>
        </div>

      </div>
    ),
    { width: W, height: H, headers: cacheHeaders },
  );
}
