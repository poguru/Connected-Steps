"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { isTokenValid, handleAuthExpiry } from "@/lib/client-auth";

import { APP_URL } from "@/lib/config";
// ── Types ─────────────────────────────────────────────────────────────────────

interface Participant {
  id:                  string;
  registration_id:     string;
  first_name:          string;
  last_name:           string | null;
  distance_category:   string | null;
  tshirt_size:         string | null;
  qr_token:            string | null;
  checked_in_at:       string | null;
  tshirt_issued:       boolean;
  breakfast_availed:   boolean;
  medal_issued:        boolean;
  bib_collected_at:    string | null;
  bib_number:          string | null;
  certificate_url:     string | null;
  status:              string;
}

interface Reg {
  id:                string;
  event_id:          string;
  registration_code: string;
  payment_status:    string;
  status:            string;
  final_price:       number;
  original_price:    number;
  coupon_discount:   number;
  created_at:        string;
  participant_count: number;
  distance_category: string | null;
  qr_token:          string | null;
  checked_in_at:     string | null;
  invoice_number:    string | null;
  participants:      Participant[];
  pending_category_change: { old_category: string; new_category: string } | null;
  events: {
    title:                  string;
    event_type:             string;
    cover_image:            string | null;
    banner_image:           string | null;
    start_date:             string;
    start_time:             string | null;
    end_date:               string | null;
    end_time:               string | null;
    location:               string;
    share_slug:             string | null;
    whatsapp_community_url: string | null;
    route_map_url:          string | null;
    route_map_type:         string | null;
    tshirt_size_chart_url:  string | null;
    distance_categories:    string[] | null;
    registration_closes_at: string | null;
    organizer_email:        string | null;
    organizer_phone:        string | null;
    maps_url:               string | null;
  } | null;
}

interface QRModalState {
  qrUrl:         string;
  name:          string;
  eventTitle:    string;
  category:      string | null;
  regCode:       string;
  bibNumber:     string | null;
}

interface WaitlistEntry {
  id:                string;
  event_id:          string;
  distance_category: string | null;
  status:            string;
  position:          number | null;
  created_at:        string;
  approved_at:       string | null;
  notified_at:       string | null;
  events: {
    title:                  string;
    event_type:             string;
    cover_image:            string | null;
    banner_image:           string | null;
    start_date:             string;
    start_time:             string | null;
    end_date:               string | null;
    end_time:               string | null;
    location:               string;
    share_slug:             string | null;
    whatsapp_community_url: string | null;
  } | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<string, string> = {
  running: "🏃", cycling: "🚴", training: "💪",
  race: "🏆", community: "🤝", workshop: "📚",
};

const BASE_URL = typeof window !== "undefined"
  ? window.location.origin
  : (APP_URL);

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function isEventOver(ev: Reg["events"]): boolean {
  if (!ev) return false;
  const ist     = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const today   = ist.toISOString().split("T")[0];
  const nowTime = ist.toTimeString().substring(0, 5);
  const endDate = ev.end_date ?? ev.start_date;
  if (endDate < today) return true;
  if (endDate === today && ev.end_time != null && ev.end_time.substring(0, 5) <= nowTime) return true;
  return false;
}

function generateICS(reg: Reg): void {
  const ev = reg.events;
  if (!ev) return;
  const d0  = ev.start_date.replace(/-/g, "");
  const t0  = ev.start_time ? ev.start_time.replace(/:/g, "").substring(0, 6) + "00" : null;
  const d1  = (ev.end_date ?? ev.start_date).replace(/-/g, "");
  const t1  = ev.end_time  ? ev.end_time.replace(/:/g, "").substring(0, 6)  + "00" : null;
  const dtS = t0 ? `${d0}T${t0}` : d0;
  const dtE = t1 ? `${d1}T${t1}` : d1;
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Connected Steps//EN",
    "BEGIN:VEVENT",
    `UID:${reg.registration_code}@connectedsteps.in`,
    `SUMMARY:${ev.title}`,
    `DTSTART:${dtS}`, `DTEND:${dtE}`,
    `LOCATION:${ev.location}`,
    `DESCRIPTION:Registration ID\\: ${reg.registration_code}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), {
    href: url, download: `${ev.title.replace(/\s+/g, "_")}.ics`,
  });
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

async function shareEvent(ev: Reg["events"], regCode: string): Promise<void> {
  if (!ev) return;
  const url  = ev.share_slug ? `${BASE_URL}/events/${ev.share_slug}` : BASE_URL;
  const text = `${ev.title} — Reg: ${regCode}`;
  if (typeof navigator !== "undefined" && navigator.share) {
    try { await navigator.share({ title: ev.title, text, url }); return; } catch { /* cancelled */ }
  }
  try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
}

function directionsUrl(ev: Reg["events"]): string {
  if (!ev) return "#";
  if (ev.maps_url) return ev.maps_url;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ev.location)}`;
}

// ── Atoms ─────────────────────────────────────────────────────────────────────

function PayBadge({ status, payment }: { status: string; payment: string }) {
  if (status === "cancelled") return <Chip color="#ef4444">Cancelled</Chip>;
  if (payment === "paid")     return <Chip color="#4ade80">Paid ✓</Chip>;
  if (payment === "free")     return <Chip color="#60a5fa">Free</Chip>;
  if (payment === "pending")  return <Chip color="#eab308">Pending Payment</Chip>;
  return <Chip color="#888">{payment}</Chip>;
}

function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
      background: `${color}18`, border: `1px solid ${color}30`, color,
      whiteSpace: "nowrap" as const,
    }}>
      {children}
    </span>
  );
}

