"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { isTokenValid, handleAuthExpiry } from "@/lib/client-auth";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Participant {
  id: string; first_name: string; last_name: string | null; email: string | null;
  distance_category: string | null; tshirt_size: string | null; bib_number: string | null;
  qr_token: string | null; checked_in_at: string | null; tshirt_issued: boolean;
  breakfast_availed: boolean; medal_issued: boolean; bib_collected_at: string | null;
  certificate_url: string | null; certificate_generated_at: string | null; status: string;
}

interface EventData {
  id: string; title: string; event_type: string;
  cover_image: string | null; banner_image: string | null;
  start_date: string; start_time: string | null; end_date: string | null; end_time: string | null;
  location: string; share_slug: string | null; whatsapp_community_url: string | null;
  route_map_url: string | null; route_map_type: string | null;
  tshirt_size_chart_url: string | null; distance_categories: string[] | null;
  registration_closes_at: string | null; faqs: Array<{ q: string; a: string }> | null;
  highlights: unknown[] | null; collect_tshirt: boolean;
}

interface Registration {
  id: string; registration_code: string; event_id: string;
  user_email: string; user_name: string; phone: string | null;
  distance_category: string | null; payment_status: string; status: string;
  original_price: number; coupon_discount: number; final_price: number;
  coupon_code: string | null; qr_token: string | null; checked_in_at: string | null;
  bib_number: string | null; bib_collected_at: string | null;
  certificate_url: string | null; certificate_generated_at: string | null;
  participant_count: number; created_at: string;
  invoice: { invoice_number: string; total_amount: number; invoice_status: string } | null;
  bib_slot: unknown | null;
  result: { finish_time: string | null; overall_position: number | null; chip_time_secs: number | null; status: string } | null;
}

interface HubData {
  registration: Registration;
  event:        EventData;
  participants: Participant[];
}

interface TimelineItem {
  id: string; label: string; detail: string | null; ts: string | null;
  done: boolean; icon: string; category: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const BASE_URL = typeof window !== "undefined"
  ? window.location.origin
  : (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in");

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function fmtDateTime(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtChipTime(secs: number | null): string | null {
  if (secs == null) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function daysUntil(dateStr: string): number {
  const eventDate = new Date(dateStr + "T00:00:00+05:30");
  const now = new Date();
  return Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Atoms ──────────────────────────────────────────────────────────────────────

function SectionCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.025)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16, padding: "16px 18px", ...style,
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: "#e8620a",
      textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12,
    }}>
      {children}
    </div>
  );
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

function ServiceBadge({ done, label, icon }: { done: boolean; label: string; icon: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
      padding: "10px 8px", borderRadius: 10, minWidth: 64,
      background: done ? "rgba(74,222,128,0.07)" : "rgba(255,255,255,0.02)",
      border: `1px solid ${done ? "rgba(74,222,128,0.25)" : "rgba(255,255,255,0.07)"}`,
    }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={{ fontSize: 9, fontWeight: 700, color: done ? "#4ade80" : "#444", textAlign: "center", letterSpacing: "0.04em" }}>
        {label}
      </span>
    </div>
  );
}

// ── QR Display ─────────────────────────────────────────────────────────────────

