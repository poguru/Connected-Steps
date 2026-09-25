"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const ACCENT = "#e8620a";
const GREEN  = "#10b981";
const RED    = "#ef4444";

const ADULT_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];
const CHILD_SIZES = ["5-6Y", "7-8Y", "9-10Y", "11-12Y", "13-14Y"];

// ── Types ──────────────────────────────────────────────────────────────────────

type SizeRow = { size: string; required: number; issued: number; not_issued: number };
type Summary = {
  total_participants: number;
  total_required: number;
  total_issued: number;
  total_not_issued: number;
};
type Category = { id: string; name: string; color: string };
type Participant = {
  id: string; name: string; participant_type: string;
  tshirt_size: string | null; size_group: string;
  mobile: string; email: string | null;
  registration_code: string; lead_email: string;
  category: string; category_color: string;
  issued: boolean; issued_at: string | null;
};
type ApiData = {
  summary:    Summary;
  adult_sizes: SizeRow[];
  child_sizes: SizeRow[];
  participants: Participant[];
  total_list:  number;
  page:        number;
  limit:       number;
  categories:  Category[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

// ── Summary tile ──────────────────────────────────────────────────────────────

function Tile({ label, value, sub, accent }: {
  label: string; value: number; sub?: string; accent?: string;
}) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14, padding: "18px 20px", flex: 1, minWidth: 140,
    }}>
      <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 900, color: accent ?? "#fff", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
        {value.toLocaleString("en-IN")}
      </div>
      {sub && <div style={{ fontSize: 11, color: "#444", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

// ── Size breakdown table ───────────────────────────────────────────────────────

function SizeTable({ title, rows, accent }: {
  title: string; rows: SizeRow[]; accent: string;
}) {
  const maxRequired = Math.max(...rows.map(r => r.required), 1);
  const hasAny = rows.some(r => r.required > 0);

  return (
    <div style={{
      background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14, overflow: "hidden", flex: 1, minWidth: 280,
    }}>
      {/* Header bar */}
      <div style={{ height: 3, background: accent }} />
      <div style={{ padding: "14px 18px 10px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.1em" }}>{title}</div>
      </div>

      {!hasAny ? (
        <div style={{ padding: "24px 18px", color: "#444", fontSize: 13, textAlign: "center" }}>No data</div>
      ) : (
        <div style={{ padding: "12px 18px 16px" }}>
          {/* Column headers */}
          <div style={{ display: "grid", gridTemplateColumns: "56px 1fr 54px 54px 54px", gap: 6, marginBottom: 8, alignItems: "center" }}>
            <div style={{ fontSize: 10, color: "#444" }}>SIZE</div>
            <div style={{ fontSize: 10, color: "#444" }}></div>
            <div style={{ fontSize: 10, color: "#888", textAlign: "right" }}>REQ</div>
            <div style={{ fontSize: 10, color: GREEN,  textAlign: "right" }}>ISSUED</div>
            <div style={{ fontSize: 10, color: RED,    textAlign: "right" }}>LEFT</div>
          </div>

          {rows.map(r => {
            const issuedPct = pct(r.issued, r.required);
            return (
              <div key={r.size} style={{
                display: "grid", gridTemplateColumns: "56px 1fr 54px 54px 54px",
                gap: 6, alignItems: "center", marginBottom: 10,
                opacity: r.required === 0 ? 0.3 : 1,
              }}>
                {/* Size label */}
                <div style={{ fontSize: 13, fontWeight: 800, color: "#ccc" }}>{r.size}</div>

                {/* Bar */}
                <div style={{ height: 10, background: "rgba(255,255,255,0.04)", borderRadius: 5, overflow: "hidden", position: "relative" }}>
                  {/* Issued portion */}
                  <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0,
                    width: `${pct(r.required, maxRequired)}%`,
                    background: RED, opacity: 0.35, borderRadius: 5,
                  }} />
                  <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0,
                    width: `${pct(r.issued, maxRequired)}%`,
                    background: GREEN, borderRadius: 5,
                    transition: "width 0.4s",
                  }} />
                </div>

                {/* Numbers */}
                <div style={{ fontSize: 13, fontWeight: 700, color: "#ccc", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {r.required}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: GREEN, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {r.issued}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: r.not_issued > 0 ? RED : "#444", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {r.not_issued}
                </div>
              </div>
            );
          })}

          {/* Totals row */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 10, marginTop: 4,
            display: "grid", gridTemplateColumns: "56px 1fr 54px 54px 54px", gap: 6, alignItems: "center" }}>
            <div style={{ fontSize: 11, color: "#555", fontWeight: 700 }}>TOTAL</div>
            <div />
            <div style={{ fontSize: 13, fontWeight: 800, color: "#ccc", textAlign: "right" }}>
              {rows.reduce((s, r) => s + r.required, 0)}
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: GREEN, textAlign: "right" }}>
              {rows.reduce((s, r) => s + r.issued, 0)}
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: RED, textAlign: "right" }}>
              {rows.reduce((s, r) => s + r.not_issued, 0)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function TshirtPage() {
  const [data,    setData]    = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [listPage, setListPage] = useState(0);

  // Filters
  const [catFilter,    setCatFilter]    = useState("");
  const [groupFilter,  setGroupFilter]  = useState("");   // adult | child | ""
  const [issuedFilter, setIssuedFilter] = useState("");   // yes | no | ""
  const [search,       setSearch]       = useState("");

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((pg: number) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(pg), limit: "50" });
    if (catFilter)    params.set("category_id", catFilter);
    if (groupFilter)  params.set("group",        groupFilter);
    if (issuedFilter) params.set("issued",        issuedFilter);
    if (search)       params.set("search",        search);
    fetch(`/api/it-run/admin/tshirt?${params}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [catFilter, groupFilter, issuedFilter, search]);

  useEffect(() => { load(listPage); }, [load, listPage]);

  function handleSearch(v: string) {
    setSearch(v);
    setListPage(0);
    if (searchTimer.current) clearTimeout(searchTimer.current);
  }

  function handleFilter(setter: (v: string) => void, v: string) {
    setter(v);
    setListPage(0);
  }

  function csvUrl() {
    const params = new URLSearchParams({ format: "csv" });
    if (catFilter)    params.set("category_id", catFilter);
    if (groupFilter)  params.set("group",        groupFilter);
    if (issuedFilter) params.set("issued",        issuedFilter);
    if (search)       params.set("search",        search);
    return `/api/it-run/admin/tshirt?${params}`;
  }

  const INPUT: React.CSSProperties = {
    padding: "9px 12px", background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
    color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none",
  };

  const s = data?.summary;

  return (
    <div style={{ maxWidth: 1040 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: "clamp(18px,3vw,24px)", fontWeight: 800, color: "#fff", margin: "0 0 4px" }}>
            T-Shirt Inventory
          </h1>
          <div style={{ fontSize: 13, color: "#555" }}>
            Live counts from participant records and BIB collection status
          </div>
        </div>
        <a href={csvUrl()} download
          style={{ padding: "9px 16px", background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: 8, color: ACCENT, fontSize: 13, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
          Export CSV
        </a>
      </div>

      {/* Summary tiles */}
      {s && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
          <Tile label="Total Participants"    value={s.total_participants} />
          <Tile label="T-Shirts Required"     value={s.total_required}
            sub={`${pct(s.total_required, s.total_participants)}% of participants`} />
          <Tile label="T-Shirts Issued"       value={s.total_issued}
            sub={`${pct(s.total_issued, s.total_required)}% of required`}
            accent={GREEN} />
          <Tile label="T-Shirts Not Issued"   value={s.total_not_issued}
            sub={s.total_not_issued > 0 ? `${pct(s.total_not_issued, s.total_required)}% remaining` : "All issued!"}
            accent={s.total_not_issued > 0 ? RED : GREEN} />
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <input
          style={{ ...INPUT, flex: 2, minWidth: 200 }}
          placeholder="Search: name, mobile, email, registration code…"
          value={search}
          onChange={e => handleSearch(e.target.value)}
        />
        <select style={INPUT} value={catFilter} onChange={e => handleFilter(setCatFilter, e.target.value)}>
          <option value="">All Categories</option>
          {(data?.categories ?? []).map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select style={INPUT} value={groupFilter} onChange={e => handleFilter(setGroupFilter, e.target.value)}>
          <option value="">Adult + Child</option>
          <option value="adult">Adult Only</option>
          <option value="child">Child Only</option>
        </select>
        <select style={INPUT} value={issuedFilter} onChange={e => handleFilter(setIssuedFilter, e.target.value)}>
          <option value="">All Issuance</option>
          <option value="yes">Issued Only</option>
          <option value="no">Not Issued Only</option>
        </select>
      </div>

      {/* Note */}
      <div style={{ fontSize: 12, color: "#444", marginBottom: 18, lineHeight: 1.5 }}>
        <span style={{ color: GREEN, fontWeight: 700 }}>Issued</span> = BIB collected (BIB collection day = t-shirt issuance).
        <span style={{ color: "#555" }}> Only active registrations with paid/free payment status are counted.</span>
      </div>

      {loading && !data && (
        <div style={{ color: "#888", padding: 60, textAlign: "center" }}>Loading…</div>
      )}

      {data && (
        <>
          {/* Size breakdown */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
            {groupFilter !== "child" && (
              <SizeTable title="Adult Sizes" rows={data.adult_sizes} accent={ACCENT} />
            )}
            {groupFilter !== "adult" && (
              <SizeTable title="Child Sizes" rows={data.child_sizes} accent="#6366f1" />
            )}
          </div>

          {/* Participant list */}
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>
                Participants
                <span style={{ fontSize: 11, fontWeight: 400, color: "#555", marginLeft: 8 }}>
                  {data.total_list} match{data.total_list !== 1 ? "es" : ""}
                </span>
              </div>
              {loading && <span style={{ fontSize: 11, color: "#555" }}>Refreshing…</span>}
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    {["Name", "Category", "Type", "Size", "Issued", "Registration", "Mobile"].map(h => (
                      <th key={h} style={{ padding: "9px 14px", textAlign: "left", color: "#555", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.participants.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "#444" }}>No participants match the current filters</td></tr>
                  ) : data.participants.map((p, i) => (
                    <tr key={p.id} style={{ borderBottom: i < data.participants.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none" }}>
                      <td style={{ padding: "8px 14px", color: "#ccc", fontWeight: 600, whiteSpace: "nowrap" }}>{p.name}</td>
                      <td style={{ padding: "8px 14px", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: 12, color: p.category_color, fontWeight: 600 }}>{p.category}</span>
                      </td>
                      <td style={{ padding: "8px 14px" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 5,
                          color: p.participant_type === "child" ? "#a78bfa" : "#888",
                          background: p.participant_type === "child" ? "rgba(167,139,250,0.1)" : "rgba(255,255,255,0.04)" }}>
                          {p.participant_type}
                        </span>
                      </td>
                      <td style={{ padding: "8px 14px" }}>
                        {p.tshirt_size ? (
                          <span style={{ fontWeight: 800, color: ACCENT, background: "rgba(232,98,10,0.1)", padding: "2px 9px", borderRadius: 6, fontSize: 13 }}>
                            {p.tshirt_size}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: "#444" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "8px 14px" }}>
                        {p.issued ? (
                          <span style={{ fontSize: 11, fontWeight: 700, color: GREEN, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 5, padding: "2px 8px", whiteSpace: "nowrap" }}>
                            ✓ Issued{p.issued_at ? ` · ${new Date(p.issued_at).toLocaleDateString("en-IN")}` : ""}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#f87171", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 5, padding: "2px 8px" }}>
                            Pending
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "8px 14px" }}>
                        <code style={{ fontSize: 11, color: ACCENT }}>{p.registration_code}</code>
                      </td>
                      <td style={{ padding: "8px 14px", color: "#666", fontSize: 12, fontFamily: "monospace", whiteSpace: "nowrap" }}>{p.mobile}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data.total_list > data.limit && (
              <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.05)", justifyContent: "center", alignItems: "center" }}>
                <button disabled={listPage === 0} onClick={() => setListPage(p => p - 1)}
                  style={{ padding: "6px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: listPage === 0 ? "#333" : "#ccc", cursor: listPage === 0 ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                  ← Prev
                </button>
                <span style={{ fontSize: 12, color: "#555" }}>
                  {listPage * data.limit + 1}–{Math.min((listPage + 1) * data.limit, data.total_list)} of {data.total_list}
                </span>
                <button disabled={(listPage + 1) * data.limit >= data.total_list} onClick={() => setListPage(p => p + 1)}
                  style={{ padding: "6px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: (listPage + 1) * data.limit >= data.total_list ? "#333" : "#ccc", cursor: (listPage + 1) * data.limit >= data.total_list ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                  Next →
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
