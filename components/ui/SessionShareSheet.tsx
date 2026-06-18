"use client";

import { useState, useRef, useEffect } from "react";

export interface ShareSession {
  id:    string;
  title: string;
  date:  string;
  time:  string | null;
  venue: string;
}

interface Props {
  session: ShareSession;
  onClose: () => void;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";

function formatDate(date: string) {
  return new Date(date + "T12:00:00Z").toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "long", year: "numeric",
  });
}

function buildCaption(session: ShareSession, joinUrl: string, dateStr: string): string {
  return [
    `${session.title}`,
    "",
    `${dateStr}${session.time ? " · " + session.time : ""}`,
    session.venue ? `${session.venue}` : null,
    "",
    "Join us for this community run.",
    joinUrl,
    "",
    "#ConnectedSteps #Running",
  ].filter(l => l !== null).join("\n");
}

// ── Brand SVG icons ────────────────────────────────────────────────────────────

function IconWhatsApp() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

function IconInstagram() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <circle cx="12" cy="12" r="4.5"/>
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function IconLink() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  );
}

function IconDownload() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}

// ── Helper: trigger a file download safely in all contexts ─────────────────────
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  // Must be in DOM for Firefox/Android WebView
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Delay revoke so the download can initiate
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SessionShareSheet({ session, onClose }: Props) {
  const [busy,       setBusy]       = useState(false);
  const [toast,      setToast]      = useState("");
  const [toastGreen, setToastGreen] = useState(true);
  const blobRef = useRef<Blob | null>(null);

  const shareImageUrl = `${APP_URL}/api/og/session/${session.id}?format=story&v=3`;
  const joinUrl       = `${APP_URL}/join/${session.id}`;
  const dateStr       = formatDate(session.date);
  const caption       = buildCaption(session, joinUrl, dateStr);

  // Lock background scroll while sheet is open
  useEffect(() => {
    document.body.style.overflow    = "hidden";
    document.body.style.touchAction = "none";
    return () => {
      document.body.style.overflow    = "";
      document.body.style.touchAction = "";
    };
  }, []);

  function showToast(msg: string, green = true) {
    setToastGreen(green);
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  }

  async function getBlob(): Promise<Blob | null> {
    if (blobRef.current) return blobRef.current;
    try {
      const res = await fetch(shareImageUrl);
      if (!res.ok) return null;
      blobRef.current = await res.blob();
      return blobRef.current;
    } catch { return null; }
  }

  function makeFile(blob: Blob): File {
    return new File([blob], `${session.title.replace(/\s+/g, "-")}-session.png`, { type: "image/png" });
  }

  // ── WhatsApp ─────────────────────────────────────────────────────────────────
  // Use wa.me — WhatsApp renders a rich link-preview card from the join URL,
  // giving a clean professional appearance without a second raw-image message.
  function shareToWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, "_blank");
  }

  // ── Instagram ─────────────────────────────────────────────────────────────────
  async function shareToInstagram() {
    setBusy(true);
    try {
      const blob = await getBlob();
      if (!blob) {
        showToast("Could not load image. Check your connection.", false);
        return;
      }
      const file = makeFile(blob);

      // Native share sheet (Android/iOS) — best path
      if (typeof navigator !== "undefined" && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: session.title });
        showToast("Image shared!");
        return;
      }

      // Fallback: download so user can manually add to Instagram Story
      downloadBlob(blob, file.name);
      showToast("Image saved — open Instagram and add it to your Story.");
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") {
        showToast("Could not share image.", false);
      }
    } finally {
      setBusy(false);
    }
  }

  // ── Copy link ─────────────────────────────────────────────────────────────────
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      showToast("Link copied!");
    } catch {
      showToast("Could not copy link.", false);
    }
  }

  // ── Save / share image ────────────────────────────────────────────────────────
  // Priority:
  //   1. navigator.share with file  (Android/iOS native share sheet — best)
  //   2. navigator.clipboard.write  (desktop Chrome)
  //   3. download fallback          (everything else)
  async function saveImage() {
    setBusy(true);
    try {
      const blob = await getBlob();
      if (!blob) {
        showToast("Could not load share image. Please check your connection.", false);
        return;
      }
      const file = makeFile(blob);

      // 1 — Native share sheet (preferred on mobile)
      if (typeof navigator !== "undefined" && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: session.title, text: caption });
        showToast("Image shared!");
        return;
      }

      // 2 — Clipboard (desktop browsers that support image clipboard)
      if (typeof ClipboardItem !== "undefined") {
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          showToast("Image copied — paste into Instagram, WhatsApp, or any app.");
          return;
        } catch { /* not supported — fall through to download */ }
      }

      // 3 — Download fallback (always works)
      downloadBlob(blob, file.name);
      showToast("Image saved to your downloads — share it anywhere.");
    } catch (e) {
      // User cancelled the native share sheet — not an error
      if (e instanceof Error && e.name === "AbortError") return;
      showToast("Could not save image. Please try again.", false);
    } finally {
      setBusy(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const secondaryBtn: React.CSSProperties = {
    width: "100%", padding: "13px",
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12, color: "#fff",
    fontSize: "0.875rem", fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
    transition: "background 0.15s",
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 440,
          background: "#1a1a1a",
          borderRadius: "20px 20px 0 0",
          // Cap height + allow inner scroll for small screens
          maxHeight: "90dvh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.6)",
        }}
      >
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 6px", flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.18)" }} />
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0.25rem 1.5rem", paddingBottom: "calc(1.75rem + env(safe-area-inset-bottom))" }}>

          {/* Session preview card */}
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "0.875rem 1rem", marginBottom: "1.25rem" }}>
            <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "#fff", marginBottom: 3 }}>{session.title}</div>
            <div style={{ fontSize: "0.75rem", color: "#888", lineHeight: 1.6 }}>
              {dateStr}{session.time ? ` · ${session.time}` : ""}{session.venue ? ` · ${session.venue}` : ""}
            </div>
          </div>

          {/* Toast / feedback */}
          {toast && (
            <div style={{
              background: toastGreen ? "rgba(74,222,128,0.1)" : "rgba(240,149,149,0.1)",
              border: `1px solid ${toastGreen ? "rgba(74,222,128,0.3)" : "rgba(240,149,149,0.3)"}`,
              borderRadius: 10, padding: "10px 14px", marginBottom: "1rem",
              fontSize: "0.8rem", color: toastGreen ? "#4ade80" : "#f09595",
              textAlign: "center", lineHeight: 1.5,
            }}>
              {toast}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>

            {/* 1 — WhatsApp (primary) */}
            <button
              onClick={shareToWhatsApp}
              style={{
                width: "100%", padding: "14px 16px",
                background: "#25D366", border: "none", borderRadius: 12,
                color: "#fff", fontSize: "0.9rem", fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                boxShadow: "0 2px 12px rgba(37,211,102,0.35)",
              }}
            >
              <IconWhatsApp />
              Share on WhatsApp
            </button>

            {/* 2 — Instagram Story (primary) */}
            <button
              onClick={shareToInstagram}
              disabled={busy}
              style={{
                width: "100%", padding: "14px 16px",
                background: "linear-gradient(135deg,#833ab4 0%,#fd1d1d 50%,#fcb045 100%)",
                border: "none", borderRadius: 12,
                color: "#fff", fontSize: "0.9rem", fontWeight: 700,
                cursor: busy ? "wait" : "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                opacity: busy ? 0.72 : 1,
                boxShadow: "0 2px 12px rgba(131,58,180,0.35)",
              }}
            >
              <IconInstagram />
              {busy ? "Loading image…" : "Share to Instagram Story"}
            </button>

            {/* Divider */}
            <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "0.25rem 0" }} />

            {/* 3 — Copy link (secondary) */}
            <button
              onClick={copyLink}
              style={secondaryBtn}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.07)"; }}
            >
              <IconLink />
              Copy Link
            </button>

            {/* 4 — Save image (secondary) */}
            <button
              onClick={saveImage}
              disabled={busy}
              style={{
                ...secondaryBtn,
                opacity: busy ? 0.6 : 1,
                cursor: busy ? "wait" : "pointer",
              }}
              onMouseEnter={e => { if (!busy) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.07)"; }}
            >
              <IconDownload />
              {busy ? "Preparing image…" : "Save Image"}
            </button>

          </div>
        </div>
      </div>
    </div>
  );
}
