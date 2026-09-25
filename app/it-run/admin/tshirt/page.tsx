"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const ACCENT = "#e8620a";

type SizeRow   = { size: string; count: number };
type CatSizes  = { color: string; sizes: Record<string, number> };
type Participant = { id: string; name: string; type: string; size: string; regCode: string; category: string };

type TshirtData = {
  total: number;
  sizeSummary: SizeRow[];
  byCategory: Record<string, CatSizes>;
  participants: Participant[];
};

const SIZE_COLORS: Record<string, string> = {
  XS:"#6366f1", S:"#3b82f6", M:"#10b981", L:ACCENT, XL:"#f59e0b",
  XXL:"#ef4444", "3XL":"#ec4899", "4XL":"#8b5cf6",
  "6Y":"#06b6d4","8Y":"#84cc16","10Y":"#a3e635","12Y":"#fbbf24","14Y":"#fb923c",
};
function sizeColor(s: string) { return SIZE_COLORS[s] ?? "#888"; }

export default function TshirtPage() {
  const [data,    setData]    = useState<TshirtData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [catFilter, setCatFilter] = useState("all");

  useEffect(() => {
    fetch("/api/it-run/admin/tshirt")
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: "#888", padding: 40, textAlign: "center" }}>Loading…</div>;
  if (!data)   return <div style={{ color: "#f87171", padding: 40 }}>Failed to load T-shirt data.</div>;

  const categories  = Object.keys(data.byCategory);
  const maxCount    = Math.max(...data.sizeSummary.map(s => s.count), 1);
  const filteredParts = data.participants
    .filter(p => catFilter === "all" || p.category === catFilter)
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.regCode.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "clamp(20px,3vw,26px)", fontWeight: 800, color: "#fff", margin: 0 }}>T-Shirt Reports</h1>
          <p style={{ color: "#666", fontSize: 13, margin: "6px 0 0" }}>Size distribution for {data.total} paid/free participants.</p>
        </div>
        <Link href={`/api/it-run/admin/reports?type=tshirt`}
          style={{ padding: "8px 16px", background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: 8, color: ACCENT, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
          Download CSV
        </Link>
      </div>

      {/* Overall size chart */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "20px 24px", marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>Overall Size Breakdown</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.sizeSummary.map(s => (
            <div key={s.size}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: "#ccc", fontWeight: 600, minWidth: 40 }}>{s.size}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: sizeColor(s.size) }}>{s.count}</span>
              </div>
              <div style={{ height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 4 }}>
                <div style={{ height: "100%", width: `${Math.round((s.count / maxCount) * 100)}%`, background: sizeColor(s.size), borderRadius: 4, transition: "width 0.4s" }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* By category */}
      {categories.length > 1 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14, marginBottom: 20 }}>
          {categories.map(cat => {
            const cd = data.byCategory[cat];
            const catMax = Math.max(...Object.values(cd.sizes), 1);
            return (
              <div key={cat} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden" }}>
                <div style={{ height: 3, background: cd.color ?? ACCENT }} />
                <div style={{ padding: "14px 18px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: cd.color ?? ACCENT, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>{cat}</div>
                  {Object.entries(cd.sizes).sort(([a],[b]) => {
                    const ORDER = ["XS","S","M","L","XL","XXL","3XL","4XL","6Y","8Y","10Y","12Y","14Y"];
                    return (ORDER.indexOf(a) ?? 99) - (ORDER.indexOf(b) ?? 99);
                  }).map(([size, count]) => (
                    <div key={size} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: "#888", minWidth: 36 }}>{size}</span>
                      <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3 }}>
                        <div style={{ height: "100%", width: `${Math.round((count / catMax) * 100)}%`, background: sizeColor(size), borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: sizeColor(size), minWidth: 24, textAlign: "right" }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Participant list */}
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>Participants</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or code…"
            style={{ flex: 1, minWidth: 160, padding: "7px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            style={{ padding: "7px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" }}>
            <option value="all" style={{ background: "#1a1a1a" }}>All categories</option>
            {categories.map(c => <option key={c} value={c} style={{ background: "#1a1a1a" }}>{c}</option>)}
          </select>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["Name","Category","Type","T-Shirt Size","Reg Code"].map(h => (
                  <th key={h} style={{ padding: "9px 14px", textAlign: "left", color: "#666", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredParts.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 28, textAlign: "center", color: "#555" }}>No participants match</td></tr>
              ) : filteredParts.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: i < filteredParts.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <td style={{ padding: "9px 14px", color: "#fff", fontWeight: 600 }}>{p.name}</td>
                  <td style={{ padding: "9px 14px", color: "#888" }}>{p.category}</td>
                  <td style={{ padding: "9px 14px", color: "#666", fontSize: 12 }}>{p.type}</td>
                  <td style={{ padding: "9px 14px" }}>
                    <span style={{ fontWeight: 800, color: sizeColor(p.size), background: `${sizeColor(p.size)}18`, padding: "2px 10px", borderRadius: 6, fontSize: 13 }}>{p.size}</span>
                  </td>
                  <td style={{ padding: "9px 14px", color: ACCENT, fontFamily: "monospace", fontSize: 12 }}>{p.regCode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
