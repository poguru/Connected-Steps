"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface ParticipantResult {
  id: string; first_name: string; last_name: string;
  bib_number: string | null; wave: string | null;
  participant_type: string;
  it_run_registrations: {
    registration_code: string; payment_status: string;
    it_run_categories: { name: string; color: string } | null;
  };
  it_run_checkins: Array<{ id: string; checked_in_at: string }>;
}

const GREEN = "#10b981";

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: `${color}15`, border: `1px solid ${color}30`, color }}>
      {children}
    </span>
  );
}

export default function CheckinPage() {
  const router = useRouter();
  const [query,     setQuery]     = useState("");
  const [result,    setResult]    = useState<ParticipantResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [checking,  setChecking]  = useState(false);
  const [message,   setMessage]   = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const [checkinCount, setCheckinCount] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    fetch("/api/it-run/admin/checkins?limit=1")
      .then(r => r.json())
      .then(d => setCheckinCount(d.total ?? null))
      .catch(() => {});
  }, []);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setResult(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/it-run/checkin?q=${encodeURIComponent(query.trim())}`);
      const d   = await res.json();
      if (!res.ok || !d.participant) {
        setMessage({ text: d.error ?? "Participant not found. Scan QR or enter BIB number.", type: "error" });
        return;
      }
      setResult(d.participant);
    } catch {
      setMessage({ text: "Network error. Try again.", type: "error" });
    } finally {
      setSearching(false);
    }
  }

  async function checkIn() {
    if (!result) return;
    setChecking(true);
    setMessage(null);
    try {
      const res = await fetch("/api/it-run/checkin", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ participantId: result.id }),
      });
      const d = await res.json();
      if (res.status === 409 || d.already) {
        setMessage({ text: "This participant is already checked in.", type: "info" });
        return;
      }
      if (!res.ok) { setMessage({ text: d.error ?? "Check-in failed.", type: "error" }); return; }
      setMessage({ text: `Checked in! ${result.first_name} ${result.last_name}${result.bib_number ? ` - BIB #${result.bib_number}` : ""}`, type: "success" });
      if (checkinCount !== null) setCheckinCount(c => (c ?? 0) + 1);
      setResult(null);
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 100);
    } finally {
      setChecking(false);
    }
  }

  async function logout() {
    await fetch("/api/it-run/portal/auth", { method: "DELETE" });
    router.push("/it-run/checkin/login");
  }

  function reset() {
    setResult(null);
    setQuery("");
    setMessage(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#fff", fontFamily: "'Inter',system-ui,sans-serif", padding: "0 0 40px" }}>
      {/* Header */}
      <header style={{ background: "#0d0d0d", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 20px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>Check-in</span>
          <span style={{ fontSize: 11, color: GREEN, marginLeft: 4 }}>IT Run Sprint-2</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {checkinCount !== null && (
            <div style={{ fontSize: 13, fontWeight: 700, color: GREEN }}>
              {checkinCount} checked in
            </div>
          )}
          <button onClick={logout} style={{ padding: "5px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#888", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            Sign Out
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 520, margin: "0 auto", padding: "clamp(1rem,4vw,2rem) 16px" }}>
        {/* Search */}
        <form onSubmit={search} style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              ref={inputRef}
              value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Scan QR code or enter BIB number..."
              style={{ flex: 1, padding: "12px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none" }}
            />
            <button type="submit" disabled={searching || !query.trim()}
              style={{ padding: "12px 18px", background: GREEN, border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
              {searching ? "..." : "Go"}
            </button>
          </div>
        </form>

        {/* Status message */}
        {message && (
          <div style={{
            padding: "14px 16px", marginBottom: 20, borderRadius: 12, fontSize: 14, fontWeight: 600,
            background: message.type === "success" ? "rgba(16,185,129,0.08)" : message.type === "error" ? "rgba(239,68,68,0.08)" : "rgba(99,102,241,0.08)",
            border:     `1px solid ${message.type === "success" ? "rgba(16,185,129,0.3)" : message.type === "error" ? "rgba(239,68,68,0.3)" : "rgba(99,102,241,0.3)"}`,
            color:      message.type === "success" ? GREEN : message.type === "error" ? "#f87171" : "#818cf8",
          }}>
            {message.text}
            {message.type === "success" && (
              <div style={{ marginTop: 10 }}>
                <button onClick={reset}
                  style={{ padding: "7px 14px", background: GREEN, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  Next Participant
                </button>
              </div>
            )}
          </div>
        )}

        {/* Participant card */}
        {result && (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, overflow: "hidden" }}>
            <div style={{ height: 4, background: result.it_run_registrations?.it_run_categories?.color ?? GREEN }} />
            <div style={{ padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#fff" }}>
                    {result.first_name} {result.last_name}
                  </div>
                  <div style={{ fontSize: 14, color: result.it_run_registrations?.it_run_categories?.color ?? GREEN, fontWeight: 600, marginTop: 2 }}>
                    {result.it_run_registrations?.it_run_categories?.name ?? "Unknown Category"}
                  </div>
                </div>
                {result.bib_number && (
                  <div style={{ background: "rgba(16,185,129,0.08)", border: "2px solid rgba(16,185,129,0.3)", borderRadius: 12, padding: "8px 16px", textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: GREEN, textTransform: "uppercase", letterSpacing: "0.1em" }}>BIB</div>
                    <div style={{ fontSize: 32, fontWeight: 900, color: GREEN, lineHeight: 1 }}>{result.bib_number}</div>
                    {result.wave && <div style={{ fontSize: 11, color: "#888" }}>Wave {result.wave}</div>}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
                <Badge color={result.it_run_registrations?.payment_status === "paid" ? GREEN : "#f59e0b"}>
                  {result.it_run_registrations?.payment_status === "paid" ? "Paid" : result.it_run_registrations?.payment_status ?? "Unknown"}
                </Badge>
                {result.it_run_checkins.length > 0 && (
                  <Badge color="#6366f1">Already Checked In</Badge>
                )}
              </div>

              {/* Already checked in warning */}
              {result.it_run_checkins.length > 0 && (
                <div style={{ padding: "10px 14px", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 10, fontSize: 13, color: "#818cf8", marginBottom: 16 }}>
                  Already checked in at {new Date(result.it_run_checkins[0].checked_in_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {result.it_run_checkins.length === 0 ? (
                  <button onClick={checkIn} disabled={checking}
                    style={{ padding: "14px 28px", background: checking ? "rgba(255,255,255,0.1)" : GREEN, border: "none", borderRadius: 10, color: "#fff", fontSize: 15, fontWeight: 800, cursor: checking ? "not-allowed" : "pointer", fontFamily: "inherit", letterSpacing: "-0.01em" }}>
                    {checking ? "Recording..." : "Check In"}
                  </button>
                ) : (
                  <button disabled style={{ padding: "14px 28px", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 10, color: "#818cf8", fontSize: 15, fontWeight: 800, cursor: "not-allowed", fontFamily: "inherit" }}>
                    Already Checked In
                  </button>
                )}
                <button onClick={reset}
                  style={{ padding: "14px 20px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#888", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
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
