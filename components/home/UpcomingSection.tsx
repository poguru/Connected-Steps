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
  difficulty:         string | null;
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
  early_bird_price:      number | null;
  early_bird_active:     boolean;
  has_multiple_prices:   boolean;
  registration_closes_at: string | null;
  distance_categories:   string[] | null;
  featured:              boolean;
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

const DIFFICULTY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  beginner:     { label: "⭐ Beginner",     color: "#4ade80", bg: "rgba(74,222,128,0.15)"  },
  intermediate: { label: "🔥 Intermediate", color: "#fb923c", bg: "rgba(251,146,60,0.15)"  },
  advanced:     { label: "💪 Advanced",     color: "#f43f5e", bg: "rgba(244,63,94,0.15)"   },
};

// ── Card ──────────────────────────────────────────────────────────────────────

function ItemCard({ item, now, onAction }: { item: Item; now: Date; onAction: (item: Item) => void }) {
  const [hovered, setHovered] = useState(false);
  const cd = countdown(item.date, item.time, now);

  const slots  = item.kind === "event" ? slotsLeft(item.max_participants, item.participant_count) : null;
  const isFull = slots !== null && slots === 0;
  const isLow  = slots !== null && slots > 0 && slots <= 10;
  const isFree = item.kind === "event" && item.price === 0;

  // Event urgency signals
  const regOpen = item.kind === "event" && (
    !item.registration_closes_at || new Date(item.registration_closes_at) > now
  );
  const fillingFast = item.kind === "event" && !isFull && !isLow &&
    item.max_participants != null && item.max_participants > 0 && slots !== null &&
    slots <= Math.ceil(item.max_participants * 0.25);
  const closingSoon = item.kind === "event" && regOpen && item.registration_closes_at != null &&
    new Date(item.registration_closes_at).getTime() - now.getTime() < 7 * 86400000;
  const regClosesDaysLeft = item.kind === "event" && item.registration_closes_at
    ? Math.ceil((new Date(item.registration_closes_at).getTime() - now.getTime()) / 86400000)
    : null;

  const typeLabel = item.kind === "session" ? "Session" : evtConf(item.event_type).label;
  const typeColor = item.kind === "session" ? "#e8620a"  : evtConf(item.event_type).color;
  const typeBg    = item.kind === "session" ? "rgba(232,98,10,0.22)" : evtConf(item.event_type).bg;

  const pastCount = item.kind === "session" ? item.user_session_count : 0;

  // Urgency badge for events
  const urgency = item.kind === "event" && !item.registered && !isFull ? (
    fillingFast ? { text: "🔥 Filling Fast", color: "#f97316", bg: "rgba(249,115,22,0.18)" } :
    isLow       ? null :                                 // already shown as "{n} left"
    closingSoon ? { text: "⏰ Closes soon",  color: "#ef4444", bg: "rgba(239,68,68,0.18)" } :
    regOpen     ? { text: "🟢 Reg Open",    color: "#4ade80", bg: "rgba(74,222,128,0.12)" } :
    null
  ) : null;

  return (
    <div
      onClick={() => onAction(item)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onAction(item)}
      style={{
        borderRadius: 16,
        overflow: "hidden",
        border: `1px solid ${
          cd.isLive        ? "rgba(74,222,128,0.3)"  :
          item.registered  ? "rgba(34,197,94,0.3)"   :
          hovered          ? "rgba(232,98,10,0.4)"   :
                             "rgba(255,255,255,0.08)"
        }`,
        background: "rgba(255,255,255,0.02)",
        cursor: "pointer",
        transition: "transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease",
        transform: hovered ? "translateY(-4px)" : "none",
        boxShadow: hovered ? "0 12px 32px rgba(0,0,0,0.4)"
          : cd.isLive ? "0 0 20px rgba(74,222,128,0.12)" : "none",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      {/* ── Event cover image ── */}
      {item.kind === "event" && item.cover_image && (
        <div style={{ height: 120, position: "relative", overflow: "hidden", flexShrink: 0 }}>
          <img src={item.cover_image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 55%)" }} />
        </div>
      )}

      {/* ── Badge row ── */}
      <div style={{ padding: "11px 13px 0", display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase",
          padding: "3px 8px", borderRadius: 999, background: typeBg, color: typeColor,
          border: `1px solid ${typeColor}44`,
        }}>
          {typeLabel}
        </span>
        {item.kind === "event" && (
          <span style={{
            fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 999,
            background: isFree ? "rgba(34,197,94,0.18)" : item.early_bird_active ? "rgba(232,98,10,0.15)" : "rgba(255,255,255,0.1)",
            color: isFree ? "#22c55e" : item.early_bird_active ? "#e8620a" : "rgba(255,255,255,0.8)",
          }}>
            {isFree ? "Free"
              : item.early_bird_active && item.early_bird_price != null
                ? <>{`Early Bird ₹${item.early_bird_price} `}<s style={{ fontStyle: "normal", opacity: 0.5 }}>{`₹${item.price}`}</s></>
                : item.has_multiple_prices
                  ? `From ₹${item.price}`
                  : `₹${item.price}`
            }
          </span>
        )}
        {item.registered && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
            background: "rgba(34,197,94,0.22)", color: "#4ade80",
            border: "1px solid rgba(34,197,94,0.3)",
            display: "flex", alignItems: "center", gap: 3,
          }}>
            <CheckCircle2 size={9} /> Reg&apos;d
          </span>
        )}
        {isLow && !isFull && !item.registered && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "rgba(239,68,68,0.85)", color: "#fff" }}>
            ⚠ {slots} left
          </span>
        )}
        {isFull && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "rgba(239,68,68,0.9)", color: "#fff" }}>
            Full
          </span>
        )}
        {urgency && (
          <span style={{ fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: urgency.bg, color: urgency.color }}>
            {urgency.text}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{
          fontSize: 9, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
          background: cd.isLive ? cd.bg : "rgba(255,255,255,0.08)",
          color: cd.color, border: `1px solid ${cd.color}55`,
          display: "flex", alignItems: "center", gap: 3,
          animation: cd.isLive ? "pulse-ring 2s infinite" : "none",
        }}>
          {cd.isLive && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#4ade80", display: "inline-block", flexShrink: 0 }} />}
          {cd.label}
        </span>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div style={{ padding: "9px 13px 13px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>

        {/* Title */}
        <div style={{
          fontSize: "0.9rem", fontWeight: 700, color: "var(--foreground)", lineHeight: 1.3,
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
        }}>
          {item.title}
        </div>

        {/* Difficulty + Points badges (session only) */}
        {item.kind === "session" && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {item.difficulty && DIFFICULTY_CONFIG[item.difficulty] && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                background: DIFFICULTY_CONFIG[item.difficulty].bg,
                color: DIFFICULTY_CONFIG[item.difficulty].color,
                border: `1px solid ${DIFFICULTY_CONFIG[item.difficulty].color}44`,
              }}>
                {DIFFICULTY_CONFIG[item.difficulty].label}
              </span>
            )}
            <span style={{
              fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
              background: "rgba(234,179,8,0.12)", color: "#eab308",
              border: "1px solid rgba(234,179,8,0.25)",
            }}>
              🏆 Earn 5 pts
            </span>
          </div>
        )}

        {/* Distance category badges (event only) */}
        {item.kind === "event" && item.distance_categories && item.distance_categories.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {item.distance_categories.slice(0, 4).map(cat => (
              <span key={cat} style={{ fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: "rgba(232,98,10,0.12)", color: "#e8620a", border: "1px solid rgba(232,98,10,0.22)" }}>
                {cat}
              </span>
            ))}
          </div>
        )}

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

          {/* Event: registration closes date */}
          {item.kind === "event" && !isFull && regClosesDaysLeft !== null && regClosesDaysLeft >= 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.68rem", color: regClosesDaysLeft <= 3 ? "#f87171" : "var(--muted-foreground)" }}>
              <Clock size={9} style={{ flexShrink: 0 }} />
              <span>Reg closes {regClosesDaysLeft === 0 ? "today" : `in ${regClosesDaysLeft}d`}</span>
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
                <CheckCircle2 size={11} /> You&apos;re registered
              </span>
              {cd.isSoon && !cd.isLive && item.kind === "session" && (
                <span style={{ fontSize: "0.67rem", color: "var(--cs-orange)", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
                  <Clock size={9} /> QR available — scan at the venue
                </span>
              )}
              {cd.isLive && (
                <span style={{ fontSize: "0.67rem", color: "#4ade80", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
                  <Clock size={9} /> {item.kind === "session" ? "Session is live — head to the venue!" : "Event is on — see you there!"}
                </span>
              )}
              {item.kind === "event" && !cd.isLive && (
                <span style={{ fontSize: "0.67rem", color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 3 }}>
                  View registration details →
                </span>
              )}
            </div>
          ) : isFull ? (
            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#f87171" }}>Join Waitlist →</span>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{
                fontSize: "0.72rem", fontWeight: 700,
                color: hovered ? "var(--cs-orange)" : "rgba(255,255,255,0.7)",
                display: "flex", alignItems: "center", gap: 4,
                transition: "color 0.15s",
              }}>
                {item.kind === "session" ? "Register free" : isFree ? "Register free" : "Register now"}
                <ArrowRight size={11} />
              </span>
              {item.kind === "event" && (
                <span style={{ fontSize: "0.67rem", color: "var(--muted-foreground)" }}>
                  View details
                </span>
              )}
            </div>
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
    const token   = typeof window !== "undefined" ? localStorage.getItem("cs_user_token") : null;
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
      const slug = item.share_slug ?? item.id;
      const slots = slotsLeft(item.max_participants, item.participant_count);
      const full  = slots !== null && slots === 0;
      router.push(full ? `/events/${slug}/waitlist` : `/events/${slug}`);
    }
  }

  const showEmpty = !loading && items.length === 0;

  // Hero: featured event with cover image and open registration, or first such event
  const heroEvent = (() => {
    const evts = items.filter((i): i is EventItem => i.kind === "event" && !!i.cover_image);
    const regOpenEvts = evts.filter(e => !e.registration_closes_at || new Date(e.registration_closes_at) > now);
    return regOpenEvts.find(e => e.featured) ?? regOpenEvts[0] ?? null;
  })();
  const heroSlug   = heroEvent ? (heroEvent.share_slug ?? heroEvent.id) : null;
  const heroSlots  = heroEvent ? slotsLeft(heroEvent.max_participants, heroEvent.participant_count) : null;
  const heroFull   = heroSlots !== null && heroSlots === 0;

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

        {/* ── Event hero banner ── */}
        {!loading && heroEvent && (
          <div
            onClick={() => handleAction(heroEvent)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && handleAction(heroEvent)}
            style={{
              borderRadius: 18, overflow: "hidden", marginBottom: "1.5rem",
              border: "1px solid rgba(232,98,10,0.25)", cursor: "pointer",
              position: "relative",
            }}
          >
            <div style={{ position: "relative", height: "clamp(180px, 38vw, 260px)" }}>
              <img src={heroEvent.cover_image!} alt={heroEvent.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.15) 55%, transparent 100%)" }} />

              {/* Top badges */}
              <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 999, background: evtConf(heroEvent.event_type).bg, color: evtConf(heroEvent.event_type).color, border: `1px solid ${evtConf(heroEvent.event_type).color}40` }}>
                  {evtConf(heroEvent.event_type).label.toUpperCase()}
                </span>
                {heroEvent.featured && (
                  <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 999, background: "rgba(232,98,10,0.2)", color: "#e8620a", border: "1px solid rgba(232,98,10,0.4)" }}>
                    ⭐ FEATURED
                  </span>
                )}
                {heroEvent.early_bird_active && (
                  <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 999, background: "rgba(234,179,8,0.2)", color: "#eab308", border: "1px solid rgba(234,179,8,0.4)" }}>
                    🐦 Early Bird
                  </span>
                )}
              </div>

              {/* Bottom overlay content */}
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "clamp(0.75rem,2.5vw,1.25rem)" }}>
                {/* Distance categories */}
                {(heroEvent.distance_categories ?? []).length > 0 && (
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 7 }}>
                    {(heroEvent.distance_categories ?? []).map(cat => (
                      <span key={cat} style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(232,98,10,0.25)", color: "#e8620a", border: "1px solid rgba(232,98,10,0.4)" }}>
                        {cat}
                      </span>
                    ))}
                  </div>
                )}
                <h3 style={{ fontSize: "clamp(1.1rem, 3.8vw, 1.6rem)", fontWeight: 800, color: "#fff", margin: "0 0 8px", lineHeight: 1.15 }}>
                  {heroEvent.title}
                </h3>
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
                  <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.75)" }}>📅 {fmtDate(heroEvent.date)}{heroEvent.time ? ` · ${fmtTime(heroEvent.time)}` : ""}</span>
                  <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.75)" }}>📍 {heroEvent.location}</span>
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: heroEvent.price === 0 ? "#4ade80" : "#e8620a" }}>
                    {heroEvent.price === 0 ? "Free"
                      : heroEvent.early_bird_active && heroEvent.early_bird_price != null
                        ? `Early Bird ₹${heroEvent.early_bird_price}`
                        : heroEvent.has_multiple_prices
                          ? `From ₹${heroEvent.price}`
                          : `₹${heroEvent.price}`
                    }
                  </span>
                  {heroSlots !== null && !heroFull && (
                    <span style={{ fontSize: "0.75rem", color: heroSlots <= 10 ? "#f87171" : "rgba(255,255,255,0.6)" }}>
                      {heroSlots <= 10 ? `⚠ ${heroSlots} slots left` : `${heroSlots} slots left`}
                    </span>
                  )}
                </div>
                <a
                  href={heroFull ? `/events/${heroSlug}/waitlist` : `/events/${heroSlug}`}
                  onClick={e => { e.stopPropagation(); }}
                  style={{ display: "inline-block", background: "var(--cs-orange)", color: "#fff", padding: "8px 20px", borderRadius: 999, fontSize: "0.82rem", fontWeight: 700, textDecoration: "none" }}
                >
                  {heroEvent.registered ? "View Registration" : heroFull ? "Join Waitlist" : "Register Now"} →
                </a>
              </div>
            </div>
          </div>
        )}

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
