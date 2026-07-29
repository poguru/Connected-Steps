"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, Button, Badge, Tabs, StatCard, EmptyState, Alert, Spinner } from "@/components/ui/ds";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Result {
  id:                string;
  user_name:         string;
  user_email:        string;
  bib_number:        string | null;
  distance_category: string | null;
  finish_time:       string | null;
  gun_time_secs:     number | null;
  chip_time_secs:    number | null;
  pace:              string | null;
  overall_position:  number | null;
  category_position: number | null;
  status:            string;
  registration_code: string | null;
}
interface Summary { total: number; finishers: number; dnf: number; dns: number; }

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  page:   { minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "inherit" } as React.CSSProperties,
  header: { position: "sticky" as const, top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" } as React.CSSProperties,
  input:  { width: "100%", padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const } as React.CSSProperties,
};

function statusBadge(s: string) {
  const colorMap: Record<string, "green" | "yellow" | "gray" | "red"> = { finisher:"green", dnf:"yellow", dns:"gray", dq:"red" };
  return <Badge color={colorMap[s] ?? "gray"} size="sm">{s.toUpperCase()}</Badge>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const params  = useParams();
  const eventId = params.id as string;

  const [tab,      setTab]      = useState<"results"|"import"|"certificates">("results");
  const [results,  setResults]  = useState<Result[]>([]);
  const [summary,  setSummary]  = useState<Summary | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [toast,    setToast]    = useState("");
  const [certStatus, setCertStatus] = useState({ total_finishers: 0, certificates_generated: 0 });

  // Import state
  const [csvText,    setCsvText]    = useState("");
  const [autoRank,   setAutoRank]   = useState(true);
  const [importing,  setImporting]  = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; failed: number } | null>(null);

  // Certificate state
  const [genLoading, setGenLoading] = useState(false);
  const [sendEmail,  setSendEmail]  = useState(false);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [resRes, certRes] = await Promise.all([
        fetch(`/api/admin/events/${eventId}/results`),
        fetch(`/api/admin/events/${eventId}/certificates`),
      ]);
      const resData  = await resRes.json();
      const certData = await certRes.json();
      setResults(resData.results ?? []);
      setSummary(resData.summary);
      setCertStatus(certData);
    } finally { setLoading(false); }
  }

  async function importCSV() {
    if (!csvText.trim()) { showToast("Paste CSV data first"); return; }
    setImporting(true); setImportResult(null);
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/results/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv: csvText, auto_rank: autoRank }) });
      const data = await res.json();
      if (res.ok) { setImportResult(data); showToast(`✅ Imported ${data.imported} results`); setCsvText(""); await loadAll(); }
      else showToast(`❌ ${data.error ?? "Import failed"}`);
    } finally { setImporting(false); }
  }

  async function generateCertificates() {
    setGenLoading(true);
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/certificates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ send_email: sendEmail, force: false }) });
      const data = await res.json();
      if (res.ok) { showToast(`✅ Generated ${data.generated} certificates${data.email_queued ? " + queued emails" : ""}`); await loadAll(); }
      else showToast(`❌ ${data.error ?? "Failed"}`);
    } finally { setGenLoading(false); }
  }

  const TABS = [
    { key: "results",      label: `Results (${results.length})` },
    { key: "import",       label: "Import CSV" },
    { key: "certificates", label: "Certificates" },
  ];

  const hasChip = results.some(r => r.chip_time_secs != null);
  function fmtSecs(s: number | null) {
    if (s == null) return null;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${m}:${String(sec).padStart(2,"0")}`;
  }

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href={`/admin/events/${eventId}/manage`} style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>← Event Hub</Link>
          <span style={{ color: "#333" }}>/</span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Results & Certificates</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button size="sm" variant="ghost" onClick={loadAll}>↻ Refresh</Button>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", background: "#0d0d0d" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Tabs tabs={TABS.map(t => ({ key: t.key, label: t.label }))} active={tab} onChange={k => setTab(k as typeof tab)} />
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "1.75rem 2rem" }}>

        {/* Results Tab */}
        {tab === "results" && (
          <div>
            {summary && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Total", value: summary.total },
                  { label: "Finishers", value: summary.finishers, color: "#4ade80" },
                  { label: "DNF", value: summary.dnf, color: "#fbbf24" },
                  { label: "DNS", value: summary.dns, color: "#555" },
                ].map(s => (
                  <StatCard key={s.label} label={s.label} value={s.value} color={s.color} />
                ))}
              </div>
            )}

            {loading ? (
              <div style={{ textAlign: "center", padding: "4rem" }}><Spinner /></div>
            ) : results.length === 0 ? (
              <EmptyState icon="📊" title="No results yet" body="Import results from a CSV file or enter them manually"
                action={<Button onClick={() => setTab("import")}>Import Results</Button>} />
            ) : (
              <Card style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      {["Pos", "BIB", "Name", "Category", "Finish Time", ...(hasChip ? ["Chip Time"] : []), "Pace", "Status"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left" as const, fontSize: 10, color: "#555", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".07em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map(r => (
                      <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ fontSize: 16, fontWeight: 900, color: r.overall_position === 1 ? "#fbbf24" : r.overall_position === 2 ? "#aaa" : r.overall_position === 3 ? "#cd7f32" : "#555" }}>
                            {r.overall_position ?? "—"}
                          </span>
                          {r.category_position && r.distance_category && (
                            <div style={{ fontSize: 10, color: "#555" }}>{r.category_position} in {r.distance_category}</div>
                          )}
                        </td>
                        <td style={{ padding: "10px 14px" }}><code style={{ color: "#e8620a", fontWeight: 700 }}>{r.bib_number ?? "—"}</code></td>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ fontWeight: 600 }}>{r.user_name}</div>
                          <div style={{ fontSize: 11, color: "#555" }}>{r.user_email}</div>
                        </td>
                        <td style={{ padding: "10px 14px", color: "#aaa" }}>{r.distance_category ?? "—"}</td>
                        <td style={{ padding: "10px 14px" }}><code style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{r.finish_time ?? "—"}</code></td>
                        {hasChip && (
                          <td style={{ padding: "10px 14px" }}>
                            {fmtSecs(r.chip_time_secs)
                              ? <code style={{ color: "#a78bfa", fontSize: 13, fontWeight: 600 }}>{fmtSecs(r.chip_time_secs)}</code>
                              : <span style={{ color: "#333" }}>—</span>}
                          </td>
                        )}
                        <td style={{ padding: "10px 14px", color: "#666" }}>{r.pace ?? "—"}</td>
                        <td style={{ padding: "10px 14px" }}>{statusBadge(r.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Import Tab */}
        {tab === "import" && (
          <div style={{ maxWidth: 680 }}>
            <Card>
              <Badge color="orange" style={{ marginBottom: 14 }}>Import Results from CSV</Badge>

              <div style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "12px 14px", marginBottom: 16, fontSize: 12, color: "#666" }}>
                <strong style={{ color: "#aaa" }}>Expected CSV columns</strong> (header row required):<br />
                <code style={{ color: "#e8620a" }}>bib_number, user_name, user_email, distance_category, finish_time, gun_time_secs, pace, overall_position, category_position, status</code>
                <br /><br />
                <strong style={{ color: "#aaa" }}>status values:</strong> finisher, dnf, dns, dq<br />
                <strong style={{ color: "#aaa" }}>finish_time format:</strong> "01:23:45" (h:mm:ss)<br />
                <strong style={{ color: "#aaa" }}>gun_time_secs:</strong> seconds from gun (used for auto-ranking)
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 11, color: "#555", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".07em", marginBottom: 6 }}>Paste CSV Data</label>
                <textarea
                  style={{ ...S.input, minHeight: 200, resize: "vertical" as const }}
                  value={csvText}
                  onChange={e => setCsvText(e.target.value)}
                  placeholder={"bib_number,user_name,user_email,distance_category,finish_time,gun_time_secs,pace,status\n001,Ravi Kumar,ravi@gmail.com,5K,00:25:42,1542,5:08 /km,finisher\n002,Priya S,priya@gmail.com,10K,00:52:11,3131,5:13 /km,finisher"}
                />
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#ccc", marginBottom: 16 }}>
                <input type="checkbox" checked={autoRank} onChange={e => setAutoRank(e.target.checked)} />
                Auto-compute positions from gun_time_secs after import
              </label>

              <Button loading={importing} disabled={!csvText.trim()} onClick={importCSV}>Import Results</Button>
              {importResult && (
                <Alert variant="success" style={{ marginTop: 14 }}>
                  ✅ Imported <strong>{importResult.imported}</strong> results
                  {importResult.failed > 0 && ` · ❌ ${importResult.failed} failed`}
                </Alert>
              )}
            </Card>
          </div>
        )}

        {/* Certificates Tab */}
        {tab === "certificates" && (
          <div style={{ maxWidth: 560 }}>
            <Card style={{ marginBottom: 16 }}>
              <Badge color="orange" style={{ marginBottom: 14 }}>Certificate Status</Badge>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <StatCard label="Generated"      value={certStatus.certificates_generated} color="#4ade80" />
                <StatCard label="Total Finishers" value={certStatus.total_finishers} />
              </div>
              <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
                Certificates are generated as printable HTML pages stored in Supabase Storage.
                Participants can print-to-PDF from their browser. Each certificate includes their
                name, event, distance, finish time, and position.
              </p>

              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#ccc", marginBottom: 16 }}>
                <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} />
                Email certificates to participants after generation
              </label>

              <Button loading={genLoading} disabled={certStatus.total_finishers === 0} onClick={generateCertificates}>
                {`Generate ${certStatus.total_finishers - certStatus.certificates_generated} Missing Certificates`}
              </Button>
              {certStatus.total_finishers === 0 && (
                <p style={{ fontSize: 12, color: "#555", marginTop: 10 }}>Import results first to generate certificates.</p>
              )}
            </Card>

            <Alert variant="warning">
              <strong>Required: Create Storage Bucket</strong><br />
              In Supabase Dashboard → Storage → New bucket:<br />
              Name: <code>event-certificates</code> · Public: off (private)
            </Alert>
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 24, padding: "10px 20px", fontSize: 13, fontWeight: 600, color: "#fff", zIndex: 9999, whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
