"use client";

import { useState, useEffect, useCallback } from "react";

interface Participant {
  id: string; first_name: string; last_name: string; email: string | null;
  mobile: string; bib_number: string | null; wave: string | null;
  tshirt_size: string | null; verification_status: string; participant_type: string;
  it_run_registrations: {
    registration_code: string; payment_status: string;
    it_run_categories: { name: string; distance_km: number; slug: string; color: string } | null;
  };
  it_run_bib_collections: Array<{ id: string; collected_at: string }>;
}

const ACCENT = "#e8620a";

export default function BibsPage() {
  const [data,       setData]       = useState<Participant[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [allocating, setAllocating] = useState(false);
  const [message,    setMessage]    = useState("");
  const [filter,     setFilter]     = useState("all");

  const load = useCallback(async (unallocated = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/it-run/admin/bibs${unallocated ? "?unallocated=1" : ""}`);
      const d   = await res.json();
      setData(d.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function allocateBibs() {
    setAllocating(true);
    setMessage("");
    try {
      const res  = await fetch("/api/it-run/admin/bibs", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({}),
      });
      const d = await res.json();
      setMessage(d.message ?? `${d.allocated} BIBs allocated successfully!`);
      await load();
    } catch {
      setMessage("Allocation failed. Please try again.");
    } finally {
      setAllocating(false);
    }
  }

  const filtered = filter === "unallocated" ? data.filter(p => !p.bib_number)
    : filter === "collected" ? data.filter(p => p.it_run_bib_collections.length > 0)
    : data;

  const unallocatedCount = data.filter(p => !p.bib_number).length;
  const collectedCount   = data.filter(p => p.it_run_bib_collections.length > 0).length;

  const CARD: React.CSSProperties = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10 };

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: "clamp(18px,3vw,24px)", fontWeight: 800, color: "#fff", margin: "0 0 4px" }}>BIB Allocation</h1>
          <div style={{ fontSize: 13, color: "#888" }}>
            {data.length} total | {unallocatedCount} unallocated | {collectedCount} collected
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/api/it-run/admin/reports?type=participants" download
            style={{ padding: "9px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#ccc", fontSize: 13, textDecoration: "none" }}>
            Export CSV
          </a>
          <button onClick={allocateBibs} disabled={allocating || unallocatedCount === 0}
            style={{ padding: "9px 16px", background: unallocatedCount === 0 ? "rgba(255,255,255,0.05)" : ACCENT, border: "none", borderRadius: 8, color: unallocatedCount === 0 ? "#555" : "#fff", fontSize: 13, fontWeight: 700, cursor: unallocatedCount === 0 ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {allocating ? "Allocating..." : `Auto-Allocate ${unallocatedCount} BIBs`}
          </button>
        </div>
      </div>

      {message && (
        <div style={{ padding: "12px 16px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 10, color: "#10b981", fontSize: 13, marginBottom: 16 }}>
          {message}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { key: "all",         label: `All (${data.length})` },
          { key: "unallocated", label: `Unallocated (${unallocatedCount})` },
          { key: "collected",   label: `Collected (${collectedCount})` },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{
              padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
              background: filter === f.key ? "rgba(232,98,10,0.1)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${filter === f.key ? ACCENT : "rgba(255,255,255,0.1)"}`,
              color:  filter === f.key ? ACCENT : "#888",
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? <div style={{ color: "#888", padding: 40, textAlign: "center" }}>Loading...</div> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 10 }}>
          {filtered.map(p => {
            const cat        = p.it_run_registrations?.it_run_categories;
            const isCollected = p.it_run_bib_collections.length > 0;
            return (
              <div key={p.id} style={{ ...CARD, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{p.first_name} {p.last_name}</div>
                    <div style={{ fontSize: 12, color: cat?.color ?? "#888" }}>{cat?.name ?? "-"}</div>
                  </div>
                  {p.bib_number ? (
                    <div style={{ background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: 8, padding: "4px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: ACCENT, textTransform: "uppercase" }}>BIB</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: ACCENT }}>{p.bib_number}</div>
                      {p.wave && <div style={{ fontSize: 9, color: "#888" }}>Wave {p.wave}</div>}
                    </div>
                  ) : (
                    <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 8, padding: "4px 10px", fontSize: 11, color: "#f59e0b", fontWeight: 600 }}>
                      Not Assigned
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "#888" }}>T: {p.tshirt_size ?? "-"}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                    color:       p.verification_status === "verified" ? "#10b981" : "#f59e0b",
                    background: `${p.verification_status === "verified" ? "#10b981" : "#f59e0b"}15`,
                  }}>
                    {p.verification_status}
                  </span>
                  {isCollected && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, color: "#10b981", background: "rgba(16,185,129,0.1)" }}>Collected</span>}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div style={{ gridColumn: "1/-1", color: "#888", textAlign: "center", padding: 40 }}>No participants in this view</div>}
        </div>
      )}
    </div>
  );
}
