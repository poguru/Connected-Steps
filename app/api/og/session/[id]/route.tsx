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

  // Pre-fetch logo + photo as data URLs
  const [logoDataUrl, photoDataUrl] = await Promise.all([
    fetchImageAsDataUrl(`${APP_URL}/logo.png`),
    session?.photo_url ? fetchImageAsDataUrl(session.photo_url) : Promise.resolve(null),
  ]);

  const cacheHeaders = { "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" };

  // Divider component with center dot
  const Divider = () => (
    <div style={{ display: "flex", alignItems: "center", width: "100%", gap: 0, margin: "52px 0" }}>
      <div style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
      <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#2a2a2a", margin: "0 16px", flexShrink: 0 }} />
      <div style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
    </div>
  );

  if (isStory) {
    // ── 1080 x 1920 Instagram Story — compact reference-style layout ───────
    return new ImageResponse(
      (
        <div style={{ width: W, height: H, display: "flex", flexDirection: "column", alignItems: "center", background: "#000000", padding: "80px 90px 80px", fontFamily: "sans-serif" }}>

          {/* Logo — circular, top center */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 48 }}>
            <div style={{ width: 160, height: 160, borderRadius: "50%", overflow: "hidden", border: "4px solid #ffffff", display: "flex", flexShrink: 0 }}>
              {logoDataUrl
                ? <img src={logoDataUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <div style={{ width: "100%", height: "100%", background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 72, fontWeight: 900, color: WHITE }}>C</div>
              }
            </div>
          </div>

          {/* Session title — large, orange, centered */}
          <div style={{ display: "flex", textAlign: "center", fontSize: title.length > 20 ? 88 : 108, fontWeight: 900, color: ORANGE, lineHeight: 1.05, textTransform: "uppercase", marginBottom: 28 }}>
            {title}
          </div>

          {/* Tagline */}
          <div style={{ display: "flex", fontSize: 38, color: "#aaaaaa", marginBottom: 8, textAlign: "center" }}>
            Train smarter. Live better.
          </div>

          {/* Orange underline accent */}
          <div style={{ width: 160, height: 5, background: ORANGE, borderRadius: 99, marginBottom: 0 }} />

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", width: "100%", margin: "52px 0" }}>
            <div style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
            <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#2a2a2a", margin: "0 16px", flexShrink: 0 }} />
            <div style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
          </div>

          {/* DATE & TIME */}
          <div style={{ display: "flex", alignItems: "center", gap: 40, width: "100%", marginBottom: 0 }}>
            {/* Calendar SVG */}
            <svg width="90" height="90" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="1.5">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <line x1="8" y1="14" x2="8" y2="14" strokeLinecap="round" strokeWidth="2.5" />
              <line x1="12" y1="14" x2="12" y2="14" strokeLinecap="round" strokeWidth="2.5" />
              <line x1="16" y1="14" x2="16" y2="14" strokeLinecap="round" strokeWidth="2.5" />
            </svg>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 30, color: ORANGE, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>DATE &amp; TIME :</span>
              <span style={{ fontSize: 42, color: WHITE, fontWeight: 700, lineHeight: 1.2 }}>
                {dateStr}{timeStr ? ` & ${timeStr}` : ""}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", width: "100%", margin: "52px 0" }}>
            <div style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
            <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#2a2a2a", margin: "0 16px", flexShrink: 0 }} />
            <div style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
          </div>

          {/* VENUE */}
          <div style={{ display: "flex", alignItems: "center", gap: 40, width: "100%" }}>
            {/* Location pin SVG */}
            <svg width="90" height="90" viewBox="0 0 24 24" fill={ORANGE}>
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 30, color: ORANGE, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>VENUE :</span>
              <span style={{ fontSize: 42, color: WHITE, fontWeight: 700, lineHeight: 1.2 }}>{venue}</span>
            </div>
          </div>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", width: "100%", margin: "52px 0" }}>
            <div style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
            <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#2a2a2a", margin: "0 16px", flexShrink: 0 }} />
            <div style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
          </div>

          {/* REGISTER */}
          <div style={{ display: "flex", alignItems: "center", gap: 40, width: "100%", marginBottom: 60 }}>
            {/* Running figure SVG */}
            <svg width="90" height="90" viewBox="0 0 24 24" fill={ORANGE}>
              <circle cx="17" cy="3" r="1.5" />
              <path d="M10.19 8.45l-1.02 3.85 2.83 2.83-1.5 5.87H12l1.9-7.45-2.66-2.66.95-3.44M14.5 8H19v2h-3.5l-2 3-3.5-.5.5-2.5L14.5 8z" />
              <path d="M8.47 11.86L7 17H5l2.1-7.14L8.47 11.86z" />
            </svg>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 30, color: ORANGE, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>REGISTER NOW :</span>
              <span style={{ fontSize: 36, color: WHITE, fontWeight: 600 }}>connectedsteps.in</span>
            </div>
          </div>

          {/* CTA button */}
          <div style={{ display: "flex", background: ORANGE, borderRadius: 20, padding: "36px 0", width: "100%", justifyContent: "center" }}>
            <span style={{ fontSize: 46, fontWeight: 900, color: WHITE }}>Join the Run</span>
          </div>
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
