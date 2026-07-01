"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Upload, Trash2, Star, StarOff, Play, Image as ImageIcon, GripVertical, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export interface MediaItem {
  id:            string;
  media_type:    "image" | "video";
  url:           string;
  thumbnail_url: string | null;
  caption:       string | null;
  duration_secs: number | null;
  file_size:     number | null;
  display_order: number;
  is_cover:      boolean;
}

interface Props {
  sessionId:     string;
  uploaderEmail: string;
  /** Called whenever media changes so the parent can refresh if needed */
  onChange?:     () => void;
}

interface UploadState {
  file:     File;
  progress: number;          // 0–100
  status:   "pending" | "uploading" | "done" | "error";
  error?:   string;
  preview:  string;          // object URL for local preview
}

function fmtSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.round(bytes / 1000)} KB`;
}

export default function MediaManager({ sessionId, uploaderEmail, onChange }: Props) {
  const [items,     setItems]     = useState<MediaItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [uploads,   setUploads]   = useState<UploadState[]>([]);
  const [dragging,  setDragging]  = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load existing media ───────────────────────────────────────────────────
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/sessions/${sessionId}/media`);
      const data = await res.json() as { media?: MediaItem[] };
      setItems((data.media ?? []).sort((a, b) => a.display_order - b.display_order));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { void reload(); }, [reload]);

  // ── Upload handler ────────────────────────────────────────────────────────
  const uploadFiles = useCallback(async (files: File[]) => {
    const valid = files.filter(f => {
      if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) return false;
      if (f.size > 100 * 1024 * 1024) return false;
      return true;
    });
    if (!valid.length) return;

    // Create pending states
    const states: UploadState[] = valid.map(f => ({
      file:     f,
      progress: 0,
      status:   "pending",
      preview:  URL.createObjectURL(f),
    }));
    setUploads(prev => [...prev, ...states]);

    // Upload each file sequentially
    for (let i = 0; i < valid.length; i++) {
      const file = valid[i];

      setUploads(prev => prev.map(u =>
        u.file === file ? { ...u, status: "uploading", progress: 20 } : u
      ));

      const form = new FormData();
      form.append("file",           file);
      form.append("uploader_email", uploaderEmail);
      // First upload of a video → set as cover
      const shouldBeCover = items.length === 0 && i === 0 && file.type.startsWith("video/");
      if (shouldBeCover) form.append("set_as_cover", "true");

      try {
        const res = await fetch(`/api/sessions/${sessionId}/media`, {
          method: "POST",
          body:   form,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Upload failed" })) as { error?: string };
          throw new Error(err.error ?? "Upload failed");
        }

        setUploads(prev => prev.map(u =>
          u.file === file ? { ...u, status: "done", progress: 100 } : u
        ));
      } catch (e: unknown) {
        setUploads(prev => prev.map(u =>
          u.file === file ? { ...u, status: "error", progress: 0, error: e instanceof Error ? e.message : String(e) } : u
        ));
      }
    }

    await reload();
    onChange?.();

    // Clean up object URLs after a short delay
    setTimeout(() => {
      for (const s of states) URL.revokeObjectURL(s.preview);
      setUploads(prev => prev.filter(u => !states.find(s => s.file === u.file)));
    }, 3000);
  }, [sessionId, uploaderEmail, items.length, reload, onChange]);

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      void uploadFiles(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void uploadFiles(Array.from(e.dataTransfer.files));
  };

  // ── Set cover ─────────────────────────────────────────────────────────────
  const setCover = async (id: string) => {
    await fetch(`/api/sessions/${sessionId}/media/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ is_cover: true }),
    });
    await reload();
    onChange?.();
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteItem = async (id: string) => {
    if (!confirm("Remove this media item?")) return;
    await fetch(`/api/sessions/${sessionId}/media/${id}`, { method: "DELETE" });
    setItems(prev => prev.filter(i => i.id !== id));
    onChange?.();
  };

  // ── Drag to reorder (simple swap on drop) ─────────────────────────────────
  const dragItem = useRef<string | null>(null);
  const onDragStart = (id: string) => { dragItem.current = id; };
  const onDragOver  = (e: React.DragEvent) => e.preventDefault();
  const onDropItem  = async (targetId: string) => {
    if (!dragItem.current || dragItem.current === targetId) return;
    const from = items.findIndex(i => i.id === dragItem.current);
    const to   = items.findIndex(i => i.id === targetId);
    if (from < 0 || to < 0) return;

    const reordered = [...items];
    const [moved]   = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const updated = reordered.map((item, idx) => ({ ...item, display_order: idx }));
    setItems(updated);

    // Persist new orders
    await Promise.all(updated.map(item =>
      fetch(`/api/sessions/${sessionId}/media/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ display_order: item.display_order }),
      })
    ));
    dragItem.current = null;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Drop zone ── */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? "rgba(232,98,10,0.7)" : "rgba(255,255,255,0.15)"}`,
          borderRadius: 12,
          padding: "24px 16px",
          textAlign: "center",
          cursor: "pointer",
          background: dragging ? "rgba(232,98,10,0.05)" : "rgba(255,255,255,0.02)",
          transition: "border-color 0.2s, background 0.2s",
        }}
      >
        <Upload size={24} style={{ color: "var(--muted-foreground)", marginBottom: 8 }} />
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
          Drop photos &amp; videos here
        </div>
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>
          MP4, MOV, WEBM · JPG, PNG, WEBP · Max 100 MB each
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/mp4,video/quicktime,video/webm"
        multiple
        style={{ display: "none" }}
        onChange={onFileInput}
      />

      {/* ── Upload progress ── */}
      {uploads.map((u, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "10px 14px", borderRadius: 10,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u.preview} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
              {u.file.name}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2 }}>
              {fmtSize(u.file.size)} · {u.file.type.startsWith("video/") ? "Video" : "Image"}
            </div>
            {u.status === "uploading" && (
              <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${u.progress}%`, background: "var(--cs-orange)", transition: "width 0.3s" }} />
              </div>
            )}
            {u.status === "error" && (
              <div style={{ fontSize: 10, color: "#f87171", marginTop: 3 }}>{u.error}</div>
            )}
          </div>
          {u.status === "uploading" && <Loader2 size={16} style={{ color: "var(--cs-orange)", animation: "spin 0.8s linear infinite" }} />}
          {u.status === "done"      && <CheckCircle2 size={16} style={{ color: "#4ade80" }} />}
          {u.status === "error"     && <AlertCircle  size={16} style={{ color: "#f87171" }} />}
        </div>
      ))}

      {/* ── Media grid ── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--muted-foreground)", fontSize: 13 }}>
          Loading media…
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--muted-foreground)", fontSize: 13 }}>
          No media yet. Upload photos or videos above.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <div style={{ fontSize: 10, color: "var(--muted-foreground)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 10, fontWeight: 600 }}>
            {items.length} item{items.length !== 1 ? "s" : ""} · drag to reorder
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
            {items.map(item => (
              <div
                key={item.id}
                draggable
                onDragStart={() => onDragStart(item.id)}
                onDragOver={onDragOver}
                onDrop={() => onDropItem(item.id)}
                style={{
                  borderRadius: 10, overflow: "hidden",
                  border: `2px solid ${item.is_cover ? "var(--cs-orange)" : "rgba(255,255,255,0.08)"}`,
                  background: "rgba(255,255,255,0.03)",
                  position: "relative",
                  transition: "border-color 0.2s",
                }}
              >
                {/* Thumbnail */}
                <div style={{ aspectRatio: "4/3", position: "relative", overflow: "hidden" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.thumbnail_url ?? item.url}
                    alt={item.caption ?? ""}
                    loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                  {item.media_type === "video" && (
                    <div style={{
                      position: "absolute", inset: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "rgba(0,0,0,0.3)",
                    }}>
                      <Play size={18} style={{ color: "#fff" }} />
                    </div>
                  )}
                  {item.is_cover && (
                    <div style={{
                      position: "absolute", top: 5, left: 5,
                      fontSize: 9, fontWeight: 700, color: "#fff",
                      background: "var(--cs-orange)", borderRadius: 4, padding: "2px 6px",
                    }}>
                      COVER
                    </div>
                  )}

                  {/* Drag handle */}
                  <div style={{
                    position: "absolute", top: 5, right: 5,
                    cursor: "grab",
                    background: "rgba(0,0,0,0.5)", borderRadius: 4, padding: "2px 4px",
                  }}>
                    <GripVertical size={12} style={{ color: "rgba(255,255,255,0.7)" }} />
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 0, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <button
                    onClick={() => setCover(item.id)}
                    disabled={item.is_cover}
                    style={{
                      flex: 1, padding: "7px 0", background: "none", border: "none",
                      cursor: item.is_cover ? "default" : "pointer",
                      color: item.is_cover ? "var(--cs-orange)" : "var(--muted-foreground)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "color 0.15s",
                    }}
                    title="Set as cover"
                    aria-label="Set as cover"
                  >
                    {item.is_cover ? <Star size={13} fill="currentColor" /> : <StarOff size={13} />}
                  </button>
                  <div style={{ width: 1, background: "rgba(255,255,255,0.06)" }} />
                  <button
                    onClick={() => deleteItem(item.id)}
                    style={{
                      flex: 1, padding: "7px 0", background: "none", border: "none",
                      cursor: "pointer", color: "rgba(248,113,113,0.7)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "color 0.15s",
                    }}
                    title="Delete"
                    aria-label="Delete media"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Media type icon */}
                <div style={{
                  position: "absolute", bottom: 38, right: 6,
                  background: "rgba(0,0,0,0.5)", borderRadius: 4,
                  padding: "2px 4px",
                }}>
                  {item.media_type === "video"
                    ? <Play  size={9} style={{ color: "rgba(255,255,255,0.7)" }} />
                    : <ImageIcon size={9} style={{ color: "rgba(255,255,255,0.7)" }} />
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
