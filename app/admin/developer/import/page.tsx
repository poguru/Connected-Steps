"use client";

import { useState, useEffect, useRef } from "react";

interface ImportJob {
  id: string; entity_type: string; status: string; file_name: string;
  total_rows: number; valid_rows: number; error_rows: number; created_rows: number;
  error_message: string | null; created_by: string; created_at: string;
}

const ENTITY_TYPES = ["participants", "registrations", "volunteers", "merchandise", "sponsors", "coupons"];

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
  const [jobs,          setJobs]         = useState<ImportJob[]>([]);
  const [loading,       setLoading]      = useState(true);
  const [error,         setError]        = useState("");
  const [entityType,    setEntityType]   = useState("participants");
  const [uploading,     setUploading]    = useState(false);
  const [uploadResult,  setUploadResult] = useState<{ can_commit: boolean; message: string; data: ImportJob & { error_sample: unknown[] } } | null>(null);
  const [committing,    setCommitting]   = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadJobs() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/import");
      const d = await r.json();
      setJobs(d.data ?? []);
    } catch { /* ignore */ }
    finally  { setLoading(false); }
  }

  useEffect(() => { loadJobs(); }, []);

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

  return (
    <div style={S.page}>
      <h1 style={S.title}>📥 Import / Export</h1>
      <p style={S.sub}>Upload a CSV to validate and import records. Rows are validated before any data is written.</p>

      {error && <div style={{ color: "#f87171", marginBottom: 12, fontSize: "0.85rem" }}>{error}</div>}

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
    </div>
  );
}
