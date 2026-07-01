"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { Play, Users, MapPin, Calendar, Camera, ArrowRight, Pause } from "lucide-react";
import MediaGallery, { type GalleryItem } from "./MediaGallery";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Session {
  id:                  string;
  title:               string;
  date:                string;
  time:                string | null;
  venue:               string | null;
  location:            string | null;
  photo_url:           string | null;
  // New optional fields from updated API
  cover_media_type?:    string | null;
  cover_media_url?:     string | null;
  cover_thumbnail_url?: string | null;
  cover_duration_secs?: number | null;
  media_count?:         number;
  avgRating:            number | null;
  reviewCount:          number;
  feedback:             { user_name: string; rating: number; comment: string | null }[];
}

interface Stats {
  totalRunners:       number;
  trainingsConducted: number;
  activeThisMonth:    number;
}

interface Photo {
  id:           string;
  photo_url:    string;
  caption:      string | null;
  uploader_name: string;
  likes:        number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function getVideoUrl(s: Session): string | null {
  return s.cover_media_type === "video" ? (s.cover_media_url ?? null) : null;
}

function getImageUrl(s: Session): string | null {
  return s.cover_thumbnail_url ?? s.photo_url ?? null;
}

// ── Intersection-observer hook for viewport-aware playback ────────────────────
function useVideoAutoplay(ref: React.RefObject<HTMLVideoElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(el);

    // Also pause when the tab becomes hidden
    const onVisChange = () => {
      if (document.hidden) el.pause();
    };
    document.addEventListener("visibilitychange", onVisChange);

    return () => {
      obs.disconnect();
      document.removeEventListener("visibilitychange", onVisChange);
    };
  }, [ref]);
}

// ── Hero video/image component ────────────────────────────────────────────────