function ServiceDot({ done, label }: { done: boolean; label: string }) {
  return (
    <span title={label} style={{
      fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
      background: done ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.04)",
      border: `1px solid ${done ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.08)"}`,
      color: done ? "#4ade80" : "#444",
    }}>
      {label}
    </span>
  );
}

function ActionBtn({ href, onClick, children, orange }: {
  href?: string; onClick?: () => void; children: React.ReactNode; orange?: boolean;
}) {
  const style: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 7,
    background: orange ? "rgba(232,98,10,0.12)" : "rgba(255,255,255,0.05)",
    border: `1px solid ${orange ? "rgba(232,98,10,0.3)" : "rgba(255,255,255,0.1)"}`,
    color: orange ? "#e8620a" : "#ccc",
    textDecoration: "none", whiteSpace: "nowrap" as const,
    cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4,
  };
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" style={style}>{children}</a>;
  return <button onClick={onClick} style={style}>{children}</button>;
}

function IconBtn({ icon, label, href, onClick }: {
  icon: string; label: string; href?: string; onClick?: () => void;
}) {
  const s: React.CSSProperties = {
    display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2,
    padding: "5px 8px", borderRadius: 8, fontSize: 9, fontWeight: 700,
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
    color: "#777", cursor: "pointer", fontFamily: "inherit", textDecoration: "none",
    whiteSpace: "nowrap" as const, minWidth: 40, letterSpacing: "0.02em",
  };
  const inner = <><span style={{ fontSize: 15, lineHeight: 1 }}>{icon}</span>{label}</>;
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" style={s}>{inner}</a>;
  return <button onClick={onClick} style={s}>{inner}</button>;
}

function MoreItem({ label, onClick, href }: { label: string; onClick?: () => void; href?: string }) {
  const s: React.CSSProperties = {
    display: "block", width: "100%", padding: "9px 16px", textAlign: "left",
    fontSize: 13, fontWeight: 500, color: "#ccc", background: "none", border: "none",
    cursor: "pointer", fontFamily: "inherit", textDecoration: "none", whiteSpace: "nowrap" as const,
  };
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" style={s}>{label}</a>;
  return <button onClick={onClick} style={s}>{label}</button>;
}

// ── QR Modal ─────────────────────────────────────────────────────────────────

