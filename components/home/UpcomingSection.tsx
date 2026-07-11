"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar, MapPin, Users, ChevronLeft, ChevronRight,
  CheckCircle2, Clock, ArrowRight, Ticket, History,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SessionItem {
  kind:               "session";
  id:                 string;
  title:              string;
  date:               string;
  time:               string | null;
  venue:              string | null;
  location:           string;
  photo_url:          string | null;
  registered_count:   number;
  registered:         boolean;
  user_session_count: number;
}

interface EventItem {
  kind:                  "event";
  id:                    string;
  title:                 string;
  event_type:            string;
  cover_image:           string | null;
  date:                  string;
  time:                  string | null;
  location:              string;
  price:                 number;
  max_participants:      number | null;
  participant_count:     number;
  share_slug:            string | null;
  registration_required: boolean;
  registered:            boolean;
}

type Item = SessionItem | EventItem;

// ── Countdown ─────────────────────────────────────────────────────────────────

interface Countdown {
  label:  string;
  color:  string;
  bg:     string;
  isLive: boolean;
  isSoon: boolean; // within 30 min — show QR hint
}

function countdown(dateStr: string, timeStr: string | null, now: Date): Countdown {
  const target  = new Date(`${dateStr}T${timeStr ?? "00:00"}:00+05:30`);
  const diffMs  = target.getTime() - now.getTime();
  const diffMin = diffMs / 60000;

  if (diffMin <= 0 && diffMin > -120)
    return { label: "Live Now",      color: "#4ade80", bg: "rgba(34,197,94,0.22)",   isLive: true,  isSoon: true  };
  if (diffMin <= -120)
    return { label: "Ended",         color: "#6b7280", bg: "rgba(107,114,128,0.15)", isLive: false, isSoon: false };
  if (diffMin <= 15)
    return { label: "Starting Soon", color: "#ef4444", bg: "rgba(239,68,68,0.22)",   isLive: false, isSoon: true  };
  if (diffMin <= 60) {
    const m = Math.ceil(diffMin);
    return { label: `In ${m}m`,      color: "#ef4444", bg: "rgba(239,68,68,0.2)",    isLive: false, isSoon: true  };
  }

  const diffH = diffMs / 3600000;
  if (diffH <= 24) {
    const h = Math.floor(diffH);
    const m = Math.floor(diffMin % 60);
    return {
      label:  m > 0 ? `Starts in ${h}h ${m}m` : `Starts in ${h}h`,
      color:  "#e8620a", bg: "rgba(232,98,10,0.2)", isLive: false, isSoon: false,
    };
  }

  const days  = Math.floor(diffH / 24);
  const hours = Math.floor(diffH % 24);
  return {
    label:  hours > 0 ? `Starts in ${days}d ${hours}h` : `Starts in ${days}d`,
    color:  "#3b82f6", bg: "rgba(59,130,246,0.2)", isLive: false, isSoon: false,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const EVENT_TYPE: Record<string, { label: string; color: string; bg: string }> = {
  running:   { label: "Run",       color: "#e8620a", bg: "rgba(232,98,10,0.18)"  },
  cycling:   { label: "Cycling",   color: "#3b82f6", bg: "rgba(59,130,246,0.18)" },
  training:  { label: "Training",  color: "#a855f7", bg: "rgba(168,85,247,0.18)" },
  race:      { label: "Race",      color: "#ef4444", bg: "rgba(239,68,68,0.18)"  },
  community: { label: "Community", color: "#22c55e", bg: "rgba(34,197,94,0.18)"  },
  workshop:  { label: "Workshop",  color: "#eab308", bg: "rgba(234,179,8,0.18)"  },
};
function evtConf(t: string) { return EVENT_TYPE[t] ?? EVENT_TYPE.running; }

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short",
  });
}

