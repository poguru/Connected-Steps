import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getSupabaseServer } from "@/lib/supabase-server";
import RegisterButton from "@/components/events/RegisterButton";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Event {
  id: string; title: string; description: string | null;
  event_type: string; cover_image: string | null;
  start_date: string; start_time: string | null;
  end_date: string | null; end_time: string | null;
  location: string; organizer: string | null;
  max_participants: number | null; registration_required: boolean;
  price: number; featured: boolean;
  terms_conditions: string | null; maps_url: string | null;
  status: string; share_slug: string | null;
  view_count: number; share_count: number;
}

const TYPE: Record<string, { label: string; icon: string; color: string }> = {
  running:   { label: "Running",   icon: "🏃", color: "#e8620a" },
  cycling:   { label: "Cycling",   icon: "🚴", color: "#3b82f6" },
  training:  { label: "Training",  icon: "💪", color: "#a855f7" },
  race:      { label: "Race",      icon: "🏆", color: "#ef4444" },
  community: { label: "Community", icon: "🤝", color: "#22c55e" },
  workshop:  { label: "Workshop",  icon: "📚", color: "#eab308" },
};

// ── Data ──────────────────────────────────────────────────────────────────────

async function getEvent(slug: string): Promise<Event | null> {
  const db = getSupabaseServer();
  const { data } = await db
    .from("events")
    .select("*")
    .eq("share_slug", slug)
    .eq("status", "published")
    .single();

  if (data) {
    db.from("events").update({ view_count: (data.view_count ?? 0) + 1 }).eq("share_slug", slug).then(() => {});
  }
  return data ?? null;
}

