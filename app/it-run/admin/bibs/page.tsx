"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const ACCENT = "#e8620a";
const GREEN  = "#10b981";
const AMBER  = "#f59e0b";
const RED    = "#ef4444";
const BLUE   = "#60a5fa";

// ── Types ──────────────────────────────────────────────────────────────────────

type BibColl  = { id: string; collected_at: string; volunteer_email: string | null };
type TshirtIs = { id: string; issued_at: string; is_override: boolean; volunteer_email: string | null };
type Checkin  = { id: string; checked_in_at: string };

type Participant = {
  id: string; first_name: string; last_name: string;
  participant_type: string; tshirt_size: string | null;
  bib_number: string | null; wave: string | null;
  mobile: string; email: string | null; verification_status: string;
  it_run_registrations: {
    id: string; registration_code: string; payment_status: string;
    registration_status: string;
    it_run_categories: { id: string; name: string; distance_km: number | null; color: string } | null;
  };
  it_run_bib_collections:   BibColl[];
  it_run_tshirt_issuances:  TshirtIs[];
  it_run_checkins:          Checkin[];
};

// ── Status chip ───────────────────────────────────────────────────────────────

function StatusPill({ done, label, detail }: { done: boolean; label: string; detail?: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "8px 14px", borderRadius: 10, minWidth: 90,
      background: done ? `${GREEN}12` : "rgba(255,255,255,0.03)",
      border: `1px solid ${done ? GREEN + "40" : "rgba(255,255,255,0.08)"}`,
    }}>
      <span style={{ fontSize: 16, lineHeight: 1 }}>{done ? "✓" : "○"}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: done ? GREEN : "#555", marginTop: 4, textAlign: "center" }}>{label}</span>
      {detail && <span style={{ fontSize: 9, color: "#444", marginTop: 2, textAlign: "center", lineHeight: 1.3 }}>{detail}</span>}
    </div>
  );
}

// ── Action button ─────────────────────────────────────────────────────────────

function ActionBtn({ label, color, disabled, loading, onClick }: {
  label: string; color: string; disabled?: boolean; loading?: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} disabled={disabled || loading}
      style={{
        flex: 1, padding: "13px 10px",
        background: (disabled || loading) ? "rgba(255,255,255,0.04)" : `${color}18`,
        border: `1px solid ${(disabled || loading) ? "rgba(255,255,255,0.08)" : color + "50"}`,
        borderRadius: 10, color: (disabled || loading) ? "#333" : color,
        fontWeight: 700, fontSize: 14, cursor: (disabled || loading) ? "not-allowed" : "pointer",
        fontFamily: "inherit", transition: "all 0.15s",
      }}>
      {loading ? "…" : label}
    </button>
  );
}

// ── Scan tab ──────────────────────────────────────────────────────────────────

