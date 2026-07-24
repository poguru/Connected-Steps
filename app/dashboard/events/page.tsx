"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isTokenValid, handleAuthExpiry } from "@/lib/client-auth";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Participant {
  id: string;
  registration_id: string;
  first_name: string;
  last_name: string | null;
  distance_category: string | null;
  tshirt_size: string | null;
  qr_token: string | null;
  checked_in_at: string | null;
  tshirt_issued: boolean;
  breakfast_availed: boolean;
  medal_issued: boolean;
  bib_collected_at: string | null;
  status: string;
}

interface Reg {
  id: string;
  event_id: string;
  registration_code: string;
  payment_status: string;
  status: string;
  final_price: number;
  original_price: number;
  coupon_discount: number;
  created_at: string;
  participant_count: number;
  distance_category: string | null;
  qr_token: string | null;
  checked_in_at: string | null;
  invoice_number: string | null;
  participants: Participant[];
  events: {
    title: string; event_type: string;
    start_date: string; start_time: string | null;
    end_date: string | null; end_time: string | null;
    location: string; share_slug: string | null;
  } | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<string, string> = {
  running: "🏃", cycling: "🚴", training: "💪",
  race: "🏆", community: "🤝", workshop: "📚",
};

const BASE_URL = typeof window !== "undefined"
  ? window.location.origin
  : (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in");

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
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

// ── Subcomponents ─────────────────────────────────────────────────────────────

function PayBadge({ status, payment }: { status: string; payment: string }) {
  if (status === "cancelled") return <Chip color="#ef4444">Cancelled</Chip>;
  if (payment === "paid")     return <Chip color="#4ade80">Paid ✓</Chip>;
  if (payment === "free")     return <Chip color="#60a5fa">Free</Chip>;
  if (payment === "pending")  return <Chip color="#eab308">Pending Payment</Chip>;
  return <Chip color="#888">{payment}</Chip>;
}

function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
      background: `${color}18`, border: `1px solid ${color}30`, color }}>
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

function ParticipantRow({ p }: { p: Participant }) {
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ");
  const qrUrl = p.qr_token ? `${BASE_URL}/api/events/qr/${encodeURIComponent(p.qr_token)}` : null;

  return (
    <div style={{
      display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10,
      padding: "10px 12px",
      background: "rgba(255,255,255,0.02)", borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.06)",
    }}>
      {/* Avatar initial */}
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
        </div>
      </div>

      {/* Service status */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <ServiceDot done={!!p.checked_in_at}   label="Check-In"  />
        <ServiceDot done={p.tshirt_issued}      label="T-Shirt"   />
        <ServiceDot done={p.breakfast_availed}  label="Breakfast" />
        <ServiceDot done={p.medal_issued}       label="Medal"     />
        <ServiceDot done={!!p.bib_collected_at} label="BIB"       />
      </div>

      {/* QR actions */}
      {qrUrl ? (
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <a href={qrUrl} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 7,
              background: "rgba(232,98,10,0.12)", border: "1px solid rgba(232,98,10,0.3)",
              color: "#e8620a", textDecoration: "none", whiteSpace: "nowrap" }}>
            View QR
          </a>
          <a href={qrUrl} download={`${name.replace(/\s+/g, "_")}_QR.png`}
            style={{ fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 7,
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
              color: "#ccc", textDecoration: "none", whiteSpace: "nowrap" }}>
            ↓ Save
          </a>
        </div>
      ) : (
        <span style={{ fontSize: 11, color: "#444", fontStyle: "italic" }}>
          {p.status === "pending_payment" ? "QR after payment" : "QR pending"}
        </span>
      )}
    </div>
  );
}

