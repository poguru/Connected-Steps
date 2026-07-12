"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const CATEGORIES = [
  { value: "bug",         label: "🐛 Bug" },
  { value: "ui",          label: "🎨 UI Issue" },
  { value: "payment",     label: "💳 Payment Issue" },
  { value: "session",     label: "📅 Session Issue" },
  { value: "event",       label: "🏁 Event Issue" },
  { value: "feature",     label: "✨ Feature Request" },
  { value: "performance", label: "⚡ Performance Issue" },
];

function getDeviceInfo() {
  if (typeof window === "undefined") return { browser: "", device: "", screenSize: "" };
  const ua = navigator.userAgent;
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const browser =
    ua.includes("Edg/")    ? "Edge"    :
    ua.includes("Chrome/")  ? "Chrome"  :
    ua.includes("Firefox/") ? "Firefox" :
    ua.includes("Safari/")  ? "Safari"  : "Unknown";
  return {
    browser: `${browser} — ${ua.slice(0, 120)}`,
    device:  isMobile ? "Mobile" : "Desktop",
    screenSize: `${window.screen.width}×${window.screen.height} (viewport ${window.innerWidth}×${window.innerHeight})`,
  };
}

// Custom dark dropdown — avoids browser-native white popup
function DarkSelect({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
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
          width: "100%", padding: "9px 12px", display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8,
          color: "#fff", fontSize: "0.85rem", fontFamily: "inherit", cursor: "pointer", textAlign: "left",
        }}
      >
        <span>{selected?.label ?? "Select…"}</span>
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
                fontSize: "0.85rem", fontFamily: "inherit", cursor: "pointer",
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

// Flag icon SVG
function FlagIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

export default function BugReportFab() {
  const [open,        setOpen]        = useState(false);
  const [category,    setCategory]    = useState("bug");
  const [description, setDescription] = useState("");
  const [screenshot,  setScreenshot]  = useState<File | null>(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [success,     setSuccess]     = useState(false);
  const [error,       setError]       = useState("");

  const submit = useCallback(async () => {
    if (!description.trim()) { setError("Please describe the issue."); return; }
    setSubmitting(true); setError("");

    const stored = typeof localStorage !== "undefined" ? localStorage.getItem("cs_user") : null;
    const user   = stored ? JSON.parse(stored) as { email?: string; firstName?: string; phone?: string } : null;
    const { browser, device, screenSize } = getDeviceInfo();

    let screenshotPath = "";
    if (screenshot) {
      const fd = new FormData();
      fd.append("file", screenshot);
      fd.append("bucket", "bug-screenshots");
      const up = await fetch("/api/upload", { method: "POST", body: fd }).catch(() => null);
      if (up?.ok) {
        const j = await up.json().catch(() => ({}));
        screenshotPath = j.path ?? "";
      }
    }

    const res = await fetch("/api/bug-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category,
        description: description.trim(),
        screenshot_url: screenshotPath,
        browser, device, screen_size: screenSize,
        current_url:  typeof window !== "undefined" ? window.location.href : "",
        user_email:   user?.email   ?? "",
        user_name:    user?.firstName ?? "",
        user_phone:   user?.phone   ?? "",
      }),
    });

    setSubmitting(false);
    if (res.ok) {
      setSuccess(true);
      setTimeout(() => { setOpen(false); setSuccess(false); setDescription(""); setCategory("bug"); setScreenshot(null); }, 2500);
    } else {
      setError("Failed to submit. Please try again.");
    }
  }, [category, description, screenshot]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <>
      {/* ── Floating trigger button ─────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Report a bug or issue"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 9990,
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "rgba(15,15,15,0.92)",
          border: "1px solid rgba(255,255,255,0.12)",
          backdropFilter: "blur(12px)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#aaa",
          transition: "transform 0.2s, box-shadow 0.2s, color 0.2s",
        }}
        onMouseEnter={e => {
          const b = e.currentTarget as HTMLButtonElement;
          b.style.transform = "scale(1.08)";
          b.style.color = "#fff";
        }}
        onMouseLeave={e => {
          const b = e.currentTarget as HTMLButtonElement;
          b.style.transform = "scale(1)";
          b.style.color = "#aaa";
        }}
      >
        <FlagIcon />
      </button>

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
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
            width: "100%", maxWidth: 480,
            background: "#111", borderRadius: "16px 16px 0 0",
            padding: "20px 20px 32px",
            boxShadow: "0 -8px 40px rgba(0,0,0,0.6)",
            border: "1px solid rgba(255,255,255,0.08)",
            maxHeight: "90vh", overflowY: "auto",
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: "1rem", fontWeight: 700, color: "#fff" }}>Report an Issue</div>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
            </div>

            {success ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#4ade80" }}>Report submitted!</div>
                <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.5)", marginTop: 4 }}>We&apos;ll look into it shortly.</div>
              </div>
            ) : (
              <>
                {/* Category */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: "0.75rem", color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Category</label>
                  <DarkSelect value={category} onChange={setCategory} options={CATEGORIES} />
                </div>

                {/* Description */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: "0.75rem", color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Description *</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="What happened? What did you expect?"
                    rows={4}
                    style={{ width: "100%", padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: "0.85rem", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }}
                  />
                </div>

                {/* Screenshot */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: "0.75rem", color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Screenshot (optional)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => setScreenshot(e.target.files?.[0] ?? null)}
                    style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.6)" }}
                  />
                  {screenshot && <div style={{ fontSize: "0.75rem", color: "#4ade80", marginTop: 4 }}>✓ {screenshot.name}</div>}
                </div>

                {/* Auto-captured info */}
                <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.3)", marginBottom: 14, background: "rgba(255,255,255,0.03)", borderRadius: 6, padding: "8px 10px" }}>
                  Auto-captured: page URL, browser, device, screen size, app version
                </div>

                {error && <div style={{ fontSize: "0.78rem", color: "#f87171", marginBottom: 10 }}>{error}</div>}

                <button
                  onClick={submit}
                  disabled={submitting}
                  style={{
                    width: "100%", padding: "12px",
                    background: submitting ? "rgba(232,98,10,0.4)" : "var(--cs-orange, #e8620a)",
                    color: "#fff", border: "none", borderRadius: 10,
                    fontSize: "0.875rem", fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {submitting ? "Submitting…" : "Submit Report"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
