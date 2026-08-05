import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getSupabaseServer } from "@/lib/supabase-server";
import RegisterButton from "@/components/events/RegisterButton";
import { getEventLifecycleStatus, LIFECYCLE_LABEL, LIFECYCLE_COLOR } from "@/lib/event-status";
import { getLifecycle } from "@/lib/event-lifecycle";
import { getDistanceOption } from "@/lib/event-distances";
import EventDetailCountdown from "@/components/events/EventDetailCountdown";
import EventShareButton from "@/components/events/EventShareButton";
import EventSlotDisplay from "@/components/events/EventSlotDisplay";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Highlight { icon: string; title: string; description?: string }
interface Faq       { question: string; answer: string }

interface Event {
  id: string; title: string; description: string | null;
  event_type: string;
  cover_image: string | null; banner_image: string | null;
  gallery_images: string[] | null;
  start_date: string; start_time: string | null;
  end_date: string | null; end_time: string | null;
  registration_closes_at: string | null; registration_opens_at: string | null;
  early_bird_ends_at: string | null;
  distance_categories: string[] | null;
  location: string; meeting_point: string | null;
  maps_url: string | null;
  organizer: string | null;
  organizer_email: string | null; organizer_phone: string | null;
  support_email: string | null;  support_phone: string | null;
  emergency_contact: string | null;
  max_participants: number | null; participant_count: number;
  price: number; featured: boolean;
  highlights: Highlight[] | null;
  faqs: Faq[] | null;
  terms_conditions: string | null;
  whatsapp_community_url: string | null;
  route_map_url: string | null; route_map_type: string | null;
  tshirt_size_chart_url: string | null; collect_tshirt: boolean;
  status: string; share_slug: string | null;
  view_count: number;
}

interface RacePerks {
  medal: boolean; bib: boolean; tshirt: boolean;
  breakfast: boolean; certificate: boolean; goodies: boolean;
}

interface EventRace {
  id: string; name: string; distance: string;
  price: number; early_bird_price: number | null;
  price_type: string;
  min_participants: number; max_participants: number;
  max_slots: number | null; slot_reserved: number;
  reporting_time: string | null; gun_time: string | null;
  timing_chip: boolean;
  perks: RacePerks | null;
  gender_restriction: string | null;
  min_age: number | null; max_age: number | null;
  display_order: number; status: string;
}

interface Sponsor {
  id: string; name: string; tier: string;
  logo_url: string | null; website_url: string | null;
  description: string | null; display_order: number;
}

// ── Tier config ───────────────────────────────────────────────────────────────

const TIER: Record<string, { label: string; logoH: number; color: boolean; order: number }> = {
  title:       { label: "Title Sponsor",       logoH: 56, color: true,  order: 1 },
  organizer:   { label: "Organized By",         logoH: 56, color: true,  order: 1 },
  powered_by:  { label: "Powered By",           logoH: 48, color: true,  order: 2 },
  gold:        { label: "Gold Sponsor",          logoH: 44, color: true,  order: 3 },
  silver:      { label: "Silver Sponsor",        logoH: 36, color: false, order: 4 },
  bronze:      { label: "Bronze Sponsor",        logoH: 32, color: false, order: 5 },
  sports:      { label: "Sports Partner",        logoH: 30, color: false, order: 6 },
  hydration:   { label: "Hydration Partner",     logoH: 30, color: false, order: 6 },
  nutrition:   { label: "Nutrition Partner",     logoH: 30, color: false, order: 6 },
  apparel:     { label: "Apparel Partner",       logoH: 30, color: false, order: 6 },
  refreshment: { label: "Refreshment Partner",   logoH: 30, color: false, order: 6 },
  community:   { label: "Community Partner",     logoH: 28, color: false, order: 7 },
  partner:     { label: "Partner",               logoH: 28, color: false, order: 7 },
  medical:     { label: "Medical Partner",       logoH: 28, color: false, order: 7 },
  photography: { label: "Photography",           logoH: 28, color: false, order: 7 },
  support:     { label: "Support Partner",       logoH: 28, color: false, order: 7 },
};
const TIER_ORDER = (tier: string) => TIER[tier]?.order ?? 9;

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
  try {
    const db = getSupabaseServer();

    // Primary lookup: by share_slug (canonical URL for published events).
    let { data } = await db
      .from("events")
      .select("*")
      .eq("share_slug", slug)
      .eq("status", "published")
      .maybeSingle();

    // Fallback: if no share_slug match and slug looks like a UUID,
    // try by primary key so events without a share_slug are still accessible.
    if (!data && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug)) {
      ({ data } = await db
        .from("events")
        .select("*")
        .eq("id", slug)
        .eq("status", "published")
        .maybeSingle());
    }

    if (data) {
      db.from("events").update({ view_count: (data.view_count ?? 0) + 1 }).eq("id", data.id).then(() => {});
    }
    return data ?? null;
  } catch { return null; }
}

