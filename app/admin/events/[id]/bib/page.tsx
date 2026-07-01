"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import QRScannerModal from "@/components/ui/QRScannerModal";
import { Card, Button, Input, Alert, Badge, StatCard, Tabs, EmptyState, Spinner } from "@/components/ui/ds";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BibReg {
  id:                string;
  registration_code: string;
  user_name:         string;
  user_email:        string;
  phone:             string | null;
  distance_category: string | null;
  bib_number:        string | null;
  bib_collected_at:  string | null;
  bib_collected_by:  string | null;
}

interface Summary { total: number; assigned: number; collected: number; pending: number; unassigned: number; }
interface Center  { id: string; name: string; address: string | null; contact_name: string | null; contact_phone: string | null; maps_url: string | null; status: string; }

interface ScanResult {
  valid:             boolean;
  already_collected: boolean;
  message:           string;
  registration?:     BibReg;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const C = {
  page:   { minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "inherit" } as React.CSSProperties,
  header: { position: "sticky" as const, top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" } as React.CSSProperties,
  input:  { width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const } as React.CSSProperties,
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function BibManagePage() {
  const params    = useParams();
  const eventId   = params.id as string;

  const [tab,      setTab]      = useState<"overview"|"scanner"|"list"|"centers">("overview");
  const [summary,  setSummary]  = useState<Summary | null>(null);
  const [regs,     setRegs]     = useState<BibReg[]>([]);
  const [centers,  setCenters]  = useState<Center[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [previewAssign, setPreviewAssign] = useState<{ category: string; bib_number: string; user_name: string }[]>([]);

  // Scanner state
  const [scanToken,  setScanToken]  = useState("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanning,   setScanning]   = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Center form
  const [centerForm, setCenterForm] = useState({ name: "", address: "", contact_name: "", contact_phone: "", maps_url: "" });
  const [savingCenter, setSavingCenter] = useState(false);

  const [toast, setToast] = useState("");
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3000); };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/bib/status`);
      const data = await res.json();
      setSummary(data.summary);
      setRegs(data.registrations ?? []);
      setCenters(data.centers ?? []);
    } finally { setLoading(false); }
  }

  // ── BIB Assignment ─────────────────────────────────────────────────────────

  async function previewBibAssignment() {
    const res  = await fetch(`/api/admin/events/${eventId}/bib/assign`, { method: "GET" });
    const data = await res.json();
    setPreviewAssign(data.assignments ?? []);
  }

  async function assignBibs(force = false) {
    if (!confirm(force ? "Reassign all BIB numbers? Existing assignments will be overwritten." : "Assign BIB numbers to all unassigned confirmed registrations?")) return;
    setAssigning(true);
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/bib/assign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force }) });
      const data = await res.json();
      if (res.ok) { showToast(`✅ Assigned ${data.assigned} BIB numbers`); setPreviewAssign([]); await loadAll(); }
      else showToast(`❌ ${data.error ?? "Failed"}`);
    } finally { setAssigning(false); }
  }

  // ── BIB Scanner ────────────────────────────────────────────────────────────

  async function handleScan(token: string) {
    if (!token.trim()) return;
    setScanning(true); setScanResult(null);
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/bib/scan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token.trim() }) });
      const data = await res.json() as ScanResult;
      setScanResult(data);
      if (data.valid && !data.already_collected) {
        setRegs(prev => prev.map(r => r.id === data.registration?.id ? { ...r, bib_collected_at: data.registration?.bib_collected_at ?? null } : r));
        if (summary) setSummary({ ...summary, collected: summary.collected + 1, pending: Math.max(0, summary.pending - 1) });
      }
    } finally { setScanning(false); setScanToken(""); scanInputRef.current?.focus(); }
  }

  // ── Centers ────────────────────────────────────────────────────────────────

  async function addCenter(e: React.FormEvent) {
    e.preventDefault(); setSavingCenter(true);
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/collection-centers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(centerForm) });
      const data = await res.json();
      if (res.ok) { showToast("Collection center added"); setCenters(c => [...c, data.center]); setCenterForm({ name: "", address: "", contact_name: "", contact_phone: "", maps_url: "" }); }
      else showToast(data.error ?? "Failed");
    } finally { setSavingCenter(false); }
  }

  async function deleteCenter(id: string) {
    if (!confirm("Delete this collection center?")) return;
    await fetch(`/api/admin/events/${eventId}/collection-centers`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setCenters(c => c.filter(x => x.id !== id));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const TABS = [
    { key: "overview", label: "Overview" },
    { key: "scanner",  label: "BIB Scanner" },
    { key: "list",     label: `BIB List (${regs.length})` },
    { key: "centers",  label: "Collection Centers" },
  ];

  return (
    <div style={C.page}>
      <header style={C.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href={`/admin/events/${eventId}/manage`} style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>← Event Hub</Link>
          <span style={{ color: "#333" }}>/</span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>BIB Collection</span>
        </div>
        <Button size="sm" variant="ghost" onClick={loadAll}>↻ Refresh</Button>
      </header>

      {/* Tabs */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", background: "#0d0d0d" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Tabs tabs={TABS.map(t => ({ key: t.key, label: t.label }))} active={tab} onChange={k => setTab(k as typeof tab)} />
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "1.75rem 2rem" }}>

        {/* Overview Tab */}
        {tab === "overview" && (
          <div>
            {summary && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
                <StatCard label="Total"     value={summary.total}      />
                <StatCard label="Assigned"  value={summary.assigned}   color="#60a5fa" />
                <StatCard label="Collected" value={summary.collected}  color="#4ade80" />
                <StatCard label="Pending"   value={summary.pending}    color="#fbbf24" />
                <StatCard label="Unassigned" value={summary.unassigned} color={summary.unassigned > 0 ? "#f87171" : "#555"} />
              </div>
            )}

            {/* BIB Assignment */}
            <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.25rem", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#e8620a", textTransform: "uppercase" as const, letterSpacing: ".07em", marginBottom: 14 }}>BIB Number Assignment</div>
              <p style={{ fontSize: 13, color: "#666", margin: "0 0 16px" }}>
                Automatically assigns sequential BIB numbers to all confirmed, paid registrations grouped by race category.
                Numbers use the prefix defined in each race configuration (e.g. "5K-001").
              </p>

              {previewAssign.length > 0 && (
                <div style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "12px 16px", marginBottom: 16, maxHeight: 200, overflowY: "auto" as const }}>
                  <div style={{ fontSize: 11, color: "#555", marginBottom: 8, fontWeight: 700, textTransform: "uppercase" as const }}>Preview ({previewAssign.length} assignments)</div>
                  {previewAssign.slice(0, 20).map((a, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 12 }}>
                      <span style={{ color: "#ccc" }}>{a.user_name}</span>
                      <span style={{ color: "#e8620a", fontWeight: 700, fontFamily: "monospace" }}>{a.bib_number}</span>
                    </div>
                  ))}
                  {previewAssign.length > 20 && <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>+{previewAssign.length - 20} more…</div>}
                </div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <Button variant="secondary" onClick={previewBibAssignment}>Preview</Button>
                <Button loading={assigning} onClick={() => assignBibs(false)}>Assign BIBs</Button>
                <Button variant="danger" loading={assigning} onClick={() => assignBibs(true)}>Force Reassign All</Button>
              </div>
            </div>

            {/* Quick go to scanner */}
            <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "2rem", textAlign: "center", cursor: "pointer" }} onClick={() => setTab("scanner")}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📦</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Open BIB Scanner</div>
              <div style={{ fontSize: 13, color: "#555" }}>Scan participant QR codes to hand over BIB packets</div>
            </div>
          </div>
        )}

        {/* BIB Scanner Tab */}
        {tab === "scanner" && (
          <div style={{ maxWidth: 560, margin: "0 auto" }}>
            <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.25rem", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#e8620a", textTransform: "uppercase" as const, letterSpacing: ".07em", marginBottom: 14 }}>📦 BIB Collection Scanner</div>
              <p style={{ fontSize: 13, color: "#666", margin: "0 0 16px" }}>Scan or paste the participant&apos;s QR token. Duplicates are automatically prevented.</p>

              <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                <input
                  ref={scanInputRef}
                  style={{ ...C.input, flex: 1 }}
                  placeholder="Paste QR token or scan…"
                  value={scanToken}
                  onChange={e => setScanToken(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleScan(scanToken)}
                  autoFocus
                />
                <Button loading={scanning} disabled={!scanToken.trim()} onClick={() => handleScan(scanToken)}>Collect BIB</Button>
              </div>
              <Button variant="secondary" fullWidth onClick={() => setCameraOpen(true)}>📷 Open Camera</Button>
            </div>

            {/* Scan Result */}
            {scanResult && (
              <div style={{ borderRadius: 12, padding: "1.25rem", border: `1px solid ${scanResult.already_collected ? "rgba(251,191,36,0.3)" : scanResult.valid ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`, background: scanResult.already_collected ? "rgba(251,191,36,0.05)" : scanResult.valid ? "rgba(74,222,128,0.05)" : "rgba(248,113,113,0.05)" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: scanResult.already_collected ? "#fbbf24" : scanResult.valid ? "#4ade80" : "#f87171", marginBottom: 8 }}>
                  {scanResult.message}
                </div>
                {scanResult.registration && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{scanResult.registration.user_name}</div>
                    <div style={{ color: "#666", fontSize: 13 }}>{scanResult.registration.user_email}</div>
                    {scanResult.registration.distance_category && (
                      <div style={{ color: "#888", fontSize: 13 }}>Category: {scanResult.registration.distance_category}</div>
                    )}
                    {scanResult.registration.bib_number && (
                      <div style={{ fontSize: 24, fontWeight: 900, color: "#e8620a", marginTop: 8, fontFamily: "monospace" }}>
                        BIB #{scanResult.registration.bib_number}
                      </div>
                    )}
                    {scanResult.registration.phone && <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>{scanResult.registration.phone}</div>}
                  </div>
                )}
              </div>
            )}

            {cameraOpen && (
              <QRScannerModal
                onScan={token => { setCameraOpen(false); handleScan(token); }}
                onClose={() => setCameraOpen(false)}
              />
            )}
          </div>
        )}

        {/* BIB List Tab */}
        {tab === "list" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: "#555" }}>{regs.filter(r => r.bib_collected_at).length} of {regs.filter(r => r.bib_number).length} BIBs collected</div>
              <a href={`/api/admin/events/${eventId}/registrations/export`} download style={{ textDecoration: "none" }}>
                <Button size="sm" variant="secondary">Export CSV</Button>
              </a>
            </div>

            {loading ? (
              <div style={{ textAlign: "center", padding: "3rem" }}><Spinner /></div>
            ) : (
              <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      {["BIB #", "Name", "Category", "Status", "Collected At"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left" as const, fontSize: 10, color: "#555", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".07em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {regs.filter(r => r.bib_number).length === 0 ? (
                      <tr><td colSpan={5} style={{ padding: "3rem", textAlign: "center", color: "#555" }}>No BIB numbers assigned yet.</td></tr>
                    ) : regs.filter(r => r.bib_number).map(r => (
                      <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "10px 14px" }}>
                          <code style={{ color: "#e8620a", fontWeight: 700, fontSize: 14 }}>{r.bib_number}</code>
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ fontWeight: 600 }}>{r.user_name}</div>
                          <div style={{ color: "#555", fontSize: 11 }}>{r.user_email}</div>
                        </td>
                        <td style={{ padding: "10px 14px", color: "#aaa" }}>{r.distance_category ?? "OPEN"}</td>
                        <td style={{ padding: "10px 14px" }}>
                          {r.bib_collected_at
                            ? <Badge color="green" size="sm">COLLECTED</Badge>
                            : <Badge color="yellow" size="sm">PENDING</Badge>}
                        </td>
                        <td style={{ padding: "10px 14px", color: "#666", fontSize: 12 }}>
                          {r.bib_collected_at ? new Date(r.bib_collected_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Collection Centers Tab */}
        {tab === "centers" && (
          <div>
            {/* Existing centers */}
            {centers.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                {centers.map(c => (
                  <div key={c.id} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                      {c.address && <div style={{ color: "#666", fontSize: 13 }}>📍 {c.address}</div>}
                      {c.contact_name && <div style={{ color: "#666", fontSize: 12 }}>👤 {c.contact_name} {c.contact_phone && `· ${c.contact_phone}`}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {c.maps_url && <a href={c.maps_url} target="_blank" rel="noopener" style={{ textDecoration: "none" }}><Button size="xs" variant="ghost">Maps ↗</Button></a>}
                      <Button size="xs" variant="danger" onClick={() => deleteCenter(c.id)}>Delete</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add center form */}
            <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.25rem" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#e8620a", textTransform: "uppercase" as const, letterSpacing: ".07em", marginBottom: 14 }}>+ Add Collection Center</div>
              <form onSubmit={addCenter}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase" as const, marginBottom: 6 }}>Center Name *</label>
                    <input required style={C.input} value={centerForm.name} onChange={e => setCenterForm(f => ({ ...f, name: e.target.value }))} placeholder="Main Collection Point" />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase" as const, marginBottom: 6 }}>Address</label>
                    <input style={C.input} value={centerForm.address} onChange={e => setCenterForm(f => ({ ...f, address: e.target.value }))} placeholder="Venue / Hall" />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase" as const, marginBottom: 6 }}>Contact Name</label>
                    <input style={C.input} value={centerForm.contact_name} onChange={e => setCenterForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Volunteer name" />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase" as const, marginBottom: 6 }}>Contact Phone</label>
                    <input style={C.input} value={centerForm.contact_phone} onChange={e => setCenterForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="+91 XXXXX XXXXX" />
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase" as const, marginBottom: 6 }}>Google Maps URL</label>
                  <input style={C.input} value={centerForm.maps_url} onChange={e => setCenterForm(f => ({ ...f, maps_url: e.target.value }))} placeholder="https://maps.google.com/…" />
                </div>
                <Button type="submit" loading={savingCenter}>Add Center</Button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 24, padding: "10px 20px", fontSize: 13, fontWeight: 600, color: "#fff", zIndex: 9999, whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