async function getSlotCount(eventId: string): Promise<number> {
  const db = getSupabaseServer();
  const { count } = await db
    .from("event_registrations")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "confirmed");
  return count ?? 0;
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const ev = await getEvent(slug);
  if (!ev) return { title: "Event Not Found" };
  const conf = TYPE[ev.event_type] ?? TYPE.running;
  const date = new Date(ev.start_date + "T12:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return {
    title: `${ev.title} | Connected Steps`,
    description: ev.description ?? `${conf.icon} ${conf.label} · ${date} · ${ev.location}. Join us at Connected Steps!`,
    openGraph: {
      title: ev.title,
      description: ev.description ?? `${conf.icon} ${conf.label} · ${date} · ${ev.location}`,
      images: ev.cover_image ? [{ url: ev.cover_image }] : [],
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function fmtTime(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [ev, slotsTaken] = await Promise.all([getEvent(slug), (async () => 0)()]);
  if (!ev) notFound();

  const slotsUsed = ev.max_participants ? await getSlotCount(ev.id) : 0;
  const slotsLeft = ev.max_participants ? ev.max_participants - slotsUsed : null;
  const isFull    = slotsLeft !== null && slotsLeft <= 0;

  const conf    = TYPE[ev.event_type] ?? TYPE.running;
  const time    = fmtTime(ev.start_time);
  const endTime = fmtTime(ev.end_time);

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d10", color: "#fff" }}>

      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(13,13,16,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 1.5rem", height: "56px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/events" style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>← All Events</Link>
        <Link href="/" style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", textDecoration: "none" }}>Connected Steps</Link>
      </nav>

      {/* Hero */}
      <div style={{ position: "relative", height: "clamp(220px, 40vw, 380px)", overflow: "hidden" }}>
        {ev.cover_image ? (
          <img src={ev.cover_image} alt={ev.title} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 30%" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "5rem", background: `radial-gradient(ellipse at 50% 50%, ${conf.color}15 0%, transparent 70%)` }}>
            {conf.icon}
          </div>
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #0d0d10 0%, rgba(13,13,16,0.3) 60%, transparent 100%)" }} />
      </div>

      {/* Content */}
      <div style={{ maxWidth: "680px", margin: "-80px auto 0", padding: "0 1.5rem 5rem", position: "relative", zIndex: 1 }}>

        {/* Badges */}
        <div style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap" }}>
          {ev.featured && <span style={{ fontSize: "10px", fontWeight: 700, color: "#e8620a", background: "rgba(232,98,10,0.15)", border: "1px solid rgba(232,98,10,0.3)", padding: "4px 10px", borderRadius: 999 }}>★ FEATURED</span>}
          <span style={{ fontSize: "10px", fontWeight: 700, color: conf.color, background: `${conf.color}18`, border: `1px solid ${conf.color}30`, padding: "4px 10px", borderRadius: 999 }}>
            {conf.icon} {conf.label.toUpperCase()}
          </span>
        </div>

        <h1 style={{ fontSize: "clamp(1.75rem, 5vw, 2.5rem)", fontWeight: 700, lineHeight: 1.15, marginBottom: "1.5rem", color: "#fff" }}>
          {ev.title}
        </h1>

        {/* Details card */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem", marginBottom: "1.75rem", padding: "1.25rem 1.5rem", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "14px" }}>
          <Row icon="📅" label="Date">{fmtDate(ev.start_date)}</Row>
          {time && <Row icon="⏰" label="Time">{time}{endTime ? ` – ${endTime}` : ""}</Row>}
          <Row icon="📍" label="Location">
            {ev.maps_url ? (
              <a href={ev.maps_url} target="_blank" rel="noopener noreferrer" style={{ color: "#60a5fa", textDecoration: "none" }}>
                {ev.location} ↗
              </a>
            ) : ev.location}
          </Row>
          {ev.organizer && <Row icon="👟" label="Organizer">{ev.organizer}</Row>}
          {slotsLeft !== null && (
            <Row icon="👥" label="Availability">
              <span style={{ color: isFull ? "#ef4444" : slotsLeft <= 5 ? "#eab308" : "#4ade80" }}>
                {isFull ? "Fully booked" : `${slotsLeft} of ${ev.max_participants} slots left`}
              </span>
            </Row>
          )}
          <Row icon="💰" label="Registration Fee">
            <span style={{ fontWeight: 700, color: ev.price === 0 ? "#4ade80" : "#e8620a", fontSize: "1rem" }}>
              {ev.price === 0 ? "Free Entry" : `₹${ev.price}`}
            </span>
          </Row>
        </div>

        {/* Description */}
        {ev.description && (
          <div style={{ fontSize: "0.95rem", color: "rgba(255,255,255,0.75)", lineHeight: 1.8, marginBottom: "2rem", whiteSpace: "pre-line" }}>
            {ev.description}
          </div>
        )}

        {/* CTA */}
        {isFull ? (
          <div style={{ padding: "14px", borderRadius: "10px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171", fontWeight: 600, textAlign: "center", fontSize: "0.95rem", marginBottom: "1rem" }}>
            This event is fully booked
          </div>
        ) : (
          <RegisterButton eventId={ev.id} slug={ev.share_slug ?? ev.id} price={ev.price} />
        )}

        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <Link href="/events" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.35)", textDecoration: "none" }}>
            ← View all events
          </Link>
        </div>

        {/* Terms */}
        {ev.terms_conditions && (
          <details style={{ marginTop: "1rem" }}>
            <summary style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.45)", cursor: "pointer", padding: "0.5rem 0", userSelect: "none" }}>
              Terms &amp; Conditions
            </summary>
            <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.45)", lineHeight: 1.7, marginTop: "0.75rem", padding: "1rem", background: "rgba(255,255,255,0.02)", borderRadius: "8px", whiteSpace: "pre-line" }}>
              {ev.terms_conditions}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function Row({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
      <span style={{ width: "20px", flexShrink: 0, textAlign: "center", fontSize: "0.95rem" }}>{icon}</span>
      <div>
        <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "2px" }}>{label}</div>
        <div style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>{children}</div>
      </div>
    </div>
  );
}
