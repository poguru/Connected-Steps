"use client";

import { useState, useEffect, useCallback } from "react";

interface CheckinRecord {
  id: string; checked_in_at: string; notes: string | null;
  it_run_participants: {
    id: string; first_name: string; last_name: string; bib_number: string | null;
    it_run_registrations: {
      registration_code: string;
      it_run_categories: { name: string; color: string } | null;
    };
  };
}

const ACCENT = "#e8620a";

export default function CheckinsPage() {
  const [checkins, setCheckins] = useState<CheckinRecord[]>([]);
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
        return (p.first_name + " " + p.last_name).toLowerCase().includes(q)
          || (p.bib_number ?? "").includes(q)
          || p.it_run_registrations.registration_code.toLowerCase().includes(q);
      })
    : checkins;

  const CARD: React.CSSProperties = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 14px" };
  const INPUT: React.CSSProperties = { padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" };

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: "clamp(18px,3vw,24px)", fontWeight: 800, color: "#fff", margin: "0 0 4px" }}>Check-ins</h1>
          <div style={{ fontSize: 13, color: "#888" }}>
            <span style={{ color: "#10b981", fontWeight: 700, fontSize: 20 }}>{total}</span> participants checked in
          </div>
        </div>
        <a href="/api/it-run/admin/reports?type=checkin" download
          style={{ padding: "9px 14px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, color: "#10b981", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
          Export CSV
        </a>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input style={{ ...INPUT, width: "100%", maxWidth: 400 }}
          placeholder="Search by name, BIB, or reg code..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? <div style={{ color: "#888", padding: 40, textAlign: "center" }}>Loading...</div> : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.map(c => {
              const p   = c.it_run_participants;
              const cat = p.it_run_registrations?.it_run_categories;
              return (
                <div key={c.id} style={CARD}>
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
                    <div style={{ fontSize: 11, color: "#888", textAlign: "right", flexShrink: 0 }}>
                      <div style={{ color: "#10b981", fontWeight: 600 }}>Checked In</div>
                      <div>{new Date(c.checked_in_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <div style={{ color: "#888", padding: 40, textAlign: "center" }}>No check-ins found</div>}
          </div>

          {total > 50 && (
            <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "center" }}>
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ padding: "7px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#ccc", cursor: "pointer", fontFamily: "inherit" }}>Prev</button>
              <span style={{ padding: "7px 14px", fontSize: 13, color: "#888" }}>{page + 1} / {Math.ceil(total / 50)}</span>
              <button disabled={(page + 1) * 50 >= total} onClick={() => setPage(p => p + 1)} style={{ padding: "7px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#ccc", cursor: "pointer", fontFamily: "inherit" }}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