async function getRaces(eventId: string): Promise<EventRace[]> {
  try {
    const { data } = await getSupabaseServer()
      .from("event_races")
      .select("id, name, distance, price, early_bird_price, price_type, min_participants, max_participants, max_slots, slot_reserved, reporting_time, gun_time, timing_chip, perks, gender_restriction, min_age, max_age, display_order, status")
      .eq("event_id", eventId)
      .eq("status", "active")
      .order("display_order");
    return data ?? [];
  } catch { return []; }
}

async function getSponsors(eventId: string): Promise<Sponsor[]> {
  try {
    const { data } = await getSupabaseServer()
      .from("event_sponsors")
      .select("id, name, tier, logo_url, website_url, description, display_order")
      .eq("event_id", eventId)
      .eq("visible", true)
      .order("display_order")
      .order("created_at");
    return data ?? [];
  } catch { return []; }
}

interface RouteMapRow { id: string; name: string; file_url: string; file_type: "image" | "pdf" | "gpx"; display_order: number }

interface CollectionCenter { id: string; name: string; address: string | null; maps_url: string | null; contact_name: string | null; contact_phone: string | null; notes: string | null; display_order: number }

async function getRouteMaps(eventId: string): Promise<RouteMapRow[]> {
  try {
    const { data } = await getSupabaseServer()
      .from("event_route_maps")
      .select("id, name, file_url, file_type, display_order")
      .eq("event_id", eventId)
      .eq("is_active", true)
      .order("display_order")
      .order("created_at");
    return data ?? [];
  } catch { return []; }
}

