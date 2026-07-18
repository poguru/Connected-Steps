"use client";

import { useState, useEffect, useCallback } from "react";

interface Registration {
  id: string; registration_code: string; lead_email: string;
  participant_count: number; base_price: number; discount_amount: number;
  final_price: number; payment_status: string; created_at: string;
  it_run_categories: { name: string; distance_km: number; color: string } | null;
  it_run_participants: Array<{ id: string; first_name: string; last_name: string; email: string | null; mobile: string; bib_number: string | null; verification_status: string }>;
}

const ACCENT = "#e8620a";

const STATUS_COLOR: Record<string, { color: string; bg: string }> = {
  paid:    { color: "#10b981", bg: "rgba(16,185,129,0.1)" },
  free:    { color: "#10b981", bg: "rgba(16,185,129,0.1)" },
  pending: { color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  failed:  { color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
};

export default function RegistrationsPage() {
  const [regs,    setRegs]    = useState<Registration[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(0);
  const [loading, setLoading] = useState(false);
  const [status,  setStatus]  = useState("");
  const [search,  setSearch]  = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "30" });
      if (status) params.set("status", status);
      if (search) params.set("search", search);
      const res  = await fetch(`/api/it-run/admin/registrations?${params}`);
      const d    = await res.json();
      setRegs(d.data ?? []);
      setTotal(d.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page, status, search]);

  useEffect(() => { load(); }, [load]);

  const CARD: React.CSSProperties = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" };
  const INPUT: React.CSSProperties = { padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" };

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: "clamp(18px,3vw,24px)", fontWeight: 800, color: "#fff", margin: "0 0 4px" }}>Registrations</h1>
        <div style={{ fontSize: 13, color: "#888" }}>{total} total registration(s)</div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input style={{ ...INPUT, flex: 1, minWidth: 200 }} placeholder="Search by code or email..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
        <select style={INPUT} value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}>
          <option value="">All Statuses</option>
          <option value="paid">Paid</option>
          <option value="free">Free</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
        <a href="/api/it-run/admin/reports?type=registrations" download
          style={{ padding: "9px 14px", background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: 8, color: ACCENT, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
          Export CSV
        </a>
      </div>

      {loading ? <div style={{ color: "#888", padding: 40, textAlign: "center" }}>Loading...</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {regs.map(reg => {
            const sc = STATUS_COLOR[reg.payment_status] ?? { color: "#888", bg: "rgba(255,255,255,0.06)" };
            const isOpen = expanded === reg.id;
            return (
              <div key={reg.id} style={CARD}>
                <button onClick={() => setExpanded(isOpen ? null : reg.id)}
                  style={{ width: "100%", background: "none", border: "none", color: "inherit", fontFamily: "inherit", cursor: "pointer", padding: "14px 16px", textAlign: "left" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <code style={{ fontSize: 13, color: ACCENT, fontWeight: 700, letterSpacing: "0.05em" }}>{reg.registration_code}</code>
                    <span style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.color}33`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
                      {reg.payment_status}
                    </span>
                    <span style={{ fontSize: 12, color: reg.it_run_categories?.color ?? "#888" }}>{reg.it_run_categories?.name}</span>
                    <span style={{ fontSize: 13, color: "#ccc", flex: 1 }}>{reg.lead_email}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#10b981" }}>Rs.{reg.final_price}</span>
                    <span style={{ fontSize: 11, color: "#555" }}>{new Date(reg.created_at).toLocaleDateString("en-IN")}</span>
                    <span style={{ color: "#555", fontSize: 12 }}>{isOpen ? "v" : ">"}</span>
                  </div>
                </button>

                {isOpen && (
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "14px 16px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "8px 16px", marginBottom: 14 }}>
                      {[
                        ["Reg Code",        reg.registration_code],
                        ["Category",        reg.it_run_categories?.name ?? "-"],
                        ["Participants",    String(reg.participant_count)],
                        ["Base Price",      `Rs.${reg.base_price}`],
                        ["Discount",        `Rs.${reg.discount_amount}`],
                        ["Final Price",     `Rs.${reg.final_price}`],
                        ["Registered",      new Date(reg.created_at).toLocaleString("en-IN")],
                      ].map(([l, v]) => (
                        <div key={l as string}>
                          <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.07em" }}>{l}</div>
                          <div style={{ fontSize: 13, color: "#ccc" }}>{v}</div>
                        </div>
                      ))}
                    </div>

                    {reg.it_run_participants.map((p, i) => (
                      <div key={p.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "10px 12px", marginBottom: 6 }}>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>P{i+1}: {p.first_name} {p.last_name}</span>
                          {p.bib_number && <span style={{ fontSize: 12, color: ACCENT, fontWeight: 700 }}>BIB {p.bib_number}</span>}
                          <span style={{ fontSize: 11, color: "#888" }}>{p.email ?? p.mobile}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                            color:       p.verification_status === "verified" ? "#10b981" : "#888",
                            background: `${p.verification_status === "verified" ? "#10b981" : "#666"}15`,
                          }}>
                            {p.verification_status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {regs.length === 0 && <div style={{ color: "#888", padding: 40, textAlign: "center" }}>No registrations found</div>}
        </div>
      )}

      {total > 30 && (
        <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "center" }}>
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ padding: "7px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#ccc", cursor: "pointer", fontFamily: "inherit" }}>Prev</button>
          <span style={{ padding: "7px 14px", fontSize: 13, color: "#888" }}>{page + 1} / {Math.ceil(total / 30)}</span>
          <button disabled={(page + 1) * 30 >= total} onClick={() => setPage(p => p + 1)} style={{ padding: "7px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#ccc", cursor: "pointer", fontFamily: "inherit" }}>Next</button>
        </div>
      )}
    </div>
  );
}
