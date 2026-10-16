"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

// The camera code runs only in the browser, and only when a volunteer opens the scanner
const BibQrScanner = dynamic(() => import("@/components/BibQrScanner"), { ssr: false });

interface ParticipantResult {
  id: string; first_name: string; last_name: string;
  mobile: string; tshirt_size: string | null;
  bib_number: string | null; wave: string | null;
  verification_status: string; participant_type: string;
  company_name: string | null;
  verification_outcome: string | null; verification_version: number; cancelled_at: string | null;
  readiness?: { state: string; message: string };
  it_run_registrations: {
    registration_code: string; payment_status: string;
    it_run_categories: { name: string; distance_km: number; color?: string } | null;
    it_run_events: { title: string } | null;
  };
  it_run_bib_collections: Array<{ id: string; collected_at: string; volunteer_email?: string }>;
}

const ACCENT = "#e8620a";

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: `${color}15`, border: `1px solid ${color}30`, color }}>
      {children}
    </span>
  );
}

export default function BibCollectionPage() {
  const router = useRouter();
  const [query,      setQuery]      = useState("");
  const [result,     setResult]     = useState<ParticipantResult | null>(null);
  const [searching,  setSearching]  = useState(false);
  const [issuing,    setIssuing]    = useState(false);
  const [message,    setMessage]    = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [counters, setCounters] = useState<Array<{ id: string; label: string }>>([]);
  const [counterId, setCounterId] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // The counters a volunteer may choose: the server returns only the enabled ones for collection staff
  useEffect(() => {
    fetch("/api/it-run/admin/bib-counters")
      .then(r => r.json())
      .then(d => setCounters((d as { counters?: Array<{ id: string; label: string }> }).counters ?? []))
      .catch(() => setCounters([]));
  }, []);

  async function search(e?: React.FormEvent, override?: string) {
    e?.preventDefault();
    const value = (override ?? query).trim();
    if (!value) return;
    setSearching(true);
    setResult(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/it-run/bib-collection?q=${encodeURIComponent(value)}`);
      const d   = await res.json();
      if (!res.ok) {
        setMessage({ text: d.error ?? "Search failed. Try again.", type: "error" });
        return;
      }
      const results: ParticipantResult[] = d.results ?? (d.participant ? [d.participant] : []);
      if (results.length === 0) {
        setMessage({ text: "Participant not found. Check QR token, reg code, mobile, or email.", type: "error" });
        return;
      }
      setResult(results[0]);
    } catch {
      setMessage({ text: "Network error. Try again.", type: "error" });
    } finally {
      setSearching(false);
    }
  }

  async function issueBib() {
    if (!result) return;
    setIssuing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/it-run/bib-collection", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ participantId: result.id, counterId: counterId || undefined }),
      });
      const d = await res.json();
      if (res.status === 409 || d.already) {
        setMessage({ text: "BIB already collected for this participant.", type: "info" });
        return;
      }
      if (!res.ok) { setMessage({ text: d.error ?? "Failed to issue BIB.", type: "error" }); return; }
      setMessage({ text: `BIB issued successfully! ${result.first_name} ${result.last_name} - BIB #${result.bib_number ?? "to be assigned"}`, type: "success" });
      setResult(null);
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 100);
    } finally {
      setIssuing(false);
    }
  }

  // Records Company ID Verified at the desk, after the physical check
  async function deskVerify() {
    if (!result) return;
    setIssuing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/it-run/bib-desk/verify-company", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: result.id, expectedVersion: result.verification_version }),
      });
      const d = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { setMessage({ text: d.error ?? "Could not record the verification", type: "error" }); return; }
      setMessage({ text: "Company ID verified. Checking the BIB status again…", type: "success" });
      await search(undefined, result.it_run_registrations.registration_code);
    } finally {
      setIssuing(false);
    }
  }

  // The runner cannot be verified and chooses to go without a BIB. Their category is cancelled and 50% is refunded.
  async function noBibCancel() {
    if (!result) return;
    const reason = window.prompt("Reason for going without a BIB (kept on the audit trail, at least 10 characters):")?.trim() ?? "";
    if (reason.length < 10) { setMessage({ text: "A reason of at least 10 characters is required.", type: "error" }); return; }
    if (!window.confirm("Cancel this runner's category? A 50% refund of their paid share will be requested. This cannot be undone here.")) return;
    setIssuing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/it-run/admin/bib-desk/no-bib-cancel", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: result.id, reason }),
      });
      const d = await res.json().catch(() => ({})) as { error?: string; refundPaise?: number };
      if (!res.ok) { setMessage({ text: d.error ?? "Could not cancel", type: "error" }); return; }
      setMessage({ text: "Category cancelled. 50% refund requested: Rs. " + ((d.refundPaise ?? 0) / 100).toLocaleString("en-IN") + ". The refund is approved on the refund page.", type: "success" });
      setResult(null);
      setQuery("");
    } finally {
      setIssuing(false);
    }
  }

  async function logout() {
    await fetch("/api/it-run/portal/auth", { method: "DELETE" });
    router.push("/it-run/bib/login");
  }

  function reset() {
    setResult(null);
    setQuery("");
    setMessage(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const vColor = result ? (
    result.verification_status === "verified" ? "#10b981" :
    result.verification_status === "rejected" ? "#ef4444" :
    result.verification_status === "not_provided" ? "#888" : "#f59e0b"
  ) : "#888";

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#fff", fontFamily: "'Inter',system-ui,sans-serif", padding: "0 0 40px" }}>
      {/* Header */}
      <header style={{ background: "#0d0d0d", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 20px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>BIB Collection</span>
          <span style={{ fontSize: 11, color: ACCENT, marginLeft: 8 }}>IT Run Sprint-2</span>
        </div>
        <button onClick={logout} style={{ padding: "5px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#888", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          Sign Out
        </button>
      </header>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "clamp(1rem,4vw,2rem) 16px" }}>
        {scannerOpen && (
          <BibQrScanner
            onClose={() => setScannerOpen(false)}
            onDetected={text => {
              setScannerOpen(false);
              setQuery("");
              void search(undefined, text);
            }}
          />
        )}

        {/* Search */}
        <div style={{ marginBottom: 20 }}>
          <form onSubmit={search}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                ref={inputRef}
                value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Enter reg code / mobile / email, or scan QR"
                style={{ flex: 1, padding: "12px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none" }}
              />
              <button type="button" onClick={() => setScannerOpen(true)} aria-label="Scan participant QR code"
                style={{ padding: "12px 14px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", minHeight: 44 }}>
                Scan QR
              </button>
              <button type="submit" disabled={searching || !query.trim()}
                style={{ padding: "12px 18px", background: ACCENT, border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                {searching ? "..." : "Search"}
              </button>
            </div>
          </form>
        </div>

        {/* Status message */}
        {message && (
          <div style={{
            padding: "14px 16px", marginBottom: 20, borderRadius: 12, fontSize: 14, fontWeight: 600,
            background: message.type === "success" ? "rgba(16,185,129,0.08)" : message.type === "error" ? "rgba(239,68,68,0.08)" : "rgba(99,102,241,0.08)",
            border:     `1px solid ${message.type === "success" ? "rgba(16,185,129,0.3)" : message.type === "error" ? "rgba(239,68,68,0.3)" : "rgba(99,102,241,0.3)"}`,
            color:      message.type === "success" ? "#10b981" : message.type === "error" ? "#f87171" : "#818cf8",
          }}>
            {message.text}
            {message.type === "success" && (
              <div style={{ marginTop: 10 }}>
                <button onClick={reset} style={{ padding: "7px 14px", background: ACCENT, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  Next Participant
                </button>
              </div>
            )}
          </div>
        )}

        {/* Participant card */}
        {result && (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, overflow: "hidden" }}>
            {/* Top accent bar */}
            <div style={{ height: 4, background: result.it_run_registrations?.it_run_categories?.color ?? ACCENT }} />

            <div style={{ padding: 24 }}>
              {/* Name and category */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>
                    {result.first_name} {result.last_name}
                  </div>
                  <div style={{ fontSize: 14, color: result.it_run_registrations?.it_run_categories?.color ?? ACCENT, fontWeight: 600, marginTop: 2 }}>
                    {result.it_run_registrations?.it_run_categories?.name ?? "Unknown Category"}
                  </div>
                </div>
                {result.bib_number && (
                  <div style={{ background: "rgba(232,98,10,0.1)", border: "2px solid rgba(232,98,10,0.4)", borderRadius: 12, padding: "8px 16px", textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.1em" }}>BIB Number</div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: ACCENT, lineHeight: 1 }}>{result.bib_number}</div>
                    {result.wave && <div style={{ fontSize: 11, color: "#888" }}>Wave {result.wave}</div>}
                  </div>
                )}
              </div>

              {/* Details grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "10px 20px", marginBottom: 20 }}>
                {[
                  ["Reg Code",    result.it_run_registrations?.registration_code ?? "-"],
                  ["Mobile",      result.mobile],
                  ["T-Shirt",     result.tshirt_size ?? "-"],
                  ["Company",     result.company_name ?? "-"],
                ].map(([l, v]) => (
                  <div key={l as string}>
                    <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.07em" }}>{l}</div>
                    <div style={{ fontSize: 14, color: "#ccc", fontWeight: 600 }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Badges */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
                <Badge color={vColor}>
                  {result.verification_status === "verified" ? "ID Verified" :
                   result.verification_status === "not_provided" ? "ID Not Provided" :
                   result.verification_status === "rejected" ? "ID Rejected" : "Pending Verification"}
                </Badge>
                <Badge color={result.it_run_registrations?.payment_status === "paid" ? "#10b981" : "#f59e0b"}>
                  {result.it_run_registrations?.payment_status === "paid" ? "Paid" : result.it_run_registrations?.payment_status ?? "Unknown"}
                </Badge>
                {result.it_run_bib_collections.length > 0 && (
                  <Badge color="#6366f1">BIB Already Collected</Badge>
                )}
              </div>

              {/* Readiness: the server decides, the screen only shows it */}
              {result.readiness && result.readiness.state === "ready" && (
                <div role="status" style={{ padding: "16px 18px", marginBottom: 16, borderRadius: 12, background: "rgba(16,185,129,0.1)", border: "2px solid rgba(16,185,129,0.5)" }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "#10b981", marginBottom: 4 }}>✓ Company ID Verified: ready</div>
                  <div style={{ fontSize: 13, color: "#a7f3d0", lineHeight: 1.5 }}>
                    BIB {result.bib_number} · {result.tshirt_size ?? "no T-shirt size"} · {result.it_run_registrations?.it_run_categories?.name ?? ""}
                  </div>
                  <div style={{ fontSize: 13, color: "#a7f3d0", marginTop: 6 }}>{result.readiness.message}</div>
                  {counters.length > 0 && (
                    <label style={{ display: "block", marginTop: 12, fontSize: 12, color: "#a7f3d0" }}>
                      Counter
                      <select value={counterId} onChange={e => setCounterId(e.target.value)}
                        style={{ display: "block", width: "100%", marginTop: 4, padding: "10px 12px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, color: "#fff", fontSize: 14, fontFamily: "inherit" }}>
                        <option value="">Choose a counter</option>
                        {counters.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              )}
              {result.readiness && result.readiness.state === "needs_desk_verification" && (
                <div role="alert" style={{ padding: "16px 18px", marginBottom: 16, borderRadius: 12, background: "rgba(245,158,11,0.08)", border: "2px solid rgba(245,158,11,0.5)" }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "#fbbf24", marginBottom: 4 }}>Manual ID verification needed</div>
                  <div style={{ fontSize: 13, color: "#fde68a", lineHeight: 1.5 }}>{result.readiness.message}</div>
                  <div style={{ fontSize: 12, color: "#a16207", marginTop: 6 }}>
                    A government ID alone does not prove employment. Only record Company ID Verified after the company ID itself is checked.
                  </div>
                </div>
              )}
              {result.readiness && result.readiness.state !== "ready" && result.readiness.state !== "needs_desk_verification" && (
                <div role="status" style={{ padding: "14px 16px", marginBottom: 16, borderRadius: 12, background: "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.3)", fontSize: 13, color: "#cbd5e1", lineHeight: 1.5 }}>
                  {result.readiness.message}
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {result.readiness?.state === "ready" && (
                  <button onClick={issueBib} disabled={issuing}
                    style={{ padding: "12px 24px", background: issuing ? "rgba(255,255,255,0.1)" : "#10b981", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: issuing ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                    {issuing ? "Issuing..." : "Issue BIB"}
                  </button>
                )}
                {result.it_run_bib_collections.length > 0 && (
                  <button disabled
                    style={{ padding: "12px 24px", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 10, color: "#818cf8", fontSize: 14, fontWeight: 700, cursor: "not-allowed", fontFamily: "inherit" }}>
                    Already Collected
                  </button>
                )}
                {result.readiness?.state === "needs_desk_verification" && (
                  <>
                    <button onClick={deskVerify} disabled={issuing}
                      style={{ padding: "12px 20px", background: issuing ? "rgba(255,255,255,0.1)" : "#10b981", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: issuing ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                      Company ID checked: record Company ID Verified
                    </button>
                    <button onClick={noBibCancel} disabled={issuing}
                      style={{ padding: "12px 20px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 10, color: "#f87171", fontSize: 14, fontWeight: 700, cursor: issuing ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                      Cannot verify: go without BIB (50% refund)
                    </button>
                  </>
                )}
                <button onClick={reset}
                  style={{ padding: "12px 24px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#888", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
