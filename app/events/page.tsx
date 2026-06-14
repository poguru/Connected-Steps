import Link from "next/link";
import type { Metadata } from "next";
import { getSupabaseServer } from "@/lib/supabase-server";

export const metadata: Metadata = {
  title: "Upcoming Events | Connected Steps",
  description: "Discover upcoming running, cycling, training, and community events from Connected Steps in Hyderabad.",
};

export const revalidate = 60;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Event {
  id: string; title: string; description: string | null;
  event_type: string; cover_image: string | null;
  start_date: string; start_time: string | null;
  location: string; price: number; featured: boolean;
  max_participants: number | null; share_slug: string | null;
}

// ── Config ────────────────────────────────────────────────────────────────────

const TYPE: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  running:   { label: "Running",   icon: "🏃", color: "#e8620a", bg: "#e8620a18" },
  cycling:   { label: "Cycling",   icon: "🚴", color: "#3b82f6", bg: "#3b82f618" },
  training:  { label: "Training",  icon: "💪", color: "#a855f7", bg: "#a855f718" },
  race:      { label: "Race",      icon: "🏆", color: "#ef4444", bg: "#ef444418" },
  community: { label: "Community", icon: "🤝", color: "#22c55e", bg: "#22c55e18" },
  workshop:  { label: "Workshop",  icon: "📚", color: "#eab308", bg: "#eab30818" },
};
const t = (k: string) => TYPE[k] ?? TYPE.running;

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function fmtTime(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

// ── Data ──────────────────────────────────────────────────────────────────────

async function getEvents(): Promise<Event[]> {
  try {
    const db    = getSupabaseServer();
    const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split("T")[0];
    const { data } = await db
      .from("events")
      .select("id, title, description, event_type, cover_image, start_date, start_time, location, price, featured, max_participants, share_slug")
      .eq("status", "published")
      .gte("start_date", today)
      .order("featured", { ascending: false })
      .order("start_date", { ascending: true });
    return (data ?? []) as Event[];
  } catch {
    return [];
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function EventsPage() {
  const events  = await getEvents();
  const featured = events.find(e => e.featured) ?? events[0] ?? null;
  const rest     = events.filter(e => e !== featured);

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d10", color: "#fff" }}>

      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(13,13,16,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 1.5rem", height: "56px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>← Connected Steps</Link>
        <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.3)" }}>{events.length} upcoming event{events.length !== 1 ? "s" : ""}</span>
      </nav>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "2.5rem 1.5rem 4rem" }}>

        {/* Heading */}
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#e8620a", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "0.5rem" }}>What&apos;s On</div>
          <h1 style={{ fontSize: "clamp(2rem, 5vw, 3rem)", fontWeight: 300, color: "#fff", lineHeight: 1.1 }}>
            Upcoming <em style={{ fontStyle: "normal", color: "#e8620a" }}>events</em>
          </h1>
        </div>

        {events.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem 1rem", color: "rgba(255,255,255,0.3)" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📅</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>No upcoming events</div>
            <div style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>Check back soon — new events are announced regularly.</div>
          </div>
        ) : (
          <>
            {/* Featured event */}
            {featured && (
              <Link href={`/events/${featured.share_slug ?? featured.id}`} style={{ textDecoration: "none", display: "block", marginBottom: "1.5rem" }}>
                <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid rgba(232,98,10,0.3)", position: "relative", background: "#111" }}>
                  <div style={{ position: "relative", height: "clamp(200px, 35vw, 340px)" }}>
                    {featured.cover_image ? (
                      <img src={featured.cover_image} alt={featured.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", background: `radial-gradient(ellipse at 30% 50%, ${t(featured.event_type).bg.replace("18", "30")} 0%, transparent 70%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "4rem" }}>
                        {t(featured.event_type).icon}
                      </div>
                    )}
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(13,13,16,0.9) 0%, rgba(13,13,16,0.2) 60%, transparent 100%)" }} />
                    <div style={{ position: "absolute", inset: 0, padding: "1.5rem 2rem", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                      <div style={{ display: "flex", gap: 8, marginBottom: "0.75rem", flexWrap: "wrap" }}>
                        {featured.featured && <span style={{ fontSize: "10px", fontWeight: 700, color: "#e8620a", background: "rgba(232,98,10,0.15)", border: "1px solid rgba(232,98,10,0.3)", padding: "3px 10px", borderRadius: 999 }}>FEATURED</span>}
                        <span style={{ fontSize: "10px", fontWeight: 700, color: t(featured.event_type).color, background: t(featured.event_type).bg, border: `1px solid ${t(featured.event_type).color}30`, padding: "3px 10px", borderRadius: 999 }}>
                          {t(featured.event_type).icon} {t(featured.event_type).label.toUpperCase()}
                        </span>
                      </div>
                      <h2 style={{ fontSize: "clamp(1.5rem, 4vw, 2.25rem)", fontWeight: 700, color: "#fff", margin: "0 0 0.5rem", lineHeight: 1.15 }}>{featured.title}</h2>
                      <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.7)" }}>📅 {fmtDate(featured.start_date)}{featured.start_time ? ` · ${fmtTime(featured.start_time)}` : ""}</span>
                        <span style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.7)" }}>📍 {featured.location}</span>
                        <span style={{ fontSize: "0.82rem", fontWeight: 700, color: featured.price === 0 ? "#4ade80" : "#fff" }}>{featured.price === 0 ? "Free Entry" : `₹${featured.price}`}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            )}

            {/* Event grid */}
            {rest.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
                {rest.map(ev => {
                  const conf = t(ev.event_type);
                  return (
                    <Link key={ev.id} href={`/events/${ev.share_slug ?? ev.id}`} style={{ textDecoration: "none" }}>
                      <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.07)", background: "#111", overflow: "hidden", transition: "border-color 0.2s, transform 0.2s", height: "100%", display: "flex", flexDirection: "column" }}
                        onMouseEnter={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor = "rgba(232,98,10,0.4)"; d.style.transform = "translateY(-3px)"; }}
                        onMouseLeave={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor = "rgba(255,255,255,0.07)"; d.style.transform = ""; }}>
                        <div style={{ height: 140, position: "relative", overflow: "hidden" }}>
                          {ev.cover_image ? (
                            <img src={ev.cover_image} alt={ev.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <div style={{ width: "100%", height: "100%", background: `radial-gradient(ellipse at 50% 50%, ${conf.bg.replace("18","28")} 0%, transparent 70%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.5rem" }}>
                              {conf.icon}
                            </div>
                          )}
                          <div style={{ position: "absolute", top: 8, left: 8, fontSize: "10px", fontWeight: 700, color: conf.color, background: conf.bg, border: `1px solid ${conf.color}30`, padding: "2px 8px", borderRadius: 999 }}>
                            {conf.icon} {conf.label.toUpperCase()}
                          </div>
                        </div>
                        <div style={{ padding: "0.875rem", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#fff", lineHeight: 1.25 }}>{ev.title}</div>
                          <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.5)" }}>📅 {fmtDate(ev.start_date)}</div>
                          <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.5)" }}>📍 {ev.location}</div>
                          <div style={{ marginTop: "auto", paddingTop: "0.5rem", fontSize: "0.82rem", fontWeight: 700, color: ev.price === 0 ? "#4ade80" : "#e8620a" }}>
                            {ev.price === 0 ? "Free Entry" : `₹${ev.price}`}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