function QRModal({ state, onClose }: { state: QRModalState; onClose: () => void }) {
  const canShare = typeof navigator !== "undefined" && !!navigator.share;
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    if (canShare) {
      try {
        await navigator.share({ title: `QR Code — ${state.name}`, url: state.qrUrl });
        return;
      } catch { /* user cancelled */ }
    }
    await navigator.clipboard.writeText(state.qrUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#111", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 20, padding: "1.5rem", maxWidth: 360, width: "100%",
          textAlign: "center",
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{state.name}</div>
          <div style={{ fontSize: 11, color: "#666", marginTop: 3 }}>{state.eventTitle}</div>
          {state.category && (
            <div style={{ display: "inline-block", marginTop: 6, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.3)", color: "#a78bfa" }}>
              {state.category}
            </div>
          )}
        </div>

        {/* QR Image */}
        <div style={{ display: "inline-block", background: "#fff", padding: 16, borderRadius: 14, border: "3px solid #e8620a", marginBottom: "1rem" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.qrUrl} alt="QR Code" width={220} height={220} style={{ display: "block" }} />
        </div>

        {/* Details */}
        <div style={{ fontSize: 11, color: "#555", marginBottom: "1rem", display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
          <span>ID: <code style={{ color: "#e8620a", fontFamily: "monospace" }}>{state.regCode}</code></span>
          {state.bibNumber && <span>BIB: <strong style={{ color: "#fff" }}>{state.bibNumber}</strong></span>}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <ActionBtn href={state.qrUrl} orange>View Full Size ↗</ActionBtn>
          <a
            href={state.qrUrl}
            download={`${state.name.replace(/\s+/g, "_")}_QR.png`}
            style={{ fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 7, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#ccc", textDecoration: "none" }}
          >
            ↓ Save
          </a>
          <ActionBtn onClick={handleShare}>{copied ? "Copied ✓" : (canShare ? "Share" : "Copy Link")}</ActionBtn>
        </div>

        <button
          onClick={onClose}
          style={{ marginTop: "1.25rem", fontSize: 12, color: "#555", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ── Participant Row ─────────────────────────────────────────────────────────────

function ParticipantRow({ p, eventTitle, regCode, onShowQR }: {
  p: Participant;
  eventTitle: string;
  regCode: string;
  onShowQR: (state: QRModalState) => void;
}) {
  const name   = [p.first_name, p.last_name].filter(Boolean).join(" ");
  const qrUrl  = p.qr_token ? `${BASE_URL}/api/events/qr/${encodeURIComponent(p.qr_token)}` : null;

  return (
    <div style={{
      display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10,
      padding: "10px 12px",
      background: "rgba(255,255,255,0.02)", borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.06)",
    }}>
      {/* Avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
        background: "rgba(232,98,10,0.15)", border: "1px solid rgba(232,98,10,0.3)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 800, color: "#e8620a",
      }}>
        {p.first_name[0]?.toUpperCase()}
      </div>

      {/* Name + meta */}
      <div style={{ flex: 1, minWidth: 100 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#eee" }}>{name}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
          {p.distance_category && <Chip color="#a78bfa">{p.distance_category}</Chip>}
          {p.tshirt_size && <Chip color="#f59e0b">👕 {p.tshirt_size}</Chip>}
          {p.bib_number && <Chip color="#60a5fa">BIB {p.bib_number}</Chip>}
        </div>
      </div>

      {/* Service dots */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <ServiceDot done={!!p.checked_in_at}   label="Check-In"  />
        <ServiceDot done={p.tshirt_issued}      label="T-Shirt"   />
        <ServiceDot done={p.breakfast_availed}  label="Breakfast" />
        <ServiceDot done={p.medal_issued}       label="Medal"     />
        <ServiceDot done={!!p.bib_collected_at} label="BIB"       />
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
        {qrUrl ? (
          <>
            <ActionBtn
              orange
              onClick={() => onShowQR({
                qrUrl, name, eventTitle, regCode,
                category: p.distance_category,
                bibNumber: p.bib_number,
              })}
            >
              🎫 QR Code
            </ActionBtn>
            <a
              href={qrUrl}
              download={`${name.replace(/\s+/g, "_")}_QR.png`}
              style={{ fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 7, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#ccc", textDecoration: "none", whiteSpace: "nowrap" }}
            >
              ↓ Save
            </a>
          </>
        ) : (
          <span style={{ fontSize: 11, color: "#444", fontStyle: "italic" }}>
            {p.status === "pending_payment" ? "QR after payment" : "QR pending"}
          </span>
        )}
        {p.certificate_url && (
          <ActionBtn href={p.certificate_url}>🏅 Certificate</ActionBtn>
        )}
      </div>
    </div>
  );
}

// ── Registration Card ─────────────────────────────────────────────────────────

function RegistrationCard({ reg, userToken, isUpcoming, onShowQR, onRefresh }: {
  reg:        Reg;
  userToken:  string;
  isUpcoming: boolean;
  onShowQR:   (state: QRModalState) => void;
  onRefresh:  () => void;
}) {
  const [expanded,      setExpanded]      = useState(true);
  const [cancelOpen,    setCancelOpen]    = useState(false);
  const [cancelReason,  setCancelReason]  = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelResult,  setCancelResult]  = useState<{ success?: boolean; message?: string; error?: string } | null>(null);

  // Category change
  const [catChangeOpen,    setCatChangeOpen]    = useState(false);
  const [newCategory,      setNewCategory]      = useState("");
  const [catReason,        setCatReason]        = useState("");
  const [catLoading,       setCatLoading]       = useState(false);
  const [catResult,        setCatResult]        = useState<{ success?: boolean; message?: string; error?: string } | null>(null);
  const [moreOpen,         setMoreOpen]         = useState(false);

  async function submitCategoryChange() {
    if (!newCategory) return;
    setCatLoading(true); setCatResult(null);
    try {
      const res  = await fetch("/api/events/category-change-request", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-token": userToken },
        body: JSON.stringify({ registration_code: reg.registration_code, new_category: newCategory, reason: catReason }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (res.ok) {
        setCatResult({ success: true, message: "Category change request submitted! Our team will review it shortly." });
        setCatReason(""); setNewCategory("");
        onRefresh();
      } else {
        setCatResult({ error: data.error ?? "Failed to submit request." });
      }
    } catch { setCatResult({ error: "Network error. Please try again." }); }
    finally { setCatLoading(false); }
  }

  const ev           = reg.events;
  const eventHref    = ev?.share_slug ? `/events/${ev.share_slug}` : "#";
  const banner       = ev?.banner_image ?? ev?.cover_image ?? null;
  const participants = reg.participants ?? [];
  const firstQRPart  = participants.find(p => !!p.qr_token);
  const contactHref  = ev?.organizer_email
    ? `mailto:${ev.organizer_email}`
    : ev?.organizer_phone ? `tel:${ev.organizer_phone}` : null;

  const daysUntilEvent = ev ? (() => {
    const d = new Date(ev.start_date + "T00:00:00+05:30");
    return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  })() : null;

  async function submitCancelRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!cancelReason.trim() || cancelReason.trim().length < 10) return;
    setCancelLoading(true); setCancelResult(null);
    try {
      const res  = await fetch("/api/events/cancellation-request", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-token": userToken },
        body: JSON.stringify({ registration_code: reg.registration_code, event_id: reg.event_id, reason: cancelReason }),
        credentials: "include",
      });
      const data = await res.json();
      setCancelResult(data);
      if (res.ok) setCancelReason("");
    } catch { setCancelResult({ error: "Network error. Please try again." }); }
    finally { setCancelLoading(false); }
  }

  return (
    <div style={{
      background: "rgba(255,255,255,0.025)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16, overflow: "hidden", marginBottom: 16,
    }}>

      {/* Row 1: Thumbnail + Event info */}
      <div style={{ display: "flex", gap: 12, padding: "14px 16px 10px", alignItems: "flex-start" }}>
        {banner ? (
          <div style={{ width: 72, height: 72, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={banner} alt={ev?.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
        ) : (
          <div style={{
            width: 72, height: 72, borderRadius: 10, flexShrink: 0,
            background: "rgba(232,98,10,0.08)", border: "1px solid rgba(232,98,10,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28,
          }}>
            {TYPE_ICON[ev?.event_type ?? ""] ?? "🏃"}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={eventHref} style={{
            fontSize: 14, fontWeight: 700, color: "#fff", textDecoration: "none",
            display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {ev?.title ?? "Event"}
          </Link>
          {ev && (
            <>
              <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                📅 {fmtDate(ev.start_date)}{ev.start_time && ` · ⏰ ${formatTime(ev.start_time)}`}
              </div>
              <div style={{ fontSize: 11, color: "#555" }}>📍 {ev.location}</div>
            </>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 7 }}>
            <code style={{
              fontSize: 10, color: "#e8620a", background: "rgba(232,98,10,0.1)",
              padding: "1px 7px", borderRadius: 4, fontFamily: "monospace",
            }}>
              {reg.registration_code}
            </code>
            <PayBadge status={reg.status} payment={reg.payment_status} />
            {reg.distance_category && <Chip color="#a78bfa">{reg.distance_category}</Chip>}
            {reg.final_price > 0 && <Chip color="#888">₹{reg.final_price}</Chip>}
            {participants.length > 1 && <Chip color="#a78bfa">{participants.length} pax</Chip>}
            {isUpcoming && daysUntilEvent !== null && daysUntilEvent >= 0 && (
              <Chip color={daysUntilEvent === 0 ? "#f87171" : daysUntilEvent <= 3 ? "#fb923c" : "#60a5fa"}>
                {daysUntilEvent === 0 ? "Today!" : daysUntilEvent === 1 ? "Tomorrow" : `${daysUntilEvent}d`}
              </Chip>
            )}
          </div>
        </div>
      </div>

      {/* Participants (collapsible) */}
      {expanded && participants.length > 0 && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#444", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>
            Participants
          </div>
          {participants.map(p => (
            <ParticipantRow
              key={p.id} p={p}
              eventTitle={ev?.title ?? "Event"}
              regCode={reg.registration_code}
              onShowQR={onShowQR}
            />
          ))}
        </div>
      )}

      {/* Pending category change notice */}
      {reg.pending_category_change && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "10px 16px",
          background: "rgba(234,179,8,0.05)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>🔄</span>
          <div style={{ fontSize: 12, color: "#eab308" }}>
            Category change pending: <strong>{reg.pending_category_change.old_category}</strong> → <strong>{reg.pending_category_change.new_category}</strong>
            <span style={{ color: "#666", marginLeft: 6 }}>· Awaiting admin review</span>
          </div>
        </div>
      )}

      {/* Category change panel (opened from More menu) */}
      {catChangeOpen && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "12px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", marginBottom: 8 }}>Request Category Change</div>
          {catResult?.success ? (
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(74,222,128,0.08)",
              border: "1px solid rgba(74,222,128,0.2)", fontSize: 12, color: "#4ade80" }}>
              {catResult.message}
              <button onClick={() => setCatChangeOpen(false)}
                style={{ display: "block", marginTop: 8, fontSize: 11, color: "#555", cursor: "pointer",
                  background: "none", border: "none", padding: 0, fontFamily: "inherit" }}>
                Close
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, color: "#666" }}>Select a new category. Our team will review your request.</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(ev?.distance_categories ?? []).filter(c => c !== reg.distance_category).map(cat => (
                  <button key={cat} onClick={() => setNewCategory(cat)}
                    style={{ padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                      background: newCategory === cat ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${newCategory === cat ? "rgba(167,139,250,0.5)" : "rgba(255,255,255,0.1)"}`,
                      color: newCategory === cat ? "#a78bfa" : "#888" }}>
                    {cat}
                  </button>
                ))}
              </div>
              <textarea value={catReason} onChange={e => setCatReason(e.target.value)} placeholder="Reason (optional)…" rows={2}
                style={{ width: "100%", padding: "8px 10px", resize: "vertical", background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#ccc", fontSize: 12,
                  fontFamily: "inherit", boxSizing: "border-box" as const, outline: "none" }} />
              {catResult?.error && <div style={{ fontSize: 11, color: "#f87171" }}>{catResult.error}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => void submitCategoryChange()} disabled={catLoading || !newCategory}
                  style={{ flex: 1, padding: "7px 0", borderRadius: 7,
                    background: catLoading || !newCategory ? "rgba(167,139,250,0.3)" : "rgba(167,139,250,0.7)",
                    border: "none", color: "#fff", fontSize: 12, fontWeight: 700,
                    cursor: catLoading || !newCategory ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                  {catLoading ? "Submitting…" : "Submit Request"}
                </button>
                <button type="button" onClick={() => { setCatChangeOpen(false); setCatResult(null); setCatReason(""); setNewCategory(""); }}
                  style={{ padding: "7px 14px", borderRadius: 7, background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.08)", color: "#888", fontSize: 12,
                    cursor: "pointer", fontFamily: "inherit" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cancellation panel (opened from More menu) */}
      {cancelOpen && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "12px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#f87171", marginBottom: 8 }}>Request Cancellation</div>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 10, lineHeight: 1.5 }}>
            Cancellations are processed within 1–2 business days. Refunds are credited within 5–7 business days.
          </div>
          {cancelResult?.success ? (
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(74,222,128,0.08)",
              border: "1px solid rgba(74,222,128,0.2)", fontSize: 12, color: "#4ade80" }}>
              {cancelResult.message}
            </div>
          ) : (
            <form onSubmit={submitCancelRequest} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                placeholder="Please describe your reason (min 10 characters)…" required
                style={{ width: "100%", minHeight: 70, padding: "8px 10px", resize: "vertical",
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 7, color: "#ccc", fontSize: 12, fontFamily: "inherit",
                  boxSizing: "border-box" as const, outline: "none" }} />
              {cancelResult?.error && (
                <div style={{ fontSize: 11, color: "#f87171" }}>{cancelResult.error}</div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={cancelLoading || cancelReason.trim().length < 10}
                  style={{ flex: 1, padding: "7px 0", borderRadius: 7,
                    background: cancelLoading || cancelReason.trim().length < 10
                      ? "rgba(239,68,68,0.3)" : "rgba(239,68,68,0.8)",
                        border: "none", color: "#fff", fontSize: 12, fontWeight: 700,
                    cursor: cancelLoading || cancelReason.trim().length < 10 ? "not-allowed" : "pointer",
                    fontFamily: "inherit" }}>
                  {cancelLoading ? "Submitting…" : "Submit Request"}
                </button>
                <button type="button" onClick={() => { setCancelOpen(false); setCancelResult(null); setCancelReason(""); }}
                  style={{ padding: "7px 14px", borderRadius: 7, background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.08)", color: "#888", fontSize: 12,
                    cursor: "pointer", fontFamily: "inherit" }}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Action bar */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "10px 14px",
        display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <Link href={`/my-events/${reg.registration_code}`}
          style={{ fontSize: 11, fontWeight: 700, padding: "6px 14px", borderRadius: 8,
            background: "rgba(232,98,10,0.12)", border: "1px solid rgba(232,98,10,0.3)",
            color: "#e8620a", textDecoration: "none", whiteSpace: "nowrap" as const }}>
          View Hub →
        </Link>
        {firstQRPart && (
          <IconBtn icon="🎫" label="QR" onClick={() => onShowQR({
            qrUrl:      `${BASE_URL}/api/events/qr/${encodeURIComponent(firstQRPart.qr_token!)}`,
            name:       [firstQRPart.first_name, firstQRPart.last_name].filter(Boolean).join(" "),
            eventTitle: ev?.title ?? "Event",
            regCode:    reg.registration_code,
            category:   firstQRPart.distance_category,
            bibNumber:  firstQRPart.bib_number,
          })} />
        )}
        {isUpcoming && ev && <IconBtn icon="📅" label="Cal" onClick={() => generateICS(reg)} />}
        {ev && <IconBtn icon="🗺" label="Map" href={directionsUrl(ev)} />}
        {ev?.share_slug && <IconBtn icon="↗" label="Share" onClick={() => void shareEvent(ev, reg.registration_code)} />}
        {participants.length > 0 && (
          <IconBtn
            icon={expanded ? "▲" : "▼"}
            label={expanded ? "Hide" : `${participants.length} pax`}
            onClick={() => setExpanded(v => !v)}
          />
        )}
        {/* More menu */}
        <div style={{ position: "relative", marginLeft: "auto" }}>
          <button onClick={() => setMoreOpen(v => !v)}
            style={{ fontSize: 15, lineHeight: 1, padding: "4px 10px", borderRadius: 8,
              background: moreOpen ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)", color: "#666",
              cursor: "pointer", fontFamily: "inherit" }}>
            ···
          </button>
          {moreOpen && (
            <div onClick={() => setMoreOpen(false)}
              style={{ position: "fixed", inset: 0, zIndex: 48 }} />
          )}
          {moreOpen && (
            <div style={{ position: "absolute", right: 0, bottom: "calc(100% + 6px)", zIndex: 50,
              background: "#1c1c1c", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12,
              padding: "6px 0", minWidth: 200, boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}>
              {reg.invoice_number && (
                <MoreItem label="📄 Invoice" onClick={() => {
                  setMoreOpen(false);
                  fetch(`/api/invoices/${reg.invoice_number}`, { headers: { "x-user-token": userToken } })
                    .then(r => r.text())
                    .then(html => { const w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); } })
                    .catch(() => {});
                }} />
              )}
              {ev?.route_map_url && <MoreItem label="🗺 Route Map" href={ev.route_map_url} />}
              {ev?.whatsapp_community_url && <MoreItem label="💬 WhatsApp Community" href={ev.whatsapp_community_url} />}
              {contactHref && <MoreItem label="✉️ Contact Organiser" href={contactHref} />}
              {isUpcoming && reg.status !== "cancelled" && !reg.pending_category_change
                && (ev?.distance_categories ?? []).length > 1 && (
                <MoreItem label="🔄 Change Category" onClick={() => {
                  setMoreOpen(false); setCatChangeOpen(true); setCatResult(null);
                }} />
              )}
              {isUpcoming && reg.status !== "cancelled" && (
                <MoreItem label="❌ Request Cancellation" onClick={() => {
                  setMoreOpen(false); setCancelOpen(true); setCancelResult(null);
                }} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Waitlist Entry Card ───────────────────────────────────────────────────────

function timeSince(isoStr: string): string {
  const ms = Date.now() - new Date(isoStr).getTime();
  const m  = Math.floor(ms / 60000);
  const h  = Math.floor(ms / 3600000);
  const d  = Math.floor(ms / 86400000);
  if (d > 0)  return `${d}d ago`;
  if (h > 0)  return `${h}h ago`;
  if (m > 0)  return `${m}m ago`;
  return "just now";
}

function WaitlistEntryCard({ entry }: { entry: WaitlistEntry }) {
  const ev        = entry.events;
  const banner    = ev?.banner_image ?? ev?.cover_image ?? null;
  const eventHref = ev?.share_slug ? `/events/${ev.share_slug}` : "#";
  const isApproved = entry.status === "approved";

  return (
    <div style={{
      background: "rgba(255,255,255,0.025)",
      border: `1px solid ${isApproved ? "rgba(74,222,128,0.25)" : "rgba(251,191,36,0.2)"}`,
      borderRadius: 16, overflow: "hidden", marginBottom: 16,
    }}>
      {/* Banner */}
      {banner && (
        <div style={{ height: 80, overflow: "hidden", position: "relative" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={banner} alt={ev?.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.75))" }} />
        </div>
      )}

      <div style={{ padding: "14px 18px", display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Position badge */}
        <div style={{
          minWidth: 52, height: 52, borderRadius: 12, flexShrink: 0,
          background: isApproved ? "rgba(74,222,128,0.12)" : "rgba(251,191,36,0.1)",
          border: `1px solid ${isApproved ? "rgba(74,222,128,0.3)" : "rgba(251,191,36,0.3)"}`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        }}>
          {isApproved ? (
            <span style={{ fontSize: 22 }}>✅</span>
          ) : entry.position != null ? (
            <>
              <span style={{ fontSize: 9, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: "0.06em" }}>Pos</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: "#fbbf24", lineHeight: 1 }}>#{entry.position}</span>
            </>
          ) : (
            <span style={{ fontSize: 22 }}>⏳</span>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={eventHref} style={{ fontSize: 14, fontWeight: 700, color: "#fff", textDecoration: "none",
            display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {ev?.title ?? "Event"}
          </Link>
          {ev && (
            <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
              📅 {fmtDate(ev.start_date)} · 📍 {ev.location}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {entry.distance_category && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.3)", color: "#a78bfa" }}>
                {entry.distance_category}
              </span>
            )}
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
              background: isApproved ? "rgba(74,222,128,0.1)" : "rgba(251,191,36,0.08)",
              border: `1px solid ${isApproved ? "rgba(74,222,128,0.3)" : "rgba(251,191,36,0.25)"}`,
              color: isApproved ? "#4ade80" : "#fbbf24" }}>
              {isApproved ? "Approved" : "Waiting"}
            </span>
            <span style={{ fontSize: 10, color: "#555" }}>
              Joined {timeSince(entry.created_at)}
            </span>
          </div>
          {isApproved && entry.approved_at && (
            <div style={{ fontSize: 11, color: "#4ade80", marginTop: 4 }}>
              ✓ Approved {timeSince(entry.approved_at)} — check your email for next steps
            </div>
          )}
          {!isApproved && entry.position != null && (
            <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
              You are #{entry.position} in the waitlist for this category. We&apos;ll notify you when a slot opens.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MyEventsDashboard() {
  const [regs,      setRegs]      = useState<Reg[]>([]);
  const [wlEntries, setWlEntries] = useState<WaitlistEntry[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [apiErr,    setApiErr]    = useState<string | null>(null);
  const [tab,       setTab]       = useState<"upcoming" | "past" | "waitlisted" | "cancelled">("upcoming");
  const [search,    setSearch]    = useState("");
  const [userToken, setUserToken] = useState("");
  const [qrModal,   setQrModal]   = useState<QRModalState | null>(null);

  const showQR = useCallback((state: QRModalState) => setQrModal(state), []);

  const loadRegs = useCallback((token: string) => {
    setLoading(true);
    fetch("/api/events/my-registrations", { headers: { "x-user-token": token } })
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
        setRegs(d.registrations ?? []);
        setWlEntries(d.waitlist_entries ?? []);
      })
      .catch(err => setApiErr(String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const raw   = localStorage.getItem("cs_user");
    const token = localStorage.getItem("cs_user_token") ?? "";
    if (!raw || !isTokenValid(token)) {
      handleAuthExpiry("/dashboard/events");
      return;
    }
    setUserToken(token);
    loadRegs(token);
  }, [loadRegs]);

  const searchLower    = search.toLowerCase().trim();
  const filteredRegs   = searchLower
    ? regs.filter(r =>
        (r.events?.title ?? "").toLowerCase().includes(searchLower) ||
        r.registration_code.toLowerCase().includes(searchLower)
      )
    : regs;

  const upcoming       = filteredRegs.filter(r => r.status !== "cancelled" && r.status !== "waitlisted" && !isEventOver(r.events));
  const past           = filteredRegs.filter(r => r.status !== "cancelled" && r.status !== "waitlisted" &&  isEventOver(r.events));
  const waitlistedRegs = filteredRegs.filter(r => r.status === "waitlisted");
  const cancelled      = filteredRegs.filter(r => r.status === "cancelled");
  const shown = tab === "upcoming"   ? upcoming
              : tab === "past"       ? past
              : tab === "cancelled"  ? cancelled
              : [];

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#fff", fontFamily: "'Inter',system-ui,sans-serif" }}>

      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(8,8,8,0.97)",
        borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 20px", height: 56,
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/dashboard" style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>
          ← Dashboard
        </Link>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>My Registrations</span>
        <Link href="/events" style={{ fontSize: 13, color: "#e8620a", textDecoration: "none", fontWeight: 600 }}>
          Browse Events
        </Link>
      </nav>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "clamp(1rem,4vw,2rem) 16px 80px" }}>

        {/* Search */}
        <div style={{ marginBottom: 16 }}>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by event name or registration ID…"
            style={{
              width: "100%", padding: "10px 14px", boxSizing: "border-box",
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none",
            }}
          />
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 2, marginBottom: 24 }}>
          {([
            { key: "upcoming",   label: "Upcoming",   count: upcoming.length },
            { key: "past",       label: "Past",       count: past.length },
            { key: "waitlisted", label: "Waitlist",   count: waitlistedRegs.length + wlEntries.length },
            { key: "cancelled",  label: "Cancelled",  count: cancelled.length },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: "7px 16px", borderRadius: 20, border: "1px solid", cursor: "pointer",
                fontSize: 12, fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap" as const,
                background: tab === t.key ? "rgba(232,98,10,0.12)" : "transparent",
                borderColor: tab === t.key ? "#e8620a" : "rgba(255,255,255,0.1)",
                color: tab === t.key ? "#e8620a" : "rgba(255,255,255,0.45)" }}>
              {t.label}{!loading ? ` (${t.count})` : ""}
            </button>
          ))}
        </div>

        {/* Content */}
        {apiErr ? (
          <div style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.25)", color: "#f87171", fontSize: 13 }}>
            Could not load registrations. Please refresh or try again.
          </div>
        ) : loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ height: 120, borderRadius: 16, background: "rgba(255,255,255,0.04)", animation: "pulse 1.4s infinite" }} />
            ))}
          </div>
        ) : tab === "waitlisted" ? (
          waitlistedRegs.length === 0 && wlEntries.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem 0", color: "#555" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
              <div style={{ fontSize: 15 }}>No waitlist entries</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {wlEntries.map(w => (
                <WaitlistEntryCard key={w.id} entry={w} />
              ))}
              {waitlistedRegs.map(r => (
                <RegistrationCard
                  key={r.id} reg={r} userToken={userToken}
                  isUpcoming={!isEventOver(r.events)}
                  onShowQR={showQR}
                  onRefresh={() => loadRegs(userToken)}
                />
              ))}
            </div>
          )
        ) : shown.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem 0", color: "#555" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>
              {tab === "upcoming" ? "🗓️" : tab === "past" ? "🏁" : "❌"}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#888", marginBottom: 8 }}>
              {searchLower
                ? `No ${tab} registrations matching "${search}"`
                : tab === "upcoming" ? "You haven't registered for any upcoming events"
                : tab === "past"     ? "No past registrations yet"
                :                     "No cancelled registrations"}
            </div>
            {tab === "upcoming" && !searchLower && (
              <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
                <p style={{ fontSize: 13, color: "#555", margin: "0 0 4px" }}>
                  You haven&apos;t registered for any events yet.
                </p>
                <Link href="/events"
                  style={{ fontSize: 13, fontWeight: 700, padding: "9px 20px", borderRadius: 8,
                    background: "rgba(232,98,10,0.12)", border: "1px solid rgba(232,98,10,0.3)",
                    color: "#e8620a", textDecoration: "none" }}>
                  Browse All Events →
                </Link>
                <Link href="/events?filter=upcoming"
                  style={{ fontSize: 13, fontWeight: 600, color: "#888", textDecoration: "none" }}>
                  View Upcoming Events →
                </Link>
              </div>
            )}
            {searchLower && (
              <button onClick={() => setSearch("")}
                style={{ marginTop: 16, fontSize: 12, color: "#e8620a", background: "none", border: "none",
                  cursor: "pointer", fontFamily: "inherit" }}>
                Clear search
              </button>
            )}
          </div>
        ) : (
          shown.map(r => (
            <RegistrationCard
              key={r.id} reg={r} userToken={userToken}
              isUpcoming={tab === "upcoming"}
              onShowQR={showQR}
              onRefresh={() => loadRegs(userToken)}
            />
          ))
        )}
      </div>

      {/* QR Modal */}
      {qrModal && <QRModal state={qrModal} onClose={() => setQrModal(null)} />}

      <style>{`@keyframes pulse { 0%,100% { opacity:.5 } 50% { opacity:1 } }`}</style>
    </div>
  );
}
