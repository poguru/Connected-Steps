import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export const runtime = "edge";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";

function formatDate(date: string) {
  return new Date(date + "T12:00:00Z").toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "long", year: "numeric",
  });
}

// GET /api/og/session/[id]          → 1200×630  Open Graph card
// GET /api/og/session/[id]?format=story → 1080×1920 Instagram Story
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id }   = await params;
  const format   = new URL(req.url).searchParams.get("format");
  const isStory  = format === "story";

  const W = isStory ? 1080 : 1200;
  const H = isStory ? 1920 : 630;

  // Fetch session — with timeout so crawlers never hang
  const db = getSupabaseServer();
  const { data: session } = await Promise.race([
    db.from("sessions").select("title, date, time, venue, location, photo_url").eq("id", id).single(),
    new Promise<{ data: null }>(resolve => setTimeout(() => resolve({ data: null }), 4000)),
  ]) as { data: { title: string; date: string; time: string | null; venue: string | null; location: string; photo_url: string | null } | null };

  const title    = session?.title      ?? "Training Session";
  const venue    = session?.venue      ?? session?.location ?? "Hyderabad";
  const dateStr  = session?.date ? formatDate(session.date) : "";
  const timeStr  = session?.time ?? "";
  const photoUrl = session?.photo_url ?? null;
  const joinUrl  = `${APP_URL}/join/${id}`;

  if (isStory) {
    // ── 1080 × 1920 Instagram Story ────────────────────────────────────────
    return new ImageResponse(
      (
        <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: "#0a0a0a", fontFamily: "sans-serif", position: "relative", overflow: "hidden" }}>
          {/* Background photo (blurred) */}
          {photoUrl && (
            <img src={photoUrl} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.18 }} />
          )}

          {/* Orange accent bar top */}
          <div style={{ width: "100%", height: 12, background: "#e8620a", flexShrink: 0 }} />

          {/* Brand header */}
          <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "60px 80px 0" }}>
            <img src={`${APP_URL}/logo.png`} style={{ width: 80, height: 80, borderRadius: "50%", border: "3px solid #e8620a", objectFit: "cover" }} />
            <div>
              <div style={{ fontSize: 44, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>Connected Steps</div>
              <div style={{ fontSize: 26, color: "#e8620a", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 6 }}>Your Goal, Our Plan</div>
            </div>
          </div>

          {/* Session photo */}
          {photoUrl && (
            <div style={{ margin: "60px 80px 0", borderRadius: 32, overflow: "hidden", height: 560 }}>
              <img src={photoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          )}

          {/* Main content */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 80px" }}>
            <div style={{ fontSize: 26, color: "#e8620a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 24 }}>🏃 Training Session</div>
            <div style={{ fontSize: 88, fontWeight: 900, color: "#fff", lineHeight: 1.05, marginBottom: 48 }}>{title}</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {dateStr && (
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <span style={{ fontSize: 48 }}>📅</span>
                  <span style={{ fontSize: 44, color: "#ddd", fontWeight: 600 }}>{dateStr}</span>
                </div>
              )}
              {timeStr && (
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <span style={{ fontSize: 48 }}>⏰</span>
                  <span style={{ fontSize: 44, color: "#ddd", fontWeight: 600 }}>{timeStr}</span>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <span style={{ fontSize: 48 }}>📍</span>
                <span style={{ fontSize: 44, color: "#ddd", fontWeight: 600 }}>{venue}</span>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div style={{ padding: "0 80px 100px", display: "flex", flexDirection: "column", gap: 28 }}>
            <div style={{ background: "#e8620a", borderRadius: 24, padding: "44px 60px", display: "flex", justifyContent: "center" }}>
              <span style={{ fontSize: 52, fontWeight: 800, color: "#fff" }}>Register Now →</span>
            </div>
            <div style={{ fontSize: 32, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>connectedsteps.in</div>
          </div>

          {/* Bottom bar */}
          <div style={{ width: "100%", height: 12, background: "#e8620a", flexShrink: 0 }} />
        </div>
      ),
      { width: W, height: H, headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" } }
    );
  }

  // ── 1200 × 630 Open Graph card ─────────────────────────────────────────────
  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", background: "#0a0a0a", fontFamily: "sans-serif", position: "relative", overflow: "hidden" }}>
        {/* Left: session photo */}
        {photoUrl ? (
          <div style={{ width: 480, height: H, flexShrink: 0, position: "relative" }}>
            <img src={photoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, transparent 60%, #0a0a0a 100%)" }} />
          </div>
        ) : (
          <div style={{ width: 480, height: H, flexShrink: 0, background: "linear-gradient(135deg, #1a0800 0%, #2d1200 50%, #0a0a0a 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
            <img src={`${APP_URL}/logo.png`} style={{ width: 120, height: 120, borderRadius: "50%", border: "4px solid #e8620a", objectFit: "cover" }} />
            <div style={{ fontSize: 28, fontWeight: 800, color: "#e8620a", letterSpacing: "0.05em" }}>CONNECTED STEPS</div>
            <div style={{ fontSize: 96 }}>🏃</div>
          </div>
        )}

        {/* Right: content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "48px 52px", position: "relative" }}>
          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 36 }}>
            <img src={`${APP_URL}/logo.png`} style={{ width: 44, height: 44, borderRadius: "50%", border: "2px solid #e8620a", objectFit: "cover" }} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>Connected Steps</div>
              <div style={{ fontSize: 11, color: "#e8620a", letterSpacing: "0.1em", textTransform: "uppercase" }}>Your Goal, Our Plan</div>
            </div>
          </div>

          {/* Category tag */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ background: "rgba(232,98,10,0.15)", border: "1px solid rgba(232,98,10,0.4)", borderRadius: 6, padding: "4px 12px", fontSize: 12, fontWeight: 700, color: "#e8620a", textTransform: "uppercase", letterSpacing: "0.08em" }}>Training Session</div>
          </div>

          {/* Title */}
          <div style={{ fontSize: title.length > 30 ? 34 : 40, fontWeight: 900, color: "#fff", lineHeight: 1.1, marginBottom: 28, flex: 1 }}>{title}</div>

          {/* Details */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
            {dateStr && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>📅</span>
                <span style={{ fontSize: 18, color: "#ccc", fontWeight: 600 }}>{dateStr}</span>
              </div>
            )}
            {timeStr && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>⏰</span>
                <span style={{ fontSize: 18, color: "#ccc", fontWeight: 600 }}>{timeStr}</span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>📍</span>
              <span style={{ fontSize: 18, color: "#ccc", fontWeight: 600 }}>{venue}</span>
            </div>
          </div>

          {/* CTA */}
          <div style={{ background: "#e8620a", borderRadius: 10, padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>Register Now →</span>
          </div>

          {/* URL */}
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 14 }}>{joinUrl}</div>
        </div>

        {/* Top accent */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, background: "#e8620a" }} />
      </div>
    ),
    { width: W, height: H, headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" } }
  );
}
