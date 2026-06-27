"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import EventCountdown from "@/components/events/EventCountdown";
import { getLifecycle } from "@/lib/event-lifecycle";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Event {
  id:                      string;
  title:                   string;
  description:             string | null;
  event_type:              string;
  cover_image:             string | null;
  start_date:              string;
  start_time:              string | null;
  end_date:                string | null;
  end_time:                string | null;
  registration_closes_at: string | null;
  location:                string;
  organizer:               string | null;
  max_participants:        number | null;
  participant_count:       number | null;
  registration_required:   boolean;
  share_slug:              string | null;
}

// ── Event type config ─────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  running:   { label: "Running",   icon: "🏃", color: "#e8620a", bg: "rgba(232,98,10,0.15)"   },
  cycling:   { label: "Cycling",   icon: "🚴", color: "#3b82f6", bg: "rgba(59,130,246,0.15)"  },
  training:  { label: "Training",  icon: "💪", color: "#a855f7", bg: "rgba(168,85,247,0.15)"  },
  race:      { label: "Race",      icon: "🏆", color: "#ef4444", bg: "rgba(239,68,68,0.15)"   },
  community: { label: "Community", icon: "🤝", color: "#22c55e", bg: "rgba(34,197,94,0.15)"   },
  workshop:  { label: "Workshop",  icon: "📚", color: "#eab308", bg: "rgba(234,179,8,0.15)"   },
};