function fmtTime(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function slotsLeft(max: number | null, current: number): number | null {
  if (max === null) return null;
  return Math.max(0, max - current);
}

const SESSION_GRADIENT = "linear-gradient(135deg, #0d1b2a 0%, #1a2744 50%, #0f3460 100%)";
const EVENT_GRADIENTS: Record<string, string> = {
  running:   "linear-gradient(135deg, #7c2d12 0%, #9a3412 100%)",
  race:      "linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)",
  training:  "linear-gradient(135deg, #3b0764 0%, #4c1d95 100%)",
  workshop:  "linear-gradient(135deg, #422006 0%, #713f12 100%)",
  community: "linear-gradient(135deg, #14532d 0%, #166534 100%)",
  cycling:   "linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%)",
};

// ── Card ──────────────────────────────────────────────────────────────────────

function ItemCard({ item, now, onAction }: { item: Item; now: Date; onAction: (item: Item) => void }) {
  const [hovered, setHovered] = useState(false);
  const cd = countdown(item.date, item.time, now);

  const imageUrl = item.kind === "session" ? item.photo_url : item.cover_image;
  const bg       = imageUrl ? undefined
    : item.kind === "session" ? SESSION_GRADIENT
    : (EVENT_GRADIENTS[item.event_type] ?? EVENT_GRADIENTS.running);

  const slots  = item.kind === "event" ? slotsLeft(item.max_participants, item.participant_count) : null;
  const isFull = slots !== null && slots === 0;
  const isLow  = slots !== null && slots > 0 && slots <= 10;
  const isFree = item.kind === "event" && item.price === 0;

  const typeLabel = item.kind === "session" ? "Session" : evtConf(item.event_type).label;
  const typeColor = item.kind === "session" ? "#e8620a"  : evtConf(item.event_type).color;
  const typeBg    = item.kind === "session" ? "rgba(232,98,10,0.22)" : evtConf(item.event_type).bg;

  const pastCount = item.kind === "session" ? item.user_session_count : 0;

  return (
    <div
      onClick={() => !isFull && onAction(item)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && !isFull && onAction(item)}
      style={{
        borderRadius: 16,
        overflow: "hidden",
        border: `1px solid ${
          cd.isLive     ? "rgba(74,222,128,0.3)"  :
          item.registered ? "rgba(34,197,94,0.3)"  :
          hovered       ? "rgba(232,98,10,0.4)"  :
                          "rgba(255,255,255,0.08)"
        }`,
        background: "rgba(255,255,255,0.02)",
        cursor: isFull ? "default" : "pointer",
        transition: "transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease",
        transform: hovered && !isFull ? "translateY(-4px)" : "none",
        boxShadow: hovered && !isFull ? "0 12px 32px rgba(0,0,0,0.4)"
          : cd.isLive ? "0 0 20px rgba(74,222,128,0.12)" : "none",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      {/* ── Image ──────────────────────────────────────────────────────────── */}
      <div className="cs-scard-img-wrap" style={{
        position: "relative",
        height: 160,
        flexShrink: 0,
        background: bg,
        overflow: "hidden",
      }}>
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={item.title}
            loading="lazy"
            className="cs-scard-img"
            style={{
              width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 25%",
              display: "block",
              transition: "transform 0.5s ease",
              transform: hovered ? "scale(1.05)" : "scale(1)",
            }}
          />
        )}

        {/* Gradient overlay — dark top + dark bottom for badge readability */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.72) 100%)",
        }} />

        {/* ── Top badges row ── */}
        <div style={{
          position: "absolute", top: 9, left: 9, right: 9,
          display: "flex", alignItems: "center", gap: 5,
        }}>
          {/* Type */}
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase",
            padding: "3px 8px", borderRadius: 999,
            background: typeBg, color: typeColor,
            backdropFilter: "blur(8px)", border: `1px solid ${typeColor}44`,
          }}>
            {typeLabel}
          </span>

          {/* Free / Price (events only) */}
          {item.kind === "event" && (
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
              padding: "3px 8px", borderRadius: 999,
              background: isFree ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.1)",
              color: isFree ? "#22c55e" : "rgba(255,255,255,0.8)",
              backdropFilter: "blur(8px)",
            }}>
              {isFree ? "Free" : `₹${item.price}`}
            </span>
          )}

          {/* Spacer */}
          <span style={{ flex: 1 }} />

          {/* Countdown badge */}
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
            background: cd.isLive ? cd.bg : "rgba(0,0,0,0.6)",
            color: cd.color,
            backdropFilter: "blur(8px)",
            border: `1px solid ${cd.color}55`,
            display: "flex", alignItems: "center", gap: 3,
            animation: cd.isLive ? "pulse-ring 2s infinite" : "none",
          }}>
            {cd.isLive && (
              <span style={{
                width: 5, height: 5, borderRadius: "50%",
                background: "#4ade80", display: "inline-block", flexShrink: 0,
              }} />
            )}
            {cd.label}
          </span>
        </div>

        {/* ── Registered badge (bottom-left of image) ── */}
        {item.registered && (
          <div style={{
            position: "absolute", bottom: 9, left: 9,
            display: "flex", alignItems: "center", gap: 4,
            fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
            background: "rgba(34,197,94,0.22)", color: "#4ade80",
            backdropFilter: "blur(8px)", border: "1px solid rgba(34,197,94,0.3)",
          }}>
            <CheckCircle2 size={9} /> Registered
          </div>
        )}

        {/* ── Slots low ── */}
        {isLow && !isFull && !item.registered && (
          <div style={{
            position: "absolute", bottom: 9, left: 9,
            fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
            background: "rgba(239,68,68,0.85)", color: "#fff",
          }}>
            {slots} slots left
          </div>
        )}

        {/* ── Sold out overlay ── */}
        {isFull && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)",
          }}>
            <span style={{
              fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
              padding: "6px 16px", borderRadius: 999, background: "rgba(239,68,68,0.9)", color: "#fff",
            }}>
              Full
            </span>
          </div>
        )}
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div style={{ padding: "12px 14px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>

        {/* Title */}
        <div style={{
          fontSize: "0.9rem", fontWeight: 700, color: "var(--foreground)", lineHeight: 1.3,
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
        }}>
          {item.title}
        </div>

        {/* Meta rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.72rem", color: "var(--muted-foreground)" }}>
            <Calendar size={10} style={{ flexShrink: 0, color: "var(--cs-orange)" }} />
            <span>{fmtDate(item.date)}{item.time ? ` · ${fmtTime(item.time)}` : ""}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.72rem", color: "var(--muted-foreground)" }}>
            <MapPin size={10} style={{ flexShrink: 0, color: "var(--cs-orange)" }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.kind === "session" ? (item.venue ?? item.location) : item.location}
            </span>
          </div>

          {/* Session: joined count */}
          {item.kind === "session" && item.registered_count > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.72rem", color: "var(--muted-foreground)" }}>
              <Users size={10} style={{ flexShrink: 0 }} />
              <span>{item.registered_count} joined</span>
            </div>
          )}

          {/* Event: slots */}
          {item.kind === "event" && item.max_participants !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.72rem", color: isLow ? "#f87171" : "var(--muted-foreground)" }}>
              <Ticket size={10} style={{ flexShrink: 0 }} />
              <span>{isFull ? "Sold out" : slots !== null ? `${slots} of ${item.max_participants} slots left` : `${item.participant_count} registered`}</span>
            </div>
          )}

          {/* Attendance history */}
          {pastCount > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.68rem", color: "rgba(74,222,128,0.7)" }}>
              <History size={9} style={{ flexShrink: 0 }} />
              <span>You attended {pastCount === 1 ? "this session before" : `${pastCount} times before`}</span>
            </div>
          )}
        </div>

        {/* CTA */}
        <div style={{ marginTop: "auto", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          {item.registered ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#4ade80", display: "flex", alignItems: "center", gap: 4 }}>
                <CheckCircle2 size={11} /> You&apos;re in
              </span>
              {cd.isSoon && !cd.isLive && (
                <span style={{ fontSize: "0.67rem", color: "var(--cs-orange)", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
                  <Clock size={9} /> QR available — scan at the venue
                </span>
              )}
              {cd.isLive && (
                <span style={{ fontSize: "0.67rem", color: "#4ade80", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
                  <Clock size={9} /> Session is live — head to the venue!
                </span>
              )}
            </div>
          ) : isFull ? (
            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#f87171" }}>Join Waitlist →</span>
          ) : (
            <span style={{
              fontSize: "0.72rem", fontWeight: 700,
              color: hovered ? "var(--cs-orange)" : "rgba(255,255,255,0.7)",
              display: "flex", alignItems: "center", gap: 4,
              transition: "color 0.15s",
            }}>
              {item.kind === "session" ? "Register free" : item.price === 0 ? "Register free" : "Register now"}
              <ArrowRight size={11} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{
      borderRadius: 16, overflow: "hidden",
      border: "1px solid rgba(255,255,255,0.06)",
      background: "rgba(255,255,255,0.02)",
    }}>
      <div style={{
        height: 160,
        background: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)",
        backgroundSize: "200% 100%",
        animation: "cs-shimmer 1.4s infinite",
      }} />
      <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ height: 14, borderRadius: 6, background: "rgba(255,255,255,0.06)", width: "75%" }} />
        <div style={{ height: 10, borderRadius: 6, background: "rgba(255,255,255,0.04)", width: "55%" }} />
        <div style={{ height: 10, borderRadius: 6, background: "rgba(255,255,255,0.04)", width: "65%" }} />
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function UpcomingSection() {
  const router   = useRouter();
  const trackRef = useRef<HTMLDivElement>(null);

  const [items,   setItems]   = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [now,     setNow]     = useState(() => new Date());

  // Tick every minute for live countdown updates
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const fetchItems = useCallback(async () => {
    const token   = typeof window !== "undefined" ? localStorage.getItem("cs_token") : null;
    const headers: HeadersInit = token ? { "x-user-token": token } : {};
    try {
      const res  = await fetch("/api/upcoming", { headers });
      const data = await res.json() as { items?: Item[] };
      setItems(data.items ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void fetchItems();
    const id = setInterval(() => void fetchItems(), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchItems]);

  const updateNav = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 10);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateNav, { passive: true });
    updateNav();
    return () => el.removeEventListener("scroll", updateNav);
  }, [items, updateNav]);

  const scroll = (dir: "prev" | "next") => {
    const el  = trackRef.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const cardW = card ? card.offsetWidth + 12 : 300;
    el.scrollBy({ left: dir === "next" ? cardW : -cardW, behavior: "smooth" });
  };

  function handleAction(item: Item) {
    const user = typeof window !== "undefined" ? localStorage.getItem("cs_user") : null;
    if (item.kind === "session") {
      router.push(user ? `/join/${item.id}` : `/auth?redirect=/join/${item.id}`);
    } else {
      const path = item.share_slug ? `/events/${item.share_slug}` : `/events/${item.id}`;
      router.push(path);
    }
  }

  const showEmpty = !loading && items.length === 0;

  return (
    <section id="upcoming" style={{ background: "var(--background)", padding: "clamp(3rem,6vh,5rem) 0" }}>
      <div className="container">

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "2rem", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: "0.14em",
              textTransform: "uppercase", color: "var(--cs-orange)", marginBottom: 6,
              display: "flex", alignItems: "center", gap: 7,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%", background: "var(--cs-orange)",
                display: "inline-block", boxShadow: "0 0 8px var(--cs-orange)",
                animation: "pulse-ring 2s infinite",
              }} />
              What&apos;s Coming Up
            </div>
            <h2 style={{
              fontSize: "clamp(1.6rem,3.5vw,2.4rem)", fontWeight: 300,
              color: "var(--foreground)", margin: 0, lineHeight: 1.2,
            }}>
              Sessions &amp; <em style={{ color: "var(--cs-orange)", fontStyle: "normal", fontWeight: 600 }}>Events</em>
            </h2>
          </div>

          <div className="us-view-links" style={{ display: "flex", gap: 12 }}>
            <a href="/sessions" style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
              All Sessions <ArrowRight size={12} />
            </a>
            <a href="/events" style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
              All Events <ArrowRight size={12} />
            </a>
          </div>
        </div>

        {/* Grid / Carousel */}
        {loading ? (
          <div className="us-grid">
            {[0, 1, 2].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : showEmpty ? (
          <div style={{
            textAlign: "center", padding: "3.5rem 1rem",
            border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16,
            background: "rgba(255,255,255,0.01)",
          }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🏃</div>
            <div style={{ fontWeight: 700, color: "var(--foreground)", marginBottom: "0.4rem" }}>
              No upcoming sessions this week
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", marginBottom: "1.5rem" }}>
              Check back soon — new sessions are announced regularly.
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
              <a href="/events" style={{ padding: "8px 20px", borderRadius: 999, fontSize: "0.8rem", fontWeight: 700, background: "var(--cs-orange)", color: "#fff", textDecoration: "none" }}>
                Browse Events
              </a>
              <a href="/training-plans" style={{ padding: "8px 20px", borderRadius: 999, fontSize: "0.8rem", fontWeight: 600, border: "1px solid rgba(255,255,255,0.15)", color: "var(--foreground)", textDecoration: "none" }}>
                Training Plans
              </a>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop grid */}
            <div className="us-grid">
              {items.map((item) => (
                <ItemCard key={`${item.kind}-${item.id}`} item={item} now={now} onAction={handleAction} />
              ))}
            </div>

            {/* Mobile carousel */}
            <div className="us-carousel-wrap">
              <div ref={trackRef} className="us-carousel-track">
                {items.map((item) => (
                  <div key={`${item.kind}-${item.id}`} className="us-carousel-item">
                    <ItemCard item={item} now={now} onAction={handleAction} />
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem" }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => scroll("prev")} disabled={!canPrev} aria-label="Previous" style={{
                    width: 38, height: 38, borderRadius: "50%",
                    border: "1px solid rgba(255,255,255,0.15)",
                    background: canPrev ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)",
                    color: canPrev ? "#fff" : "rgba(255,255,255,0.3)",
                    cursor: canPrev ? "pointer" : "default",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 0.15s",
                  }}>
                    <ChevronLeft size={16} />
                  </button>
                  <button onClick={() => scroll("next")} disabled={!canNext} aria-label="Next" style={{
                    width: 38, height: 38, borderRadius: "50%",
                    border: "1px solid rgba(255,255,255,0.15)",
                    background: canNext ? "rgba(232,98,10,0.15)" : "rgba(255,255,255,0.02)",
                    color: canNext ? "var(--cs-orange)" : "rgba(255,255,255,0.3)",
                    cursor: canNext ? "pointer" : "default",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 0.15s",
                  }}>
                    <ChevronRight size={16} />
                  </button>
                </div>

                <div style={{ display: "flex", gap: 14 }}>
                  <a href="/sessions" style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted-foreground)", textDecoration: "none" }}>
                    Sessions →
                  </a>
                  <a href="/events" style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted-foreground)", textDecoration: "none" }}>
                    Events →
                  </a>
                </div>
              </div>
            </div>
          </>
        )}

      </div>
    </section>
  );
}
