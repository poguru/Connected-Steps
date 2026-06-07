import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export const runtime = "edge";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";
const ORANGE  = "#e8620a";
const BLACK   = "#0a0a0a";
const WHITE   = "#ffffff";
const MUTED   = "#999999";

function formatDate(date: string) {
  return new Date(date + "T12:00:00Z").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await Promise.race([
      fetch(url),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]) as Response;
    if (!res.ok) return null;
    const buf  = await res.arrayBuffer();
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    const b64  = Buffer.from(buf).toString("base64");
    return `data:${mime};base64,${b64}`;
  } catch {
    return null;
  }
}

// GET /api/og/session/[id]               → 1200x630 Open Graph card
// GET /api/og/session/[id]?format=story  → 1080x1920 Instagram Story
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id }  = await params;
  const format  = new URL(req.url).searchParams.get("format");
  const isStory = format === "story";
  const W = isStory ? 1080 : 1200;
  const H = isStory ? 1920 : 630;

  // Fetch session data with timeout
  const db = getSupabaseServer();
  const sessionRes = await Promise.race([
    db.from("sessions").select("title, date, time, venue, location, photo_url").eq("id", id).single(),
    new Promise<{ data: null }>(resolve => setTimeout(() => resolve({ data: null }), 4000)),
  ]) as { data: { title: string; date: string; time: string | null; venue: string | null; location: string; photo_url: string | null } | null };

  const session  = sessionRes.data;
  const title    = session?.title      ?? "Training Session";
  const venue    = session?.venue      ?? session?.location ?? "Hyderabad";
  const dateStr  = session?.date ? formatDate(session.date) : "";
  const timeStr  = session?.time ?? "";

  // Pre-fetch photo as data URL (avoids external fetch issues in Satori)
  const photoDataUrl = session?.photo_url ? await fetchImageAsDataUrl(session.photo_url) : null;

  const cacheHeaders = { "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" };

  if (isStory) {
    // ── 1080 x 1920 Instagram Story ────────────────────────────────────────
    return new ImageResponse(
      (
        <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: BLACK, position: "relative" }}>
          {/* Top orange bar */}
          <div style={{ width: "100%", height: 16, background: ORANGE, flexShrink: 0 }} />

          {/* Logo area */}
          <div style={{ display: "flex", alignItems: "center", gap: 28, padding: "64px 80px 0" }}>
            <div style={{ width: 88, height: 88, borderRadius: "50%", background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 52, fontWeight: 900, color: WHITE, fontFamily: "serif" }}>C</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 46, fontWeight: 800, color: WHITE }}>Connected Steps</span>
              <span style={{ fontSize: 24, color: ORANGE, letterSpacing: "0.15em", textTransform: "uppercase", marginTop: 6 }}>Your Goal, Our Plan</span>
            </div>
          </div>

          {/* Session photo */}
          {photoDataUrl && (
            <div style={{ margin: "60px 80px 0", borderRadius: 32, overflow: "hidden", height: 520, display: "flex" }}>
              <img src={photoDataUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          )}

          {/* Category label */}
          <div style={{ display: "flex", margin: photoDataUrl ? "48px 80px 0" : "80px 80px 0" }}>
            <div style={{ background: "rgba(232,98,10,0.2)", border: `1px solid ${ORANGE}`, borderRadius: 8, padding: "8px 20px", fontSize: 24, fontWeight: 700, color: ORANGE, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Training Session
            </div>
          </div>

          {/* Title */}
          <div style={{ display: "flex", padding: "28px 80px 0", fontSize: title.length > 25 ? 72 : 88, fontWeight: 900, color: WHITE, lineHeight: 1.05 }}>
            {title}
          </div>

          {/* Details */}
          <div style={{ display: "flex", flexDirection: "column", padding: "48px 80px 0", gap: 28 }}>
            {dateStr && (
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <div style={{ width: 8, height: 48, background: ORANGE, borderRadius: 4, flexShrink: 0 }} />
                <span style={{ fontSize: 38, color: "#ddd", fontWeight: 600 }}>{dateStr}</span>
              </div>
            )}
            {timeStr && (
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <div style={{ width: 8, height: 48, background: ORANGE, borderRadius: 4, flexShrink: 0 }} />
                <span style={{ fontSize: 38, color: "#ddd", fontWeight: 600 }}>{timeStr}</span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ width: 8, height: 48, background: ORANGE, borderRadius: 4, flexShrink: 0 }} />
              <span style={{ fontSize: 38, color: "#ddd", fontWeight: 600 }}>{venue}</span>
            </div>
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* CTA */}
          <div style={{ padding: "0 80px 60px", display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ background: ORANGE, borderRadius: 20, padding: "40px 0", display: "flex", justifyContent: "center" }}>
              <span style={{ fontSize: 48, fontWeight: 800, color: WHITE }}>Register Now</span>
            </div>
            <span style={{ fontSize: 28, color: MUTED, textAlign: "center" }}>connectedsteps.in</span>
          </div>

          {/* Bottom orange bar */}
          <div style={{ width: "100%", height: 16, background: ORANGE, flexShrink: 0 }} />
        </div>
      ),
      { width: W, height: H, headers: cacheHeaders }
    );
  }

  // ── 1200 x 630 Open Graph card ──────────────────────────────────────────────
  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", background: BLACK, position: "relative" }}>

        {/* Left panel: photo or branded gradient */}
        <div style={{ width: 460, height: H, flexShrink: 0, display: "flex", position: "relative", overflow: "hidden" }}>
          {photoDataUrl ? (
            <>
              <img src={photoDataUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              {/* Fade to right */}
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, transparent 55%, #0a0a0a 100%)" }} />
            </>
          ) : (
            <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #1c0a00 0%, #2d1200 60%, #0a0a0a 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
              <div style={{ width: 110, height: 110, borderRadius: "50%", background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64, fontWeight: 900, color: WHITE, fontFamily: "serif" }}>C</div>
              <span style={{ fontSize: 22, fontWeight: 800, color: ORANGE, letterSpacing: "0.1em", textTransform: "uppercase" }}>Connected Steps</span>
            </div>
          )}
        </div>

        {/* Right panel: content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "44px 48px", position: "relative" }}>

          {/* Logo row */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900, color: WHITE, fontFamily: "serif" }}>C</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: WHITE }}>Connected Steps</span>
              <span style={{ fontSize: 10, color: ORANGE, letterSpacing: "0.12em", textTransform: "uppercase" }}>Your Goal, Our Plan</span>
            </div>
          </div>

          {/* Tag */}
          <div style={{ display: "flex", marginBottom: 16 }}>
            <div style={{ background: "rgba(232,98,10,0.15)", border: `1px solid rgba(232,98,10,0.5)`, borderRadius: 6, padding: "4px 12px", fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Training Session
            </div>
          </div>

          {/* Title */}
          <div style={{ display: "flex", fontSize: title.length > 28 ? 32 : 38, fontWeight: 900, color: WHITE, lineHeight: 1.1, marginBottom: 24, flex: 1 }}>
            {title}
          </div>

          {/* Details */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {dateStr && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 3, height: 18, background: ORANGE, borderRadius: 2, flexShrink: 0 }} />
                <span style={{ fontSize: 15, color: "#cccccc", fontWeight: 600 }}>{dateStr}</span>
              </div>
            )}
            {timeStr && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 3, height: 18, background: ORANGE, borderRadius: 2, flexShrink: 0 }} />
                <span style={{ fontSize: 15, color: "#cccccc", fontWeight: 600 }}>{timeStr}</span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 3, height: 18, background: ORANGE, borderRadius: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 15, color: "#cccccc", fontWeight: 600 }}>{venue}</span>
            </div>
          </div>

          {/* CTA */}
          <div style={{ background: ORANGE, borderRadius: 8, padding: "13px 0", display: "flex", justifyContent: "center" }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: WHITE }}>Register Now</span>
          </div>

          <span style={{ fontSize: 11, color: MUTED, marginTop: 10 }}>{APP_URL}/join/{id}</span>
        </div>

        {/* Top orange accent */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, background: ORANGE }} />
      </div>
    ),
    { width: W, height: H, headers: cacheHeaders }
  );
}