function QRDisplay({ participant, eventTitle }: { participant: Participant; registration: Registration; eventTitle: string }) {
  const name    = [participant.first_name, participant.last_name].filter(Boolean).join(" ");
  const qrToken = participant.qr_token;
  const qrUrl   = qrToken ? `${BASE_URL}/api/events/qr/${encodeURIComponent(qrToken)}` : null;
  const [enlarged, setEnlarged] = useState(false);

  if (!qrUrl) {
    return (
      <div style={{ textAlign: "center", padding: "20px 0", color: "#555", fontSize: 13 }}>
        QR code will appear after payment confirmation
      </div>
    );
  }

  return (
    <>
      {enlarged && (
        <div onClick={() => setEnlarged(false)}
          style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.92)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ textAlign: "center" }}>
            <div style={{ background: "#fff", padding: 20, borderRadius: 16, display: "inline-block", border: "3px solid #e8620a" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUrl} alt="QR Code" width={280} height={280} style={{ display: "block" }} />
            </div>
            <div style={{ marginTop: 12, fontSize: 13, color: "#ccc", fontWeight: 600 }}>{name}</div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{eventTitle}</div>
            {participant.bib_number && <div style={{ marginTop: 6 }}><Chip color="#60a5fa">BIB {participant.bib_number}</Chip></div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
              <a href={qrUrl} download={`${name.replace(/\s+/g, "_")}_QR.png`}
                style={{ padding: "8px 16px", background: "#e8620a", borderRadius: 8, color: "#fff", textDecoration: "none", fontSize: 12, fontWeight: 700 }}>
                ↓ Save QR
              </a>
              <button onClick={() => setEnlarged(false)}
                style={{ padding: "8px 16px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#888", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* QR thumbnail */}
        <button onClick={() => setEnlarged(true)}
          style={{ background: "#fff", padding: 8, borderRadius: 10, border: "2px solid #e8620a", cursor: "pointer", flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="QR Code" width={80} height={80} style={{ display: "block" }} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f0f0f0" }}>{name}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
            {participant.distance_category && <Chip color="#a78bfa">{participant.distance_category}</Chip>}
            {participant.tshirt_size && <Chip color="#f59e0b">👕 {participant.tshirt_size}</Chip>}
            {participant.bib_number && <Chip color="#60a5fa">BIB {participant.bib_number}</Chip>}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button onClick={() => setEnlarged(true)}
              style={{ padding: "5px 12px", background: "rgba(232,98,10,0.12)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: 7, color: "#e8620a", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700 }}>
              🎫 Expand QR
            </button>
            <a href={qrUrl} download={`${name.replace(/\s+/g, "_")}_QR.png`}
              style={{ padding: "5px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#ccc", textDecoration: "none", fontSize: 11, fontWeight: 700 }}>
              ↓ Save
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────────

function Timeline({ code, token }: { code: string; token: string }) {
  const [items,   setItems]   = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/my-events/${code}/timeline`, { headers: { "x-user-token": token } })
      .then(r => r.json())
      .then(d => setItems(d.timeline ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [code, token]);

  if (loading) return <div style={{ color: "#444", fontSize: 13, textAlign: "center", padding: "20px 0" }}>Loading timeline…</div>;
  if (!items.length) return <div style={{ color: "#444", fontSize: 13, textAlign: "center", padding: "20px 0" }}>No timeline events yet</div>;

  return (
    <div style={{ position: "relative" }}>
      {/* Vertical line */}
      <div style={{ position: "absolute", left: 15, top: 0, bottom: 0, width: 2, background: "rgba(255,255,255,0.06)", borderRadius: 2 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {items.map((item, i) => (
          <div key={item.id} style={{ display: "flex", gap: 12, paddingBottom: i < items.length - 1 ? 16 : 0 }}>
            {/* Icon dot */}
            <div style={{
              width: 32, height: 32, borderRadius: "50%", flexShrink: 0, position: "relative", zIndex: 1,
              background: item.done ? "rgba(232,98,10,0.15)" : "rgba(255,255,255,0.04)",
              border: `2px solid ${item.done ? "rgba(232,98,10,0.5)" : "rgba(255,255,255,0.08)"}`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
            }}>
              {item.done ? item.icon : "◦"}
            </div>
            {/* Content */}
            <div style={{ flex: 1, paddingTop: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: item.done ? "#f0f0f0" : "#555" }}>{item.label}</div>
              {item.detail && <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{item.detail}</div>}
              {item.ts && <div style={{ fontSize: 10, color: "#444", marginTop: 3 }}>{fmtDateTime(item.ts)}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Comms History (mini, event-scoped) ────────────────────────────────────────

function CommsHistory({ eventId, token }: { eventId: string; token: string }) {
  const [items,   setItems]   = useState<Array<{ id: string; subject: string | null; type: string; status: string; sent_at: string | null }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/user/comms?event_id=${eventId}`, { headers: { "x-user-token": token } })
      .then(r => r.json())
      .then(d => setItems((d.timeline ?? []).slice(0, 10)))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [eventId, token]);

  if (loading) return <div style={{ color: "#444", fontSize: 12, padding: "8px 0" }}>Loading…</div>;
  if (!items.length) return <div style={{ color: "#444", fontSize: 12, padding: "8px 0" }}>No communications yet for this event</div>;

  const icons: Record<string, string> = { email: "📧", whatsapp: "💬" };
  const statusColor: Record<string, string> = {
    delivered: "#4ade80", sent: "#4ade80", read: "#4ade80",
    failed: "#f87171", queued: "#fb923c",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {items.map(item => (
        <div key={item.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", alignItems: "center" }}>
          <span style={{ fontSize: 14 }}>{icons[item.type] ?? "📨"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.subject ?? "—"}
            </div>
          </div>
          <span style={{ fontSize: 10, color: statusColor[item.status] ?? "#666", fontWeight: 700, flexShrink: 0 }}>{item.status}</span>
          <span style={{ fontSize: 10, color: "#444", flexShrink: 0, whiteSpace: "nowrap" }}>
            {item.sent_at ? new Date(item.sent_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Category Change Form ───────────────────────────────────────────────────────

function CategoryChangeForm({ reg, event, token, onDone }: {
  reg: Registration; event: EventData; token: string; onDone: () => void;
}) {
  const [open,     setOpen]     = useState(false);
  const [category, setCategory] = useState("");
  const [reason,   setReason]   = useState("");
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<{ ok?: boolean; error?: string; message?: string } | null>(null);

  const cats = (event.distance_categories ?? []).filter(c => c !== reg.distance_category);
  if (cats.length === 0) return null;
  // Hide if a pending category change already exists (field not returned by this API; guard omitted)

  async function submit() {
    if (!category) return;
    setLoading(true); setResult(null);
    const res = await fetch("/api/events/category-change-request", {
      method: "POST", headers: { "Content-Type": "application/json", "x-user-token": token },
      body: JSON.stringify({ registration_code: reg.registration_code, new_category: category, reason }),
    });
    const data = await res.json();
    setResult(res.ok ? { ok: true, message: data.message ?? "Request submitted!" } : { error: data.error ?? "Failed" });
    if (res.ok) { onDone(); setOpen(false); }
    setLoading(false);
  }

  if (!open) return (
    <button onClick={() => { setOpen(true); setResult(null); }}
      style={{ padding: "8px 16px", background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.25)", borderRadius: 8, color: "#a78bfa", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600 }}>
      🔄 Change Category
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, color: "#888" }}>
        Current: <span style={{ color: "#a78bfa", fontWeight: 700 }}>{reg.distance_category ?? "—"}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {cats.map(c => (
          <button key={c} onClick={() => setCategory(c)}
            style={{ padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              background: category === c ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${category === c ? "rgba(167,139,250,0.5)" : "rgba(255,255,255,0.1)"}`,
              color: category === c ? "#a78bfa" : "#888" }}>
            {c}
          </button>
        ))}
      </div>
      <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
        placeholder="Reason (optional)…"
        style={{ width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#ccc", fontSize: 12, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" as const }} />
      {result?.error && <div style={{ fontSize: 11, color: "#f87171" }}>{result.error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submit} disabled={loading || !category}
          style={{ flex: 1, padding: "8px 0", background: loading || !category ? "rgba(167,139,250,0.3)" : "#a78bfa", border: "none", borderRadius: 7, color: "#fff", fontSize: 12, fontWeight: 700, cursor: loading || !category ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
          {loading ? "Submitting…" : "Submit Request"}
        </button>
        <button onClick={() => { setOpen(false); setCategory(""); setReason(""); }}
          style={{ padding: "8px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, color: "#888", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EventHubPage() {
  const params        = useParams();
  const code          = (params?.code as string ?? "").toUpperCase();
  const [hub,         setHub]         = useState<HubData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [userToken,   setUserToken]   = useState("");
  const [toast,       setToast]       = useState<string | null>(null);
  const [resendLoad,  setResendLoad]  = useState(false);
  const [cancelOpen,  setCancelOpen]  = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoad,  setCancelLoad]  = useState(false);
  const [cancelResult, setCancelResult] = useState<{ ok?: boolean; error?: string; message?: string } | null>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3500); }

  const loadHub = useCallback((tok: string) => {
    setLoading(true); setError(null);
    fetch(`/api/my-events/${code}`, { headers: { "x-user-token": tok } })
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
        setHub(d as HubData);
      })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false));
  }, [code]);

  useEffect(() => {
    const raw   = localStorage.getItem("cs_user");
    const token = localStorage.getItem("cs_user_token") ?? "";
    if (!raw || !isTokenValid(token)) {
      handleAuthExpiry(`/my-events/${code}`);
      return;
    }
    setUserToken(token);
    loadHub(token);
  }, [code, loadHub]);

  async function handleResendQR() {
    setResendLoad(true);
    const res = await fetch(`/api/my-events/${code}/resend-qr`, {
      method: "POST", headers: { "x-user-token": userToken },
    });
    const data = await res.json();
    showToast(res.ok ? (data.message ?? "QR code sent!") : (data.error ?? "Failed to send"));
    setResendLoad(false);
  }

  async function handleCancel(e: React.FormEvent) {
    e.preventDefault();
    if (cancelReason.trim().length < 10) return;
    setCancelLoad(true); setCancelResult(null);
    const res = await fetch("/api/events/cancellation-request", {
      method: "POST", headers: { "Content-Type": "application/json", "x-user-token": userToken },
      body: JSON.stringify({ registration_code: code, event_id: hub?.registration.event_id, reason: cancelReason }),
      credentials: "include",
    });
    const data = await res.json();
    setCancelResult(res.ok ? { ok: true, message: data.message ?? "Request submitted!" } : { error: data.error ?? "Failed" });
    setCancelLoad(false);
    if (res.ok) { setCancelOpen(false); loadHub(userToken); }
  }

  // ── Derived values ──────────────────────────────────────────────────────────
  const reg  = hub?.registration;
  const ev   = hub?.event;
  const ppts = hub?.participants ?? [];

  const isUpcoming  = ev ? daysUntil(ev.start_date) > 0 : false;
  const daysTill    = ev ? daysUntil(ev.start_date) : 0;
  const banner      = ev?.banner_image ?? ev?.cover_image ?? null;
  const isCancelled = reg?.status === "cancelled";
  const isPaid      = reg?.payment_status === "paid" || reg?.payment_status === "free";

  // ── Loading / error states ──────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontFamily: "system-ui,sans-serif" }}>
      <div>Loading event hub…</div>
    </div>
  );

  if (error || !hub) return (
    <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ textAlign: "center", color: "#f87171" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠</div>
        <div>{error ?? "Registration not found"}</div>
        <Link href="/dashboard/events" style={{ display: "inline-block", marginTop: 16, color: "#e8620a", fontSize: 13, textDecoration: "none" }}>← Back to My Registrations</Link>
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#f0f0f0", fontFamily: "'Inter',system-ui,sans-serif" }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 18px", fontSize: 13, color: "#ddd", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <nav style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(8,8,8,0.97)", backdropFilter: "blur(10px)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 16px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/dashboard/events" style={{ fontSize: 13, color: "#888", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
          ← <span style={{ display: "none" }} className="sm-show">My Registrations</span>
        </Link>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60vw" }}>
          {ev?.title ?? code}
        </span>
        {isPaid && !isCancelled && (
          <Link href={`/my-events/${code}/pass`}
            style={{ padding: "5px 12px", background: "rgba(232,98,10,0.12)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: 7, color: "#e8620a", textDecoration: "none", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
            🎫 Pass
          </Link>
        )}
      </nav>

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "0 0 100px" }}>

        {/* ── Event Banner ────────────────────────────────────────────────────── */}
        {banner ? (
          <div style={{ position: "relative", height: 180, overflow: "hidden" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={banner} alt={ev?.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(8,8,8,0.85) 100%)" }} />
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "16px 20px" }}>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#fff", lineHeight: 1.2 }}>{ev?.title}</h1>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
                📅 {fmtDate(ev!.start_date)} · 📍 {ev?.location}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: "20px 16px 0" }}>
            <h1 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800, color: "#fff" }}>{ev?.title}</h1>
            <div style={{ fontSize: 12, color: "#666" }}>📅 {fmtDate(ev!.start_date)} · 📍 {ev?.location}</div>
          </div>
        )}

        <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>

          {/* ── Status Strip ────────────────────────────────────────────────── */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <code style={{ fontSize: 11, color: "#e8620a", background: "rgba(232,98,10,0.1)", padding: "2px 8px", borderRadius: 6 }}>
              {reg?.registration_code}
            </code>
            {reg?.status === "confirmed"  && <Chip color="#4ade80">Confirmed ✓</Chip>}
            {reg?.status === "waitlisted" && <Chip color="#f59e0b">Waitlisted</Chip>}
            {isCancelled                  && <Chip color="#f87171">Cancelled</Chip>}
            {reg?.payment_status === "paid"    && <Chip color="#4ade80">Paid ✓</Chip>}
            {reg?.payment_status === "free"    && <Chip color="#60a5fa">Free</Chip>}
            {reg?.payment_status === "pending" && <Chip color="#f59e0b">Payment Pending</Chip>}
            {reg?.distance_category && <Chip color="#a78bfa">{reg.distance_category}</Chip>}
            {isUpcoming && !isCancelled && (
              <span style={{ fontSize: 11, color: daysTill <= 7 ? "#fb923c" : "#666", fontWeight: daysTill <= 7 ? 700 : 400 }}>
                {daysTill === 0 ? "🔴 Today!" : daysTill === 1 ? "🟡 Tomorrow" : `${daysTill} days away`}
              </span>
            )}
          </div>

          {/* ── Pending payment warning ─────────────────────────────────────── */}
          {reg?.payment_status === "pending" && (
            <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(234,179,8,0.07)", border: "1px solid rgba(234,179,8,0.25)", color: "#eab308", fontSize: 13 }}>
              ⚠ Payment pending — your spot is not confirmed yet.{" "}
              {ev?.share_slug && (
                <Link href={`/events/${ev.share_slug}/register`} style={{ color: "#eab308", fontWeight: 700, textDecoration: "underline" }}>
                  Complete payment
                </Link>
              )}
            </div>
          )}

          {/* ── QR Codes ────────────────────────────────────────────────────── */}
          {isPaid && !isCancelled && (
            <SectionCard>
              <SectionLabel>Your Event Pass{ppts.length > 1 ? "es" : ""}</SectionLabel>
              {ppts.length === 0 ? (
                <div style={{ fontSize: 12, color: "#555" }}>No participants found</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {ppts.map(p => (
                    <QRDisplay key={p.id} participant={p} registration={reg!} eventTitle={ev!.title} />
                  ))}
                </div>
              )}
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <Link href={`/my-events/${code}/pass`}
                  style={{ padding: "6px 14px", background: "rgba(232,98,10,0.12)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: 7, color: "#e8620a", textDecoration: "none", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  🎫 Race Day Pass
                </Link>
                <button onClick={handleResendQR} disabled={resendLoad}
                  style={{ padding: "6px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#888", cursor: resendLoad ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 600, opacity: resendLoad ? 0.6 : 1 }}>
                  {resendLoad ? "Sending…" : "📧 Resend QR to Email"}
                </button>
              </div>
            </SectionCard>
          )}

          {/* ── Services Status ──────────────────────────────────────────────── */}
          {ppts.length > 0 && !isCancelled && (
            <SectionCard>
              <SectionLabel>Event Day Status</SectionLabel>
              {ppts.map(p => {
                const name = [p.first_name, p.last_name].filter(Boolean).join(" ");
                return (
                  <div key={p.id} style={{ marginBottom: ppts.length > 1 ? 14 : 0 }}>
                    {ppts.length > 1 && <div style={{ fontSize: 11, color: "#666", marginBottom: 8, fontWeight: 600 }}>{name}</div>}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <ServiceBadge done={!!p.checked_in_at}   label="Check-In"  icon="✅" />
                      {ev?.collect_tshirt && <ServiceBadge done={p.tshirt_issued}    label="T-Shirt"   icon="👕" />}
                      <ServiceBadge done={p.breakfast_availed} label="Breakfast" icon="🍽" />
                      <ServiceBadge done={p.medal_issued}      label="Medal"     icon="🏅" />
                      <ServiceBadge done={!!p.bib_collected_at} label="BIB"      icon="🎽" />
                    </div>
                  </div>
                );
              })}
            </SectionCard>
          )}

          {/* ── Documents ───────────────────────────────────────────────────── */}
          <SectionCard>
            <SectionLabel>Documents</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Invoice */}
              {reg?.invoice?.invoice_number ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#ddd" }}>📄 Invoice</div>
                    <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>₹{reg.final_price} · {reg.invoice.invoice_number}</div>
                  </div>
                  <button onClick={() => {
                    const headers = new Headers({ "x-user-token": userToken });
                    fetch(`/api/invoices/${reg.invoice!.invoice_number}`, { headers })
                      .then(r => r.text())
                      .then(html => {
                        const w = window.open("", "_blank");
                        if (w) { w.document.write(html); w.document.close(); }
                      });
                  }} style={{ padding: "5px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#ccc", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 600 }}>
                    Open ↗
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "#555" }}>Invoice will appear here after payment</div>
              )}

              {/* Certificates */}
              {ppts.some(p => p.certificate_url) && (
                <>
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#ddd", marginBottom: 8 }}>🏆 Certificates</div>
                    {ppts.filter(p => p.certificate_url).map(p => {
                      const name = [p.first_name, p.last_name].filter(Boolean).join(" ");
                      return (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: 12, color: "#888" }}>{name}</span>
                          <a href={p.certificate_url!} target="_blank" rel="noopener noreferrer"
                            style={{ padding: "4px 10px", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 7, color: "#4ade80", textDecoration: "none", fontSize: 11, fontWeight: 700 }}>
                            Download ↗
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Route Map */}
              {ev?.route_map_url && (
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#ddd" }}>🗺 Route Map</div>
                    <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{ev.route_map_type ?? "View course route"}</div>
                  </div>
                  <a href={ev.route_map_url} target="_blank" rel="noopener noreferrer"
                    style={{ padding: "5px 12px", background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.25)", borderRadius: 7, color: "#60a5fa", textDecoration: "none", fontSize: 11, fontWeight: 700 }}>
                    View ↗
                  </a>
                </div>
              )}
            </div>
          </SectionCard>

          {/* ── Race Results ────────────────────────────────────────────────── */}
          {reg?.result && (
            <SectionCard>
              <SectionLabel>Race Results</SectionLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {reg.result.chip_time_secs != null && (
                  <div style={{ flex: 1, minWidth: 120, background: "rgba(232,98,10,0.07)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: 12, padding: "12px 16px", textAlign: "center" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#e8620a", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Chip Time</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums" }}>
                      {fmtChipTime(reg.result.chip_time_secs)}
                    </div>
                  </div>
                )}
                {reg.result.overall_position != null && (
                  <div style={{ flex: 1, minWidth: 100, background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 12, padding: "12px 16px", textAlign: "center" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Overall</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums" }}>
                      #{reg.result.overall_position}
                    </div>
                  </div>
                )}
                {reg.result.finish_time && (
                  <div style={{ flex: 2, minWidth: 140, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "12px 16px" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Finish Time</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#ccc" }}>{reg.result.finish_time}</div>
                    <div style={{ marginTop: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                        background: reg.result.status === "finisher" ? "rgba(74,222,128,0.1)" : "rgba(239,68,68,0.1)",
                        border: `1px solid ${reg.result.status === "finisher" ? "rgba(74,222,128,0.3)" : "rgba(239,68,68,0.3)"}`,
                        color: reg.result.status === "finisher" ? "#4ade80" : "#f87171" }}>
                        {reg.result.status?.toUpperCase() ?? "—"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* ── Event Info ──────────────────────────────────────────────────── */}
          <SectionCard>
            <SectionLabel>Event Details</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { icon: "📅", label: "Date",     value: fmtDate(ev!.start_date) },
                ev?.start_time ? { icon: "⏰", label: "Time",  value: ev.start_time } : null,
                { icon: "📍", label: "Venue",    value: ev!.location },
                ev?.end_date  ? { icon: "🏁", label: "End",   value: fmtDate(ev.end_date) } : null,
              ].filter(Boolean).map((row, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{row!.icon}</span>
                  <div>
                    <div style={{ fontSize: 10, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{row!.label}</div>
                    <div style={{ fontSize: 13, color: "#ddd", marginTop: 2 }}>{row!.value}</div>
                  </div>
                </div>
              ))}

              {/* WhatsApp community */}
              {ev?.whatsapp_community_url && (
                <div style={{ marginTop: 4, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <a href={ev.whatsapp_community_url} target="_blank" rel="noopener noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 10, textDecoration: "none" }}>
                    <span style={{ fontSize: 20 }}>💬</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#4ade80" }}>Join WhatsApp Community</div>
                      <div style={{ fontSize: 10, color: "#555", marginTop: 1 }}>Get live updates on event day</div>
                    </div>
                    <span style={{ marginLeft: "auto", color: "#4ade80", fontSize: 14 }}>→</span>
                  </a>
                </div>
              )}
            </div>
          </SectionCard>

          {/* ── Journey Timeline ─────────────────────────────────────────────── */}
          <SectionCard>
            <SectionLabel>Your Journey</SectionLabel>
            <Timeline code={code} token={userToken} />
          </SectionCard>

          {/* ── Communications ──────────────────────────────────────────────── */}
          <SectionCard>
            <SectionLabel>Communications</SectionLabel>
            <CommsHistory eventId={reg!.event_id} token={userToken} />
            <div style={{ marginTop: 10 }}>
              <Link href="/dashboard/comms" style={{ fontSize: 11, color: "#e8620a", textDecoration: "none", fontWeight: 600 }}>
                View all communications →
              </Link>
            </div>
          </SectionCard>

          {/* ── FAQs ────────────────────────────────────────────────────────── */}
          {ev?.faqs && ev.faqs.length > 0 && (
            <SectionCard>
              <SectionLabel>FAQ</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {ev.faqs.map((faq, i) => (
                  <FaqItem key={i} q={faq.q} a={faq.a} />
                ))}
              </div>
            </SectionCard>
          )}

          {/* ── Self-Service Actions ────────────────────────────────────────── */}
          {!isCancelled && (
            <SectionCard>
              <SectionLabel>Manage Registration</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Category change */}
                {isUpcoming && (ev?.distance_categories ?? []).length > 1 && (
                  <div>
                    <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
                      Current category: <span style={{ color: "#a78bfa", fontWeight: 700 }}>{reg?.distance_category ?? "—"}</span>
                    </div>
                    <CategoryChangeForm reg={reg!} event={ev!} token={userToken} onDone={() => loadHub(userToken)} />
                  </div>
                )}

                {/* Cancellation */}
                {isUpcoming && (
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 14 }}>
                    {!cancelOpen ? (
                      <button onClick={() => { setCancelOpen(true); setCancelResult(null); }}
                        style={{ padding: "7px 16px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, color: "#f87171", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600 }}>
                        Request Cancellation
                      </button>
                    ) : (
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#f87171", marginBottom: 8 }}>Request Cancellation</div>
                        <div style={{ fontSize: 11, color: "#666", marginBottom: 10, lineHeight: 1.5 }}>
                          Cancellations are processed within 1–2 business days. Refunds within 5–7 business days.
                        </div>
                        {cancelResult?.ok ? (
                          <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", fontSize: 12, color: "#4ade80" }}>
                            {cancelResult.message}
                          </div>
                        ) : (
                          <form onSubmit={handleCancel} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} required
                              placeholder="Reason for cancellation (min 10 characters)…" rows={2}
                              style={{ width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#ccc", fontSize: 12, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" as const }} />
                            {cancelResult?.error && <div style={{ fontSize: 11, color: "#f87171" }}>{cancelResult.error}</div>}
                            <div style={{ display: "flex", gap: 8 }}>
                              <button type="submit" disabled={cancelLoad || cancelReason.trim().length < 10}
                                style={{ flex: 1, padding: "7px 0", background: cancelLoad || cancelReason.trim().length < 10 ? "rgba(239,68,68,0.3)" : "rgba(239,68,68,0.8)", border: "none", borderRadius: 7, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                                {cancelLoad ? "Submitting…" : "Submit"}
                              </button>
                              <button type="button" onClick={() => { setCancelOpen(false); setCancelReason(""); setCancelResult(null); }}
                                style={{ padding: "7px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, color: "#888", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                                Cancel
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* ── Contact & Support ───────────────────────────────────────────── */}
          <SectionCard>
            <SectionLabel>Need Help?</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <a href="mailto:info@connectedsteps.in"
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, textDecoration: "none" }}>
                <span style={{ fontSize: 18 }}>✉️</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#ddd" }}>Email Support</div>
                  <div style={{ fontSize: 11, color: "#555" }}>info@connectedsteps.in</div>
                </div>
              </a>
              <div style={{ display: "flex", gap: 8 }}>
                <Link href="/my-bugs" style={{ flex: 1, padding: "8px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>🐛</span>
                  <span style={{ fontSize: 12, color: "#888" }}>Report Issue</span>
                </Link>
                {ev?.share_slug && (
                  <Link href={`/events/${ev.share_slug}`} style={{ flex: 1, padding: "8px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16 }}>🌐</span>
                    <span style={{ fontSize: 12, color: "#888" }}>Event Page</span>
                  </Link>
                )}
              </div>
            </div>
          </SectionCard>

        </div>
      </div>

      <style>{`
        @media (min-width: 480px) { .sm-show { display: inline !important; } }
        .sm-show { display: none; }
      `}</style>
    </div>
  );
}

// ── FAQ Accordion ─────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", gap: 10 }}>
        <span style={{ fontSize: 13, color: "#ddd", textAlign: "left", fontWeight: 500 }}>{q}</span>
        <span style={{ color: "#555", flexShrink: 0, transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "rotate(0)" }}>▾</span>
      </button>
      {open && (
        <div style={{ fontSize: 12, color: "#888", paddingBottom: 12, lineHeight: 1.6 }}>{a}</div>
      )}
    </div>
  );
}
