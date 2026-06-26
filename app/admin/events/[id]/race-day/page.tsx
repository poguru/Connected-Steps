"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import QRScannerModal from "@/components/ui/QRScannerModal";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Summary {
  total:            number;
  checked_in:       number;
  not_checked_in:   number;
  breakfast_issued: number;
  bib_collected:    number;
  check_in_rate:    number;
}

interface RecentCheckin {
  registration_code: string;
  user_name:         string;
  distance_category: string | null;
  bib_number:        string | null;
  checked_in_at:     string;
  checked_in_by:     string | null;
}

interface PendingReg {
  registration_code: string;
  user_name:         string;
  user_email:        string;
  phone:             string | null;
  distance_category: string | null;
  bib_number:        string | null;
}

interface ByCategory {
  [cat: string]: { total: number; checked_in: number; breakfast: number };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const D = {
  page:   { minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "inherit" } as React.CSSProperties,
  header: { position: "sticky" as const, top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" } as React.CSSProperties,
  card:   { background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.25rem" } as React.CSSProperties,
  input:  { width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const } as React.CSSProperties,
  btn:    (p = true): React.CSSProperties => ({ padding: "9px 18px", background: p ? "#e8620a" : "rgba(255,255,255,0.06)", border: p ? "none" : "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: p ? "#fff" : "#aaa", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }),
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function StatCard({ label, value, sub, color = "#fff", big }: { label: string; value: string | number; sub?: string; color?: string; big?: boolean }) {
  return (
    <div style={D.card}>
      <div style={{ fontSize: big ? 40 : 28, fontWeight: 900, color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{sub}</div>}
      <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase" as const, letterSpacing: ".07em", marginTop: 6, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function RaceDayPage() {
  const params  = useParams();
  const eventId = params.id as string;

  const [tab,           setTab]           = useState<"dashboard"|"checkin"|"breakfast"|"pending">("dashboard");
  const [summary,       setSummary]       = useState<Summary | null>(null);
  const [recent,        setRecent]        = useState<RecentCheckin[]>([]);
  const [pending,       setPending]       = useState<PendingReg[]>([]);
  const [byCategory,    setByCategory]    = useState<ByCategory>({});
  const [lastRefresh,   setLastRefresh]   = useState<string>("");
  const [autoRefresh,   setAutoRefresh]   = useState(true);
  const [newCount,      setNewCount]      = useState(0);

  // Check-in scanner state
  const [scanToken,     setScanToken]     = useState("");
  const [scanResult,    setScanResult]    = useState<{ valid: boolean; already_checked_in: boolean; message: string; name?: string; bib?: string } | null>(null);
  const [scanning,      setScanning]      = useState(false);
  const [cameraOpen,    setCameraOpen]    = useState(false);
  const [lastSince,     setLastSince]     = useState<string>("");

  // Breakfast scanner state
  const [bfToken,       setBfToken]       = useState("");
  const [bfResult,      setBfResult]      = useState<{ valid: boolean; already_availed: boolean; message: string; name?: string } | null>(null);
  const [bfScanning,    setBfScanning]    = useState(false);
  const [bfCameraOpen,  setBfCameraOpen]  = useState(false);

  const scanInputRef = useRef<HTMLInputElement>(null);
  const bfInputRef   = useRef<HTMLInputElement>(null);
  const pollRef      = useRef<ReturnType<typeof setInterval>>(null);

  // ── Data loading ────────────────────────────────────────────────────────────

  const load = useCallback(async (since?: string) => {
    const url = `/api/admin/events/${eventId}/race-day` + (since ? `?since=${encodeURIComponent(since)}` : "");
    const res  = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();

    setSummary(data.summary);
    setRecent(data.recent_checkins ?? []);
    setPending(data.pending ?? []);
    setByCategory(data.by_category ?? {});
    setLastRefresh(data.as_of);

    if (since && data.new_since?.length > 0) {
      setNewCount(n => n + data.new_since.length);
    }
    if (data.as_of) setLastSince(data.as_of);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 12 seconds
  useEffect(() => {
    if (!autoRefresh) { if (pollRef.current) clearInterval(pollRef.current); return; }
    pollRef.current = setInterval(() => load(lastSince), 12000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [autoRefresh, lastSince, load]);

  // ── Check-in ────────────────────────────────────────────────────────────────

  async function handleCheckIn(token: string) {
    if (!token.trim()) return;
    setScanning(true); setScanResult(null);
    try {
      const res  = await fetch("/api/events/check-in", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token.trim() }) });
      const data = await res.json();
      const reg  = data.registration;

      setScanResult({
        valid:               res.ok || data.already_checked_in,
        already_checked_in:  data.already_checked_in ?? false,
        message:             data.already_checked_in
                               ? `⚠️ Already checked in — ${reg?.user_name ?? ""}`
                               : res.ok
                               ? `✅ Checked in — ${reg?.user_name ?? ""}`
                               : `❌ ${data.error ?? data.message ?? "Failed"}`,
        name:                reg?.user_name,
        bib:                 reg?.bib_number,
      });

      if (res.ok && !data.already_checked_in) await load(); // refresh stats
    } finally { setScanning(false); setScanToken(""); scanInputRef.current?.focus(); }
  }

  // ── Breakfast ───────────────────────────────────────────────────────────────

  async function handleBreakfast(token: string) {
    if (!token.trim()) return;
    setBfScanning(true); setBfResult(null);

    // We need event_id for the breakfast endpoint
    const res  = await fetch("/api/events/mark-breakfast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token.trim(), event_id: eventId }) });
    const data = await res.json();

    setBfResult({
      valid:          res.ok || data.already_availed,
      already_availed: data.already_availed ?? false,
      message:        data.already_availed
                        ? `⚠️ Already availed — ${data.user_name ?? ""}`
                        : res.ok
                        ? `✅ Breakfast issued — ${data.user_name ?? ""}`
                        : `❌ ${data.error ?? data.message ?? "Failed"}`,
      name: data.user_name,
    });

    if (res.ok && !data.already_availed) await load();
    setBfScanning(false); setBfToken(""); bfInputRef.current?.focus();
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const TABS = [
    { key: "dashboard", label: "Live Dashboard" },
    { key: "checkin",   label: "Check-In Scanner" },
    { key: "breakfast", label: "Breakfast Scanner" },
    { key: "pending",   label: `Pending (${pending.length})` },
  ];

  const checkInRate = summary?.check_in_rate ?? 0;

  return (
    <div style={D.page}>
      {/* Header */}
      <header style={D.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href={`/admin/events/${eventId}/manage`} style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>← Event Hub</Link>
          <span style={{ color: "#333" }}>/</span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>🏁 Race Day Operations</span>
          {newCount > 0 && (
            <span style={{ padding: "2px 10px", borderRadius: 999, background: "rgba(74,222,128,0.15)", color: "#4ade80", fontSize: 11, fontWeight: 700 }}>
              +{newCount} new
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {lastRefresh && <span style={{ fontSize: 11, color: "#555" }}>Updated {fmtTime(lastRefresh)}</span>}
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: "#555" }}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
            Auto-refresh
          </label>
          <button onClick={() => { setNewCount(0); load(); }} style={{ ...D.btn(false), padding: "6px 14px", fontSize: 12 }}>
            Refresh Now
          </button>
          <Link href={`/event-checkin`} target="_blank" style={{ ...D.btn(), padding: "6px 14px", fontSize: 12, textDecoration: "none" }}>
            Full Screen Check-In ↗
          </Link>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", background: "#0d0d0d" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex" }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key as typeof tab); setNewCount(0); }} style={{ padding: "12px 18px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: tab === t.key ? 700 : 400, color: tab === t.key ? "#fff" : "#555", borderBottom: tab === t.key ? "2px solid #e8620a" : "2px solid transparent", marginBottom: -1 }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem 2rem" }}>

        {/* ── Dashboard Tab ─────────────────────────────────────────────────── */}
        {tab === "dashboard" && (
          <div>
            {/* Primary stats */}
            {summary && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div style={{ ...D.card, background: "linear-gradient(135deg, #1a0900 0%, #111 100%)", border: "1px solid rgba(232,98,10,0.2)", display: "flex", alignItems: "center", gap: 20 }}>
                    <div>
                      <div style={{ fontSize: 52, fontWeight: 900, color: "#e8620a", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                        {summary.checked_in}
                        <span style={{ fontSize: 20, color: "#555" }}>/{summary.total}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#888", textTransform: "uppercase" as const, letterSpacing: ".07em", fontWeight: 700, marginTop: 6 }}>Checked In</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      {/* Progress bar */}
                      <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 999, height: 10, overflow: "hidden", marginBottom: 8 }}>
                        <div style={{ height: "100%", width: `${checkInRate}%`, background: "#e8620a", borderRadius: 999, transition: "width 0.5s ease" }} />
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 900, color: "#e8620a" }}>{checkInRate}%</div>
                      <div style={{ fontSize: 11, color: "#555" }}>check-in rate</div>
                    </div>
                  </div>

                  <StatCard label="Not Arrived"     value={summary.not_checked_in}   color={summary.not_checked_in > 0 ? "#fbbf24" : "#555"} />
                  <StatCard label="Breakfast"       value={summary.breakfast_issued}  color="#a3e635" />
                  <StatCard label="BIB Collected"   value={summary.bib_collected}     color="#60a5fa" />
                  <StatCard label="Total Confirmed" value={summary.total}             />
                </div>

                {/* Category breakdown */}
                {Object.keys(byCategory).length > 1 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 16 }}>
                    {Object.entries(byCategory).map(([cat, v]) => (
                      <div key={cat} style={{ ...D.card, padding: "0.875rem 1rem" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#e8620a", textTransform: "uppercase" as const, letterSpacing: ".06em", marginBottom: 8 }}>{cat}</div>
                        <div style={{ display: "flex", gap: 12, fontSize: 13 }}>
                          <div><span style={{ fontWeight: 700, color: "#4ade80" }}>{v.checked_in}</span><span style={{ color: "#555" }}>/{v.total} in</span></div>
                          <div><span style={{ fontWeight: 700, color: "#a3e635" }}>{v.breakfast}</span><span style={{ color: "#555" }}> 🥐</span></div>
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 999, height: 4, marginTop: 8 }}>
                          <div style={{ height: "100%", width: `${v.total > 0 ? Math.round((v.checked_in / v.total) * 100) : 0}%`, background: "#4ade80", borderRadius: 999 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Recent check-ins */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={D.card}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#e8620a", textTransform: "uppercase" as const, letterSpacing: ".07em", marginBottom: 12 }}>
                  Recent Check-Ins
                </div>
                {recent.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "2rem 0", color: "#555", fontSize: 13 }}>No check-ins yet</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {recent.slice(0, 12).map((r, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{r.user_name}</span>
                          {r.distance_category && <span style={{ color: "#555", fontSize: 11, marginLeft: 6 }}>{r.distance_category}</span>}
                          {r.bib_number && <span style={{ color: "#e8620a", fontSize: 11, marginLeft: 6, fontFamily: "monospace", fontWeight: 700 }}>#{r.bib_number}</span>}
                        </div>
                        <span style={{ fontSize: 11, color: "#555", whiteSpace: "nowrap" as const, marginLeft: 8 }}>{fmtTime(r.checked_in_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick actions */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ ...D.card, cursor: "pointer" }} onClick={() => setTab("checkin")}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>📷</div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Check-In Scanner</div>
                  <div style={{ fontSize: 12, color: "#555" }}>Scan QR to mark arrival</div>
                </div>
                <div style={{ ...D.card, cursor: "pointer" }} onClick={() => setTab("breakfast")}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>🥐</div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Breakfast Scanner</div>
                  <div style={{ fontSize: 12, color: "#555" }}>Issue breakfast / refreshments</div>
                </div>
                <Link href={`/admin/events/${eventId}/bib`} style={{ ...D.card, textDecoration: "none", cursor: "pointer" }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>📦</div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>BIB Collection</div>
                  <div style={{ fontSize: 12, color: "#555" }}>Scan QR to hand over BIB</div>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ── Check-In Scanner Tab ────────────────────────────────────────── */}
        {tab === "checkin" && (
          <div style={{ maxWidth: 540, margin: "0 auto" }}>
            <div style={{ ...D.card, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#e8620a", textTransform: "uppercase" as const, letterSpacing: ".07em", marginBottom: 14 }}>📷 Event Check-In</div>
              <p style={{ fontSize: 13, color: "#666", margin: "0 0 16px" }}>Scan participant QR code to mark them as arrived. Duplicate scans are safely ignored.</p>
              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <input
                  ref={scanInputRef}
                  style={{ ...D.input, flex: 1 }}
                  placeholder="Paste QR token or scan…"
                  value={scanToken}
                  onChange={e => setScanToken(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleCheckIn(scanToken)}
                  autoFocus
                />
                <button onClick={() => handleCheckIn(scanToken)} disabled={scanning || !scanToken.trim()} style={D.btn()}>
                  {scanning ? "…" : "Check In"}
                </button>
              </div>
              <button onClick={() => setCameraOpen(true)} style={{ ...D.btn(false), width: "100%" }}>📷 Open Camera</button>
            </div>

            {scanResult && (
              <div style={{ ...D.card, border: `1px solid ${scanResult.already_checked_in ? "rgba(251,191,36,0.3)" : scanResult.valid ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`, background: scanResult.already_checked_in ? "rgba(251,191,36,0.05)" : scanResult.valid ? "rgba(74,222,128,0.05)" : "rgba(248,113,113,0.05)" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: scanResult.already_checked_in ? "#fbbf24" : scanResult.valid ? "#4ade80" : "#f87171", marginBottom: 8 }}>
                  {scanResult.message}
                </div>
                {scanResult.bib && <div style={{ fontSize: 28, fontWeight: 900, color: "#e8620a", fontFamily: "monospace" }}>BIB #{scanResult.bib}</div>}
              </div>
            )}

            {cameraOpen && (
              <QRScannerModal
                onScan={token => { setCameraOpen(false); handleCheckIn(token); }}
                onClose={() => setCameraOpen(false)}
              />
            )}

            {/* Live mini-stats */}
            {summary && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
                <div style={{ ...D.card, textAlign: "center" }}>
                  <div style={{ fontSize: 32, fontWeight: 900, color: "#4ade80" }}>{summary.checked_in}</div>
                  <div style={{ fontSize: 11, color: "#555", fontWeight: 700, textTransform: "uppercase" as const }}>Checked In</div>
                </div>
                <div style={{ ...D.card, textAlign: "center" }}>
                  <div style={{ fontSize: 32, fontWeight: 900, color: "#fbbf24" }}>{summary.not_checked_in}</div>
                  <div style={{ fontSize: 11, color: "#555", fontWeight: 700, textTransform: "uppercase" as const }}>Pending</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Breakfast Scanner Tab ───────────────────────────────────────── */}
        {tab === "breakfast" && (
          <div style={{ maxWidth: 540, margin: "0 auto" }}>
            <div style={{ ...D.card, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#a3e635", textTransform: "uppercase" as const, letterSpacing: ".07em", marginBottom: 14 }}>🥐 Breakfast / Refreshments</div>
              <p style={{ fontSize: 13, color: "#666", margin: "0 0 16px" }}>Scan participant QR code to issue breakfast. Each participant can only receive one breakfast.</p>
              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <input
                  ref={bfInputRef}
                  style={{ ...D.input, flex: 1 }}
                  placeholder="Paste QR token or scan…"
                  value={bfToken}
                  onChange={e => setBfToken(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleBreakfast(bfToken)}
                  autoFocus={tab === "breakfast"}
                />
                <button onClick={() => handleBreakfast(bfToken)} disabled={bfScanning || !bfToken.trim()} style={{ ...D.btn(), background: "#16a34a" }}>
                  {bfScanning ? "…" : "Issue"}
                </button>
              </div>
              <button onClick={() => setBfCameraOpen(true)} style={{ ...D.btn(false), width: "100%" }}>📷 Open Camera</button>
            </div>

            {bfResult && (
              <div style={{ ...D.card, border: `1px solid ${bfResult.already_availed ? "rgba(251,191,36,0.3)" : bfResult.valid ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`, background: bfResult.already_availed ? "rgba(251,191,36,0.05)" : bfResult.valid ? "rgba(74,222,128,0.05)" : "rgba(248,113,113,0.05)" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: bfResult.already_availed ? "#fbbf24" : bfResult.valid ? "#4ade80" : "#f87171" }}>
                  {bfResult.message}
                </div>
              </div>
            )}

            {bfCameraOpen && (
              <QRScannerModal
                onScan={token => { setBfCameraOpen(false); handleBreakfast(token); }}
                onClose={() => setBfCameraOpen(false)}
              />
            )}

            {summary && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
                <div style={{ ...D.card, textAlign: "center" }}>
                  <div style={{ fontSize: 32, fontWeight: 900, color: "#a3e635" }}>{summary.breakfast_issued}</div>
                  <div style={{ fontSize: 11, color: "#555", fontWeight: 700, textTransform: "uppercase" as const }}>Issued</div>
                </div>
                <div style={{ ...D.card, textAlign: "center" }}>
                  <div style={{ fontSize: 32, fontWeight: 900, color: "#555" }}>{(summary.checked_in ?? 0) - (summary.breakfast_issued ?? 0)}</div>
                  <div style={{ fontSize: 11, color: "#555", fontWeight: 700, textTransform: "uppercase" as const }}>Checked In / No Breakfast</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Pending Tab ─────────────────────────────────────────────────── */}
        {tab === "pending" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: "#555" }}>
                {pending.length} registered participants not yet checked in
              </div>
              <button onClick={() => load()} style={{ ...D.btn(false), fontSize: 12, padding: "6px 14px" }}>Refresh</button>
            </div>

            {pending.length === 0 ? (
              <div style={{ ...D.card, textAlign: "center", padding: "4rem" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
                <div style={{ fontWeight: 700, fontSize: 18, color: "#4ade80" }}>Everyone is checked in!</div>
              </div>
            ) : (
              <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      {["Name", "Category", "BIB #", "Phone"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left" as const, fontSize: 10, color: "#555", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".07em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((r, i) => (
                      <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ fontWeight: 600 }}>{r.user_name}</div>
                          <div style={{ color: "#555", fontSize: 11 }}>{r.user_email}</div>
                        </td>
                        <td style={{ padding: "10px 14px", color: "#aaa" }}>{r.distance_category ?? "OPEN"}</td>
                        <td style={{ padding: "10px 14px" }}>
                          {r.bib_number ? <code style={{ color: "#e8620a", fontWeight: 700 }}>{r.bib_number}</code> : <span style={{ color: "#555" }}>—</span>}
                        </td>
                        <td style={{ padding: "10px 14px", color: "#666" }}>{r.phone ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
