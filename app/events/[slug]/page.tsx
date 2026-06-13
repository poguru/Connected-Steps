import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getSupabaseServer } from "@/lib/supabase-server";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Event {
  id:                    string;
  title:                 string;
  description:           string | null;
  event_type:            string;
  cover_image:           string | null;
  start_date:            string;
  start_time:            string | null;
  end_date:              string | null;
  end_time:              string | null;
  location:              string;
  organizer:             string | null;
  max_participants:      number | null;
  registration_required: boolean;
  status:                string;
  share_slug:            string | null;
}

const TYPE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  running:   { label: "Running",   icon: "🏃", color: "#e8620a" },
  cycling:   { label: "Cycling",   icon: "🚴", color: "#3b82f6" },
  training:  { label: "Training",  icon: "💪", color: "#a855f7" },
  race:      { label: "Race",      icon: "🏆", color: "#ef4444" },
  community: { label: "Community", icon: "🤝", color: "#22c55e" },
  workshop:  { label: "Workshop",  icon: "📚", color: "#eab308" },
};

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getEvent(slug: string): Promise<Event | null> {
  const db = getSupabaseServer();
  const { data } = await db
    .from("events")
    .select("*")
    .eq("share_slug", slug)
    .eq("status", "published")
    .single();

  if (data) {
    // Increment view count (fire-and-forget)
    db.from("events").update({ view_count: (data.view_count ?? 0) + 1 }).eq("share_slug", slug).then(() => {});
  }

  return data ?? null;
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const ev = await getEvent(slug);
  if (!ev) return { title: "Event Not Found" };

  const conf = TYPE_CONFIG[ev.event_type] ?? TYPE_CONFIG.running;
  const date = new Date(ev.start_date + "T12:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return {
    title: `${ev.title} | Connected Steps`,
    description: ev.description ?? `${conf.icon} ${conf.label} event on ${date} at ${ev.location}. Join us at Connected Steps!`,
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
  const ev = await getEvent(slug);
  if (!ev) notFound();

  const conf    = TYPE_CONFIG[ev.event_type] ?? TYPE_CONFIG.running;
  const time    = fmtTime(ev.start_time);
  const endTime = fmtTime(ev.end_time);

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d10", color: "#fff" }}>

      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(13,13,16,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 1.5rem", height: "56px", display: "flex", alignItems: "center", gap: "1rem" }}>
        <Link href="/" style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>← Connected Steps</Link>
      </nav>

      {/* Hero */}
      <div style={{ position: "relative", height: "320px", overflow: "hidden" }}>
        {ev.cover_image ? (
          <img src={ev.cover_image} alt={ev.title} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 30%" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "5rem", background: `radial-gradient(ellipse at 50% 50%, ${conf.color}15 0%, transparent 70%)` }}>
            {conf.icon}
          </div>
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #0d0d10 0%, rgba(13,13,16,0.4) 60%, transparent 100%)" }} />
      </div>

      {/* Content */}
      <div style={{ maxWidth: "640px", margin: "-80px auto 0", padding: "0 1.5rem 4rem", position: "relative", zIndex: 1 }}>

        {/* Type badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 999, background: `${conf.color}20`, border: `1px solid ${conf.color}40`, marginBottom: "1rem" }}>
          <span>{conf.icon}</span>
          <span style={{ fontSize: "11px", fontWeight: 700, color: conf.color, textTransform: "uppercase", letterSpacing: "0.08em" }}>{conf.label}</span>
        </div>

        <h1 style={{ fontSize: "clamp(1.75rem, 5vw, 2.5rem)", fontWeight: 700, lineHeight: 1.15, marginBottom: "1.5rem", color: "#fff" }}>
          {ev.title}
        </h1>

        {/* Details */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.75rem", padding: "1.25rem", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px" }}>
          <Row icon="📅" label="Date">{fmtDate(ev.start_date)}</Row>
          {time && <Row icon="⏰" label="Time">{time}{endTime ? ` – ${endTime}` : ""}</Row>}
          <Row icon="📍" label="Location">{ev.location}</Row>
          {ev.organizer && <Row icon="👟" label="Organizer">{ev.organizer}</Row>}
          {ev.max_participants && <Row icon="👥" label="Capacity">{ev.max_participants} participants</Row>}
        </div>

        {ev.description && (
          <div style={{ fontSize: "0.95rem", color: "rgba(255,255,255,0.7)", lineHeight: 1.75, marginBottom: "2rem", whiteSpace: "pre-line" }}>
            {ev.description}
          </div>
        )}

        {/* CTA */}
        <Link href={`/auth?tab=register`}
          style={{ display: "block", textAlign: "center", padding: "14px 28px", borderRadius: "10px", background: "linear-gradient(135deg,#e8620a,#f07c2a)", color: "#fff", fontWeight: 700, fontSize: "1rem", textDecoration: "none", marginBottom: "1rem" }}>
          Register for this event
        </Link>

        <Link href="/"
          style={{ display: "block", textAlign: "center", fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>
          View all events at Connected Steps →
        </Link>
      </div>
    </div>
  );
}

function Row({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
      <span style={{ width: "20px", flexShrink: 0, textAlign: "center" }}>{icon}</span>
      <div>
        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "1px" }}>{label}</div>
        <div style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>{children}</div>
      </div>
    </div>
  );
}
