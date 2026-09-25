"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const ACCENT = "#e8620a";
const GREEN  = "#10b981";
const AMBER  = "#f59e0b";
const RED    = "#ef4444";

// ── Types ──────────────────────────────────────────────────────────────────────

type BibColl  = { id: string; collected_at: string };
type TshirtIs = { id: string; issued_at: string };
type Checkin  = { id: string; checked_in_at: string; volunteer_email: string | null };

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
  it_run_bib_collections:  BibColl[];
  it_run_tshirt_issuances: TshirtIs[];
  it_run_checkins:         Checkin[];
};

type CheckinLog = {
  id: string; checked_in_at: string; notes: string | null;
  it_run_participants: {
    id: string; first_name: string; last_name: string; bib_number: string | null;
    it_run_registrations: {
      registration_code: string;
      it_run_categories: { name: string; color: string } | null;
    };
  };
};

// ── Status pill ───────────────────────────────────────────────────────────────

function StatusPill({ done, label, detail }: { done: boolean; label: string; detail?: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "8px 14px", borderRadius: 10, minWidth: 90,
      background: done ? `${GREEN}12` : "rgba(255,255,255,0.03)",
      border: `1px solid ${done ? GREEN + "40" : "rgba(255,255,255,0.08)"}`,
    }}>
      <span style={{ fontSize: 16 }}>{done ? "✓" : "○"}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: done ? GREEN : "#555", marginTop: 4, textAlign: "center" }}>{label}</span>
      {detail && <span style={{ fontSize: 9, color: "#444", marginTop: 2, textAlign: "center", lineHeight: 1.3 }}>{detail}</span>}
    </div>
  );
}

// ── Scan tab ──────────────────────────────────────────────────────────────────

