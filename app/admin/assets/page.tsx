"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Button, Alert } from "@/components/ui/ds";

interface AssetItem {
  name:       string;
  path:       string;
  is_folder:  boolean;
  size:       number | null;
  mime_type:  string | null;
  created_at: string | null;
  url:        string | null;
}

const S: Record<string, React.CSSProperties> = {
  page:     { minHeight: "100vh", background: "#080808", color: "#fff", fontFamily: "'Inter',system-ui,sans-serif" },
  nav:      { position: "sticky", top: 0, zIndex: 40, background: "rgba(8,8,8,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 20px", height: 52, display: "flex", alignItems: "center", gap: 16 },
  main:     { maxWidth: 1100, margin: "0 auto", padding: "20px 16px 80px" },
  card:     { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 },
};

function fmtBytes(b: number | null): string {
  if (!b) return "—";
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  return `${Math.round(b / 1024)} KB`;
}

function isImage(mimeType: string | null): boolean {
  return !!mimeType && mimeType.startsWith("image/");
}

function fileIcon(mimeType: string | null): string {
  if (!mimeType) return "📁";
  if (mimeType.startsWith("image/")) return "🖼";
  if (mimeType === "application/pdf") return "📄";
  return "📎";
}

export default function AssetLibraryPage() {
  const [folder,    setFolder]    = useState("shared");
  const [items,     setItems]     = useState<AssetItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState("");
  const [toast,     setToast]     = useState("");
  const [deleting,  setDeleting]  = useState<string | null>(null);
  const [preview,   setPreview]   = useState<AssetItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3000); };

  const load = useCallback(async (f: string) => {
    setLoading(true); setError("");
    try {
      const res  = await fetch(`/api/admin/assets?folder=${encodeURIComponent(f)}`);
      if (!res.ok) { setError("Failed to load assets"); return; }
      const data = await res.json() as { items: AssetItem[] };
      setItems(data.items ?? []);
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(folder); }, [folder, load]);

  function navigate(f: string) { setFolder(f); setItems([]); }

  // Breadcrumb segments from folder path
  function breadcrumbs() {
    const parts = folder.split("/").filter(Boolean);
    return parts;
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true); setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", folder);
      const res  = await fetch("/api/admin/assets/upload", { method: "POST", body: form });
      const data = await res.json() as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !data.ok) { setError(data.error ?? "Upload failed"); return; }
      showToast(`✅ Uploaded · URL copied to clipboard`);
      if (data.url) await navigator.clipboard.writeText(data.url).catch(() => {});
      void load(folder);
    } catch { setError("Network error"); }
    finally { setUploading(false); }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      showToast("✅ URL copied to clipboard");
    } catch { showToast("❌ Clipboard unavailable — select and copy the URL manually"); }
  }

  async function deleteFile(path: string) {
    if (!confirm(`Delete ${path.split("/").pop()}? This cannot be undone.`)) return;
    setDeleting(path);
    try {
      const res = await fetch(`/api/admin/assets?path=${encodeURIComponent(path)}`, { method: "DELETE" });
      if (res.ok) { showToast("🗑 File deleted"); void load(folder); }
      else { const d = await res.json() as { error?: string }; setError(d.error ?? "Delete failed"); }
    } catch { setError("Network error"); }
    finally { setDeleting(null); }
  }

  const crumbs = breadcrumbs();
  const files   = items.filter(i => !i.is_folder);
  const folders = items.filter(i => i.is_folder);

  return (
    <div style={S.page}>
      <nav style={S.nav}>
        <Link href="/admin" style={{ fontSize: 13, color: "#888", textDecoration: "none" }}>← Admin</Link>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Asset Library</span>
        <span style={{ fontSize: 11, color: "#555" }}>event-media bucket</span>
      </nav>

      {toast && (
        <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 999, padding: "10px 20px", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, fontSize: 13, color: "#fff", whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}

      {preview && (
        <div onClick={() => setPreview(null)} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: 860, width: "100%", background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{preview.name}</div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: 12 }}>
                <button onClick={() => { void copyUrl(preview.url!); }} style={{ padding: "5px 12px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "#ccc", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Copy URL</button>
                <button onClick={() => setPreview(null)} style={{ background: "none", border: "none", color: "#555", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
              </div>
            </div>
            {isImage(preview.mime_type) ? (
              <img src={preview.url!} alt={preview.name} style={{ width: "100%", height: "auto", maxHeight: "80vh", objectFit: "contain", display: "block" }} />
            ) : (
              <div style={{ padding: 32, textAlign: "center" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>{fileIcon(preview.mime_type)}</div>
                <div style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>{preview.mime_type} · {fmtBytes(preview.size)}</div>
                <a href={preview.url!} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", padding: "10px 20px", background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.25)", borderRadius: 8, color: "#60a5fa", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                  Open in new tab ↗
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={S.main}>

        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          {/* Breadcrumb */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#555", flexWrap: "wrap" }}>
            <button onClick={() => navigate("shared")} style={{ background: "none", border: "none", color: folder === "shared" ? "#fff" : "#60a5fa", fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: 0, fontWeight: 600 }}>
              shared
            </button>
            {crumbs.filter(c => c !== "shared").map((c, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>/</span>
                <span style={{ color: i === crumbs.length - 2 ? "#fff" : "#60a5fa", fontWeight: 600 }}>{c}</span>
              </span>
            ))}
          </div>

          {/* Shortcut folders */}
          <div style={{ display: "flex", gap: 6 }}>
            {["shared"].map(f => (
              <button key={f} onClick={() => navigate(f)} style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${folder === f ? "rgba(232,98,10,0.4)" : "rgba(255,255,255,0.1)"}`, background: folder === f ? "rgba(232,98,10,0.12)" : "rgba(255,255,255,0.04)", color: folder === f ? "#e8620a" : "#888", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                📁 {f}
              </button>
            ))}
          </div>

          {/* Upload */}
          <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.svg,.pdf,image/*,application/pdf" style={{ display: "none" }} onChange={handleUpload} />
          <Button size="sm" loading={uploading} onClick={() => fileInputRef.current?.click()}>
            ↑ Upload
          </Button>
        </div>

        {/* Folder path input for navigating by event ID */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#555", flexShrink: 0 }}>Browse folder:</span>
          <input
            defaultValue={folder}
            key={folder}
            onKeyDown={e => { if (e.key === "Enter") navigate((e.target as HTMLInputElement).value.trim() || "shared"); }}
            onBlur={e => { const v = e.target.value.trim(); if (v && v !== folder) navigate(v); }}
            placeholder="shared or event UUID"
            style={{ flex: 1, maxWidth: 320, padding: "6px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontSize: 12, outline: "none", fontFamily: "inherit" }}
          />
          <span style={{ fontSize: 10, color: "#555" }}>Press Enter to navigate</span>
        </div>

        {error && <Alert variant="error" style={{ marginBottom: 14 }}>{error}</Alert>}

        {loading ? (
          <div style={{ textAlign: "center", padding: "4rem", color: "#555" }}>Loading…</div>
        ) : (
          <>
            {/* Sub-folders */}
            {folders.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Folders</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {folders.map(f => (
                    <button key={f.path} onClick={() => navigate(f.path)}
                      style={{ padding: "8px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#ccc", fontSize: 12, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
                      📁 {f.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Files grid */}
            {files.length === 0 && folders.length === 0 ? (
              <div style={{ textAlign: "center", padding: "4rem", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
                <div style={{ fontSize: 14, color: "#555", fontWeight: 600 }}>Folder is empty</div>
                <div style={{ fontSize: 12, color: "#444", marginTop: 6 }}>Upload a file to get started</div>
              </div>
            ) : files.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>
                  Files ({files.length})
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                  {files.map(item => (
                    <div key={item.path} style={{ ...S.card, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                      {/* Preview area */}
                      <div onClick={() => setPreview(item)} style={{ aspectRatio: "16/9", cursor: "pointer", overflow: "hidden", background: "#0d0d0d", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {isImage(item.mime_type) && item.url ? (
                          <img src={item.url} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
                        ) : (
                          <span style={{ fontSize: 32 }}>{fileIcon(item.mime_type)}</span>
                        )}
                      </div>

                      {/* Info */}
                      <div style={{ padding: "10px 10px 8px", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#ddd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.name}>
                          {item.name}
                        </div>
                        <div style={{ fontSize: 10, color: "#555" }}>
                          {fmtBytes(item.size)}
                          {item.mime_type && <> · <span style={{ color: "#444" }}>{item.mime_type.split("/")[1]?.toUpperCase()}</span></>}
                        </div>

                        {/* URL row */}
                        {item.url && (
                          <div style={{ fontSize: 9, color: "#444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }} title={item.url}>
                            {item.url.replace(/^https?:\/\/[^/]+/, "")}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ padding: "0 10px 10px", display: "flex", gap: 6 }}>
                        {item.url && (
                          <button onClick={() => void copyUrl(item.url!)}
                            style={{ flex: 1, padding: "5px 8px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#ccc", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                            Copy URL
                          </button>
                        )}
                        <button onClick={() => void deleteFile(item.path)} disabled={deleting === item.path}
                          style={{ padding: "5px 8px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 6, color: "#f87171", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: deleting === item.path ? 0.5 : 1 }}>
                          {deleting === item.path ? "…" : "Delete"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* Info box */}
        <div style={{ marginTop: 28, padding: "12px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 11, color: "#555", lineHeight: 1.7 }}>
          <strong style={{ color: "#666" }}>Tip:</strong> Upload reusable assets (t-shirt size charts, sponsor logos, route maps) here to the <code style={{ color: "#888" }}>shared/</code> folder. Copy the URL and paste it into event fields — no need to re-upload the same file for each event.<br />
          To browse event-specific uploads, enter the event&apos;s UUID in the folder input above.
        </div>
      </div>
    </div>
  );
}
