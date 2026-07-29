"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface ImportJob {
  id: string; entity_type: string; status: string; file_name: string;
  total_rows: number; valid_rows: number; error_rows: number; created_rows: number;
  error_message: string | null; created_by: string; created_at: string;
}

interface ExportJob {
  id: string; dataset: string; format: string; status: string;
  row_count: number | null; file_path: string | null; error: string | null;
  created_at: string; completed_at: string | null; downloadUrl?: string | null;
}

const ENTITY_TYPES = ["participants", "registrations", "volunteers", "merchandise", "sponsors", "coupons"];
const EXPORT_DATASETS = ["users", "memberships", "registrations", "referrals"];

const STATUS_COLOR: Record<string, string> = {
  validated: "#34d399", validated_errors: "#fbbf24", committing: "#a5b4fc",
  done: "#34d399", error: "#f87171", validating: "#fbbf24",
};

const S: Record<string, React.CSSProperties> = {
  page:   { padding: "28px 24px", maxWidth: 860, margin: "0 auto" },
  title:  { fontSize: "1.3rem", fontWeight: 700, color: "#fff", margin: "0 0 8px" },
  sub:    { color: "rgba(255,255,255,0.45)", fontSize: "0.85rem", marginBottom: 28 },
  card:   { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10, padding: "20px 20px", marginBottom: 12 },
  label:  { fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, display: "block" },
  select: { padding: "8px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "#fff", fontSize: "0.83rem", fontFamily: "inherit" },
  btn:    { padding: "8px 16px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 7, fontSize: "0.83rem", fontWeight: 600, cursor: "pointer" },
  btnSm:  { padding: "5px 10px", background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, fontSize: "0.78rem", cursor: "pointer" },
  btnGrn: { padding: "8px 16px", background: "#059669", color: "#fff", border: "none", borderRadius: 7, fontSize: "0.83rem", fontWeight: 600, cursor: "pointer" },
  row:    { display: "flex", gap: 10, flexWrap: "wrap" as const, alignItems: "center" },
};

function fmtDate(d: string) { return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }

export default function ImportPage() {
  const [tab,           setTab]          = useState<"import" | "export">("import");
  const [jobs,          setJobs]         = useState<ImportJob[]>([]);
  const [loading,       setLoading]      = useState(true);
  const [error,         setError]        = useState("");
  const [entityType,    setEntityType]   = useState("participants");
  const [uploading,     setUploading]    = useState(false);
  const [uploadResult,  setUploadResult] = useState<{ can_commit: boolean; message: string; data: ImportJob & { error_sample: unknown[] } } | null>(null);
  const [committing,    setCommitting]   = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Export state
  const [exportDataset,  setExportDataset]  = useState("registrations");
  const [exportFormat,   setExportFormat]   = useState<"csv" | "zip">("csv");
  const [exporting,      setExporting]      = useState(false);
  const [exportJobs,     setExportJobs]     = useState<ExportJob[]>([]);
  const [pollingId,      setPollingId]      = useState<string | null>(null);

  async function loadJobs() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/import");
      const d = await r.json();
      setJobs(d.data ?? []);
    } catch { /* ignore */ }
    finally  { setLoading(false); }
  }

  const loadExportJobs = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/export");
      const d = await r.json();
      setExportJobs(d.data ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadJobs(); loadExportJobs(); }, [loadExportJobs]);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Select a CSV file first."); return; }
    setError(""); setUploading(true); setUploadResult(null);
    try {
      const form = new FormData();
      form.append("entity_type", entityType);
      form.append("file", file);
      const r = await fetch("/api/admin/import", { method: "POST", body: form });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Upload failed"); return; }
      setUploadResult(d);
      loadJobs();
    } catch { setError("Network error"); }
    finally  { setUploading(false); }
  }

  async function startExport() {
    setExporting(true); setError("");
    try {
      const r = await fetch("/api/admin/export", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset: exportDataset, format: exportFormat, filters: {} }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Export failed"); return; }
      setPollingId(d.id ?? null);
      await loadExportJobs();
    } catch { setError("Network error"); }
    finally { setExporting(false); }
  }

  // Poll the active export until done
  useEffect(() => {
    if (!pollingId) return;
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`/api/admin/export/${pollingId}`);
        const d = await r.json() as ExportJob & { downloadUrl?: string };
        if (d.status === "ready" || d.status === "error") {
          setPollingId(null);
          setExportJobs(prev => prev.map(j => j.id === pollingId ? { ...j, ...d } : j));
        }
      } catch { /* ignore */ }
    }, 2500);
    return () => clearInterval(iv);
  }, [pollingId]);

  async function commit(id: string) {
    if (!confirm("Commit this import? Rows will be inserted into the database.")) return;
    setCommitting(id);
    try {
      const r = await fetch(`/api/admin/import/${id}/commit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Commit failed"); return; }
      setUploadResult(null);
      loadJobs();
    } catch { setError("Network error"); }
    finally  { setCommitting(null); }
  }

  const TAB_S = (active: boolean): React.CSSProperties => ({
    padding: "8px 16px", fontSize: "0.85rem", background: "none", border: "none",
    cursor: "pointer", fontFamily: "inherit", fontWeight: active ? 600 : 400,
    color: active ? "#fff" : "rgba(255,255,255,0.45)",
    borderBottom: active ? "2px solid #6366f1" : "2px solid transparent",
  });

  return (
    <div style={S.page}>
      <h1 style={S.title}>📥 Import / Export</h1>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid rgba(255,255,255,0.09)", marginBottom: 24 }}>
        <button style={TAB_S(tab === "import")} onClick={() => setTab("import")}>Import CSV</button>
        <button style={TAB_S(tab === "export")} onClick={() => setTab("export")}>Export Data</button>
      </div>

      {error && <div style={{ color: "#f87171", marginBottom: 12, fontSize: "0.85rem" }}>{error}</div>}

      {tab === "export" && (
        <div>
          <p style={S.sub}>Export data as CSV for offline analysis or backup. Exports run in the background.</p>

          <div style={S.card}>
            <div style={{ fontWeight: 600, color: "#fff", marginBottom: 16 }}>New Export</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <label style={S.label}>Dataset</label>
                <select style={S.select} value={exportDataset} onChange={e => setExportDataset(e.target.value)}>
                  {EXPORT_DATASETS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Format</label>
                <select style={S.select} value={exportFormat} onChange={e => setExportFormat(e.target.value as "csv" | "zip")}>
                  <option value="csv">CSV</option>
                  <option value="zip">ZIP (with images)</option>
                </select>
              </div>
              <button style={S.btn} onClick={startExport} disabled={exporting}>
                {exporting ? "Queuing…" : "Export"}
              </button>
            </div>
          </div>

          <div style={{ fontWeight: 600, color: "rgba(255,255,255,0.6)", fontSize: "0.83rem", marginBottom: 10 }}>Recent Exports</div>
          {exportJobs.length === 0 ? (
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.85rem", textAlign: "center", padding: "30px 0" }}>No exports yet.</div>
          ) : exportJobs.map(j => (
            <div key={j.id} style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <span style={{ fontWeight: 600, color: "#fff" }}>{j.dataset}</span>
                  <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", marginLeft: 8 }}>{j.format.toUpperCase()}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: "0.78rem", color: j.status === "ready" ? "#34d399" : j.status === "error" ? "#f87171" : j.status === "pending" || j.status === "processing" ? "#fbbf24" : "rgba(255,255,255,0.5)" }}>
                    {j.status === "pending" || j.status === "processing" ? "⟳ " : ""}{j.status}
                  </span>
                  {j.status === "ready" && j.downloadUrl && (
                    <a href={j.downloadUrl} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: "0.78rem", color: "#6366f1", textDecoration: "none", border: "1px solid rgba(99,102,241,0.4)", borderRadius: 5, padding: "2px 10px", fontWeight: 600 }}>
                      ↓ Download
                    </a>
                  )}
                </div>
              </div>
              {j.row_count != null && <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{j.row_count.toLocaleString()} rows</div>}
              {j.error && <div style={{ fontSize: "0.77rem", color: "#f87171", marginTop: 4 }}>{j.error}</div>}
              <div style={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.25)", marginTop: 6 }}>{fmtDate(j.created_at)}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "import" && (
      <>
      <p style={S.sub}>Upload a CSV to validate and import records. Rows are validated before any data is written.</p>

      {/* Upload form */}
      <div style={S.card}>
        <div style={{ fontWeight: 600, color: "#fff", marginBottom: 16 }}>Upload CSV</div>
        <div style={S.row}>
          <div>
            <label style={S.label}>Entity Type</label>
            <select style={S.select} value={entityType} onChange={e => setEntityType(e.target.value)}>
              {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>CSV File</label>
            <input ref={fileRef} type="file" accept=".csv" style={{ fontSize: "0.83rem", color: "rgba(255,255,255,0.7)" }} />
          </div>
          <button style={{ ...S.btn, alignSelf: "flex-end" }} onClick={upload} disabled={uploading}>
            {uploading ? "Validating…" : "Validate & Upload"}
          </button>
        </div>

        {uploadResult && (
          <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 8, background: uploadResult.can_commit ? "rgba(52,211,153,0.08)" : "rgba(251,191,36,0.08)", border: `1px solid ${uploadResult.can_commit ? "rgba(52,211,153,0.25)" : "rgba(251,191,36,0.25)"}` }}>
            <div style={{ fontSize: "0.85rem", color: uploadResult.can_commit ? "#34d399" : "#fbbf24", marginBottom: 8 }}>{uploadResult.message}</div>
            <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.5)", marginBottom: 10 }}>
              {uploadResult.data.total_rows} rows · {uploadResult.data.valid_rows} valid · {uploadResult.data.error_rows} errors
            </div>
            {uploadResult.can_commit && (
              <button style={S.btnGrn} onClick={() => commit(uploadResult.data.id)} disabled={committing === uploadResult.data.id}>
                {committing === uploadResult.data.id ? "Committing…" : "Commit Import"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Job history */}
      <div style={{ fontWeight: 600, color: "rgba(255,255,255,0.6)", fontSize: "0.83rem", marginBottom: 10, marginTop: 8 }}>Import History</div>
      {loading ? (
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.85rem" }}>Loading…</div>
      ) : jobs.length === 0 ? (
        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.85rem", textAlign: "center", padding: "30px 0" }}>No imports yet.</div>
      ) : jobs.map(j => (
        <div key={j.id} style={S.card}>
          <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontWeight: 600, color: "#fff", fontSize: "0.9rem" }}>{j.file_name}</span>
            <span style={{ fontSize: "0.78rem", color: STATUS_COLOR[j.status] ?? "rgba(255,255,255,0.5)" }}>{j.status}</span>
          </div>
          <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
            {j.entity_type} · {j.total_rows} rows · {j.valid_rows} valid · {j.error_rows} errors
            {j.status === "done" && ` · ${j.created_rows} imported`}
          </div>
          {j.error_message && <div style={{ fontSize: "0.77rem", color: "#f87171" }}>{j.error_message}</div>}
          <div style={{ ...S.row, justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.3)" }}>{fmtDate(j.created_at)} by {j.created_by}</span>
            {j.status === "validated" && j.error_rows === 0 && (
              <button style={S.btnGrn} onClick={() => commit(j.id)} disabled={committing === j.id}>
                {committing === j.id ? "Committing…" : "Commit"}
              </button>
            )}
          </div>
        </div>
      ))}
      </>
      )}
    </div>
  );
}