function RegistrationCard({ reg, userToken, isUpcoming }: { reg: Reg; userToken: string; isUpcoming: boolean }) {
  const [expanded,      setExpanded]      = useState(true);
  const [cancelOpen,    setCancelOpen]    = useState(false);
  const [cancelReason,  setCancelReason]  = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelResult,  setCancelResult]  = useState<{ success?: boolean; message?: string; error?: string } | null>(null);

  const ev = reg.events;
  const eventHref = ev?.share_slug ? `/events/${ev.share_slug}` : "#";

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
      if (res.ok) { setCancelReason(""); }
    } catch { setCancelResult({ error: "Network error. Please try again." }); }
    finally { setCancelLoading(false); }
  }

  const participants = reg.participants ?? [];

  return (
    <div style={{
      background: "rgba(255,255,255,0.025)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16, overflow: "hidden", marginBottom: 16,
    }}>
      {/* Card header */}
      <div style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 28, flexShrink: 0, marginTop: 2 }}>
            {TYPE_ICON[ev?.event_type ?? ""] ?? "🏃"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Link href={eventHref}
              style={{ fontSize: 15, fontWeight: 700, color: "#fff", textDecoration: "none", display: "block",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {ev?.title ?? "Event"}
            </Link>
            {ev && (
              <div style={{ fontSize: 12, color: "#666", marginTop: 3 }}>
                📅 {fmtDate(ev.start_date)} · 📍 {ev.location}
              </div>
            )}
            {/* Registration code + badges */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 8 }}>
              <code style={{ fontSize: 11, color: "#e8620a", background: "rgba(232,98,10,0.1)", padding: "2px 7px", borderRadius: 5 }}>
                {reg.registration_code}
              </code>
              <PayBadge status={reg.status} payment={reg.payment_status} />
              {reg.final_price > 0 && (
                <Chip color="#888">₹{reg.final_price}</Chip>
              )}
              {participants.length > 1 && (
                <Chip color="#a78bfa">{participants.length} participants</Chip>
              )}
            </div>
          </div>

          {/* Actions: invoice + expand toggle */}
          <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "flex-start" }}>
            {reg.invoice_number && (
              <a href={`/api/invoices/${reg.invoice_number}`}
                target="_blank" rel="noopener noreferrer"
                onClick={e => {
                  e.stopPropagation();
                  const headers = new Headers({ "x-user-token": userToken });
                  fetch(`/api/invoices/${reg.invoice_number}`, { headers })
                    .then(r => r.text())
                    .then(html => {
                      const w = window.open("", "_blank");
                      if (w) { w.document.write(html); w.document.close(); }
                    }).catch(() => {});
                  e.preventDefault();
                }}
                style={{ fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 8,
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                  color: "#ccc", textDecoration: "none", whiteSpace: "nowrap" }}>
                📄 Invoice
              </a>
            )}
            {participants.length > 0 && (
              <button onClick={() => setExpanded(v => !v)}
                style={{ fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 8,
                  background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
                  color: "#888", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                {expanded ? "Hide ▲" : `QR Codes ▼`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Participants section */}
      {expanded && participants.length > 0 && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "12px 16px",
          display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>
            Participants & QR Codes
          </div>

          {participants.map(p => <ParticipantRow key={p.id} p={p} />)}
        </div>
      )}

      {/* Cancellation section — upcoming confirmed events only */}
      {isUpcoming && reg.status !== "cancelled" && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "12px 16px" }}>
          {!cancelOpen ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 11, color: "#444" }}>
                Need to cancel?{" "}
                <a href="mailto:info@connectedsteps.in" style={{ color: "#666", textDecoration: "none" }}>info@connectedsteps.in</a>
                {" · "}
                <a href="tel:+919876543210" style={{ color: "#666", textDecoration: "none" }}>Contact Support</a>
              </div>
              <button onClick={() => { setCancelOpen(true); setCancelResult(null); }}
                style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 6,
                  background: "transparent", border: "1px solid rgba(239,68,68,0.25)",
                  color: "#f87171", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                Request Cancellation
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#f87171", marginBottom: 8 }}>
                Request Cancellation
              </div>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 10, lineHeight: 1.5 }}>
                Cancellations are processed by our team within 1–2 business days.
                Refunds for paid registrations are credited within 5–7 business days.
              </div>
              {cancelResult?.success ? (
                <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(74,222,128,0.08)",
                  border: "1px solid rgba(74,222,128,0.2)", fontSize: 12, color: "#4ade80" }}>
                  {cancelResult.message}
                </div>
              ) : (
                <form onSubmit={submitCancelRequest} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <textarea
                    value={cancelReason}
                    onChange={e => setCancelReason(e.target.value)}
                    placeholder="Please describe your reason for cancellation (required, min 10 characters)…"
                    required
                    style={{ width: "100%", minHeight: 70, padding: "8px 10px", resize: "vertical",
                      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 7, color: "#ccc", fontSize: 12, fontFamily: "inherit",
                      boxSizing: "border-box" as const, outline: "none" }}
                  />
                  {cancelResult?.error && (
                    <div style={{ fontSize: 11, color: "#f87171" }}>{cancelResult.error}</div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="submit" disabled={cancelLoading || cancelReason.trim().length < 10}
                      style={{ flex: 1, padding: "7px 0", borderRadius: 7,
                        background: cancelLoading || cancelReason.trim().length < 10 ? "rgba(239,68,68,0.3)" : "rgba(239,68,68,0.8)",
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
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MyEventsDashboard() {
  const [regs,      setRegs]      = useState<Reg[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [apiErr,    setApiErr]    = useState<string | null>(null);
  const [tab,       setTab]       = useState<"upcoming" | "past">("upcoming");
  const [userToken, setUserToken] = useState("");

  useEffect(() => {
    const raw   = localStorage.getItem("cs_user");
    const token = localStorage.getItem("cs_user_token") ?? "";
    if (!raw || !isTokenValid(token)) {
      handleAuthExpiry("/dashboard/events");
      return;
    }
    setUserToken(token);

    fetch("/api/events/my-registrations", { headers: { "x-user-token": token } })
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
        setRegs(d.registrations ?? []);
      })
      .catch(err => setApiErr(String(err)))
      .finally(() => setLoading(false));
  }, []);

  const upcoming = regs.filter(r => r.status !== "cancelled" && !isEventOver(r.events));
  const past     = regs.filter(r => r.status !== "cancelled" &&  isEventOver(r.events));
  const shown    = tab === "upcoming" ? upcoming : past;

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

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, padding: 3, background: "rgba(255,255,255,0.04)",
          borderRadius: 10, width: "fit-content", marginBottom: 24 }}>
          {(["upcoming", "past"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: "7px 18px", borderRadius: 7, border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                background: tab === t ? "#e8620a" : "transparent",
                color: tab === t ? "#fff" : "rgba(255,255,255,0.5)" }}>
              {t === "upcoming"
                ? `Upcoming${!loading ? ` (${upcoming.length})` : ""}`
                : `Past${!loading ? ` (${past.length})` : ""}`
              }
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
              <div key={i} style={{ height: 96, borderRadius: 16, background: "rgba(255,255,255,0.04)", animation: "pulse 1.4s infinite" }} />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem 0", color: "#555" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>{tab === "upcoming" ? "🗓️" : "🏁"}</div>
            <div style={{ fontSize: 15, marginBottom: 8 }}>
              {tab === "upcoming" ? "No upcoming registrations" : "No past registrations"}
            </div>
            {tab === "upcoming" && (
              <Link href="/events" style={{ fontSize: 13, color: "#e8620a", textDecoration: "none", fontWeight: 600 }}>
                Browse events →
              </Link>
            )}
          </div>
        ) : (
          shown.map(r => (
            <RegistrationCard key={r.id} reg={r} userToken={userToken} isUpcoming={tab === "upcoming"} />
          ))
        )}
      </div>

      <style>{`@keyframes pulse { 0%,100% { opacity:.5 } 50% { opacity:1 } }`}</style>
    </div>
  );
}