function ScanTab() {
  const inputRef  = useRef<HTMLInputElement>(null);
  const [input,   setInput]   = useState("");
  const [scanning, setScanning] = useState(false);
  const [checking, setChecking] = useState(false);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [scanErr, setScanErr]  = useState<string | null>(null);
  const [toast,   setToast]    = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function showToast(text: string, ok: boolean) {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 4000);
  }

  async function doScan(q: string) {
    if (!q.trim()) return;
    setScanning(true); setScanErr(null); setParticipant(null);
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

  async function doCheckin() {
    if (!participant) return;
    setChecking(true);
    const res  = await fetch("/api/it-run/checkin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId: participant.id }),
    });
    const data = await res.json();
    setChecking(false);

    if (res.ok) {
      showToast(`✓ ${participant.first_name} ${participant.last_name} checked in! BIB: ${participant.bib_number ?? "—"}`, true);
      setParticipant(p => p ? {
        ...p, it_run_checkins: [{ id: "new", checked_in_at: new Date().toISOString(), volunteer_email: null }],
      } : p);
    } else if (data.already) {
      showToast(`Already checked in — ${participant.first_name} ${participant.last_name}`, false);
      setParticipant(p => p ? {
        ...p, it_run_checkins: [{ id: "existing", checked_in_at: new Date().toISOString(), volunteer_email: null }],
      } : p);
    } else {
      showToast(data.error ?? "Check-in failed", false);
    }
  }

  const p           = participant;
  const bibDone     = (p?.it_run_bib_collections  ?? []).length > 0;
  const tshirtDone  = (p?.it_run_tshirt_issuances ?? []).length > 0;
  const checkinDone = (p?.it_run_checkins          ?? []).length > 0;
  const cat         = p?.it_run_registrations.it_run_categories;

  return (
    <div>
      {/* Scan input */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 6 }}>
          Scan participant QR or enter BIB number
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && doScan(input)}
            placeholder="Scan QR code or type BIB number…"
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
          <div style={{ marginTop: 8, fontSize: 13, color: "#f87171", fontWeight: 600 }}>✗ {scanErr}</div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          marginBottom: 14, padding: "12px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700,
          background: toast.ok ? `${GREEN}12` : "rgba(239,68,68,0.1)",
          border: `1px solid ${toast.ok ? GREEN + "40" : RED + "40"}`,
          color: toast.ok ? GREEN : "#f87171",
        }}>
          {toast.text}
        </div>
      )}

      {/* Participant card */}
      {p && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ height: 4, background: cat?.color ?? ACCENT }} />
          <div style={{ padding: "16px 18px" }}>
            {/* Name row */}
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 16 }}>
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
                </div>
              </div>
            </div>

            {/* Status pills */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              <StatusPill done={bibDone}    label="BIB Collected"
                detail={bibDone ? new Date(p.it_run_bib_collections[0].collected_at).toLocaleDateString("en-IN") : undefined} />
              <StatusPill done={tshirtDone} label="T-Shirt Issued"
                detail={tshirtDone ? new Date(p.it_run_tshirt_issuances[0].issued_at).toLocaleDateString("en-IN") : undefined} />
              <StatusPill done={checkinDone} label="Checked In"
                detail={checkinDone ? new Date(p.it_run_checkins[0].checked_in_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : undefined} />
            </div>

            {/* Warnings */}
            {!bibDone && (
              <div style={{ marginBottom: 12, fontSize: 12, color: AMBER, fontWeight: 600 }}>
                ⚠ BIB not yet collected — participant may not have received their BIB.
              </div>
            )}
            {!tshirtDone && (
              <div style={{ marginBottom: 12, fontSize: 12, color: "#555" }}>
                T-shirt not yet issued.
              </div>
            )}

            {/* Check-in button */}
            <button onClick={doCheckin} disabled={checking || checkinDone}
              style={{
                width: "100%", padding: "14px",
                background: checkinDone ? `${GREEN}12` : checking ? "rgba(16,185,129,0.3)" : GREEN,
                border: `1px solid ${GREEN}50`, borderRadius: 12,
                color: checkinDone ? GREEN : "#fff",
                fontWeight: 800, fontSize: 16, cursor: checkinDone ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}>
              {checkinDone
                ? `✓ Checked In at ${new Date(p.it_run_checkins[0]?.checked_in_at ?? "").toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
                : checking ? "Recording…" : "✓ Check In"}
            </button>
          </div>
        </div>
      )}

      {!p && !scanning && !scanErr && (
        <div style={{ color: "#333", fontSize: 13, textAlign: "center", padding: "32px 0" }}>
          Scan or enter a BIB number above to load participant
        </div>
      )}
    </div>
  );
}

// ── Log tab ────────────────────────────────────────────────────────────────────

function LogTab() {
  const [checkins, setCheckins] = useState<CheckinLog[]>([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [search,   setSearch]   = useState("");
  const [page,     setPage]     = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      const res    = await fetch(`/api/it-run/admin/checkins?${params}`);
      const d      = await res.json();
      setCheckins(d.data ?? []);
      setTotal(d.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const filtered = search.trim()
    ? checkins.filter(c => {
        const p = c.it_run_participants;
        const q = search.toLowerCase();
        return `${p.first_name} ${p.last_name}`.toLowerCase().includes(q)
          || (p.bib_number ?? "").includes(q)
          || p.it_run_registrations.registration_code.toLowerCase().includes(q);
      })
    : checkins;

  const INPUT: React.CSSProperties = { padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 13, color: "#888" }}>
          <span style={{ color: GREEN, fontWeight: 800, fontSize: 20 }}>{total}</span> checked in
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...INPUT, minWidth: 220 }} placeholder="Search name, BIB, reg code…"
            value={search} onChange={e => setSearch(e.target.value)} />
          <a href="/api/it-run/admin/reports?type=checkin" download
            style={{ padding: "9px 14px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, color: GREEN, fontSize: 13, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
            Export CSV
          </a>
        </div>
      </div>

      {loading ? <div style={{ color: "#888", padding: 40, textAlign: "center" }}>Loading…</div> : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.map(c => {
              const p   = c.it_run_participants;
              const cat = p.it_run_registrations?.it_run_categories;
              return (
                <div key={c.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    {p.bib_number && (
                      <div style={{ background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: 6, padding: "3px 8px", fontSize: 14, fontWeight: 900, color: ACCENT, flexShrink: 0 }}>
                        {p.bib_number}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{p.first_name} {p.last_name}</div>
                      <div style={{ fontSize: 11, color: cat?.color ?? "#888" }}>{cat?.name ?? "Unknown"}</div>
                    </div>
                    <div style={{ fontSize: 11, textAlign: "right", flexShrink: 0 }}>
                      <div style={{ color: GREEN, fontWeight: 700 }}>Checked In</div>
                      <div style={{ color: "#666" }}>{new Date(c.checked_in_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <div style={{ color: "#888", padding: 40, textAlign: "center" }}>No check-ins found</div>}
          </div>

          {total > 50 && (
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center" }}>
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                style={{ padding: "7px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#ccc", cursor: "pointer", fontFamily: "inherit" }}>Prev</button>
              <span style={{ padding: "7px 14px", fontSize: 13, color: "#888" }}>{page + 1} / {Math.ceil(total / 50)}</span>
              <button disabled={(page + 1) * 50 >= total} onClick={() => setPage(p => p + 1)}
                style={{ padding: "7px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#ccc", cursor: "pointer", fontFamily: "inherit" }}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function CheckinsPage() {
  const [tab, setTab] = useState<"scan" | "log">("scan");

  const TAB: React.CSSProperties = {
    padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit", border: "none",
  };

  return (
    <div style={{ maxWidth: 880 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <h1 style={{ fontSize: "clamp(18px,3vw,24px)", fontWeight: 800, color: "#fff", margin: 0 }}>
          Race-Day Check-In
        </h1>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={{ ...TAB, background: tab === "scan" ? `${GREEN}14` : "rgba(255,255,255,0.04)", color: tab === "scan" ? GREEN : "#888", outline: tab === "scan" ? `1px solid ${GREEN}40` : "1px solid rgba(255,255,255,0.08)" }}
            onClick={() => setTab("scan")}>
            Scan &amp; Check In
          </button>
          <button style={{ ...TAB, background: tab === "log" ? `${GREEN}14` : "rgba(255,255,255,0.04)", color: tab === "log" ? GREEN : "#888", outline: tab === "log" ? `1px solid ${GREEN}40` : "1px solid rgba(255,255,255,0.08)" }}
            onClick={() => setTab("log")}>
            Check-In Log
          </button>
        </div>
      </div>

      {tab === "scan" && <ScanTab />}
      {tab === "log"  && <LogTab />}
    </div>
  );
}