function HeroMedia({ session, onClick }: { session: Session; onClick: () => void }) {
  const videoUrl = getVideoUrl(session);
  const imageUrl = getImageUrl(session);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loaded,    setLoaded]    = useState(false);

  useVideoAutoplay(videoRef as React.RefObject<HTMLVideoElement>);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay  = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    v.addEventListener("play",  onPlay);
    v.addEventListener("pause", onPause);
    return () => { v.removeEventListener("play", onPlay); v.removeEventListener("pause", onPause); };
  }, []);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
  };

  return (
    <div
      onClick={onClick}
      style={{
        position: "relative", borderRadius: 20, overflow: "hidden",
        aspectRatio: "16/9", cursor: "pointer",
        background: "rgba(255,255,255,0.04)",
      }}
      role="button"
      aria-label={`View gallery for ${session.title}`}
    >
      {/* Poster / background image */}
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={session.title}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", objectPosition: "center 30%",
            display: "block",
            transition: "transform 8s ease",
            transform: loaded ? "scale(1.05)" : "scale(1)",
          }}
        />
      )}

      {/* Video overlay */}
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          muted
          loop
          playsInline
          preload="metadata"
          poster={imageUrl ?? undefined}
          onLoadedData={() => setLoaded(true)}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", display: "block",
          }}
        />
      )}

      {/* Dark gradient overlay */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.3) 55%, rgba(0,0,0,0.08) 100%)",
        pointerEvents: "none",
      }} />

      {/* Video indicator + play/pause toggle */}
      {videoUrl && (
        <button
          onClick={togglePlay}
          style={{
            position: "absolute", top: 12, left: 12,
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 12px", borderRadius: 999,
            background: isPlaying ? "rgba(232,98,10,0.85)" : "rgba(0,0,0,0.55)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer",
            letterSpacing: "0.06em", textTransform: "uppercase" as const,
            transition: "background 0.2s",
          }}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying
            ? <><Pause size={10} />&nbsp;Playing</>
            : <><Play  size={10} />&nbsp;Video</>}
        </button>
      )}

      {/* Gallery badge */}
      <div style={{
        position: "absolute", top: 12, right: 12,
        display: "flex", alignItems: "center", gap: 5,
        padding: "5px 11px", borderRadius: 999,
        background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)",
        border: "1px solid rgba(255,255,255,0.12)",
        fontSize: 10, color: "rgba(255,255,255,0.8)", fontWeight: 600,
      }}>
        <Camera size={11} />
        View Gallery
      </div>

      {/* Content overlay */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        padding: "20px 18px 18px",
      }}>
        <div style={{
          fontSize: "1rem", fontWeight: 700, color: "#fff",
          lineHeight: 1.3, marginBottom: 8,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
        }}>
          {session.title}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" as const }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.65)" }}>
            <MapPin size={10} />{session.venue || session.location || "Hyderabad"}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.65)" }}>
            <Calendar size={10} />{fmtDate(session.date)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Session card (hover-to-play) ──────────────────────────────────────────────

function SessionCard({
  session, count, onClick,
}: { session: Session; count: number; onClick: () => void }) {
  const videoUrl = getVideoUrl(session);
  const imageUrl = getImageUrl(session);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hovered, setHovered] = useState(false);

  const handleMouseEnter = useCallback(() => {
    setHovered(true);
    if (videoRef.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      videoRef.current.play().catch(() => {});
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHovered(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, []);

  // Mobile: tap to play/pause
  const handleTap = useCallback(() => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
        setHovered(true);
      } else {
        videoRef.current.pause();
        setHovered(false);
      }
    }
    onClick();
  }, [onClick]);

  return (
    <motion.div
      onClick={handleTap}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      style={{
        borderRadius: 14, overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)",
        cursor: "pointer",
        boxShadow: hovered ? "0 0 0 1px rgba(232,98,10,0.5), 0 16px 40px rgba(0,0,0,0.4)" : "none",
        transition: "box-shadow 0.25s ease",
      }}
      role="button"
      aria-label={`View ${session.title}`}
    >
      {/* Media area */}
      <div style={{ position: "relative", aspectRatio: "4/3", overflow: "hidden" }}>
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={session.title}
            loading="lazy"
            style={{
              width: "100%", height: "100%", objectFit: "cover",
              objectPosition: "center 30%", display: "block",
              transition: "transform 0.5s ease, filter 0.3s ease",
              transform: hovered ? "scale(1.06)" : "scale(1)",
              filter: hovered ? "brightness(0.7)" : "brightness(1)",
            }}
          />
        )}

        {videoUrl && (
          <video
            ref={videoRef}
            src={videoUrl}
            muted
            playsInline
            preload="metadata"
            poster={imageUrl ?? undefined}
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%",
              objectFit: "cover", display: "block",
              opacity: hovered ? 1 : 0,
              transition: "opacity 0.4s ease",
            }}
          />
        )}

        {/* Gradient overlay */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 55%)",
        }} />

        {/* Play icon for video cards */}
        {videoUrl && !hovered && (
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: 36, height: 36, borderRadius: "50%",
            background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)",
            border: "1px solid rgba(255,255,255,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Play size={14} style={{ color: "#fff", marginLeft: 2 }} />
          </div>
        )}

        {/* Runner count badge */}
        {count > 0 && (
          <div style={{
            position: "absolute", bottom: 8, left: 9,
            display: "flex", alignItems: "center", gap: 4,
            padding: "3px 9px", borderRadius: 999,
            background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)",
            fontSize: 10, color: "var(--cs-orange)", fontWeight: 700,
          }}>
            <Users size={9} />{count} runners
          </div>
        )}
      </div>

      {/* Card info */}
      <div style={{ padding: "10px 12px 12px" }}>
        <div style={{
          fontSize: "0.76rem", fontWeight: 700, color: "var(--foreground)",
          lineHeight: 1.3, marginBottom: 4,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
        }}>
          {session.title}
        </div>
        <div style={{
          fontSize: "0.68rem", color: "var(--muted-foreground)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
        }}>
          📍 {session.venue || session.location || "Hyderabad"}
        </div>
      </div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CommunityHighlights() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [counts,   setCounts]   = useState<Record<string, number>>({});
  const [stats,    setStats]    = useState<Stats | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [gallery,  setGallery]  = useState<{ session: Session; items: GalleryItem[]; startIndex: number } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/sessions/recent").then(r => r.json()),
      fetch("/api/stats").then(r => r.json()),
    ])
      .then(([sessData, statsData]) => {
        const s: Session[] = sessData.sessions ?? [];
        setSessions(s);
        setStats(statsData);

        const ids = s.map(x => x.id).join(",");
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

  const openGallery = useCallback(async (session: Session, startIndex = 0) => {
    // Try to load all media for this session
    const items: GalleryItem[] = [];

    try {
      const res  = await fetch(`/api/sessions/${session.id}/media`);
      const data = await res.json() as { media?: { id: string; media_type: string; url: string; thumbnail_url: string | null; caption: string | null }[] };
      for (const m of data.media ?? []) {
        items.push({
          id:      m.id,
          type:    m.media_type as "image" | "video",
          url:     m.url,
          thumb:   m.thumbnail_url ?? m.url,
          caption: m.caption,
        });
      }
    } catch { /* media table may not exist */ }

    // Fall back to legacy session_photos
    if (items.length === 0) {
      try {
        const res  = await fetch(`/api/sessions/${session.id}/photos`);
        const data = await res.json() as { photos?: { id: string; photo_url: string; caption: string | null }[] };
        for (const p of data.photos ?? []) {
          items.push({
            id:      p.id,
            type:    "image",
            url:     p.photo_url,
            thumb:   p.photo_url,
            caption: p.caption,
          });
        }
      } catch { /* no photos */ }
    }

    // If still nothing, show cover as single item
    if (items.length === 0) {
      const coverUrl  = session.cover_media_url ?? session.photo_url;
      const coverType = session.cover_media_type === "video" ? "video" : "image";
      if (coverUrl) {
        items.push({
          id:    "cover",
          type:  coverType as "image" | "video",
          url:   coverUrl,
          thumb: session.cover_thumbnail_url ?? session.photo_url ?? coverUrl,
        });
      }
    }

    if (items.length > 0) {
      setGallery({ session, items, startIndex });
    }
  }, []);

  const featured = sessions[0] ?? null;
  const recent   = sessions.slice(1, 4);

  // Stagger variants
  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.07 } },
  };
  const cardVariant: Variants = {
    hidden: { opacity: 0, y: 24 },
    show:   { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
  };

  if (loading) {
    return (
      <div style={{
        borderRadius: 20, border: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(255,255,255,0.02)", padding: 16,
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        {/* Shimmer skeleton */}
        <div style={{
          aspectRatio: "16/9", borderRadius: 16,
          background: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)",
          backgroundSize: "200% 100%",
          animation: "cs-shimmer 1.4s infinite",
        }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              aspectRatio: "4/3", borderRadius: 12,
              background: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)",
              backgroundSize: "200% 100%",
              animation: `cs-shimmer 1.4s ${i * 0.15}s infinite`,
            }} />
          ))}
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div style={{
        borderRadius: 20, border: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(255,255,255,0.02)",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "3rem 1.5rem", gap: 12, textAlign: "center",
      }}>
        <span style={{ fontSize: "2.5rem" }}>🏃</span>
        <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--foreground)" }}>
          Sessions coming soon
        </div>
        <div style={{ fontSize: "0.78rem", color: "var(--muted-foreground)" }}>
          Check back after our next group run
        </div>
      </div>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(255,255,255,0.02)",
          backdropFilter: "blur(16px)",
          overflow: "hidden",
        }}
      >
        {/* ── Header ── */}
        <div style={{
          padding: "12px 16px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "var(--cs-orange)",
            boxShadow: "0 0 8px var(--cs-orange)",
            flexShrink: 0, display: "block",
            animation: "pulse-ring 2s infinite",
          }} />
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.13em",
            textTransform: "uppercase" as const, color: "var(--cs-orange)",
          }}>
            Community Highlights
          </span>
          {stats && stats.totalRunners > 0 && (
            <span style={{
              marginLeft: "auto", fontSize: 10,
              color: "var(--muted-foreground)", fontWeight: 500,
            }}>
              {stats.totalRunners} runners
            </span>
          )}
        </div>

        <div style={{ padding: "14px 14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* ── Hero ── */}
          {featured && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7 }}
            >
              <HeroMedia session={featured} onClick={() => openGallery(featured)} />

              {/* Top quote */}
              {featured.feedback?.find(f => f.comment) && (
                <div style={{
                  marginTop: 10, padding: "8px 12px",
                  borderLeft: "2px solid rgba(232,98,10,0.45)",
                  background: "rgba(232,98,10,0.04)",
                  borderRadius: "0 8px 8px 0",
                }}>
                  <p style={{
                    margin: 0, fontSize: "0.7rem",
                    color: "var(--muted-foreground)", fontStyle: "italic",
                    lineHeight: 1.55,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical" as const,
                    overflow: "hidden",
                  }}>
                    &ldquo;{featured.feedback.find(f => f.comment)!.comment}&rdquo;
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* ── Recent cards ── */}
          {recent.length > 0 && (
            <>
              <div style={{
                fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
                textTransform: "uppercase" as const, color: "var(--muted-foreground)",
              }}>
                Recent · {recent.length} session{recent.length !== 1 ? "s" : ""}
              </div>

              <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}
              >
                {recent.map(s => (
                  <motion.div key={s.id} variants={cardVariant}>
                    <SessionCard
                      session={s}
                      count={counts[s.id] ?? 0}
                      onClick={() => openGallery(s)}
                    />
                  </motion.div>
                ))}
              </motion.div>
            </>
          )}

          {/* ── Stats strip ── */}
          {stats && (stats.totalRunners > 0 || stats.trainingsConducted > 0) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              style={{
                marginTop: 4,
                display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
                borderTop: "1px solid rgba(255,255,255,0.05)",
                paddingTop: 12, gap: 4,
              }}
            >
              {[
                { val: stats.totalRunners,       label: "Members"    },
                { val: stats.trainingsConducted, label: "Sessions"   },
                { val: stats.activeThisMonth,    label: "Active/mo"  },
              ].map((item, i) => (
                <div key={item.label} style={{
                  textAlign: "center",
                  borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
                }}>
                  <div style={{
                    fontSize: "1.1rem", fontWeight: 800,
                    color: "var(--cs-orange)", lineHeight: 1,
                  }}>
                    {item.val > 0 ? item.val : "—"}
                  </div>
                  <div style={{
                    fontSize: 9, color: "var(--muted-foreground)",
                    textTransform: "uppercase" as const, letterSpacing: "0.06em", marginTop: 4,
                  }}>
                    {item.label}
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {/* ── Join CTA ── */}
          <motion.a
            href="/auth?tab=register"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            whileHover={{ scale: 1.02 }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "10px 14px", borderRadius: 10,
              background: "linear-gradient(135deg, oklch(0.72 0.19 49), oklch(0.66 0.22 30))",
              color: "#fff", fontWeight: 700, fontSize: "0.8rem",
              textDecoration: "none",
              boxShadow: "0 4px 20px oklch(0.72 0.19 49 / 30%)",
            }}
          >
            Join Next Session <ArrowRight size={13} />
          </motion.a>
        </div>
      </motion.div>

      {/* ── Gallery modal ── */}
      <AnimatePresence>
        {gallery && (
          <MediaGallery
            items={gallery.items}
            initialIndex={gallery.startIndex}
            title={gallery.session.title}
            onClose={() => setGallery(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
