"use client";

import { useEffect, useState, type CSSProperties } from "react";

interface Session {
  id: string;
  title: string;
  date: string;
  time: string | null;
  venue: string | null;
  location: string | null;
  photo_url: string | null;
  avgRating: number | null;
  reviewCount: number;
  feedback: { user_name: string; rating: number; comment: string | null }[];
}

interface Photo {
  id: string;
  photo_url: string;
  caption: string | null;
  uploader_name: string;
  likes: number;
}

interface Stats {
  totalRunners: number;
  trainingsConducted: number;
  activeThisMonth: number;
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// ── Photo gallery lightbox ────────────────────────────────────────────────────

function Gallery({ session, onClose }: { session: Session; onClose: () => void }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Photo | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (selected) setSelected(null); else onClose(); }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, selected]);

  useEffect(() => {
    fetch(`/api/sessions/${session.id}/photos`)
      .then(r => r.json())
      .then(d => {
        const uploaded: Photo[] = d.photos ?? [];
        const all: Photo[] = session.photo_url
          ? [
              { id: "cover", photo_url: session.photo_url, caption: session.title, uploader_name: "Connected Steps", likes: 0 },
              ...uploaded.filter(p => p.photo_url !== session.photo_url),
            ]
          : uploaded;
        setPhotos(all);
      })
      .catch(() => {
        if (session.photo_url) {
          setPhotos([{ id: "cover", photo_url: session.photo_url, caption: session.title, uploader_name: "Connected Steps", likes: 0 }]);
        }
      })
      .finally(() => setLoading(false));
  }, [session]);

  return (
    <div
      onClick={selected ? () => setSelected(null) : onClose}
      style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.93)", backdropFilter: "blur(16px)", display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      {/* Header */}
      <div
        onClick={e => e.stopPropagation()}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}
      >
        <div>
          <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#fff" }}>{session.title}</div>
          <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
            {fmtDate(session.date)}{photos.length > 0 ? ` · ${photos.length} photo${photos.length !== 1 ? "s" : ""}` : ""}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", width: 34, height: 34, borderRadius: "50%", cursor: "pointer", fontSize: "1.1rem", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}
        >
          ×
        </button>
      </div>

      {/* Expanded single photo */}
      {selected ? (
        <div
          onClick={e => e.stopPropagation()}
          style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1.5rem", overflow: "hidden" }}
        >
          <img
            src={selected.photo_url}
            alt={selected.caption ?? ""}
            style={{ maxHeight: "75vh", maxWidth: "100%", borderRadius: 12, objectFit: "contain" }}
          />
          {selected.caption && (
            <div style={{ marginTop: 10, fontSize: "0.78rem", color: "rgba(255,255,255,0.5)", textAlign: "center" }}>{selected.caption}</div>
          )}
          <button
            onClick={() => setSelected(null)}
            style={{ marginTop: 14, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.55)", borderRadius: 8, padding: "7px 18px", cursor: "pointer", fontSize: "0.78rem", fontFamily: "inherit" }}
          >
            ← Back to gallery
          </button>
        </div>
      ) : (
        <div
          onClick={e => e.stopPropagation()}
          style={{ flex: 1, overflowY: "auto", padding: "1rem 1.25rem" }}
        >
          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ aspectRatio: "1", borderRadius: 8, backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 75%)", backgroundSize: "200% 100%", animation: "cs-shimmer 1.4s infinite" }} />
              ))}
            </div>
          ) : photos.length === 0 ? (
            <div style={{ textAlign: "center", padding: "4rem 2rem", color: "rgba(255,255,255,0.3)", fontSize: "0.875rem" }}>No photos uploaded yet</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8 }}>
              {photos.map(p => (
                <div
                  key={p.id}
                  onClick={() => setSelected(p)}
                  style={{ aspectRatio: "1", borderRadius: 8, overflow: "hidden", cursor: "pointer" }}
                >
                  <img
                    src={p.photo_url}
                    alt={p.caption ?? ""}
                    loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", transition: "transform 0.3s" }}
                    onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.05)")}
                    onMouseLeave={e => (e.currentTarget.style.transform = "")}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Small session card ────────────────────────────────────────────────────────

function SessionCard({ session, count, onClick }: { session: Session; count: number; onClick: () => void }) {
  const place = session.venue || session.location || "Hyderabad";
  return (
    <div
      onClick={onClick}
      className="cs-ch-card"
      style={{ borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", transition: "border-color 0.2s, transform 0.2s" }}
    >
      <div style={{ height: 68, overflow: "hidden", background: "var(--surface-elevated)", position: "relative" }}>
        {session.photo_url ? (
          <img
            src={session.photo_url}
            alt={session.title}
            loading="lazy"
            className="cs-ch-img"
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 30%", display: "block", transition: "transform 0.4s" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(232,98,10,0.05)" }}>
            <span style={{ fontSize: "1.3rem" }}>🏃</span>
          </div>
        )}
      </div>
      <div style={{ padding: "8px 9px 7px" }}>
        <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--foreground)", lineHeight: 1.3, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {session.title}
        </div>
        <div style={{ fontSize: "10px", color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: count > 0 ? 3 : 0 }}>
          📍 {place}
        </div>
        {count > 0 && (
          <div style={{ fontSize: "10px", color: "var(--cs-orange)", fontWeight: 600 }}>
            {count} runner{count !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Community Highlights ──────────────────────────────────────────────────────

export default function CommunityHighlights() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [gallery, setGallery] = useState<Session | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/sessions/recent").then(r => r.json()),
      fetch("/api/stats").then(r => r.json()),
    ])
      .then(([sessData, statsData]) => {
        const s: Session[] = sessData.sessions ?? [];
        const top4 = s.slice(0, 4);
        setSessions(top4);
        setStats(statsData);

        const ids = top4.map(x => x.id).join(",");
        if (ids) {
          fetch(`/api/sessions/rsvp-counts?ids=${ids}`)
            .then(r => r.json())
            .then(d => setCounts(d.counts ?? {}))
            .catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const featured = sessions[0] ?? null;
  const recent = sessions.slice(1, 4);
  const topQuote = (s: Session) => s.feedback?.find(f => f.comment)?.comment ?? null;

  const shimmer: CSSProperties = {
    backgroundImage: "linear-gradient(90deg, var(--border) 25%, var(--surface-elevated) 50%, var(--border) 75%)",
    backgroundSize: "200% 100%",
    animation: "cs-shimmer 1.4s infinite",
  };

  return (
    <>
      <style>{`
        @keyframes cs-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        .cs-ch-card:hover { border-color: oklch(0.72 0.19 49 / 40%) !important; transform: translateY(-2px); }
        .cs-ch-card:hover .cs-ch-img { transform: scale(1.06); }
        .cs-ch-feat-wrap:hover .cs-ch-feat-img { transform: scale(1.04); }
      `}</style>

      <div style={{
        position: "relative", borderRadius: 20, border: "1px solid var(--border)",
        background: "var(--surface)", boxShadow: "var(--shadow-card)", overflow: "hidden",
      }}>

        {/* Section header */}
        <div style={{ padding: "13px 16px 11px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--cs-orange)", boxShadow: "0 0 6px var(--cs-orange)", flexShrink: 0 }} />
          <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: "var(--cs-orange)" }}>
            Community Highlights
          </span>
        </div>

        {loading ? (
          <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ height: 160, borderRadius: 12, ...shimmer }} />
            <div style={{ height: 12, width: "55%", borderRadius: 4, ...shimmer }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {[0, 1, 2].map(i => <div key={i} style={{ height: 116, borderRadius: 10, ...shimmer }} />)}
            </div>
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3rem 1.5rem", textAlign: "center", gap: 10 }}>
            <span style={{ fontSize: "2.5rem" }}>🏃</span>
            <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--foreground)" }}>Sessions coming soon</div>
            <div style={{ fontSize: "0.78rem", color: "var(--muted-foreground)" }}>Check back after our next group run</div>
          </div>
        ) : (
          <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 9 }}>

            {/* Featured session */}
            {featured && (
              <div>
                {/* Image */}
                <div
                  className="cs-ch-feat-wrap"
                  onClick={() => setGallery(featured)}
                  style={{ position: "relative", height: 155, borderRadius: 12, overflow: "hidden", cursor: "pointer", background: "var(--surface-elevated)" }}
                >
                  {featured.photo_url ? (
                    <img
                      src={featured.photo_url}
                      alt={featured.title}
                      loading="lazy"
                      className="cs-ch-feat-img"
                      style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 30%", display: "block", transition: "transform 0.5s ease" }}
                    />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: "3rem" }}>🏃</span>
                    </div>
                  )}
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(13,13,16,0.88) 0%, transparent 55%)" }} />
                  {/* View photos pill */}
                  <div style={{ position: "absolute", top: 9, right: 9, padding: "3px 9px", borderRadius: 999, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.1)", fontSize: "10px", color: "rgba(255,255,255,0.75)", fontWeight: 500 }}>
                    📷 View photos
                  </div>
                  {/* Overlaid info */}
                  <div style={{ position: "absolute", bottom: 10, left: 11, right: 11 }}>
                    <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#fff", lineHeight: 1.25, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {featured.title}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                      <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.55)" }}>
                        📍 {featured.venue || featured.location || "Hyderabad"}
                      </span>
                      <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>·</span>
                      <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.55)" }}>{fmtDate(featured.date)}</span>
                      {(counts[featured.id] ?? 0) > 0 && (
                        <>
                          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>·</span>
                          <span style={{ fontSize: "10px", color: "var(--cs-orange)", fontWeight: 600 }}>{counts[featured.id]} runners</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Top feedback quote */}
                {topQuote(featured) && (
                  <div style={{ marginTop: 8, padding: "7px 10px", borderLeft: "2px solid rgba(232,98,10,0.45)", background: "rgba(232,98,10,0.04)", borderRadius: "0 6px 6px 0" }}>
                    <p style={{
                      margin: 0, fontSize: "0.7rem", color: "var(--muted-foreground)", fontStyle: "italic", lineHeight: 1.55,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical" as const,
                      overflow: "hidden",
                    }}>
                      &ldquo;{topQuote(featured)}&rdquo;
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Recent sessions */}
            {recent.length > 0 && (
              <>
                <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-foreground)", marginTop: 1 }}>
                  Recent · {recent.length} session{recent.length !== 1 ? "s" : ""}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 7 }}>
                  {recent.map(s => (
                    <SessionCard
                      key={s.id}
                      session={s}
                      count={counts[s.id] ?? 0}
                      onClick={() => setGallery(s)}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Mini stats strip */}
            {stats && (stats.totalRunners > 0 || stats.trainingsConducted > 0) && (
              <div style={{ marginTop: 3, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderTop: "1px solid var(--border)", paddingTop: 10, gap: 4 }}>
                {[
                  { val: stats.totalRunners, label: "Members" },
                  { val: stats.trainingsConducted, label: "Sessions" },
                  { val: stats.activeThisMonth, label: "Active / mo" },
                ].map((item, i) => (
                  <div key={item.label} style={{ textAlign: "center", borderLeft: i > 0 ? "1px solid var(--border)" : "none" }}>
                    <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--cs-orange)", lineHeight: 1 }}>
                      {item.val > 0 ? item.val : "—"}
                    </div>
                    <div style={{ fontSize: "9px", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 3 }}>
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {gallery && <Gallery session={gallery} onClose={() => setGallery(null)} />}
    </>
  );
}
