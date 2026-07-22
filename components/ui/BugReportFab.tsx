"use client";

import { useState, useEffect, useCallback, useRef, DragEvent } from "react";

const CATEGORIES = [
  { value: "bug",         label: "🐛 Bug" },
  { value: "ui",          label: "🎨 UI Issue" },
  { value: "payment",     label: "💳 Payment Issue" },
  { value: "session",     label: "📅 Session Issue" },
  { value: "event",       label: "🏁 Event Issue" },
  { value: "feature",     label: "✨ Feature Request" },
  { value: "performance", label: "⚡ Performance Issue" },
];

const SEVERITIES = [
  { value: "critical", label: "🔴 Critical — app is broken / data loss" },
  { value: "high",     label: "🟠 High — major feature not working" },
  { value: "medium",   label: "🟡 Medium — annoying but workable" },
  { value: "low",      label: "🟢 Low — minor or cosmetic" },
];

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_FILE_SIZE  = 10 * 1024 * 1024; // 10 MB
const MAX_FILES      = 5;

interface FilePreview {
  file: File;
  url:  string;
  id:   string;
}

function getDeviceInfo() {
  if (typeof window === "undefined") return { browser: "", device: "", os: "", screenSize: "" };
  const ua       = navigator.userAgent;
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const browser  =
    ua.includes("Edg/")    ? "Edge"    :
    ua.includes("Chrome/")  ? "Chrome"  :
    ua.includes("Firefox/") ? "Firefox" :
    ua.includes("Safari/")  ? "Safari"  : "Unknown";
  const os =
    /Windows NT 10/.test(ua) ? "Windows 10/11" :
    /Windows NT/.test(ua)    ? "Windows"        :
    /Mac OS X/.test(ua)      ? "macOS"           :
    /Android/.test(ua)       ? "Android"         :
    /iPhone|iPad/.test(ua)   ? "iOS"             :
    /Linux/.test(ua)         ? "Linux"           : "Unknown";
  return {
    browser:    `${browser} — ${ua.slice(0, 120)}`,
    device:     isMobile ? "Mobile" : "Desktop",
    os,
    screenSize: `${window.screen.width}×${window.screen.height} (viewport ${window.innerWidth}×${window.innerHeight})`,
  };
}