function ScanTab() {
  const inputRef   = useRef<HTMLInputElement>(null);
  const [input,    setInput]    = useState("");
  const [counter,  setCounter]  = useState("");
  const [scanning, setScanning] = useState(false);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [scanErr,  setScanErr]  = useState<string | null>(null);

  const [bibLoading,    setBibLoading]    = useState(false);
  const [tshirtLoading, setTshirtLoading] = useState(false);
  const [confirmOverride, setConfirmOverride] = useState<{
    message: string; issued_at: string; issued_by: string | null;
  } | null>(null);

  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function showToast(text: string, ok: boolean) {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function doScan(q: string) {
    if (!q.trim()) return;
    setScanning(true); setScanErr(null); setParticipant(null); setConfirmOverride(null);
    const res  = await fetch(`/api/it-run/admin/scan?q=${encodeURIComponent(q.trim())}`);
    const data = await res.json();
    setScanning(false);
    if (res.ok) {
      setParticipant(data.participant);
      setInput("");
      inputRef.current?.focus();
    } else {
      setScanErr(data.error ?? "Not found");
      inputRef.current?.select();
    }
  }

  async function collectBib() {
    if (!participant) return;
    setBibLoading(true);
    const res  = await fetch("/api/it-run/admin/bib-collect", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId: participant.id, counter_name: counter }),
    });
    const data = await res.json();
    setBibLoading(false);
    if (res.ok) {
      showToast(`BIB collected for ${participant.first_name}`, true);
      setParticipant(p => p ? {
        ...p, it_run_bib_collections: [{ id: "new", collected_at: new Date().toISOString(), volunteer_email: null }],
      } : p);
    } else if (data.already_collected) {
      showToast("BIB already collected for this participant", false);
      refreshParticipant();
    } else {
      showToast(data.error ?? "Failed", false);
    }
  }

  async function issueTshirt(confirm = false) {
    if (!participant) return;
    setTshirtLoading(true);
    const res  = await fetch("/api/it-run/admin/tshirt-issue", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId: participant.id, counter_name: counter, confirm }),
    });
    const data = await res.json();
    setTshirtLoading(false);

    if (res.ok) {
      const msg = data.override ? `T-shirt re-issued (override) for ${participant.first_name}` : `T-shirt issued for ${participant.first_name}`;
      showToast(msg, true);
      setConfirmOverride(null);
      setParticipant(p => p ? {
        ...p, it_run_tshirt_issuances: [{
          id: "new", issued_at: new Date().toISOString(),
          is_override: data.override ?? false, volunteer_email: null,
        }],
      } : p);
    } else if (data.needsConfirm) {
      setConfirmOverride({
        message:   data.message,
        issued_at: data.issued_at,
        issued_by: data.issued_by,
      });
    } else {
      showToast(data.error ?? "Failed", false);
    }
  }

  async function refreshParticipant() {
    if (!participant) return;
    const res  = await fetch(`/api/it-run/admin/scan?q=${encodeURIComponent(participant.bib_number ?? participant.id)}`);
    const data = await res.json();
    if (res.ok) setParticipant(data.participant);
  }

  const p      = participant;
  const bibDone     = (p?.it_run_bib_collections  ?? []).length > 0;
  const tshirtDone  = (p?.it_run_tshirt_issuances ?? []).length > 0;
  const checkinDone = (p?.it_run_checkins          ?? []).length > 0;
  const cat    = p?.it_run_registrations.it_run_categories;

  return (
    <div>
      {/* Scan input */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 6 }}>
          Scan QR Code or enter BIB / Registration Code
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && doScan(input)}
            placeholder="Scan QR, type BIB number, or registration code…"
            style={{
              flex: 1, padding: "13px 16px",
              background: "rgba(255,255,255,0.05)",
              border: `1px solid ${scanErr ? RED + "50" : "rgba(255,255,255,0.12)"}`,
              borderRadius: 10, color: "#fff", fontSize: 16,
              fontFamily: "inherit", outline: "none",
            }}
          />
          <button onClick={() => doScan(input)} disabled={scanning || !input.trim()}
            style={{ padding: "13px 20px", background: ACCENT, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
            {scanning ? "…" : "Find"}
          </button>
        </div>
        {scanErr && (
          <div style={{ marginTop: 8, fontSize: 13, color: "#f87171", fontWeight: 600 }}>
            ✗ {scanErr}
          </div>
        )}
        {/* Counter */}
        <div style={{ marginTop: 10 }}>
          <input value={counter} onChange={e => setCounter(e.target.value)}
            placeholder="Counter name (optional: Counter A, Gate 2…)"
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#888", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          marginBottom: 14, padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700,
          background: toast.ok ? `${GREEN}12` : "rgba(239,68,68,0.1)",
          border: `1px solid ${toast.ok ? GREEN + "40" : RED + "40"}`,
          color: toast.ok ? GREEN : "#f87171",
        }}>
          {toast.ok ? "✓" : "✗"} {toast.text}
        </div>
      )}

      {/* Override confirmation */}
      {confirmOverride && (
        <div style={{ marginBottom: 16, padding: "14px 16px", borderRadius: 12, background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.35)" }}>
          <div style={{ fontSize: 13, color: AMBER, fontWeight: 700, marginBottom: 6 }}>⚠ T-shirt already issued</div>
          <div style={{ fontSize: 13, color: "#888", lineHeight: 1.5, marginBottom: 12 }}>{confirmOverride.message}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => issueTshirt(true)}
              style={{ padding: "8px 16px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8, color: RED, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Override (Admin Only)
            </button>
            <button onClick={() => setConfirmOverride(null)}
              style={{ padding: "8px 16px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#888", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Participant card */}
      {p && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, overflow: "hidden", marginBottom: 8 }}>
          {/* Category accent bar */}
          <div style={{ height: 4, background: cat?.color ?? ACCENT }} />

          <div style={{ padding: "16px 18px" }}>
            {/* Name + category + reg code */}
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 16 }}>
              {/* BIB */}
              {p.bib_number && (
                <div style={{ background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: 10, padding: "6px 14px", textAlign: "center", flexShrink: 0 }}>
                  <div style={{ fontSize: 9, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.1em" }}>BIB</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: ACCENT, lineHeight: 1 }}>{p.bib_number}</div>
                  {p.wave && <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>Wave {p.wave}</div>}
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 3 }}>{p.first_name} {p.last_name}</div>
                <div style={{ fontSize: 13, color: cat?.color ?? "#888", fontWeight: 600, marginBottom: 3 }}>
                  {cat?.name ?? "—"}{cat?.distance_km ? ` · ${cat.distance_km}km` : ""}
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "#666" }}>
                  <code style={{ color: ACCENT, fontSize: 11 }}>{p.it_run_registrations.registration_code}</code>
                  <span style={{ textTransform: "capitalize" }}>{p.participant_type}</span>
                  {p.tshirt_size && <span>T-Shirt: <strong style={{ color: "#ccc" }}>{p.tshirt_size}</strong></span>}
                  {p.mobile && <span>{p.mobile}</span>}
                </div>
              </div>
            </div>

            {/* Status pills */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              <StatusPill done={bibDone}    label="BIB Collected"
                detail={bibDone ? new Date(p.it_run_bib_collections[0].collected_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : undefined} />
              <StatusPill done={tshirtDone} label="T-Shirt Issued"
                detail={tshirtDone ? new Date(p.it_run_tshirt_issuances[0].issued_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : undefined} />
              <StatusPill done={checkinDone} label="Checked In"
                detail={checkinDone ? new Date(p.it_run_checkins[0].checked_in_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : undefined} />
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 10 }}>
              <ActionBtn
                label={bibDone ? "BIB Already Collected" : "Collect BIB"}
                color={GREEN} disabled={bibDone} loading={bibLoading}
                onClick={collectBib}
              />
              {p.tshirt_size && (
                <ActionBtn
                  label={tshirtDone ? `T-Shirt Issued (${p.tshirt_size})` : `Issue T-Shirt (${p.tshirt_size})`}
                  color={BLUE} disabled={false} loading={tshirtLoading}
                  onClick={() => issueTshirt(false)}
                />
              )}
            </div>

            {!p.bib_number && (
              <div style={{ marginTop: 12, fontSize: 12, color: AMBER, fontWeight: 600 }}>
                ⚠ BIB not yet assigned — allocate BIBs from the Allocation tab before collecting.
              </div>
            )}
          </div>
        </div>
      )}

      {!p && !scanning && !scanErr && (
        <div style={{ color: "#333", fontSize: 13, textAlign: "center", padding: "32px 0" }}>
          Scan or enter a code above to load participant details
        </div>
      )}
    </div>
  );
}

