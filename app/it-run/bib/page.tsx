"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface ParticipantResult {
  id: string; first_name: string; last_name: string;
  mobile: string; tshirt_size: string | null;
  bib_number: string | null; wave: string | null;
  verification_status: string; participant_type: string;
  company_name: string | null;
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setResult(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/it-run/bib-collection?q=${encodeURIComponent(query.trim())}`);
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
        body:    JSON.stringify({ participantId: result.id }),
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
    result.verification_status === "rejected" ? "#ef4444" : "#f59e0b"
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
        {/* Search */}
        <div style={{ marginBottom: 20 }}>
          <form onSubmit={search}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                ref={inputRef}
                value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Scan QR / enter reg code / mobile / email..."
                style={{ flex: 1, padding: "12px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none" }}
              />
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
                   result.verification_status === "rejected" ? "ID Rejected" : "Pending Verification"}
                </Badge>
                <Badge color={result.it_run_registrations?.payment_status === "paid" ? "#10b981" : "#f59e0b"}>
                  {result.it_run_registrations?.payment_status === "paid" ? "Paid" : result.it_run_registrations?.payment_status ?? "Unknown"}
                </Badge>
                {result.it_run_bib_collections.length > 0 && (
                  <Badge color="#6366f1">BIB Already Collected</Badge>
                )}
              </div>

              {/* Warning for unverified */}
              {result.verification_status !== "verified" && result.it_run_registrations?.payment_status === "paid" && (
                <div style={{ padding: "10px 14px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10, fontSize: 12, color: "#fbbf24", marginBottom: 16 }}>
                  Physical ID verification required at BIB desk. Ask participant to show valid IT company ID card.
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {result.it_run_bib_collections.length === 0 && result.it_run_registrations?.payment_status === "paid" && (
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