function DarkSelect({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", padding: "9px 12px", display: "flex", alignItems: "center",
          justifyContent: "space-between",
          background: "rgba(255,255,255,0.06)", border: `1px solid ${!value ? "rgba(255,100,100,0.3)" : "rgba(255,255,255,0.12)"}`,
          borderRadius: 8, color: selected ? "#fff" : "#888", fontSize: "0.85rem",
          fontFamily: "inherit", cursor: "pointer", textAlign: "left",
        }}
      >
        <span>{selected?.label ?? placeholder ?? "Select…"}</span>
        <span style={{ fontSize: 10, color: "#666", marginLeft: 8 }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 10010,
          background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8,
          overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        }}>
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{
                width: "100%", padding: "9px 12px", display: "block", textAlign: "left",
                background: opt.value === value ? "rgba(232,98,10,0.15)" : "transparent",
                border: "none", color: opt.value === value ? "#e8620a" : "#ccc",
                fontSize: "0.82rem", fontFamily: "inherit", cursor: "pointer",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
              }}
              onMouseEnter={e => { if (opt.value !== value) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; }}
              onMouseLeave={e => { if (opt.value !== value) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FlagIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

const LABEL: React.CSSProperties = {
  display: "block", fontSize: "0.72rem", color: "rgba(255,255,255,0.45)",
  marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em",
};

export default function BugReportFab() {
  const [open,        setOpen]        = useState(false);
  const [title,       setTitle]       = useState("");
  const [category,    setCategory]    = useState("bug");
  const [severity,    setSeverity]    = useState("");
  const [description, setDescription] = useState("");
  const [previews,    setPreviews]    = useState<FilePreview[]>([]);
  const [dragOver,    setDragOver]    = useState(false);
  const [fileError,   setFileError]   = useState("");
  const [lightbox,    setLightbox]    = useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [success,     setSuccess]     = useState(false);
  const [error,       setError]       = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = title.trim().length > 0
    && description.trim().length > 0
    && severity !== ""
    && previews.length > 0;

  // ── File handling ────────────────────────────────────────────────────────────

  const addFiles = useCallback((rawFiles: File[]) => {
    let newError = "";
    const valid: File[] = [];
    for (const f of rawFiles) {
      if (!ACCEPTED_TYPES.includes(f.type)) { newError = "Only PNG, JPG, JPEG, WEBP accepted"; continue; }
      if (f.size > MAX_FILE_SIZE)           { newError = `${f.name}: max 10 MB per image`;      continue; }
      valid.push(f);
    }
    setFileError(newError);
    setPreviews(prev => {
      const room = MAX_FILES - prev.length;
      if (room <= 0) { setFileError(`Maximum ${MAX_FILES} screenshots allowed`); return prev; }
      const toAdd = valid.slice(0, room).map(f => ({
        file: f,
        url:  URL.createObjectURL(f),
        id:   Math.random().toString(36).slice(2),
      }));
      if (valid.length > room) setFileError(`Maximum ${MAX_FILES} screenshots allowed`);
      return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
    });
  }, []);

  function removePreview(id: string) {
    setPreviews(prev => {
      const item = prev.find(p => p.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return prev.filter(p => p.id !== id);
    });
  }

  function resetForm() {
    setPreviews(p => { p.forEach(x => URL.revokeObjectURL(x.url)); return []; });
    setTitle(""); setCategory("bug"); setSeverity(""); setDescription("");
    setError(""); setFileError("");
  }

  // ── Clipboard paste ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function handlePaste(e: ClipboardEvent) {
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter(i => i.kind === "file")
        .map(i => i.getAsFile())
        .filter((f): f is File => f !== null);
      if (files.length > 0) addFiles(files);
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [open, addFiles]);

  // ── Escape key ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { if (lightbox) setLightbox(null); else setOpen(false); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, lightbox]);

  // ── Drag & drop handlers ────────────────────────────────────────────────────
  function handleDragOver(e: DragEvent) { e.preventDefault(); setDragOver(true); }
  function handleDragLeave()             { setDragOver(false); }
  function handleDrop(e: DragEvent) {
    e.preventDefault(); setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  const submit = useCallback(async () => {
    if (!title.trim())       { setError("Bug title is required."); return; }
    if (!description.trim()) { setError("Description is required."); return; }
    if (!severity)           { setError("Please select a severity."); return; }
    if (previews.length === 0) {
      setError("Please attach at least one screenshot so we can investigate the issue.");
      return;
    }

    setSubmitting(true); setError("");

    // Upload screenshots in sequence, collect attachment metadata
    const attachments: { path: string; type: string; name: string; size: number }[] = [];
    for (const preview of previews) {
      const fd = new FormData();
      fd.append("file", preview.file);
      fd.append("bucket", "bug-screenshots");
      const up = await fetch("/api/upload", { method: "POST", body: fd }).catch(() => null);
      if (up?.ok) {
        const j = await up.json().catch(() => ({})) as { path?: string };
        if (j.path) attachments.push({ path: j.path, type: "image", name: preview.file.name, size: preview.file.size });
      } else {
        setSubmitting(false);
        setError("Screenshot upload failed. Please try again.");
        return;
      }
    }

    const stored = typeof localStorage !== "undefined" ? localStorage.getItem("cs_user") : null;
    const user   = stored ? JSON.parse(stored) as { email?: string; firstName?: string; phone?: string; id?: string } : null;
    const { browser, device, os, screenSize } = getDeviceInfo();

    const res = await fetch("/api/bug-report", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        title:       title.trim(),
        category,
        severity,
        description: description.trim(),
        attachments,
        browser, device, os, screen_size: screenSize,
        current_url: typeof window !== "undefined" ? window.location.href : "",
        user_email:  user?.email     ?? "",
        user_name:   user?.firstName ?? "",
        user_phone:  user?.phone     ?? "",
      }),
    });

    setSubmitting(false);
    if (res.ok) {
      setSuccess(true);
      setTimeout(() => { setOpen(false); setSuccess(false); resetForm(); }, 2500);
    } else {
      const j = await res.json().catch(() => ({})) as { error?: string };
      setError(j.error ?? "Failed to submit. Please try again.");
    }
  }, [title, category, severity, description, previews]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Report an issue"
        className="cs-bug-fab"
        style={{
          position: "fixed",
          bottom: "calc(env(safe-area-inset-bottom) + 20px)",
          left: 16, zIndex: 9990,
          height: 38, paddingLeft: 12, paddingRight: 16, borderRadius: 999,
          background: "rgba(15,15,15,0.9)", border: "1px solid rgba(255,255,255,0.14)",
          backdropFilter: "blur(14px)", boxShadow: "0 4px 16px rgba(0,0,0,0.45)",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
          color: "#aaa", fontSize: "0.78rem", fontWeight: 500, fontFamily: "inherit",
          whiteSpace: "nowrap", transition: "transform 0.18s, color 0.18s, box-shadow 0.18s",
        }}
        onMouseEnter={e => { const b = e.currentTarget; b.style.transform = "scale(1.05)"; b.style.color = "#fff"; b.style.boxShadow = "0 6px 22px rgba(0,0,0,0.55)"; }}
        onMouseLeave={e => { const b = e.currentTarget; b.style.transform = "scale(1)"; b.style.color = "#aaa"; b.style.boxShadow = "0 4px 16px rgba(0,0,0,0.45)"; }}
      >
        <FlagIcon />
        Report an issue
      </button>

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(0,0,0,0.95)", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <img
            src={lightbox}
            alt=""
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: "95vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 8 }}
          />
          <button
            onClick={() => setLightbox(null)}
            style={{ position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", cursor: "pointer", fontSize: 18 }}
          >×</button>
        </div>
      )}

      {/* Modal */}
      {open && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
        >
          <div style={{
            width: "100%", maxWidth: 500,
            background: "#111", borderRadius: "16px 16px 0 0",
            padding: "20px 20px 32px",
            boxShadow: "0 -8px 40px rgba(0,0,0,0.6)",
            border: "1px solid rgba(255,255,255,0.08)",
            maxHeight: "94vh", overflowY: "auto",
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ fontSize: "1rem", fontWeight: 700, color: "#fff" }}>Report an Issue</div>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 22, lineHeight: 1 }}>×</button>
            </div>

            {success ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#4ade80" }}>Report submitted!</div>
                <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.5)", marginTop: 4 }}>We&apos;ll look into it shortly.</div>
              </div>
            ) : (
              <>
                {/* Bug Title */}
                <div style={{ marginBottom: 13 }}>
                  <label style={LABEL}>Bug Title <span style={{ color: "#e8620a" }}>*</span></label>
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Short summary of the issue"
                    maxLength={160}
                    style={{
                      width: "100%", padding: "9px 12px",
                      background: "rgba(255,255,255,0.05)",
                      border: `1px solid ${title.trim() ? "rgba(255,255,255,0.12)" : "rgba(255,100,100,0.25)"}`,
                      borderRadius: 8, color: "#fff", fontSize: "0.85rem", fontFamily: "inherit",
                      boxSizing: "border-box", outline: "none",
                    }}
                  />
                </div>

                {/* Category */}
                <div style={{ marginBottom: 13 }}>
                  <label style={LABEL}>Type</label>
                  <DarkSelect value={category} onChange={setCategory} options={CATEGORIES} />
                </div>

                {/* Severity */}
                <div style={{ marginBottom: 13 }}>
                  <label style={LABEL}>Severity <span style={{ color: "#e8620a" }}>*</span></label>
                  <DarkSelect value={severity} onChange={setSeverity} options={SEVERITIES} placeholder="Select severity…" />
                </div>

                {/* Description */}
                <div style={{ marginBottom: 13 }}>
                  <label style={LABEL}>Description <span style={{ color: "#e8620a" }}>*</span></label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="What happened? What did you expect?"
                    rows={3}
                    style={{
                      width: "100%", padding: "9px 12px",
                      background: "rgba(255,255,255,0.05)",
                      border: `1px solid ${description.trim() ? "rgba(255,255,255,0.1)" : "rgba(255,100,100,0.25)"}`,
                      borderRadius: 8, color: "#fff", fontSize: "0.85rem", fontFamily: "inherit",
                      resize: "vertical", boxSizing: "border-box", outline: "none",
                    }}
                  />
                </div>

                {/* Screenshots */}
                <div style={{ marginBottom: 14 }}>
                  <label style={LABEL}>
                    Screenshots <span style={{ color: "#e8620a" }}>*</span>
                    <span style={{ fontSize: "0.68rem", color: "#555", marginLeft: 6, textTransform: "none", letterSpacing: 0 }}>
                      {previews.length}/{MAX_FILES} · PNG, JPG, WEBP · max 10 MB each
                    </span>
                  </label>

                  {/* Drop zone */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: `2px dashed ${dragOver ? "#e8620a" : previews.length === 0 ? "rgba(255,100,100,0.4)" : "rgba(255,255,255,0.14)"}`,
                      borderRadius: 10, padding: "16px 12px", textAlign: "center",
                      cursor: previews.length >= MAX_FILES ? "not-allowed" : "pointer",
                      background: dragOver ? "rgba(232,98,10,0.06)" : "rgba(255,255,255,0.02)",
                      transition: "all 0.15s",
                      opacity: previews.length >= MAX_FILES ? 0.4 : 1,
                    }}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                      multiple
                      disabled={previews.length >= MAX_FILES}
                      onChange={e => { if (e.target.files) { addFiles(Array.from(e.target.files)); e.target.value = ""; } }}
                      style={{ display: "none" }}
                    />
                    <div style={{ fontSize: "1.6rem", marginBottom: 4 }}>📷</div>
                    <div style={{ fontSize: "0.82rem", color: "#aaa", marginBottom: 2 }}>
                      {dragOver ? "Drop here" : "Drag & drop, tap to browse, or Ctrl+V to paste"}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "#555" }}>Mobile: camera or gallery supported</div>
                  </div>

                  {fileError && (
                    <div style={{ fontSize: "0.75rem", color: "#f87171", marginTop: 6 }}>{fileError}</div>
                  )}

                  {/* Thumbnails */}
                  {previews.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                      {previews.map(p => (
                        <div key={p.id} style={{ position: "relative", width: 68, height: 68, flexShrink: 0 }}>
                          <img
                            src={p.url}
                            alt=""
                            onClick={() => setLightbox(p.url)}
                            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8, cursor: "pointer", border: "1px solid rgba(255,255,255,0.12)" }}
                          />
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); removePreview(p.id); }}
                            style={{
                              position: "absolute", top: -6, right: -6,
                              width: 20, height: 20, borderRadius: "50%",
                              background: "#ef4444", border: "2px solid #111",
                              color: "#fff", cursor: "pointer", fontSize: 12, lineHeight: "16px",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              padding: 0,
                            }}
                          >×</button>
                        </div>
                      ))}
                      {previews.length < MAX_FILES && (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            width: 68, height: 68, border: "2px dashed rgba(255,255,255,0.15)",
                            borderRadius: 8, background: "transparent", color: "#555",
                            cursor: "pointer", fontSize: 22, display: "flex",
                            alignItems: "center", justifyContent: "center",
                          }}
                        >+</button>
                      )}
                    </div>
                  )}

                  {/* Required hint */}
                  {previews.length === 0 && (
                    <div style={{ fontSize: "0.73rem", color: "#666", marginTop: 7, lineHeight: 1.4 }}>
                      Please attach at least one screenshot so we can investigate the issue.
                    </div>
                  )}
                </div>

                {/* Auto-captured */}
                <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.25)", marginBottom: 14, background: "rgba(255,255,255,0.02)", borderRadius: 6, padding: "7px 10px" }}>
                  Auto-captured: page URL, browser, device, screen size, app version
                </div>

                {error && (
                  <div style={{ fontSize: "0.78rem", color: "#f87171", marginBottom: 10 }}>{error}</div>
                )}

                <button
                  onClick={submit}
                  disabled={submitting || !canSubmit}
                  title={!canSubmit ? "Fill in all required fields and add at least one screenshot" : undefined}
                  style={{
                    width: "100%", padding: "12px",
                    background: !canSubmit
                      ? "rgba(255,255,255,0.07)"
                      : submitting
                        ? "rgba(232,98,10,0.4)"
                        : "var(--cs-orange, #e8620a)",
                    color: !canSubmit ? "#444" : "#fff",
                    border: "none", borderRadius: 10,
                    fontSize: "0.875rem", fontWeight: 700,
                    cursor: !canSubmit || submitting ? "not-allowed" : "pointer",
                    fontFamily: "inherit", transition: "background 0.2s",
                  }}
                >
                  {submitting ? "Uploading & Submitting…" : "Submit Bug Report"}
                </button>

                {!canSubmit && (
                  <div style={{ textAlign: "center", fontSize: "0.7rem", color: "#444", marginTop: 8 }}>
                    {!title.trim() ? "Enter a bug title" : !severity ? "Select severity" : !description.trim() ? "Add a description" : "Attach at least one screenshot"}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