// ── Allocation tab (existing functionality) ────────────────────────────────────

type AllocParticipant = {
  id: string; first_name: string; last_name: string; email: string | null;
  mobile: string; bib_number: string | null; wave: string | null;
  tshirt_size: string | null; verification_status: string; participant_type: string;
  it_run_registrations: {
    registration_code: string; payment_status: string;
    it_run_categories: { name: string; distance_km: number; slug: string; color: string } | null;
  };
  it_run_bib_collections: Array<{ id: string; collected_at: string }>;
};

function AllocationTab() {
  const [data,       setData]       = useState<AllocParticipant[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [allocating, setAllocating] = useState(false);
  const [message,    setMessage]    = useState("");
  const [filter,     setFilter]     = useState("all");
  const [search,     setSearch]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/it-run/admin/bibs");
      const d   = await res.json();
      setData(d.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function allocateBibs() {
    setAllocating(true); setMessage("");
    try {
      const res = await fetch("/api/it-run/admin/bibs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await res.json();
      setMessage(d.message ?? `${d.allocated} BIBs allocated`);
      await load();
    } catch {
      setMessage("Allocation failed");
    } finally {
      setAllocating(false);
    }
  }

  const unallocatedCount = data.filter(p => !p.bib_number).length;
  const collectedCount   = data.filter(p => p.it_run_bib_collections.length > 0).length;
  const lc               = search.toLowerCase();

  const filtered = data
    .filter(p =>
      filter === "unallocated" ? !p.bib_number :
      filter === "collected"   ? p.it_run_bib_collections.length > 0 :
      true
    )
    .filter(p =>
      !lc ||
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(lc) ||
      (p.bib_number ?? "").includes(lc) ||
      p.it_run_registrations.registration_code.toLowerCase().includes(lc)
    );

  const INPUT: React.CSSProperties = { padding: "8px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" };
  const CARD: React.CSSProperties  = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 14 };

  return (
    <div>
      {/* Header actions */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, color: "#666" }}>
          {data.length} total · {unallocatedCount} unallocated · {collectedCount} collected
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/api/it-run/admin/reports?type=participants" download style={{ padding: "8px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#888", fontSize: 12, textDecoration: "none" }}>Export CSV</a>
          <button onClick={allocateBibs} disabled={allocating || unallocatedCount === 0}
            style={{ padding: "8px 14px", background: unallocatedCount === 0 ? "rgba(255,255,255,0.04)" : ACCENT, border: "none", borderRadius: 8, color: unallocatedCount === 0 ? "#444" : "#fff", fontSize: 13, fontWeight: 700, cursor: unallocatedCount === 0 ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {allocating ? "Allocating…" : `Auto-Allocate ${unallocatedCount} BIBs`}
          </button>
        </div>
      </div>

      {message && (
        <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8, color: GREEN, fontSize: 13 }}>
          {message}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, BIB, reg code…"
          style={{ ...INPUT, flex: 1, minWidth: 180 }} />
        {[
          { key: "all",         label: `All (${data.length})` },
          { key: "unallocated", label: `Unallocated (${unallocatedCount})` },
          { key: "collected",   label: `Collected (${collectedCount})` },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{ padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", background: filter === f.key ? "rgba(232,98,10,0.1)" : "rgba(255,255,255,0.03)", border: `1px solid ${filter === f.key ? ACCENT : "rgba(255,255,255,0.1)"}`, color: filter === f.key ? ACCENT : "#888" }}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? <div style={{ color: "#888", padding: 40, textAlign: "center" }}>Loading…</div> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 8 }}>
          {filtered.map(p => {
            const cat        = p.it_run_registrations?.it_run_categories;
            const isCollected = p.it_run_bib_collections.length > 0;
            return (
              <div key={p.id} style={CARD}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{p.first_name} {p.last_name}</div>
                    <div style={{ fontSize: 11, color: cat?.color ?? "#888" }}>{cat?.name ?? "—"}</div>
                  </div>
                  {p.bib_number ? (
                    <div style={{ background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: 7, padding: "3px 8px", textAlign: "center", flexShrink: 0 }}>
                      <div style={{ fontSize: 9, color: ACCENT, textTransform: "uppercase" }}>BIB</div>
                      <div style={{ fontSize: 17, fontWeight: 900, color: ACCENT }}>{p.bib_number}</div>
                      {p.wave && <div style={{ fontSize: 9, color: "#888" }}>Wave {p.wave}</div>}
                    </div>
                  ) : (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 7px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 6, color: AMBER }}>No BIB</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {p.tshirt_size && <span style={{ fontSize: 10, color: "#888", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, padding: "2px 6px" }}>T: {p.tshirt_size}</span>}
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 5, color: p.verification_status === "verified" ? GREEN : AMBER, background: `${p.verification_status === "verified" ? GREEN : AMBER}15` }}>
                    {p.verification_status}
                  </span>
                  {isCollected && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 5, color: GREEN, background: `${GREEN}12` }}>Collected</span>}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div style={{ gridColumn: "1/-1", color: "#666", textAlign: "center", padding: 40 }}>No participants match</div>}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function BibsPage() {
  const [tab, setTab] = useState<"scan" | "allocate">("scan");

  const TAB: React.CSSProperties = {
    padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit", border: "none",
  };

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <h1 style={{ fontSize: "clamp(18px,3vw,24px)", fontWeight: 800, color: "#fff", margin: 0 }}>
          BIB Collection
        </h1>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={{ ...TAB, background: tab === "scan" ? "rgba(232,98,10,0.12)" : "rgba(255,255,255,0.04)", color: tab === "scan" ? ACCENT : "#888", outline: tab === "scan" ? `1px solid ${ACCENT}40` : "1px solid rgba(255,255,255,0.08)" }}
            onClick={() => setTab("scan")}>
            Scan &amp; Collect
          </button>
          <button style={{ ...TAB, background: tab === "allocate" ? "rgba(232,98,10,0.12)" : "rgba(255,255,255,0.04)", color: tab === "allocate" ? ACCENT : "#888", outline: tab === "allocate" ? `1px solid ${ACCENT}40` : "1px solid rgba(255,255,255,0.08)" }}
            onClick={() => setTab("allocate")}>
            BIB Allocation
          </button>
        </div>
      </div>

      {tab === "scan"     && <ScanTab />}
      {tab === "allocate" && <AllocationTab />}
    </div>
  );
}
