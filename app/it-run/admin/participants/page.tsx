"use client";

import { useState, useEffect, useCallback } from "react";

interface Participant {
  id: string; first_name: string; last_name: string; email: string | null;
  mobile: string; tshirt_size: string | null; dob: string | null;
  company_name: string | null; bib_number: string | null; wave: string | null;
  verification_status: string; participant_type: string;
  it_run_registrations: {
    registration_code: string; payment_status: string;
    it_run_categories: { name: string; color: string } | null;
  };
  it_run_bib_collections: Array<{ id: string }>;
  it_run_checkins: Array<{ id: string; checked_in_at: string }>;
}

const ACCENT = "#e8620a";
const VERIFY_COLOR: Record<string, string> = {
  verified:           "#10b981",
  pending:            "#f59e0b",
  rejected:           "#ef4444",
  need_clarification: "#6366f1",
};

export default function ParticipantsPage() {
  const [data,    setData]    = useState<Participant[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(0);
  const [loading, setLoading] = useState(false);
  const [search,  setSearch]  = useState("");
  const [status,  setStatus]  = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "40" });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      const res = await fetch(`/api/it-run/admin/participants?${params}`);
      const d   = await res.json();
      setData(d.data ?? []);
      setTotal(d.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);

  const CARD: React.CSSProperties = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 14px" };
  const INPUT: React.CSSProperties = { padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" };

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: "clamp(18px,3vw,24px)", fontWeight: 800, color: "#fff", margin: "0 0 4px" }}>All Participants</h1>
          <div style={{ fontSize: 13, color: "#888" }}>{total} participant(s)</div>
        </div>
        <a href="/api/it-run/admin/reports?type=participants" download
          style={{ padding: "9px 14px", background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: 8, color: ACCENT, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
          Export CSV
        </a>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input style={{ ...INPUT, flex: 1, minWidth: 180 }}
          placeholder="Search by name, email, mobile, or BIB..."
          value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
        <select style={INPUT} value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}>
          <option value="">All Verification</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
          <option value="need_clarification">Clarification</option>
        </select>
      </div>

      {loading ? <div style={{ color: "#888", padding: 40, textAlign: "center" }}>Loading...</div> : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.map(p => {
              const cat       = p.it_run_registrations?.it_run_categories;
              const collected = p.it_run_bib_collections.length > 0;
              const checkedIn = p.it_run_checkins.length > 0;
              return (
                <div key={p.id} style={CARD}>
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center" }}>
                    {/* BIB */}
                    <div style={{ width: 52, textAlign: "center" }}>
                      {p.bib_number ? (
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 900, color: ACCENT }}>{p.bib_number}</div>
                          {p.wave && <div style={{ fontSize: 9, color: "#888" }}>Wave {p.wave}</div>}
                        </div>
                      ) : (
                        <div style={{ fontSize: 10, color: "#555" }}>No BIB</div>
                      )}
                    </div>
                    {/* Info */}
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 2 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{p.first_name} {p.last_name}</span>
                        <span style={{ fontSize: 11, color: cat?.color ?? "#888" }}>{cat?.name ?? "-"}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 5px", borderRadius: 4, color: VERIFY_COLOR[p.verification_status] ?? "#888", background: `${VERIFY_COLOR[p.verification_status] ?? "#888"}15` }}>
                          {p.verification_status}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "#888", display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <span>{p.email ?? p.mobile}</span>
                        {p.company_name && <span>{p.company_name}</span>}
                        {p.tshirt_size && <span>T: {p.tshirt_size}</span>}
                        <span style={{ color: "#666" }}>{p.it_run_registrations?.registration_code}</span>
                      </div>
                    </div>
                    {/* Status badges */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                      {collected && <span style={{ fontSize: 9, fontWeight: 700, color: "#10b981", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 4, padding: "2px 6px" }}>BIB Collected</span>}
                      {checkedIn && <span style={{ fontSize: 9, fontWeight: 700, color: "#60a5fa", background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 4, padding: "2px 6px" }}>Checked In</span>}
                    </div>
                  </div>
                </div>
              );
            })}
            {data.length === 0 && <div style={{ color: "#888", textAlign: "center", padding: 40 }}>No participants found</div>}
          </div>

          {total > 40 && (
            <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "center" }}>
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ padding: "7px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#ccc", cursor: "pointer", fontFamily: "inherit" }}>Prev</button>
              <span style={{ padding: "7px 14px", fontSize: 13, color: "#888" }}>{page + 1} / {Math.ceil(total / 40)}</span>
              <button disabled={(page + 1) * 40 >= total} onClick={() => setPage(p => p + 1)} style={{ padding: "7px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#ccc", cursor: "pointer", fontFamily: "inherit" }}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