async function getCollectionCenters(eventId: string): Promise<CollectionCenter[]> {
  try {
    const { data } = await getSupabaseServer()
      .from("bib_collection_centers")
      .select("id, name, address, maps_url, contact_name, contact_phone, notes, display_order")
      .eq("event_id", eventId)
      .order("display_order");
    return data ?? [];
  } catch { return []; }
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const ev = await getEvent(slug);
  if (!ev) return { title: "Event Not Found" };
  const conf = TYPE[ev.event_type] ?? TYPE.running;
  const date = new Date(ev.start_date + "T12:00:00").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  return {
    title: `${ev.title} | Connected Steps`,
    description: ev.description
      ? ev.description.replace(/<[^>]+>/g, "").slice(0, 160)
      : `${conf.icon} ${conf.label} · ${date} · ${ev.location}. Join us at Connected Steps!`,
    openGraph: {
      title: ev.title,
      description: ev.description?.replace(/<[^>]+>/g, "").slice(0, 160)
        ?? `${conf.icon} ${conf.label} · ${date} · ${ev.location}`,
      images: (ev.banner_image ?? ev.cover_image)
        ? [{ url: ev.banner_image ?? ev.cover_image! }]
        : [{ url: "https://www.connectedsteps.in/logo.png", width: 512, height: 512, alt: "Connected Steps" }],
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}
function fmtTime(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
function slotsColor(left: number, total: number): string {
  if (total <= 0) return "#94a3b8";
  const pct = left / total;
  if (pct <= 0)    return "#6b7280";
  if (pct <= 0.10) return "#ef4444";
  if (pct <= 0.25) return "#f97316";
  if (pct <= 0.50) return "#eab308";
  return "#4ade80";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", marginBottom: "16px" }}>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "0 0 36px" }} />;
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
      <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", width: 96, flexShrink: 0, paddingTop: 2 }}>{label}</div>
      <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.82)", fontWeight: 500, flex: 1, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const ev = await getEvent(slug);
  if (!ev) notFound();

  const [racesData, sponsorsData, routeMapsData, centersData] = await Promise.all([
    getRaces(ev.id),
    getSponsors(ev.id),
    getRouteMaps(ev.id),
    getCollectionCenters(ev.id),
  ]);

  const slotsLeft = ev.max_participants !== null
    ? Math.max(0, ev.max_participants - (ev.participant_count ?? 0))
    : null;
  const isFull = slotsLeft !== null && slotsLeft === 0;

  const conf      = TYPE[ev.event_type] ?? TYPE.running;
  const ls        = getEventLifecycleStatus(ev);
  const lifecycle = getLifecycle(ev);
  const lsCol     = LIFECYCLE_COLOR[ls];
  const closeAt   = ev.registration_closes_at
    ? new Date(ev.registration_closes_at).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : null;

  // Starting price — the lowest price across all active categories
  const startingPrice = racesData.length > 0
    ? Math.min(...racesData.map(r => r.price))
    : ev.price ?? 0;

  // Early bird: show banner when future date is set and races have early-bird prices
  const hasEarlyBirdRaces = racesData.some(r => r.early_bird_price != null && r.early_bird_price < r.price);
  const earlyBirdEndsAt   = ev.early_bird_ends_at && hasEarlyBirdRaces && lifecycle.canRegister
    ? new Date(ev.early_bird_ends_at)
    : null;
  const earlyBirdActive   = earlyBirdEndsAt !== null && earlyBirdEndsAt > new Date();
  const earlyBirdLabel    = earlyBirdActive
    ? earlyBirdEndsAt!.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  const heroImg = ev.banner_image ?? ev.cover_image;
  const highlights: Highlight[] = Array.isArray(ev.highlights) ? ev.highlights : [];
  const faqs: Faq[] = Array.isArray(ev.faqs) ? ev.faqs : [];
  const gallery: string[] = Array.isArray(ev.gallery_images) ? ev.gallery_images : [];

  // Group sponsors by tier order
  const tierGroups = new Map<number, { tierKey: string; sponsors: Sponsor[] }>();
  for (const s of sponsorsData) {
    const ord = TIER_ORDER(s.tier);
    if (!tierGroups.has(ord)) tierGroups.set(ord, { tierKey: s.tier, sponsors: [] });
    tierGroups.get(ord)!.sponsors.push(s);
  }
  const sortedTierGroups = Array.from(tierGroups.entries()).sort(([a], [b]) => a - b);

  // CSS for this page
  const css = `
    .ep-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
    .ep-gallery a { display: block; aspect-ratio: 1; overflow: hidden; border-radius: 8px; }
    .ep-gallery a img { width: 100%; height: 100%; object-fit: cover; transition: transform .3s; }
    .ep-gallery a:hover img { transform: scale(1.04); }
    .ep-race-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
    .ep-highlights { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
    .ep-faq summary { list-style: none; display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 14px 0; font-size: 14px; font-weight: 500; color: rgba(255,255,255,.85); user-select: none; }
    .ep-faq summary::-webkit-details-marker { display: none; }
    .ep-faq summary::after { content: "+"; font-size: 18px; color: rgba(255,255,255,.3); flex-shrink: 0; transition: transform .2s; }
    .ep-faq[open] summary::after { transform: rotate(45deg); }
    .ep-faq-ans { font-size: 13.5px; color: rgba(255,255,255,.55); line-height: 1.75; padding-bottom: 14px; }
    .ep-mobile-cta { display: none; }
    .ep-sponsor-row { display: flex; flex-wrap: wrap; gap: 20px; align-items: center; justify-content: center; }
    @media (max-width: 600px) {
      .ep-race-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
      .ep-highlights { grid-template-columns: 1fr 1fr; }
      .ep-mobile-cta { display: block; position: fixed; bottom: 0; left: 0; right: 0; z-index: 50; padding: 12px 16px; background: rgba(13,13,16,.96); border-top: 1px solid rgba(255,255,255,.07); backdrop-filter: blur(12px); }
      .ep-desktop-cta { display: none; }
    }
  `;

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d10", color: "#fff" }}>
      <style>{css}</style>

      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(13,13,16,0.97)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 20px", height: "52px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Link href="/events" style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", textDecoration: "none", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 16 }}>←</span> All Events
        </Link>
        <Link href="/" style={{ fontSize: "11px", fontWeight: 700, letterSpacing: ".06em", color: "rgba(255,255,255,0.25)", textDecoration: "none", textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Connected Steps
        </Link>
        <EventShareButton
          title={ev.title}
          url={`https://www.connectedsteps.in/events/${ev.share_slug ?? ev.id}`}
        />
      </nav>

      {/* Hero */}
      <div style={{ position: "relative", height: "clamp(260px, 44vw, 480px)", overflow: "hidden" }}>
        {heroImg ? (
          <img src={heroImg} alt={ev.title} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 35%" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "5rem", background: `radial-gradient(ellipse at 50% 50%, ${conf.color}18 0%, transparent 70%)` }}>
            {conf.icon}
          </div>
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #0d0d10 0%, rgba(13,13,16,0.15) 55%, transparent 100%)" }} />
        {ev.featured && (
          <div style={{ position: "absolute", top: 16, right: 16, fontSize: "10px", fontWeight: 700, color: "#e8620a", background: "rgba(13,13,16,0.85)", border: "1px solid rgba(232,98,10,0.4)", padding: "4px 10px", borderRadius: 999, backdropFilter: "blur(8px)" }}>
            ★ FEATURED
          </div>
        )}
      </div>

      {/* Main content */}
      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "0 20px 120px", position: "relative", zIndex: 1, marginTop: "-48px" }}>

        {/* Type + lifecycle badges */}
        <div style={{ display: "flex", gap: 6, marginBottom: "14px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, color: conf.color, background: `${conf.color}18`, border: `1px solid ${conf.color}30`, padding: "4px 10px", borderRadius: 999 }}>
            {conf.icon} {conf.label.toUpperCase()}
          </span>
          <span style={{ fontSize: "10px", fontWeight: 700, color: lsCol.text, background: lsCol.bg, border: `1px solid ${lsCol.border}`, padding: "4px 10px", borderRadius: 999 }}>
            {LIFECYCLE_LABEL[ls].toUpperCase()}
          </span>
          {(ev.distance_categories ?? []).map(cat => {
            const d = getDistanceOption(cat);
            return (
              <span key={cat} style={{ fontSize: "10px", fontWeight: 700, color: d.color, background: d.bg, border: `1px solid ${d.border}`, padding: "4px 10px", borderRadius: 999 }}>
                {cat}
              </span>
            );
          })}
        </div>

        {/* Title */}
        <h1 style={{ fontSize: "clamp(1.75rem, 5.5vw, 2.6rem)", fontWeight: 700, lineHeight: 1.12, letterSpacing: "-.02em", marginBottom: "20px", color: "#fff" }}>
          {ev.title}
        </h1>

        {/* Countdown */}
        <EventDetailCountdown event={{
          start_date:             ev.start_date,
          start_time:             ev.start_time,
          end_date:               ev.end_date,
          end_time:               ev.end_time,
          registration_closes_at: ev.registration_closes_at,
        }} />

        {/* Live slot counter */}
        <EventSlotDisplay
          eventId={ev.id}
          featured={ev.featured}
          initial={{
            participant_count: ev.participant_count ?? 0,
            max_participants:  ev.max_participants  ?? null,
            races: racesData.map(r => ({
              race_id:       r.id,
              name:          r.name,
              distance:      r.distance,
              slot_reserved: r.slot_reserved,
              max_slots:     r.max_slots ?? null,
            })),
          }}
        />

        {/* Early bird banner */}
        {earlyBirdActive && earlyBirdLabel && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", marginBottom: "20px", background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.22)", borderRadius: "10px" }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>🐦</span>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#fbbf24" }}>Early Bird Prices Active</div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", marginTop: 2 }}>Ends {earlyBirdLabel} IST</div>
            </div>
          </div>
        )}

        {/* Race categories */}
        {racesData.length > 0 && (
          <div style={{ marginBottom: "32px" }}>
            <SectionHead>Race Categories</SectionHead>
            <div className="ep-race-grid">
              {racesData.map(race => {
                const rSlotsLeft = race.max_slots !== null ? Math.max(0, race.max_slots - race.slot_reserved) : null;
                const rFull = rSlotsLeft !== null && rSlotsLeft === 0;
                const showEarly = race.early_bird_price != null && race.early_bird_price < race.price && lifecycle.canRegister;
                const isGroup = (race.max_participants ?? 1) > 1;
                const perks: RacePerks = race.perks ?? { medal: false, bib: false, tshirt: false, breakfast: false, certificate: false, goodies: false };
                const perkList = [
                  perks.medal       && { label: "Medal",       icon: "🏅" },
                  perks.bib         && { label: "BIB",         icon: "📋" },
                  perks.tshirt      && { label: "T-Shirt",     icon: "👕" },
                  perks.breakfast   && { label: "Breakfast",   icon: "🍌" },
                  perks.certificate && { label: "Certificate", icon: "📜" },
                  perks.goodies     && { label: "Goodies",     icon: "🎁" },
                ].filter(Boolean) as { label: string; icon: string }[];
                return (
                  <div key={race.id} style={{ background: rFull ? "rgba(239,68,68,0.04)" : "rgba(255,255,255,0.03)", border: `1px solid ${rFull ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.08)"}`, borderRadius: "12px", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    {/* Distance tag */}
                    <div style={{ fontSize: "10px", fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: ".08em" }}>{race.distance}</div>

                    {/* Name */}
                    <div style={{ fontSize: "14px", fontWeight: 700, color: rFull ? "rgba(255,255,255,0.4)" : "#fff", lineHeight: 1.3 }}>{race.name}</div>

                    {/* Price */}
                    <div>
                      {race.price === 0 ? (
                        <span style={{ fontSize: "16px", fontWeight: 700, color: "#4ade80" }}>Free</span>
                      ) : showEarly ? (
                        <div>
                          <span style={{ fontSize: "16px", fontWeight: 700, color: "#e8620a" }}>₹{race.early_bird_price}</span>
                          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginLeft: 6, textDecoration: "line-through" }}>₹{race.price}</span>
                          <div style={{ fontSize: "10px", color: "#fbbf24", fontWeight: 600, marginTop: 2 }}>⚡ Early Bird</div>
                        </div>
                      ) : (
                        <div>
                          <span style={{ fontSize: "16px", fontWeight: 700, color: "#e8620a" }}>₹{race.price}</span>
                          {(race.price_type === "per_registration" || isGroup) && (
                            <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", marginLeft: 5 }}>
                              {race.price_type === "per_registration" ? "/registration" : isGroup ? `/person` : ""}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Group indicator */}
                    {isGroup && (
                      <div style={{ fontSize: "10px", color: "#60a5fa", fontWeight: 600, background: "rgba(96,165,250,0.1)", borderRadius: 4, padding: "2px 6px", display: "inline-block", alignSelf: "flex-start" }}>
                        👥 {(race.min_participants ?? 1) === (race.max_participants ?? 1) ? `${race.min_participants} people` : `${race.min_participants}–${race.max_participants} people`}
                      </div>
                    )}

                    {/* Age / gender restriction hints */}
                    {(() => {
                      const tags: { label: string; color: string; bg: string }[] = [];
                      const gr = race.gender_restriction;
                      if (gr && gr !== "any" && gr !== "all") {
                        const label = gr === "male" ? "♂ Male only" : gr === "female" ? "♀ Female only" : gr;
                        tags.push({ label, color: "#a78bfa", bg: "rgba(167,139,250,0.1)" });
                      }
                      if (race.min_age && race.max_age) tags.push({ label: `${race.min_age}–${race.max_age} yrs`, color: "rgba(255,255,255,0.45)", bg: "rgba(255,255,255,0.04)" });
                      else if (race.min_age) tags.push({ label: `${race.min_age}+ yrs`, color: "rgba(255,255,255,0.45)", bg: "rgba(255,255,255,0.04)" });
                      else if (race.max_age) tags.push({ label: `Up to ${race.max_age} yrs`, color: "rgba(255,255,255,0.45)", bg: "rgba(255,255,255,0.04)" });
                      if (tags.length === 0) return null;
                      return (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                          {tags.map(t => (
                            <span key={t.label} style={{ fontSize: "10px", fontWeight: 700, color: t.color, background: t.bg, borderRadius: 4, padding: "2px 6px" }}>{t.label}</span>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Perks */}
                    {perkList.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px", marginTop: 2 }}>
                        {perkList.map(p => (
                          <span key={p.label} style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.05)", borderRadius: 4, padding: "2px 5px", display: "flex", alignItems: "center", gap: 2 }}>
                            {p.icon} {p.label}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Timing */}
                    {(race.reporting_time || race.gun_time) && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginTop: 2 }}>
                        {race.reporting_time && <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.38)" }}>🕐 Report {fmtTime(race.reporting_time)}</div>}
                        {race.gun_time      && <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.38)" }}>🏁 Flag-off {fmtTime(race.gun_time)}</div>}
                      </div>
                    )}

                    {/* Timing chip badge */}
                    {race.timing_chip && (
                      <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.38)", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 6, marginTop: 2 }}>⏱ Timing Chip</div>
                    )}

                    {/* Per-category waitlist CTA */}
                    {rFull && lifecycle.canRegister && (
                      <a href={`/events/${ev.share_slug ?? ev.id}/waitlist?category=${encodeURIComponent(race.distance)}`}
                        style={{ display: "block", textAlign: "center", padding: "7px 10px", marginTop: 4, borderRadius: 7, background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.18)", color: "#60a5fa", fontSize: "11px", fontWeight: 700, textDecoration: "none" }}>
                        Join Waitlist →
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Details */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "14px", marginBottom: "28px" }}>
          <InfoRow label="Date">{fmtDate(ev.start_date)}</InfoRow>
          {ev.start_time && <InfoRow label="Time">{fmtTime(ev.start_time)}{ev.end_time ? ` – ${fmtTime(ev.end_time)}` : ""}</InfoRow>}
          <InfoRow label="Location">
            {ev.maps_url ? (
              <a href={ev.maps_url} target="_blank" rel="noopener noreferrer" style={{ color: "#60a5fa", textDecoration: "none" }}>
                {ev.location} ↗
              </a>
            ) : ev.location}
          </InfoRow>
          {ev.meeting_point && <InfoRow label="Meeting Point">{ev.meeting_point}</InfoRow>}
          {ev.organizer && <InfoRow label="Organizer">{ev.organizer}</InfoRow>}
          {lifecycle.canRegister && slotsLeft !== null && (isFull || slotsLeft <= 20) && (
            <InfoRow label="Availability">
              <span style={{ color: isFull ? "#ef4444" : slotsColor(slotsLeft, ev.max_participants!) }}>
                {isFull ? "Sold Out" : `${slotsLeft} of ${ev.max_participants} slots remaining`}
              </span>
            </InfoRow>
          )}
          {lifecycle.canRegister && racesData.length === 0 && (
            <InfoRow label="Entry Fee">
              <span style={{ fontWeight: 700, color: ev.price === 0 ? "#4ade80" : "#e8620a", fontSize: "15px" }}>
                {ev.price === 0 ? "Free Entry" : `₹${ev.price}`}
              </span>
            </InfoRow>
          )}
          {lifecycle.canRegister && closeAt && <InfoRow label="Closes">{closeAt} IST</InfoRow>}
        </div>

        {/* WhatsApp community */}
        {ev.whatsapp_community_url && (
          <a href={ev.whatsapp_community_url} target="_blank" rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "13px 20px", borderRadius: "12px", marginBottom: "24px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: "#4ade80", fontWeight: 600, fontSize: "14px", textDecoration: "none", transition: "background .2s" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Join the WhatsApp Community
          </a>
        )}

        {/* CTA — desktop */}
        <div className="ep-desktop-cta" style={{ marginBottom: "32px" }}>
          {isFull ? (
            <div>
              <div style={{ padding: "14px", borderRadius: "10px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", fontWeight: 600, textAlign: "center", fontSize: "14px", marginBottom: "10px" }}>
                This event is fully booked
              </div>
              <a href={`/events/${ev.share_slug ?? ev.id}/waitlist`}
                style={{ display: "block", textAlign: "center", padding: "13px 28px", borderRadius: "10px", background: "rgba(96,165,250,0.08)", color: "#60a5fa", fontWeight: 700, fontSize: "14px", border: "1px solid rgba(96,165,250,0.2)", textDecoration: "none" }}>
                Join Waitlist — Get notified when a spot opens
              </a>
            </div>
          ) : (
            <RegisterButton
              eventId={ev.id} slug={ev.share_slug ?? ev.id} price={startingPrice}
              startDate={ev.start_date} endDate={ev.end_date} endTime={ev.end_time}
              registrationClosesAt={ev.registration_closes_at}
              registrationOpensAt={ev.registration_opens_at}
            />
          )}
        </div>

        {/* Description */}
        {ev.description && (
          <>
            <Divider />
            <div style={{ marginBottom: "36px" }}>
              <SectionHead>About This Event</SectionHead>
              <div style={{ fontSize: "15px", color: "rgba(255,255,255,0.72)", lineHeight: 1.8 }}
                dangerouslySetInnerHTML={{ __html: ev.description }} />
            </div>
          </>
        )}

        {/* Highlights */}
        {highlights.length > 0 && (
          <>
            <Divider />
            <div style={{ marginBottom: "36px" }}>
              <SectionHead>Event Highlights</SectionHead>
              <div className="ep-highlights">
                {highlights.map((h, i) => (
                  <div key={i} style={{ padding: "14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px" }}>
                    {h.icon && <div style={{ fontSize: "22px", marginBottom: "8px" }}>{h.icon}</div>}
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: h.description ? "4px" : 0 }}>{h.title}</div>
                    {h.description && <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>{h.description}</div>}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Gallery */}
        {gallery.length > 0 && (
          <>
            <Divider />
            <div style={{ marginBottom: "36px" }}>
              <SectionHead>Gallery</SectionHead>
              <div className="ep-gallery">
                {gallery.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" title="View photo">
                    <img src={url} alt={`${ev.title} photo ${i + 1}`} loading="lazy" />
                  </a>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Route maps — prefer new table, fall back to legacy column */}
        {(routeMapsData.length > 0 || ev.route_map_url) && (
          <>
            <Divider />
            <div style={{ marginBottom: "36px" }}>
              <SectionHead>Route Map{routeMapsData.length > 1 ? "s" : ""}</SectionHead>
              {routeMapsData.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {routeMapsData.map(map => (
                    <div key={map.id}>
                      {map.file_type === "image" ? (
                        <>
                          {routeMapsData.length > 1 && (
                            <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.6)", marginBottom: 8 }}>{map.name}</div>
                          )}
                          <a href={map.file_url} target="_blank" rel="noopener noreferrer">
                            <img src={map.file_url} alt={map.name} style={{ width: "100%", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)" }} loading="lazy" />
                          </a>
                        </>
                      ) : (
                        <a href={map.file_url} target="_blank" rel="noopener noreferrer"
                          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 18px", background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: "10px", color: "#60a5fa", fontWeight: 600, fontSize: "13px", textDecoration: "none" }}>
                          {map.file_type === "pdf"
                            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
                            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21"/></svg>
                          }
                          {map.name}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : ev.route_map_url && (
                ev.route_map_type === "pdf" ? (
                  <a href={ev.route_map_url} target="_blank" rel="noopener noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 18px", background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: "10px", color: "#60a5fa", fontWeight: 600, fontSize: "13px", textDecoration: "none" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
                    Download Route Map (PDF)
                  </a>
                ) : (
                  <a href={ev.route_map_url} target="_blank" rel="noopener noreferrer">
                    <img src={ev.route_map_url} alt="Route map" style={{ width: "100%", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)" }} loading="lazy" />
                  </a>
                )
              )}
            </div>
          </>
        )}

        {/* T-shirt size chart */}
        {ev.tshirt_size_chart_url && ev.collect_tshirt && (
          <>
            <Divider />
            <div style={{ marginBottom: "36px" }}>
              <SectionHead>T-Shirt Size Guide</SectionHead>
              {ev.tshirt_size_chart_url.match(/\.pdf$/i) ? (
                <a href={ev.tshirt_size_chart_url} target="_blank" rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 18px", background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: "10px", color: "#60a5fa", fontWeight: 600, fontSize: "13px", textDecoration: "none" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
                  View T-Shirt Size Chart (PDF)
                </a>
              ) : (
                <a href={ev.tshirt_size_chart_url} target="_blank" rel="noopener noreferrer" title="View full size">
                  <img src={ev.tshirt_size_chart_url} alt="T-Shirt Size Guide" style={{ maxWidth: "100%", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)", display: "block" }} loading="lazy" />
                </a>
              )}
            </div>
          </>
        )}

        {/* BIB collection centers */}
        {centersData.length > 0 && (
          <>
            <Divider />
            <div style={{ marginBottom: "36px" }}>
              <SectionHead>BIB &amp; Kit Collection</SectionHead>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {centersData.map(c => (
                  <div key={c.id} style={{ padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px" }}>
                    <div style={{ fontWeight: 700, fontSize: "14px", color: "#fff", marginBottom: 6 }}>{c.name}</div>
                    {c.address && (
                      <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.55)", marginBottom: 4, lineHeight: 1.5 }}>
                        📍 {c.maps_url ? (
                          <a href={c.maps_url} target="_blank" rel="noopener noreferrer" style={{ color: "#60a5fa", textDecoration: "none" }}>{c.address} ↗</a>
                        ) : c.address}
                      </div>
                    )}
                    {(c.contact_name || c.contact_phone) && (
                      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginBottom: c.notes ? 4 : 0 }}>
                        📞 {c.contact_name}{c.contact_name && c.contact_phone ? " · " : ""}{c.contact_phone ? <a href={`tel:${c.contact_phone}`} style={{ color: "#60a5fa", textDecoration: "none" }}>{c.contact_phone}</a> : null}
                      </div>
                    )}
                    {c.notes && <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>{c.notes}</div>}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* FAQs */}
        {faqs.length > 0 && (
          <>
            <Divider />
            <div style={{ marginBottom: "36px" }}>
              <SectionHead>Frequently Asked Questions</SectionHead>
              <div>
                {faqs.map((faq, i) => (
                  <details key={i} className="ep-faq" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <summary>{faq.question}</summary>
                    <div className="ep-faq-ans">{faq.answer}</div>
                  </details>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Sponsors */}
        {sponsorsData.length > 0 && (
          <>
            <Divider />
            <div style={{ marginBottom: "36px" }}>
              <SectionHead>Event Sponsors &amp; Partners</SectionHead>
              <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
                {sortedTierGroups.map(([, group]) => {
                  const tierCfg = TIER[group.tierKey] ?? TIER.partner;
                  // If multiple different tiers are in this order group, get unique labels
                  const uniqueTierKeys = [...new Set(group.sponsors.map(s => s.tier))];
                  const groupLabel = uniqueTierKeys.length === 1
                    ? (TIER[uniqueTierKeys[0]]?.label ?? uniqueTierKeys[0])
                    : "Partners";
                  return (
                    <div key={group.tierKey}>
                      <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,0.2)", marginBottom: "14px", textAlign: "center" }}>
                        {groupLabel}
                      </div>
                      <div className="ep-sponsor-row">
                        {group.sponsors.map(s => {
                          const sc = TIER[s.tier] ?? tierCfg;
                          const logo = s.logo_url ? (
                            <img src={s.logo_url} alt={s.name}
                              style={{ height: sc.logoH, maxWidth: sc.logoH * 3, objectFit: "contain", filter: sc.color ? "none" : "brightness(0) invert(0.55)", transition: "filter .2s" }} />
                          ) : (
                            <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>{s.name}</span>
                          );
                          return s.website_url ? (
                            <a key={s.id} href={s.website_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }} title={s.name}>
                              {logo}
                            </a>
                          ) : <div key={s.id}>{logo}</div>;
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Organizer contact */}
        {(ev.organizer_email || ev.organizer_phone || ev.support_email || ev.support_phone || ev.emergency_contact) && (
          <>
            <Divider />
            <div style={{ marginBottom: "36px" }}>
              <SectionHead>Contact</SectionHead>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {ev.organizer_email && (
                  <InfoRow label="Email">
                    <a href={`mailto:${ev.organizer_email}`} style={{ color: "#60a5fa", textDecoration: "none" }}>{ev.organizer_email}</a>
                  </InfoRow>
                )}
                {ev.organizer_phone && (
                  <InfoRow label="Phone">
                    <a href={`tel:${ev.organizer_phone}`} style={{ color: "#60a5fa", textDecoration: "none" }}>{ev.organizer_phone}</a>
                  </InfoRow>
                )}
                {ev.support_email && ev.support_email !== ev.organizer_email && (
                  <InfoRow label="Support">
                    <a href={`mailto:${ev.support_email}`} style={{ color: "#60a5fa", textDecoration: "none" }}>{ev.support_email}</a>
                  </InfoRow>
                )}
                {ev.emergency_contact && <InfoRow label="Emergency">{ev.emergency_contact}</InfoRow>}
              </div>
            </div>
          </>
        )}

        {/* Terms */}
        {ev.terms_conditions && (
          <>
            <Divider />
            <details style={{ marginBottom: "36px" }}>
              <summary style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", cursor: "pointer", padding: "8px 0", userSelect: "none", listStyle: "none", display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Terms &amp; Conditions
              </summary>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", lineHeight: 1.75, marginTop: "12px", padding: "16px", background: "rgba(255,255,255,0.02)", borderRadius: "10px", whiteSpace: "pre-line" }}>
                {ev.terms_conditions}
              </div>
            </details>
          </>
        )}

        <div style={{ textAlign: "center" }}>
          <Link href="/events" style={{ fontSize: "12px", color: "rgba(255,255,255,0.28)", textDecoration: "none" }}>
            ← View all events
          </Link>
        </div>
      </div>

      {/* Sticky mobile CTA */}
      <div className="ep-mobile-cta">
        {isFull ? (
          <a href={`/events/${ev.share_slug ?? ev.id}/waitlist`}
            style={{ display: "block", textAlign: "center", padding: "14px", borderRadius: "10px", background: "rgba(96,165,250,0.12)", color: "#60a5fa", fontWeight: 700, fontSize: "15px", border: "1px solid rgba(96,165,250,0.25)", textDecoration: "none" }}>
            Join Waitlist
          </a>
        ) : lifecycle.canRegister ? (
          <a href={`/events/${ev.share_slug ?? ev.id}/register`}
            style={{ display: "block", textAlign: "center", padding: "14px", borderRadius: "10px", background: "#e8620a", color: "#fff", fontWeight: 700, fontSize: "15px", textDecoration: "none" }}>
            {startingPrice === 0 ? "Register Free" : racesData.length > 1 ? `Register · from ₹${startingPrice}` : `Register · ₹${startingPrice}`}
          </a>
        ) : null}
      </div>
    </div>
  );
}
