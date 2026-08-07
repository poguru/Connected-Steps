"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { Card, Button, Badge, Spinner, Alert } from "@/components/ui/ds";

interface PreviewRow {
  row: number; full_name: string; company_name?: string; email?: string;
  mobile?: string; whatsapp_number?: string; city?: string; state?: string;
  tags?: string[]; email_consent?: boolean; errors: string[]; warnings: string[];
  isDuplicate?: { field: string; existingId: string };
}

interface PreviewResult {
  preview: PreviewRow[]; total: number; valid: number; errors: number; duplicates: number;
}

interface ImportResult {
  imported: number; updated: number; skipped: number; failed: number;
  errors: Array<{ row: number; message: string }>; import_id: string;
}

const inp: React.CSSProperties = {
  padding: "7px 11px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6, color: "#fff", fontSize: "0.82rem", outline: "none", fontFamily: "inherit",
};

export default function ImportContactsPage() {
  const [step,             setStep]             = useState<"upload" | "preview" | "done">("upload");
  const [file,             setFile]             = useState<File | null>(null);
  const [preview,          setPreview]          = useState<PreviewResult | null>(null);
  const [result,           setResult]           = useState<ImportResult | null>(null);
  const [loading,          setLoading]          = useState(false);
  const [alert,            setAlert]            = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [dupHandling,      setDupHandling]      = useState("skip");
  const [compliance,       setCompliance]       = useState(false);
  const [listIds,          setListIds]          = useState<string[]>([]);
  const [lists,            setLists]            = useState<{ id: string; name: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadLists = useCallback(async () => {
    const res = await fetch("/api/admin/contact-lists");
    const d   = await res.json();
    setLists(d.lists ?? []);
  }, []);

  useState(() => { loadLists(); });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(null);
    setAlert(null);
  }

  async function handlePreview() {
    if (!file) return;
    setLoading(true); setAlert(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("dry_run", "true");

    const res = await fetch("/api/admin/external-contacts/import", { method: "POST", body: fd });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setAlert({ type: "error", msg: data.error ?? "Preview failed" }); return; }
    setPreview(data);
    setStep("preview");
  }

  async function handleImport() {
    if (!file || !compliance) return;
    setLoading(true); setAlert(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("dry_run", "false");
    fd.append("duplicate_handling", dupHandling);
    fd.append("compliance_acknowledged", "true");
    if (listIds.length) fd.append("list_ids", JSON.stringify(listIds));

    const res  = await fetch("/api/admin/external-contacts/import", { method: "POST", body: fd });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setAlert({ type: "error", msg: data.error ?? "Import failed" }); return; }
    setResult(data);
    setStep("done");
  }

  function toggleListId(id: string) {
    setListIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: 860, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: "0.72rem", color: "#555", marginBottom: 4 }}>
          <Link href="/admin/contacts" style={{ color: "#555", textDecoration: "none" }}>Contacts</Link> /
        </div>
        <h1 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "#fff" }}>📥 Import Contacts</h1>
        <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#555" }}>Upload Excel (.xlsx) or CSV — up to 10,000 contacts per import</p>
      </div>

      {alert && <Alert variant={alert.type === "success" ? "success" : "error"} style={{ marginBottom: 14 }}>{alert.msg}</Alert>}

      {/* Step: Done */}
      {step === "done" && result && (
        <Card style={{ padding: "1.5rem" }}>
          <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#4ade80", marginBottom: 16 }}>✅ Import Complete</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Imported", value: result.imported, color: "#4ade80" },
              { label: "Updated",  value: result.updated,  color: "#60a5fa" },
              { label: "Skipped",  value: result.skipped,  color: "#facc15" },
              { label: "Failed",   value: result.failed,   color: "#f87171" },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center", padding: "12px", background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: "0.72rem", color: "#555", textTransform: "uppercase", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          {result.errors.length > 0 && (
            <div style={{ background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "12px 16px", marginBottom: 16 }}>
              <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#f87171", marginBottom: 8 }}>Errors ({result.errors.length})</div>
              {result.errors.slice(0,10).map(e => (
                <div key={e.row} style={{ fontSize: "0.72rem", color: "#888", marginBottom: 2 }}>Row {e.row}: {e.message}</div>
              ))}
              {result.errors.length > 10 && <div style={{ fontSize: "0.7rem", color: "#444" }}>+{result.errors.length - 10} more errors in import log</div>}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/admin/contacts"><Button variant="primary" size="sm">View Contacts →</Button></Link>
            <Button variant="ghost" size="sm" onClick={() => { setStep("upload"); setFile(null); setPreview(null); setResult(null); setCompliance(false); }}>Import Another File</Button>
          </div>
        </Card>
      )}

      {/* Step: Preview */}
      {step === "preview" && preview && (
        <>
          {/* Summary */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
            {[
              { label: "Total Rows", value: preview.total,      color: "#fff" },
              { label: "Valid",      value: preview.valid,       color: "#4ade80" },
              { label: "With Errors",value: preview.errors,      color: "#f87171" },
              { label: "Duplicates", value: preview.duplicates,  color: "#facc15" },
            ].map(s => (
              <Card key={s.label} style={{ padding: "0.85rem", textAlign: "center" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginTop: 3 }}>{s.label}</div>
              </Card>
            ))}
          </div>

          {/* Options */}
          <Card style={{ padding: "1.25rem", marginBottom: 16 }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#fff", marginBottom: 12 }}>Import Options</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#555", textTransform: "uppercase", marginBottom: 6 }}>Duplicate Handling</label>
                <select value={dupHandling} onChange={e => setDupHandling(e.target.value)} style={inp}>
                  <option value="skip">Skip duplicates (default)</option>
                  <option value="update">Update existing with new data</option>
                  <option value="merge">Merge: update only empty fields</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#555", textTransform: "uppercase", marginBottom: 6 }}>Add to Lists (optional)</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {lists.map(l => (
                    <button key={l.id} type="button" onClick={() => toggleListId(l.id)}
                      style={{ padding: "3px 10px", borderRadius: 100, fontSize: "0.72rem", cursor: "pointer", fontFamily: "inherit",
                        background: listIds.includes(l.id) ? "rgba(232,98,10,0.2)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${listIds.includes(l.id) ? "#e8620a" : "rgba(255,255,255,0.1)"}`,
                        color: listIds.includes(l.id) ? "#e8620a" : "#666" }}>
                      {l.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Preview table */}
          <Card style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: "0.78rem", color: "#888" }}>
              Showing first {preview.preview.length} rows of {preview.total}
            </div>
            <div style={{ overflowX: "auto", maxHeight: 400, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                <thead style={{ position: "sticky", top: 0, background: "#111" }}>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    {["Row","Name","Company","Email","Mobile","Consent","Status"].map(h => (
                      <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(255,255,255,0.35)", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map(row => {
                    const hasError   = row.errors.length > 0;
                    const isDup      = !!row.isDuplicate;
                    const hasWarning = row.warnings?.length > 0;
                    return (
                      <tr key={row.row} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: hasError ? "rgba(248,113,113,0.04)" : isDup ? "rgba(250,204,21,0.04)" : "transparent" }}>
                        <td style={{ padding: "6px 10px", color: "#555", fontVariantNumeric: "tabular-nums" }}>{row.row}</td>
                        <td style={{ padding: "6px 10px", color: hasError ? "#f87171" : "#fff", fontWeight: 600 }}>{row.full_name || <span style={{ color: "#f87171" }}>MISSING</span>}</td>
                        <td style={{ padding: "6px 10px", color: "#888" }}>{row.company_name ?? "—"}</td>
                        <td style={{ padding: "6px 10px", color: "#60a5fa" }}>{row.email ?? "—"}</td>
                        <td style={{ padding: "6px 10px", color: "#888", fontVariantNumeric: "tabular-nums" }}>{row.mobile ?? "—"}</td>
                        <td style={{ padding: "6px 10px" }}>{row.email_consent ? "📧" : "—"}</td>
                        <td style={{ padding: "6px 10px" }}>
                          {hasError   && <span style={{ color: "#f87171", fontSize: "0.7rem" }}>❌ {row.errors.join("; ")}</span>}
                          {isDup      && !hasError && <span style={{ color: "#facc15", fontSize: "0.7rem" }}>⚠ Duplicate ({row.isDuplicate!.field})</span>}
                          {hasWarning && !hasError && !isDup && <span style={{ color: "#fb923c", fontSize: "0.7rem" }}>{row.warnings[0]}</span>}
                          {!hasError && !isDup && !hasWarning && <span style={{ color: "#4ade80", fontSize: "0.7rem" }}>✓</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Compliance + confirm */}
          <Card style={{ padding: "1.25rem" }}>
            <label style={{ display: "flex", gap: 12, cursor: "pointer", alignItems: "flex-start" }}>
              <input type="checkbox" checked={compliance} onChange={e => setCompliance(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
              <span style={{ fontSize: "0.82rem", color: "#888", lineHeight: 1.6 }}>
                I confirm that I have permission to contact all imported recipients and that these contacts comply with applicable privacy and anti-spam regulations, including the Information Technology Act, 2000 and TRAI guidelines.
              </span>
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <Button variant="ghost" size="sm" onClick={() => setStep("upload")}>← Back</Button>
              <Button variant="primary" size="sm" onClick={handleImport} disabled={!compliance || loading || preview.valid === 0}>
                {loading ? "Importing…" : `Import ${preview.valid} contacts`}
              </Button>
            </div>
          </Card>
        </>
      )}

      {/* Step: Upload */}
      {step === "upload" && (
        <>
          <Card style={{ padding: "1.5rem", marginBottom: 16 }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#fff", marginBottom: 12 }}>Upload File</div>

            <div
              onClick={() => fileRef.current?.click()}
              style={{ border: "2px dashed rgba(255,255,255,0.1)", borderRadius: 10, padding: "40px 20px", textAlign: "center", cursor: "pointer", transition: "border-color 0.15s" }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { const dt = new DataTransfer(); dt.items.add(f); if (fileRef.current) { fileRef.current.files = dt.files; handleFileChange({ target: fileRef.current } as React.ChangeEvent<HTMLInputElement>); } } }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📤</div>
              <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "#fff" }}>
                {file ? file.name : "Click to upload or drag & drop"}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#555", marginTop: 4 }}>Excel (.xlsx) or CSV — max 10,000 rows</div>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} style={{ display: "none" }} />

            {file && (
              <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.8rem", color: "#888" }}>
                  {file.name} · {(file.size / 1024).toFixed(1)} KB
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button variant="ghost" size="sm" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}>Remove</Button>
                  <Button variant="primary" size="sm" onClick={handlePreview} disabled={loading}>
                    {loading ? <><span style={{ display: "inline-block", marginRight: 6 }}><Spinner /></span>Parsing…</> : "Preview →"}
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Download sample */}
          <Card style={{ padding: "1rem 1.25rem", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#fff" }}>Sample Template</div>
                <div style={{ fontSize: "0.72rem", color: "#555", marginTop: 2 }}>Download and fill in — then re-upload</div>
              </div>
              <a href="/api/admin/external-contacts/sample">
                <Button variant="outline" size="sm">⬇ Download CSV Template</Button>
              </a>
            </div>
          </Card>

          {/* Column guide */}
          <Card style={{ padding: "1rem 1.25rem" }}>
            <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#fff", marginBottom: 10 }}>Expected Columns</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6 }}>
              {[
                ["Name *",      "Full name of the contact"],
                ["Company",     "Organisation / company name"],
                ["Designation", "Job title or role"],
                ["Email",       "Email address"],
                ["Mobile",      "10-digit or +91 format"],
                ["WhatsApp",    "WhatsApp number"],
                ["City",        "City"],
                ["State",       "State"],
                ["Country",     "Default: India"],
                ["Tags",        "Comma-separated tags"],
                ["Email Consent","Yes / No"],
                ["WhatsApp Consent","Yes / No"],
                ["Notes",       "Internal notes"],
              ].map(([col, desc]) => (
                <div key={col} style={{ fontSize: "0.72rem", color: "#888" }}>
                  <span style={{ color: "#fff", fontWeight: 600 }}>{col}</span> — {desc}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