function typeConf(t: string) {
  return TYPE_CONFIG[t] ?? TYPE_CONFIG.running;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

function fmtTime(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function daysUntil(d: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff  = Math.round((new Date(d + "T12:00:00").getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return `In ${diff} days`;
}

function shareUrl(ev: Event) {
  const base = typeof window !== "undefined" ? window.location.origin : "https://www.connectedsteps.in";
  return ev.share_slug ? `${base}/events/${ev.share_slug}` : `${base}/#upcoming-events`;
}

function shareText(ev: Event) {
  const conf = typeConf(ev.event_type);
  const lines = [
    `${conf.icon} ${ev.title}`,
    ``,
    `📅 ${fmtDate(ev.start_date)}`,
    `📍 ${ev.location}`,
    ev.start_time ? `⏰ ${fmtTime(ev.start_time)}` : null,
    ``,
    `Join us at Connected Steps: ${shareUrl(ev)}`,
  ].filter((l): l is string => l !== null);
  return lines.join("\n");
}

// ── Share sheet ───────────────────────────────────────────────────────────────

function ShareSheet({ ev, onClose }: { ev: Event; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url  = shareUrl(ev);
  const text = shareText(ev);

  async function copyLink() {
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function whatsapp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    // Increment share count fire-and-forget
    if (ev.share_slug) fetch(`/api/events/by-slug?slug=${ev.share_slug}`, { method: "POST" }).catch(() => {});
    onClose();
  }

  function nativeShare() {
    if (navigator.share) {
      navigator.share({ title: ev.title, text, url }).catch(() => {});
      if (ev.share_slug) fetch(`/api/events/by-slug?slug=${ev.share_slug}`, { method: "POST" }).catch(() => {});
    }
    onClose();
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "1rem" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, background: "var(--surface-elevated)", border: "1px solid var(--border)", borderRadius: 16, padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--cs-cream)" }}>Share event</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted-foreground)", cursor: "pointer", fontSize: "1.2rem", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: "0.625rem 0.875rem", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--muted-foreground)", wordBreak: "break-all" }}>
          {url}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem" }}>
          <button onClick={whatsapp}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px", borderRadius: 10, background: "rgba(37,211,102,0.08)", border: "1px solid rgba(37,211,102,0.2)", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, color: "#25D366", fontFamily: "inherit" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.099.546 4.07 1.497 5.79L.057 23.32l5.686-1.494A11.947 11.947 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.914 0-3.705-.51-5.246-1.399l-.374-.222-3.378.887.9-3.288-.244-.389A9.947 9.947 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
            WhatsApp
          </button>

          <button onClick={copyLink}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px", borderRadius: 10, background: copied ? "rgba(74,222,128,0.08)" : "rgba(255,255,255,0.04)", border: `1px solid ${copied ? "rgba(74,222,128,0.25)" : "var(--border)"}`, cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, color: copied ? "#4ade80" : "var(--cs-cream)", fontFamily: "inherit", transition: "all 0.2s" }}>
            {copied ? "✓ Copied!" : "Copy link"}
          </button>
        </div>

        {typeof navigator !== "undefined" && "share" in navigator && (
          <button onClick={nativeShare}
            style={{ padding: "10px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, color: "var(--cs-cream)", fontFamily: "inherit" }}>
            More sharing options…
          </button>
        )}
      </div>
    </div>
  );
}

// ── Event card ────────────────────────────────────────────────────────────────

function EventCard({
  ev, featured = false, onShare,
}: {
  ev: Event; featured?: boolean; onShare: (ev: Event) => void;
}) {
  const router     = useRouter();
  const conf       = typeConf(ev.event_type);
  const time       = fmtTime(ev.start_time);
  const lifecycle  = getLifecycle({
    start_date:             ev.start_date,
    start_time:             ev.start_time,
    end_date:               ev.end_date,
    end_time:               ev.end_time,
    registration_closes_at: ev.registration_closes_at,
  });
  // Highlight card border when event is today or registration is closing soon
  const urgent = lifecycle.nextTransitionMs !== null
    ? (lifecycle.nextTransitionMs - Date.now()) < 24 * 60 * 60 * 1000
    : false;

  function handleRegister() {
    const dest = `/events/${ev.share_slug ?? ev.id}`;
    const user = typeof window !== "undefined" ? localStorage.getItem("cs_user") : null;
    if (user) {
      router.push(dest);
    } else {
      sessionStorage.setItem("cs_post_login_redirect", dest);
      router.push("/auth?tab=login");
    }
  }

  return (
    <div style={{
      borderRadius: 14,
      border: `1px solid ${urgent ? "rgba(232,98,10,0.35)" : "rgba(255,255,255,0.07)"}`,
      background: "var(--cs-charcoal)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      transition: "border-color 0.2s, transform 0.2s",
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(232,98,10,0.45)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = urgent ? "rgba(232,98,10,0.35)" : "rgba(255,255,255,0.07)"; (e.currentTarget as HTMLDivElement).style.transform = ""; }}>

      {/* Cover image / gradient header */}
      <div style={{ position: "relative", height: featured ? 200 : 120, overflow: "hidden", flexShrink: 0 }}>
        {ev.cover_image ? (
          <img src={ev.cover_image} alt={ev.title} loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 30%", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: `linear-gradient(135deg, var(--background) 0%, ${conf.bg.replace("0.15", "0.2")} 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: featured ? "3rem" : "2rem" }}>
            {conf.icon}
          </div>
        )}
        {/* Overlay for readability when image present */}
        {ev.cover_image && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(13,13,16,0.75) 0%, transparent 50%)" }} />}

        {/* Type badge */}
        <div style={{ position: "absolute", top: 10, left: 10, display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 999, background: conf.bg, border: `1px solid ${conf.color}30`, backdropFilter: "blur(6px)" }}>
          <span style={{ fontSize: "10px" }}>{conf.icon}</span>
          <span style={{ fontSize: "10px", fontWeight: 700, color: conf.color, textTransform: "uppercase", letterSpacing: "0.08em" }}>{conf.label}</span>
        </div>

        {/* Live lifecycle countdown badge */}
        <div style={{ position: "absolute", top: 10, right: 10, backdropFilter: "blur(6px)" }}>
          <EventCountdown
            event={{
              start_date:             ev.start_date,
              start_time:             ev.start_time,
              end_date:               ev.end_date,
              end_time:               ev.end_time,
              registration_closes_at: ev.registration_closes_at,
            }}
            compact
          />
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <div style={{ fontSize: featured ? "1.1rem" : "0.9rem", fontWeight: 700, color: "var(--cs-cream)", lineHeight: 1.25 }}>
          {ev.title}
        </div>

        {featured && ev.description && (
          <div style={{ fontSize: "0.78rem", color: "var(--cs-muted)", lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
            {ev.description}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.77rem", color: "var(--cs-muted)" }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            {fmtDate(ev.start_date)}{time ? ` · ${time}` : ""}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.77rem", color: "var(--cs-muted)" }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            {ev.location}
          </div>
          {ev.max_participants && (() => {
            const taken = ev.participant_count ?? 0;
            const left  = ev.max_participants - taken;
            const full  = left <= 0;
            const low   = !full && left <= 10;
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.77rem", color: full ? "#ef4444" : low ? "#eab308" : conf.color, fontWeight: 600 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                {full ? "Sold Out" : `${left} of ${ev.max_participants} slots available`}
              </div>
            );
          })()}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "auto", paddingTop: "0.75rem" }}>
          {lifecycle.isCompleted ? (
            <div style={{ flex: 1, padding: "8px 14px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.3)", fontSize: "0.78rem", fontWeight: 700, textAlign: "center" }}>
              Event Completed
            </div>
          ) : lifecycle.isLive ? (
            <div style={{ flex: 1, padding: "8px 14px", borderRadius: 8, background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.25)", color: "#a78bfa", fontSize: "0.78rem", fontWeight: 700, textAlign: "center" }}>
              ● Event Live Now
            </div>
          ) : !lifecycle.canRegister ? (
            <div style={{ flex: 1, padding: "8px 14px", borderRadius: 8, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", fontSize: "0.78rem", fontWeight: 700, textAlign: "center" }}>
              Registration Closed
            </div>
          ) : (
            <button onClick={handleRegister}
              style={{ flex: 1, padding: "8px 14px", borderRadius: 8, background: "var(--gradient-accent)", border: "none", color: "#fff", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "var(--shadow-orange)" }}>
              Register Now
            </button>
          )}
          <button onClick={() => onShare(ev)}
            style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--cs-muted)", fontSize: "0.78rem", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}
            title="Share event">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            Share
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

export default function UpcomingEvents() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [events,  setEvents]  = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState<Event | null>(null);

  useEffect(() => {
    fetch("/api/events/upcoming")
      .then(r => r.json())
      .then(d => setEvents(d.events ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const scroll = (dir: "prev" | "next") => {
    const el = trackRef.current;
    if (!el) return;
    const cardW = el.firstElementChild ? (el.firstElementChild as HTMLElement).offsetWidth + 16 : 300;
    el.scrollBy({ left: dir === "next" ? cardW : -cardW, behavior: "smooth" });
  };

  return (
    <section id="upcoming-events" className="section" style={{ background: "var(--cs-dark)" }}>
      <div className="container">

        {/* Header */}
        <div style={{ marginBottom: "2rem", display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <span className="gold-line" />
            <div className="section-label">What&apos;s On</div>
            <h2 className="font-display mt-2" style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 300, color: "var(--cs-cream)" }}>
              Upcoming{" "}
              <em className="not-italic" style={{ color: "var(--cs-orange)" }}>events</em>
            </h2>
          </div>
          {events.length > 0 && (
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button onClick={() => scroll("prev")} aria-label="Previous"
                style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.04)", color: "#fff", cursor: "pointer", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>
              <button onClick={() => scroll("next")} aria-label="Next"
                style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.04)", color: "#fff", cursor: "pointer", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>→</button>
            </div>
          )}
        </div>

        {loading ? (
          // Skeleton
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem" }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ height: 320, borderRadius: 14, backgroundImage: "linear-gradient(90deg, var(--cs-charcoal) 25%, rgba(255,255,255,0.04) 50%, var(--cs-charcoal) 75%)", backgroundSize: "200% 100%", animation: "cs-shimmer 1.4s infinite" }} />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem", opacity: 0.35 }}>📅</div>
            <div style={{ fontWeight: 600, color: "var(--cs-cream)", marginBottom: "0.4rem" }}>No upcoming events</div>
            <div style={{ fontSize: "0.82rem", color: "var(--cs-muted)" }}>Check back soon — new events will be announced here.</div>
          </div>
        ) : (
          <>
            {/* Desktop grid */}
            <div className="ue-desktop-grid" style={{ display: "none" }}>
              {events.length === 1 ? (
                <EventCard ev={events[0]} featured onShare={setSharing} />
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: events.length >= 2 ? "2fr 1fr" : "1fr", gap: "1rem", alignItems: "start" }}>
                  <EventCard ev={events[0]} featured onShare={setSharing} />
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    {events.slice(1, 3).map(ev => <EventCard key={ev.id} ev={ev} onShare={setSharing} />)}
                  </div>
                </div>
              )}
              {events.length === 4 && (
                <div style={{ marginTop: "1rem", gridColumn: "1/-1" }}>
                  <EventCard ev={events[3]} onShare={setSharing} />
                </div>
              )}
            </div>

            {/* Mobile scroll */}
            <div className="ue-mobile-scroll">
              <div ref={trackRef} style={{ display: "flex", gap: "1rem", overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", paddingBottom: "0.5rem" }}>
                {events.map(ev => (
                  <div key={ev.id} style={{ minWidth: "82vw", maxWidth: "82vw", scrollSnapAlign: "start", flexShrink: 0 }}>
                    <EventCard ev={ev} featured={ev === events[0]} onShare={setSharing} />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* View all link */}
        {events.length > 0 && (
          <div style={{ textAlign: "center", marginTop: "2rem" }}>
            <Link href="/#upcoming-events"
              style={{ fontSize: "0.82rem", color: "var(--cs-orange)", textDecoration: "none", fontWeight: 600, letterSpacing: "0.04em" }}>
              View all events →
            </Link>
          </div>
        )}
      </div>

      {sharing && <ShareSheet ev={sharing} onClose={() => setSharing(null)} />}

      <style>{`
        @keyframes cs-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @media (min-width: 768px) {
          .ue-desktop-grid  { display: block !important; }
          .ue-mobile-scroll { display: none !important; }
        }
        .ue-mobile-scroll::-webkit-scrollbar { display: none; }
      `}</style>
    </section>
  );
}
