"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import Image from "next/image";
import QRScannerModal from "@/components/ui/QRScannerModal";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Reg {
  id: string; registration_code: string; user_email: string; user_name: string;
  phone: string | null; blood_group: string | null; coupon_code: string | null;
  coupon_discount: number; original_price: number; final_price: number;
  payment_status: string; razorpay_payment_id: string | null; status: string;
  checked_in_at: string | null; created_at: string; distance_category: string | null;
  qr_token: string | null;
}

interface Summary { total: number; paid: number; free: number; pending: number; revenue: number; checkedIn: number; }

interface CheckInResult {
  valid: boolean; already_checked_in?: boolean; message: string; error?: string;
  registration?: { code: string; name: string; category: string | null; event: string; checked_in_at: string };
}

interface CommHistory { id: string; sent_at: string; subject: string; recipients: number; status: string; }

type Tab = "registrations" | "communicate";
type RecipientFilter = "all" | "paid" | "free" | "pending" | "checked_in" | "not_checked_in";

const RECIPIENT_LABELS: Record<RecipientFilter, string> = {
  all: "All Registrants", paid: "Paid Only", free: "Free Only",
  pending: "Pending Payment", checked_in: "Checked In", not_checked_in: "Not Checked In",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  card:  { background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "1.25rem" },
  input: { padding: "9px 13px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", fontSize: "0.85rem", outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" as const },
};

function btnStyle(active = true): React.CSSProperties {
  return { padding: "9px 20px", background: active ? "#e8620a" : "rgba(255,255,255,0.06)", border: "none", borderRadius: 6, color: active ? "#fff" : "#888", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer", fontFamily: "inherit" };
}

function payBadge(s: string) {
  const c = s === "paid" ? "#4ade80" : s === "free" ? "#60a5fa" : s === "pending" ? "#eab308" : "#888";
  return <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: 999, background: `${c}18`, border: `1px solid ${c}30`, color: c, fontWeight: 700 }}>{s.toUpperCase()}</span>;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EventRegistrationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);

  const [tab,      setTab]      = useState<Tab>("registrations");
  const [regs,     setRegs]     = useState<Reg[]>([]);
  const [summary,  setSummary]  = useState<Summary | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [search,   setSearch]   = useState("");
  const [filter,   setFilter]   = useState<"all" | "paid" | "free" | "pending">("all");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanToken,  setScanToken]  = useState("");
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult,  setScanResult] = useState<CheckInResult | null>(null);

  // Communication state
  const [recipient,   setRecipient]   = useState<RecipientFilter>("all");
  const [commSubject, setCommSubject] = useState("");
  const [commBody,    setCommBody]    = useState("");
  const [template,    setTemplate]    = useState("");
  const [sending,     setSending]     = useState(false);
  const [sendResult,  setSendResult]  = useState("");
  const [history,     setHistory]     = useState<CommHistory[]>([]);

  const headers = { "Content-Type": "application/json" };

  async function load() {
    setLoading(true); setError("");
    try {
      const res  = await fetch(`/api/admin/events/registrations?event_id=${eventId}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to load"); return; }
      setRegs(json.registrations ?? []);

      // Compute summary client-side from full list
      const all = json.registrations ?? [];
      setSummary({
        total:     all.length,
        paid:      all.filter((r: Reg) => r.payment_status === "paid").length,
        free:      all.filter((r: Reg) => r.payment_status === "free").length,
        pending:   all.filter((r: Reg) => r.payment_status === "pending").length,
        revenue:   all.filter((r: Reg) => r.payment_status === "paid").reduce((s: number, r: Reg) => s + (r.final_price ?? 0), 0),
        checkedIn: all.filter((r: Reg) => r.checked_in_at).length,
      });
      if (all[0]?.events?.title) setEventTitle(all[0].events.title);
    } catch { setError("Network error."); }
    finally { setLoading(false); }
  }

  async function loadHistory() {
    const res  = await fetch(`/api/admin/events/${eventId}/communicate`).catch(() => null);
    if (res?.ok) { const d = await res.json(); setHistory(d.history ?? []); }
  }

  useEffect(() => { load(); }, [eventId]); // eslint-disable-line
  useEffect(() => { if (tab === "communicate") loadHistory(); }, [tab]); // eslint-disable-line

  async function runCheckIn(token: string) {
    if (!token.trim()) return;
    setScanLoading(true); setScanResult(null);
    try {
      const res  = await fetch("/api/events/check-in", { method: "POST", headers, body: JSON.stringify({ token: token.trim() }) });
      const data = await res.json();
      setScanResult(data);
      if (res.ok && data.valid && !data.already_checked_in) {
        setRegs(prev => prev.map(r => r.registration_code === data.registration?.code ? { ...r, checked_in_at: data.registration.checked_in_at } : r));
        setScanToken("");
      }
    } catch { setScanResult({ valid: false, message: "Network error." }); }
    finally { setScanLoading(false); }
  }

  async function cancel(id: string) {
    if (!confirm("Cancel this registration?")) return;
    const res = await fetch("/api/admin/events/registrations", { method: "PATCH", headers, body: JSON.stringify({ id, status: "cancelled" }) });
    if (res.ok) setRegs(r => r.map(x => x.id === id ? { ...x, status: "cancelled" } : x));
  }

  async function resendQR(id: string, name: string) {
    if (!confirm(`Resend QR email to ${name}?`)) return;
    const res  = await fetch("/api/admin/events/registrations/resend-qr", { method: "POST", headers, body: JSON.stringify({ registration_id: id }) });
    const data = await res.json();
    alert(res.ok ? data.message : `Error: ${data.error}`);
  }

  const [genLoading,   setGenLoading]   = useState(false);
  const [genResult,    setGenResult]    = useState("");
  const [bulkSending,  setBulkSending]  = useState(false);
  const [bulkResult,   setBulkResult]   = useState<{ sent: number; failed: number; skipped: number; total: number; details: { email: string; name: string; status: string; reason: string | null }[] } | null>(null);
  const [showDetails,  setShowDetails]  = useState(false);

  async function resendAllQR(retryFailed = false) {
    const confirmed = regs.filter(r => r.status === "confirmed").length;
    const label     = retryFailed ? "Retry all failed emails?" : `Send QR email to all ${confirmed} confirmed registrants?\n\nThis sends in batches of 10 — may take 1–2 minutes.`;
    if (!confirm(label)) return;
    setBulkSending(true); setBulkResult(null); setShowDetails(false);
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/resend-all-qr`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ retry_failed: retryFailed }) });
      const data = await res.json();
      if (res.ok) setBulkResult(data);
      else        setBulkResult({ sent: 0, failed: 0, skipped: 0, total: 0, details: [{ email: "", name: "", status: "failed", reason: data.error }] });
    } catch { setBulkResult({ sent: 0, failed: 0, skipped: 0, total: 0, details: [{ email: "", name: "", status: "failed", reason: "Network error" }] }); }
    finally { setBulkSending(false); }
  }

  async function generateMissingQR() {
    if (!confirm("Generate QR tokens for all confirmed registrations that are missing one?")) return;
    setGenLoading(true); setGenResult("");
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/generate-missing-qr`, { method: "POST", headers });
      const data = await res.json();
      setGenResult(res.ok ? `✅ Generated: ${data.generated}  Failed: ${data.failed}` : `❌ ${data.error}`);
      if (res.ok && data.generated > 0) load(); // refresh list
    } catch { setGenResult("❌ Network error"); }
    finally { setGenLoading(false); }
  }

  function exportFailedCSV() {
    if (!bulkResult) return;
    const failed = bulkResult.details.filter(d => d.status === "failed");
    const rows   = [["Email","Name","Reason"].join(","), ...failed.map(d => [d.email, d.name, d.reason ?? ""].map(v => `"${String(v).replace(/"/g,'""')}"`).join(","))].join("\n");
    const a      = document.createElement("a"); a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(rows); a.download = `failed-emails-${Date.now()}.csv`; a.click();
  }

  async function sendCommunication(e: React.FormEvent) {
    e.preventDefault();
    if (!commSubject.trim() || !commBody.trim()) return;
    setSending(true); setSendResult("");
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/communicate`, {
        method: "POST", headers,
        body: JSON.stringify({ recipient_filter: recipient, subject: commSubject, body: commBody }),
      });
      const data = await res.json();
      if (!res.ok) { setSendResult(`Error: ${data.error}`); return; }
      setSendResult(`✅ Sent to ${data.sent} recipients${data.failed ? ` (${data.failed} failed)` : ""}`);
      setCommSubject(""); setCommBody(""); setTemplate("");
      loadHistory();
    } catch { setSendResult("Network error. Please try again."); }
    finally { setSending(false); }
  }

  function applyTemplate(t: string) {
    setTemplate(t);
    const templates: Record<string, { subject: string; body: string }> = {
      schedule: {
        subject: `Event Schedule — ${eventTitle}`,
        body: `Dear Runner,\n\nHere's your event schedule:\n\n⏰ Reporting Time: 5:30 AM\n🏃 Warm-up: 5:45 AM\n🚩 Flag Off: 6:00 AM\n📍 Venue: [Venue Name]\n🚗 Parking: [Parking details]\n\nRoute map: [Link]\n\nContact: +91 XXXXXXXXXX\n\nSee you at the start line!\n\nTeam Connected Steps`,
      },
      reminder: {
        subject: `Reminder: ${eventTitle} is tomorrow!`,
        body: `Dear Runner,\n\nThis is a reminder that ${eventTitle} is tomorrow!\n\nPlease carry:\n✓ Your event QR code (check your registration email)\n✓ Valid ID proof\n✓ Water bottle\n✓ Comfortable running gear\n\nWe look forward to seeing you!\n\nTeam Connected Steps`,
      },
      resend_qr: {
        subject: `Action Required: Check your QR code for ${eventTitle}`,
        body: `Dear Runner,\n\nThis is a reminder to check your registration email for your unique QR code for ${eventTitle}.\n\nYour QR code was sent to this email address when you registered. Please search your inbox for an email from Connected Steps with subject "Your Registration & QR Code".\n\nIf you cannot find it, please reply to this email and we will resend it.\n\nEvent Details:\n📅 Date: [Event Date]\n📍 Venue: [Venue Name]\n⏰ Reporting Time: 5:30 AM\n\nTeam Connected Steps\ninfo@connectedsteps.in`,
      },
    };
    if (templates[t]) { setCommSubject(templates[t].subject); setCommBody(templates[t].body); }
  }

  function exportCSV() {
    const rows = [
      ["Code", "Name", "Email", "Phone", "Category", "Price", "Payment", "Status", "Checked In", "Registered"].join(","),
      ...filtered.map(r => [
        r.registration_code, r.user_name, r.user_email, r.phone ?? "",
        r.distance_category ?? "",
        r.final_price, r.payment_status, r.status,
        r.checked_in_at ? new Date(r.checked_in_at).toLocaleTimeString("en-IN") : "—",
        new Date(r.created_at).toLocaleDateString("en-IN"),
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(rows);
    a.download = `registrations-${eventId}-${Date.now()}.csv`;
    a.click();
  }

  const filtered = regs
    .filter(r => filter === "all" || r.payment_status === filter)
    .filter(r => {
      if (!search) return true;
      const q = search.toLowerCase();
      return r.user_name.toLowerCase().includes(q)
        || r.user_email.toLowerCase().includes(q)
        || r.registration_code.toLowerCase().includes(q);
    });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff" }}>
      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", height: "60px", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <Link href="/admin" style={{ textDecoration: "none" }}>
          <Image src="/logo.png" alt="" width={28} height={28} className="rounded-full" />
        </Link>
        <span style={{ fontWeight: 600 }}>Admin</span>
        <span style={{ color: "#444" }}>/</span>
        <Link href="/admin/events/registrations" style={{ color: "#888", textDecoration: "none", fontSize: "0.85rem" }}>Events</Link>
        <span style={{ color: "#444" }}>/</span>
        <span style={{ color: "#888", fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
          {eventTitle || "Registrations"}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {genResult && <span style={{ fontSize: "0.72rem", color: genResult.startsWith("✅") ? "#4ade80" : "#f87171" }}>{genResult}</span>}
          <button onClick={generateMissingQR} disabled={genLoading}
            style={{ padding: "6px 12px", background: genLoading ? "#1a1a1a" : "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 6, color: genLoading ? "#444" : "#4ade80", cursor: genLoading ? "not-allowed" : "pointer", fontSize: "0.78rem", fontFamily: "inherit", fontWeight: 600, whiteSpace: "nowrap" }}>
            {genLoading ? "Generating…" : "⚡ Generate Missing QR"}
          </button>
          {bulkResult && (
            <span style={{ fontSize: "0.75rem", color: "#aaa" }}>
              ✅ {bulkResult.sent} &nbsp;❌ {bulkResult.failed} &nbsp;⏭ {bulkResult.skipped}
              {bulkResult.details.length > 0 && <button onClick={() => setShowDetails(s => !s)} style={{ marginLeft: 8, background: "none", border: "none", color: "#e8620a", cursor: "pointer", fontSize: "0.72rem", fontFamily: "inherit" }}>{showDetails ? "Hide" : "View"} details</button>}
            </span>
          )}
          {bulkResult && bulkResult.failed > 0 && (
            <button onClick={() => resendAllQR(true)} disabled={bulkSending}
              style={{ padding: "6px 12px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, color: "#f87171", cursor: "pointer", fontSize: "0.78rem", fontFamily: "inherit", fontWeight: 600 }}>
              🔁 Retry {bulkResult.failed} Failed
            </button>
          )}
          <button onClick={() => resendAllQR(false)} disabled={bulkSending}
            style={{ padding: "6px 14px", background: bulkSending ? "#1a1a1a" : "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.3)", borderRadius: 6, color: bulkSending ? "#444" : "#60a5fa", cursor: bulkSending ? "not-allowed" : "pointer", fontSize: "0.8rem", fontFamily: "inherit", fontWeight: 600 }}>
            {bulkSending ? "Sending (batches of 10)…" : "📧 Resend QR to All"}
          </button>
          <button onClick={exportCSV} style={{ padding: "6px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: "0.8rem", fontFamily: "inherit" }}>
            Export CSV
          </button>
        </div>
      </header>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Email send details panel */}
        {showDetails && bulkResult && bulkResult.details.length > 0 && (
          <div style={{ ...S.card, marginBottom: "1.5rem", borderColor: "rgba(96,165,250,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#fff" }}>Email Send Results</div>
              {bulkResult.failed > 0 && (
                <button onClick={exportFailedCSV} style={{ padding: "5px 12px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#aaa", cursor: "pointer", fontSize: "0.75rem", fontFamily: "inherit" }}>
                  ↓ Export Failed
                </button>
              )}
            </div>
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                    {["Email","Name","Status","Reason"].map(h => (
                      <th key={h} style={{ padding: "6px 12px", textAlign: "left", fontSize: "10px", color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bulkResult.details.map((d, i) => (
                    <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "5px 12px", color: "#aaa", fontFamily: "monospace" }}>{d.email}</td>
                      <td style={{ padding: "5px 12px", color: "#888" }}>{d.name}</td>
                      <td style={{ padding: "5px 12px" }}>
                        <span style={{ fontSize: "9px", fontWeight: 700, padding: "2px 7px", borderRadius: 999, color: d.status === "sent" ? "#4ade80" : d.status === "skipped" ? "#eab308" : "#f87171", background: d.status === "sent" ? "rgba(74,222,128,0.1)" : d.status === "skipped" ? "rgba(234,179,8,0.1)" : "rgba(239,68,68,0.1)" }}>
                          {d.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: "5px 12px", color: "#666", fontSize: "0.72rem" }}>{d.reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Summary cards */}
        {summary && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px,1fr))", gap: "0.875rem", marginBottom: "1.5rem" }}>
            {[
              { label: "Total",      value: summary.total,     color: "#fff"     },
              { label: "Paid",       value: summary.paid,      color: "#4ade80"  },
              { label: "Free",       value: summary.free,      color: "#60a5fa"  },
              { label: "Pending",    value: summary.pending,   color: "#eab308"  },
              { label: "Checked In", value: summary.checkedIn, color: "#a78bfa"  },
              { label: "Revenue",    value: `₹${summary.revenue.toLocaleString("en-IN")}`, color: "#e8620a" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ ...S.card, textAlign: "center" }}>
                <div style={{ fontSize: "1.4rem", fontWeight: 700, color }}>{value}</div>
                <div style={{ fontSize: "11px", color: "#666", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 4, marginBottom: "1.5rem", width: "fit-content" }}>
          {(["registrations", "communicate"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: "7px 18px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, background: tab === t ? "#e8620a" : "transparent", color: tab === t ? "#fff" : "#666", fontFamily: "inherit" }}>
              {t === "registrations" ? "Registrations" : "📧 Communicate"}
            </button>
          ))}
        </div>

        {/* ══ REGISTRATIONS TAB ══════════════════════════════════════════════ */}
        {tab === "registrations" && (
          <>
            {/* Check-In Scanner */}
            <div style={{ ...S.card, marginBottom: "1.5rem", borderColor: "rgba(74,222,128,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem", flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#fff" }}>🔍 Event Check-In Scanner</div>
                <button onClick={() => { setScanResult(null); setCameraOpen(true); }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "#e8620a", border: "none", borderRadius: 6, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "0.82rem", fontFamily: "inherit" }}>
                  📷 Open Camera
                </button>
              </div>
              <form onSubmit={e => { e.preventDefault(); runCheckIn(scanToken); }} style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <input value={scanToken} onChange={e => { setScanToken(e.target.value); setScanResult(null); }} placeholder="Or paste QR token manually…"
                  style={{ ...S.input, flex: "1 1 260px", fontFamily: "monospace", fontSize: "0.78rem" }} />
                <button type="submit" disabled={scanLoading || !scanToken.trim()}
                  style={{ padding: "9px 20px", background: "#4ade80", color: "#000", border: "none", borderRadius: 6, fontWeight: 700, cursor: scanLoading ? "not-allowed" : "pointer", fontSize: "0.85rem", fontFamily: "inherit", opacity: scanLoading ? 0.6 : 1 }}>
                  {scanLoading ? "Checking…" : "Validate & Check In"}
                </button>
              </form>
              {scanResult && (
                <div style={{ marginTop: "0.75rem", padding: "12px 16px", borderRadius: 8, background: scanResult.valid ? (scanResult.already_checked_in ? "rgba(234,179,8,0.1)" : "rgba(74,222,128,0.1)") : "rgba(239,68,68,0.1)", border: `1px solid ${scanResult.valid ? (scanResult.already_checked_in ? "rgba(234,179,8,0.3)" : "rgba(74,222,128,0.3)") : "rgba(239,68,68,0.3)"}` }}>
                  <div style={{ fontWeight: 700, color: scanResult.valid ? (scanResult.already_checked_in ? "#eab308" : "#4ade80") : "#f87171", marginBottom: 4 }}>{scanResult.message}</div>
                  {scanResult.registration && (
                    <div style={{ fontSize: "0.78rem", color: "#aaa" }}>{scanResult.registration.name}{scanResult.registration.category ? ` · ${scanResult.registration.category}` : ""} · <span style={{ fontFamily: "monospace" }}>{scanResult.registration.code}</span></div>
                  )}
                </div>
              )}
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, code…" style={{ ...S.input, flex: "1 1 240px" }} />
              <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", borderRadius: 7, padding: 3 }}>
                {(["all","paid","free","pending"] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    style={{ padding: "5px 14px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600, background: filter === f ? "#e8620a" : "transparent", color: filter === f ? "#fff" : "#888", fontFamily: "inherit" }}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                      {["Code","Participant","Category","Price","Payment","Status","QR","Check-In","Actions"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "10px", color: "#666", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={8} style={{ padding: "2rem", textAlign: "center", color: "#555" }}>Loading…</td></tr>
                    ) : filtered.length === 0 ? (
                      <tr><td colSpan={9} style={{ padding: "2rem", textAlign: "center", color: "#555" }}>No registrations found.</td></tr>
                    ) : filtered.map(r => (
                      <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={{ padding: "10px 14px" }}><span style={{ fontFamily: "monospace", color: "#e8620a", fontSize: "0.78rem" }}>{r.registration_code}</span></td>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ fontWeight: 600, color: "#fff" }}>{r.user_name}</div>
                          <div style={{ color: "#666", fontSize: "0.75rem" }}>{r.user_email}</div>
                          {r.phone && <div style={{ color: "#555", fontSize: "0.72rem" }}>{r.phone}</div>}
                        </td>
                        <td style={{ padding: "10px 14px", color: "#aaa" }}>{r.distance_category || "—"}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ color: "#fff" }}>₹{r.final_price}</div>
                          {r.coupon_discount > 0 && <div style={{ color: "#4ade80", fontSize: "0.72rem" }}>−₹{r.coupon_discount}</div>}
                        </td>
                        <td style={{ padding: "10px 14px" }}>{payBadge(r.payment_status)}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: 999, background: r.status === "confirmed" ? "rgba(74,222,128,0.1)" : "rgba(239,68,68,0.1)", color: r.status === "confirmed" ? "#4ade80" : "#f87171", fontWeight: 700 }}>
                            {r.status.replace("_", " ").toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                          {r.qr_token ? (
                            <a href={`/api/events/qr/${encodeURIComponent(r.qr_token)}`} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: "10px", fontWeight: 700, color: "#4ade80", textDecoration: "none" }} title="Preview QR">
                              ✓ QR
                            </a>
                          ) : (
                            <span style={{ fontSize: "10px", color: "#555" }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                          {r.checked_in_at ? (
                            <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: 999, background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.3)", color: "#4ade80", fontWeight: 700 }}>
                              ✓ {new Date(r.checked_in_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          ) : <span style={{ fontSize: "10px", color: "#555" }}>—</span>}
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {r.status === "confirmed" && (
                              <button onClick={() => resendQR(r.id, r.user_name)}
                                style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid rgba(96,165,250,0.3)", background: "transparent", color: "#60a5fa", cursor: "pointer", fontSize: "0.72rem", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                                📧 QR
                              </button>
                            )}
                            {r.status !== "cancelled" && (
                              <button onClick={() => cancel(r.id)}
                                style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid rgba(239,68,68,0.3)", background: "transparent", color: "#f09595", cursor: "pointer", fontSize: "0.75rem", fontFamily: "inherit" }}>
                                Cancel
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{ marginTop: "0.75rem", fontSize: "11px", color: "#555" }}>{filtered.length} of {regs.length} registrations</div>
          </>
        )}

        {/* ══ COMMUNICATE TAB ════════════════════════════════════════════════ */}
        {tab === "communicate" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

            {/* Compose */}
            <div style={S.card}>
              <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#fff", marginBottom: "1rem" }}>📧 Send Email to Registrants</div>

              {/* Templates */}
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ fontSize: "11px", color: "#555", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Quick Templates</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    { key: "schedule", label: "📋 Event Schedule" },
                    { key: "reminder", label: "⏰ Reminder" },
                    { key: "resend_qr", label: "🎫 Resend QR Info" },
                  ].map(t => (
                    <button key={t.key} onClick={() => applyTemplate(t.key)}
                      style={{ padding: "6px 14px", background: template === t.key ? "#e8620a" : "rgba(255,255,255,0.06)", border: "none", borderRadius: 6, color: template === t.key ? "#fff" : "#aaa", fontSize: "0.78rem", cursor: "pointer", fontFamily: "inherit" }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={sendCommunication} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Recipient filter */}
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#555", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Send To</label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(Object.keys(RECIPIENT_LABELS) as RecipientFilter[]).map(f => {
                      const counts: Record<RecipientFilter, number> = {
                        all:           summary?.total ?? 0,
                        paid:          summary?.paid ?? 0,
                        free:          summary?.free ?? 0,
                        pending:       summary?.pending ?? 0,
                        checked_in:    summary?.checkedIn ?? 0,
                        not_checked_in: (summary?.total ?? 0) - (summary?.checkedIn ?? 0),
                      };
                      return (
                        <button key={f} type="button" onClick={() => setRecipient(f)}
                          style={{ padding: "6px 14px", background: recipient === f ? "#e8620a" : "rgba(255,255,255,0.06)", border: `1px solid ${recipient === f ? "#e8620a" : "transparent"}`, borderRadius: 6, color: recipient === f ? "#fff" : "#aaa", fontSize: "0.78rem", cursor: "pointer", fontFamily: "inherit" }}>
                          {RECIPIENT_LABELS[f]} ({counts[f]})
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#555", marginBottom: 6 }}>Subject</label>
                  <input value={commSubject} onChange={e => setCommSubject(e.target.value)} required placeholder="Email subject…" style={S.input} />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#555", marginBottom: 6 }}>Message</label>
                  <textarea value={commBody} onChange={e => setCommBody(e.target.value)} required placeholder="Email body…"
                    style={{ ...S.input, minHeight: 160, resize: "vertical" } as React.CSSProperties} />
                </div>

                {sendResult && (
                  <div style={{ padding: "10px 14px", borderRadius: 8, background: sendResult.startsWith("✅") ? "rgba(74,222,128,0.1)" : "rgba(239,68,68,0.1)", color: sendResult.startsWith("✅") ? "#4ade80" : "#f87171", fontSize: "0.82rem" }}>
                    {sendResult}
                  </div>
                )}

                <button type="submit" disabled={sending || !commSubject.trim() || !commBody.trim()}
                  style={{ ...btnStyle(!sending && !!commSubject.trim() && !!commBody.trim()), alignSelf: "flex-start" }}>
                  {sending ? "Sending…" : `Send to ${RECIPIENT_LABELS[recipient]}`}
                </button>
              </form>
            </div>

            {/* Email history */}
            {history.length > 0 && (
              <div style={S.card}>
                <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#fff", marginBottom: "1rem" }}>📬 Email History</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {history.map(h => (
                    <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{h.subject}</div>
                        <div style={{ fontSize: 11, color: "#555" }}>{new Date(h.sent_at).toLocaleString("en-IN")}</div>
                      </div>
                      <div style={{ fontSize: 12, color: "#aaa" }}>{h.recipients} recipients</div>
                      <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: 999, background: h.status === "sent" ? "rgba(74,222,128,0.1)" : "rgba(239,68,68,0.1)", color: h.status === "sent" ? "#4ade80" : "#f87171", fontWeight: 700 }}>
                        {h.status.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {cameraOpen && (
        <QRScannerModal
          title="Scan Participant QR"
          onScan={raw => {
            setCameraOpen(false);
            let tok = raw;
            try { const u = new URL(raw); tok = u.searchParams.get("t") ?? raw; } catch { /* raw */ }
            runCheckIn(tok);
          }}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </div>
  );
}
