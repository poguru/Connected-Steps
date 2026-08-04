import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

import { APP_URL } from "@/lib/config";

const ORANGE  = "#e8620a";
const BLACK   = "#0a0a0a";
const WHITE   = "#ffffff";

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata",
    });
  } catch { return iso; }
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
    return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
  } catch { return null; }
}

// GET /api/og/event/[slug]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db       = getSupabaseServer();

  const { data: event } = await Promise.race([
    db.from("events").select("title, start_date, location, banner_image, distance_categories, max_participants, participant_count").eq("share_slug", slug).single(),
    new Promise<{ data: null }>(resolve => setTimeout(() => resolve({ data: null }), 4000)),
  ]) as { data: { title: string; start_date: string; location: string | null; banner_image: string | null; distance_categories: string[] | null; max_participants: number | null; participant_count: number | null } | null };

  const title     = event?.title ?? "Community Run";
  const dateStr   = event?.start_date ? formatDate(event.start_date) : "";
  const location  = event?.location ?? "Hyderabad";
  const cats      = event?.distance_categories ?? [];
  const regCount  = event?.participant_count ?? 0;
  const regLimit  = event?.max_participants;

  const [logoDataUrl, bannerDataUrl] = await Promise.all([
    fetchImageAsDataUrl(`${APP_URL}/logo.png`),
    event?.banner_image ? fetchImageAsDataUrl(event.banner_image) : Promise.resolve(null),
  ]);

  const W = 1200, H = 630;
  const cacheHeaders = { "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" };

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", background: BLACK, position: "relative" }}>

        {/* Left panel: banner or gradient */}
        <div style={{ width: 460, height: H, flexShrink: 0, display: "flex", position: "relative", overflow: "hidden" }}>
          {bannerDataUrl ? (
            <>
              <img src={bannerDataUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, transparent 55%, #0a0a0a 100%)" }} />
            </>
          ) : (
            <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #1c0a00 0%, #3d1f00 60%, #0a0a0a 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
              <div style={{ fontSize: 110 }}>🏃</div>
              <span style={{ fontSize: 20, color: ORANGE, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Community Run</span>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "44px 48px" }}>

          {/* Logo row */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            {logoDataUrl
              ? <img src={logoDataUrl} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />
              : <div style={{ width: 36, height: 36, borderRadius: "50%", background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: WHITE }}>C</div>
            }
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: WHITE }}>Connected Steps</span>
              <span style={{ fontSize: 10, color: ORANGE, letterSpacing: "0.1em", textTransform: "uppercase" }}>Official Event</span>
            </div>
          </div>

          {/* Event tag */}
          <div style={{ display: "flex", marginBottom: 16 }}>
            <div style={{ background: "rgba(232,98,10,0.15)", border: "1px solid rgba(232,98,10,0.4)", borderRadius: 6, padding: "4px 12px", fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              🏁 Running Event
            </div>
          </div>

          {/* Title */}
          <div style={{ display: "flex", fontSize: title.length > 28 ? 30 : 36, fontWeight: 900, color: WHITE, lineHeight: 1.1, flex: 1 }}>
            {title}
          </div>

          {/* Details */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {dateStr && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 3, height: 18, background: ORANGE, borderRadius: 2, flexShrink: 0 }} />
                <span style={{ fontSize: 15, color: "#ccc", fontWeight: 600 }}>{dateStr}</span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 3, height: 18, background: ORANGE, borderRadius: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 15, color: "#ccc", fontWeight: 600 }}>{location}</span>
            </div>
            {cats.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 3, height: 18, background: ORANGE, borderRadius: 2, flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>{cats.join(" · ")}</span>
              </div>
            )}
            {regCount > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 3, height: 18, background: "#4ade80", borderRadius: 2, flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: "#4ade80", fontWeight: 600 }}>
                  {regCount}{regLimit ? ` / ${regLimit}` : "+"} registered
                </span>
              </div>
            )}
          </div>

          {/* CTA */}
          <div style={{ background: ORANGE, borderRadius: 8, padding: "13px 0", display: "flex", justifyContent: "center" }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: WHITE }}>Register Now →</span>
          </div>
        </div>

        {/* Top accent bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, background: ORANGE }} />
      </div>
    ),
    { width: W, height: H, headers: cacheHeaders },
  );
}
