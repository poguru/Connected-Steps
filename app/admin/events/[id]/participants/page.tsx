"use client";

import { useState, useEffect, use, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Participant {
  id: string;
  registration_id: string;
  registration_code: string | null;
  payment_status: string | null;
  account_email: string;
  first_name: string;
  last_name: string | null;
  gender: string | null;
  blood_group: string | null;
  mobile: string | null;
  distance_category: string | null;
  tshirt_size: string | null;
  bib_number: string | null;
  qr_token: string | null;
  checked_in_at: string | null;
  tshirt_issued: boolean;
  breakfast_availed: boolean;
  medal_issued: boolean;
  bib_collected_at: string | null;
  status: string;
}

interface PaginatedResult {
  participants: Participant[];
  total: number;
  page: number;
  total_pages: number;
}

const S: Record<string, React.CSSProperties> = {
  input: { padding: "8px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" },
  btn:   { padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#ccc", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit", whiteSpace: "nowrap" as const },
  btnPrimary: { padding: "7px 16px", borderRadius: 8, border: "none", background: "#e8620a", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit", whiteSpace: "nowrap" as const },
};

function Dot({ done }: { done: boolean }) {
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: done ? "#4ade80" : "#333", flexShrink: 0 }} />;
}

export default function ParticipantsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const router = useRouter();

  const [data,       setData]       = useState<PaginatedResult | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [q,          setQ]          = useState("");
  const [page,       setPage]       = useState(1);
  const [editBib,    setEditBib]    = useState<Record<string, string>>({});
  const [savingBib,  setSavingBib]  = useState<string | null>(null);
  const [bulkPrefix, setBulkPrefix] = useState("");
  const [bulkStart,  setBulkStart]  = useState("1");
  const [bulkMsg,    setBulkMsg]    = useState("");
  const [bulkCat,    setBulkCat]    = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (query: string, pg: number) => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ q: query, page: String(pg), limit: "50" });
      const r  = await fetch(`/api/admin/events/${eventId}/participants?${sp}`);
      if (r.status === 401) { router.replace("/admin/login"); return; }
      if (r.ok) setData(await r.json() as PaginatedResult);
    } finally { setLoading(false); }
  }, [eventId, router]);

  useEffect(() => { void load("", 1); }, [load]);

  function handleSearch(val: string) {
    setQ(val); setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void load(val, 1), 300);
  }

  async function saveBib(participantId: string) {
    setSavingBib(participantId);
    try {
      await fetch(`/api/admin/events/${eventId}/participants`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participant_id: participantId, bib_number: editBib[participantId] || null }),
      });
      setEditBib(v => { const n = { ...v }; delete n[participantId]; return n; });
      void load(q, page);
    } finally { setSavingBib(null); }
  }

  async function bulkAssign(preview = false) {
    setBulkMsg(preview ? "Previewing…" : "Assigning…");
    const r = await fetch(`/api/admin/events/${eventId}/participants`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bulk_bib: true,
        prefix: bulkPrefix,
        start: Number(bulkStart) || 1,
        pad: 3,
        distance_category: bulkCat || undefined,
        preview,
      }),
    });
    const d = await r.json() as { ok?: boolean; assigned?: number; preview?: Array<{ id: string; bib_number: string }> };
    if (preview && d.preview) {
      setBulkMsg(`Preview: first BIB = ${d.preview[0]?.bib_number ?? "?"}, total = ${d.preview.length}`);
    } else {
      setBulkMsg(`Done — ${d.assigned ?? 0} BIBs assigned`);
      void load(q, page);
    }
  }

  const cats = [...new Set((data?.participants ?? []).map(p => p.distance_category).filter(Boolean))] as string[];

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#fff", fontFamily: "'Inter',system-ui,sans-serif" }}>
      <nav style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(8,8,8,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 20px", height: 52, display: "flex", alignItems: "center", gap: 16 }}>
        <Link href={`/admin/events/${eventId}/manage`} style={{ fontSize: 13, color: "#888", textDecoration: "none" }}>← Event Hub</Link>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Participants</span>
        {data && <span style={{ fontSize: 11, color: "#555" }}>{data.total} total</span>}
        <a href={`/api/admin/events/${eventId}/export`} download style={{ marginLeft: "auto", ...S.btn, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}>
          ↓ Export CSV
        </a>
      </nav>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 16px 80px" }}>

        {/* Bulk BIB assign */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10, fontWeight: 700 }}>Auto-Assign BIB Numbers</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 100px" }}>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>Prefix</div>
              <input style={S.input} value={bulkPrefix} onChange={e => setBulkPrefix(e.target.value)} placeholder="e.g. 5K-" />
            </div>
            <div style={{ flex: "1 1 80px" }}>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>Start #</div>
              <input style={S.input} type="number" value={bulkStart} onChange={e => setBulkStart(e.target.value)} min={1} />
            </div>
            {cats.length > 1 && (
              <div style={{ flex: "1 1 120px" }}>
                <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>Category (optional)</div>
                <select style={{ ...S.input, cursor: "pointer", colorScheme: "dark" }} value={bulkCat} onChange={e => setBulkCat(e.target.value)}>
                  <option value="">All categories</option>
                  {cats.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            <button style={S.btn} onClick={() => void bulkAssign(true)}>Preview</button>
            <button style={S.btnPrimary} onClick={() => void bulkAssign(false)}>Assign</button>
          </div>
          {bulkMsg && <div style={{ fontSize: 12, color: "#a78bfa", marginTop: 8 }}>{bulkMsg}</div>}
        </div>

        {/* Search */}
        <input style={{ ...S.input, marginBottom: 12, fontSize: 14 }}
          value={q} onChange={e => handleSearch(e.target.value)}
          placeholder="Search by name, email, BIB number…" autoFocus />

        {/* Table */}
        {loading && !data ? (
          <div style={{ textAlign: "center", padding: 40, color: "#555" }}>Loading…</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {["Name","Registration","Category","T-Shirt","BIB","Check-In","T-Shirt","Bfast","Medal","Status"].map(h => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#555", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.participants ?? []).map(p => {
                  const name  = [p.first_name, p.last_name].filter(Boolean).join(" ");
                  const isEditing = p.id in editBib;
                  return (
                    <tr key={p.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "10px 10px" }}>
                        <div style={{ fontWeight: 600, color: "#eee" }}>{name}</div>
                        <div style={{ fontSize: 11, color: "#555" }}>{p.account_email}</div>
                      </td>
                      <td style={{ padding: "10px 10px" }}>
                        <code style={{ fontSize: 11, color: "#e8620a" }}>{p.registration_code ?? "—"}</code>
                        {p.payment_status && <div style={{ fontSize: 10, color: "#555" }}>{p.payment_status}</div>}
                      </td>
                      <td style={{ padding: "10px 10px", color: "#aaa" }}>{p.distance_category ?? "—"}</td>
                      <td style={{ padding: "10px 10px", color: "#aaa" }}>{p.tshirt_size ?? "—"}</td>
                      <td style={{ padding: "10px 10px" }}>
                        {isEditing ? (
                          <div style={{ display: "flex", gap: 4 }}>
                            <input
                              style={{ ...S.input, width: 80, padding: "4px 8px", fontSize: 12 }}
                              value={editBib[p.id]}
                              onChange={e => setEditBib(v => ({ ...v, [p.id]: e.target.value }))}
                              onKeyDown={e => { if (e.key === "Enter") void saveBib(p.id); if (e.key === "Escape") setEditBib(v => { const n = { ...v }; delete n[p.id]; return n; }); }}
                              autoFocus
                            />
                            <button style={{ ...S.btnPrimary, padding: "4px 8px" }} onClick={() => void saveBib(p.id)} disabled={savingBib === p.id}>✓</button>
                          </div>
                        ) : (
                          <button style={{ ...S.btn, background: "transparent", border: "none", color: p.bib_number ? "#e8620a" : "#444", fontFamily: "monospace", padding: "4px 0" }}
                            onClick={() => setEditBib(v => ({ ...v, [p.id]: p.bib_number ?? "" }))}>
                            {p.bib_number ?? "—"}
                          </button>
                        )}
                      </td>
                      <td style={{ padding: "10px 10px" }}><Dot done={!!p.checked_in_at} /></td>
                      <td style={{ padding: "10px 10px" }}><Dot done={p.tshirt_issued} /></td>
                      <td style={{ padding: "10px 10px" }}><Dot done={p.breakfast_availed} /></td>
                      <td style={{ padding: "10px 10px" }}><Dot done={p.medal_issued} /></td>
                      <td style={{ padding: "10px 10px" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: p.status === "active" ? "#4ade80" : "#888" }}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {(data?.participants ?? []).length === 0 && (
                  <tr><td colSpan={10} style={{ padding: 32, textAlign: "center", color: "#555" }}>
                    {q ? "No participants found." : "No participants yet."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {(data?.total_pages ?? 0) > 1 && (
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
            {Array.from({ length: data!.total_pages }, (_, i) => i + 1).map(pg => (
              <button key={pg} onClick={() => { setPage(pg); void load(q, pg); }}
                style={{ ...S.btn, background: pg === page ? "#e8620a" : "rgba(255,255,255,0.04)", color: pg === page ? "#fff" : "#666", border: `1px solid ${pg === page ? "#e8620a" : "rgba(255,255,255,0.08)"}` }}>
                {pg}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
