"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ShareContentType =
  | "post" | "event" | "session" | "achievement"
  | "certificate" | "leaderboard" | "registration";

export interface ShareConfig {
  type:        ShareContentType;
  id:          string;
  title:       string;
  description?: string;
  url:         string;
  imageUrl?:   string;   // 1200×630 OG image (for link previews)
  storyUrl?:   string;   // 1080×1920 Instagram Story image (for download / save)
  authorName?: string;
}

interface Props {
  config:  ShareConfig;
  onClose: () => void;
}

// ── Caption builders ──────────────────────────────────────────────────────────

function buildCaption(config: ShareConfig): string {
  const { type, title, url, authorName } = config;
  switch (type) {
    case "post":
      return `${authorName ? `${authorName} on Connected Steps:\n\n` : ""}${title}\n\n${url}\n\n#ConnectedSteps #Running`;
    case "event":
      return `I'm joining the ${title}!\n\nRegister now 👇\n${url}\n\n#ConnectedSteps #RunHyderabad`;
    case "session":
      return `Join me for ${title} with Connected Steps! 🏃\n\n${url}\n\n#ConnectedSteps`;
    case "achievement":
      return `I just earned "${title}" on Connected Steps! 🏅\n\n${url}\n\n#ConnectedSteps #RunningMilestone`;
    case "certificate":
      return `I completed ${title}! Here's my certificate 🎽\n\n${url}\n\n#ConnectedSteps`;
    case "leaderboard":
      return `Check out my leaderboard position — ${title} — on Connected Steps! 🏆\n\n${url}\n\n#ConnectedSteps`;
    case "registration":
      return `I just registered for ${title}! See you at the start line 🏁\n\n${url}\n\n#ConnectedSteps`;
    default:
      return `${title}\n\n${url}\n\n#ConnectedSteps`;
  }
}

function buildTwitterText(config: ShareConfig): string {
  const { type, title, authorName } = config;
  switch (type) {
    case "post":         return `${authorName ? `${authorName}:` : ""} ${title.slice(0, 180)} @ConnectedSteps`;
    case "event":        return `Joining ${title.slice(0, 160)} with @ConnectedSteps 🏃`;
    case "achievement":  return `Just earned "${title.slice(0, 120)}" 🏅 @ConnectedSteps`;
    case "certificate":  return `Completed ${title.slice(0, 130)}! 🎽 @ConnectedSteps`;
    case "leaderboard":  return `${title} on @ConnectedSteps leaderboard 🏆`;
    case "registration": return `Registered for ${title.slice(0, 150)} 🏁 @ConnectedSteps`;
    default:             return `${title.slice(0, 200)} @ConnectedSteps`;
  }
}

// ── Track share event ─────────────────────────────────────────────────────────

async function trackShare(config: ShareConfig, platform: string) {
  try {
    await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: config.type, id: config.id, platform }),
    });
  } catch { /* non-critical */ }
}

// ── Download helper ───────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconWhatsApp() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}
function IconTwitterX() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.258 5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}
function IconFacebook() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}
function IconLinkedIn() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}
function IconTelegram() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
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
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  );
}
function IconDownload() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ShareModal({ config, onClose }: Props) {
  const [toast,      setToast]      = useState("");
  const [toastOk,    setToastOk]    = useState(true);
  const [imgBusy,    setImgBusy]    = useState(false);
  const [caption,    setCaption]    = useState(() => buildCaption(config));
  const [showEdit,   setShowEdit]   = useState(false);
  const blobRef = useRef<Blob | null>(null);

  useEffect(() => {
    document.body.style.overflow    = "hidden";
    document.body.style.touchAction = "none";
    return () => {
      document.body.style.overflow    = "";
      document.body.style.touchAction = "";
    };
  }, []);

  const showToast = useCallback((msg: string, ok = true) => {
    setToastOk(ok);
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }, []);

  // Pre-fetch story/image blob (cached in ref). Prefers storyUrl (1080×1920).
  async function getBlob(): Promise<Blob | null> {
    const src = config.storyUrl ?? config.imageUrl;
    if (!src) return null;
    if (blobRef.current) return blobRef.current;
    try {
      const res = await Promise.race([
        fetch(src),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000)),
      ]) as Response;
      if (!res.ok) return null;
      blobRef.current = await res.blob();
      return blobRef.current;
    } catch { return null; }
  }

  function makeFile(blob: Blob): File {
    const slug = config.title.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40);
    return new File([blob], `connected-steps-${slug}.png`, { type: "image/png" });
  }

  // ── Share actions ─────────────────────────────────────────────────────────

  function openWindow(url: string, platform: string) {
    trackShare(config, platform);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function shareWhatsApp() {
    openWindow(`https://wa.me/?text=${encodeURIComponent(caption)}`, "whatsapp");
  }

  function shareTwitter() {
    const text = buildTwitterText(config);
    openWindow(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(config.url)}`, "twitter");
  }

  function shareFacebook() {
    openWindow(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(config.url)}`, "facebook");
  }

  function shareLinkedIn() {
    openWindow(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(config.url)}`, "linkedin");
  }

  function shareTelegram() {
    openWindow(`https://t.me/share/url?url=${encodeURIComponent(config.url)}&text=${encodeURIComponent(caption)}`, "telegram");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(config.url);
      showToast("Link copied!");
      trackShare(config, "copy");
    } catch {
      showToast("Could not copy link.", false);
    }
  }

  async function downloadImage() {
    if (!config.imageUrl) { showToast("No image available.", false); return; }
    setImgBusy(true);
    try {
      const blob = await getBlob();
      if (!blob) { showToast("Could not load image.", false); return; }
      const file = makeFile(blob);

      // Native share sheet on mobile (best path)
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: config.title, text: caption });
        showToast("Shared!");
        trackShare(config, "native");
        return;
      }
      // Download fallback
      downloadBlob(blob, file.name);
      showToast("Image saved — share it anywhere!");
      trackShare(config, "download");
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      showToast("Could not save image.", false);
    } finally {
      setImgBusy(false);
    }
  }

  async function shareInstagram() {
    if (!config.imageUrl) { showToast("No image available for Instagram.", false); return; }
    setImgBusy(true);
    try {
      const blob = await getBlob();
      if (!blob) { showToast("Could not load image.", false); return; }
      const file = makeFile(blob);

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: config.title });
        showToast("Image shared — choose Instagram from the sheet.");
        trackShare(config, "instagram");
        return;
      }
      downloadBlob(blob, file.name);
      showToast("Image saved — open Instagram and post it!");
      trackShare(config, "instagram");
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      showToast("Could not prepare image.", false);
    } finally {
      setImgBusy(false);
    }
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const primaryBtn = (color: string, shadow?: string): React.CSSProperties => ({
    width: "100%", padding: "13px 16px",
    background: color, border: "none", borderRadius: 12,
    color: "#fff", fontSize: "0.875rem", fontWeight: 700,
    cursor: "pointer", fontFamily: "inherit",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
    boxShadow: shadow ?? "none",
    transition: "opacity 0.15s",
  });

  const secondaryBtn: React.CSSProperties = {
    width: "100%", padding: "12px 16px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.11)",
    borderRadius: 12, color: "#fff",
    fontSize: "0.875rem", fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
    transition: "background 0.15s",
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 600, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 460,
          background: "#161616", borderRadius: "22px 22px 0 0",
          maxHeight: "92dvh", display: "flex", flexDirection: "column",
          boxShadow: "0 -8px 48px rgba(0,0,0,0.7)",
        }}
      >
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px", flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem 1.25rem", paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.875rem" }}>
            <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#fff" }}>Share</div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "rgba(255,255,255,0.5)", fontSize: "0.75rem" }}>✕</button>
          </div>

          {/* Preview card */}
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "0.75rem 1rem", marginBottom: "1rem" }}>
            <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#fff", marginBottom: 2, lineClamp: 2, overflow: "hidden", display: "-webkit-box", WebkitBoxOrient: "vertical" as const, WebkitLineClamp: 2 }}>
              {config.title}
            </div>
            {config.description && (
              <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitBoxOrient: "vertical" as const, WebkitLineClamp: 2 }}>
                {config.description}
              </div>
            )}
          </div>

          {/* Editable caption */}
          <div style={{ marginBottom: "1rem" }}>
            <button
              onClick={() => setShowEdit(s => !s)}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.75rem", color: "#e8620a", fontFamily: "inherit", fontWeight: 600, padding: "0 0 6px" }}
            >
              {showEdit ? "▲ Hide caption" : "✏ Edit caption"}
            </button>
            {showEdit && (
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                rows={5}
                style={{
                  width: "100%", background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10,
                  color: "#fff", fontSize: "0.8rem", lineHeight: 1.6,
                  padding: "10px 12px", fontFamily: "inherit", resize: "vertical",
                  outline: "none",
                }}
              />
            )}
          </div>

          {/* Toast */}
          {toast && (
            <div style={{
              background: toastOk ? "rgba(63,185,80,.1)" : "rgba(248,81,73,.1)",
              border: `1px solid ${toastOk ? "rgba(63,185,80,.3)" : "rgba(248,81,73,.3)"}`,
              borderRadius: 10, padding: "9px 14px", marginBottom: "0.875rem",
              fontSize: "0.8rem", color: toastOk ? "#4ade80" : "#f87171",
              textAlign: "center",
            }}>
              {toast}
            </div>
          )}

          {/* Platform grid — top 2 primary */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>

            <button
              onClick={shareWhatsApp}
              style={primaryBtn("#25D366", "0 2px 12px rgba(37,211,102,.3)")}
            >
              <IconWhatsApp /> Share on WhatsApp
            </button>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              <button onClick={shareTwitter}    style={primaryBtn("#000", "0 2px 10px rgba(0,0,0,.4)")}>
                <IconTwitterX /> X (Twitter)
              </button>
              <button onClick={shareFacebook}   style={primaryBtn("#1877F2", "0 2px 10px rgba(24,119,242,.3)")}>
                <IconFacebook /> Facebook
              </button>
              <button onClick={shareLinkedIn}   style={primaryBtn("#0A66C2", "0 2px 10px rgba(10,102,194,.3)")}>
                <IconLinkedIn /> LinkedIn
              </button>
              <button onClick={shareTelegram}   style={primaryBtn("#229ED9", "0 2px 10px rgba(34,158,217,.3)")}>
                <IconTelegram /> Telegram
              </button>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "0.25rem 0" }} />

            {/* Instagram Story */}
            {(config.storyUrl ?? config.imageUrl) && (
              <button
                onClick={shareInstagram}
                disabled={imgBusy}
                style={{
                  ...primaryBtn("linear-gradient(135deg,#833ab4 0%,#fd1d1d 50%,#fcb045 100%)"),
                  opacity: imgBusy ? 0.7 : 1,
                  cursor: imgBusy ? "wait" : "pointer",
                }}
              >
                <IconInstagram />
                {imgBusy ? "Preparing story…" : "Instagram Story (save image)"}
              </button>
            )}

            {/* Secondary actions */}
            <button onClick={copyLink} style={secondaryBtn}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}>
              <IconLink /> Copy Link
            </button>

            {(config.storyUrl ?? config.imageUrl) && (
              <button
                onClick={downloadImage}
                disabled={imgBusy}
                style={{ ...secondaryBtn, opacity: imgBusy ? 0.6 : 1, cursor: imgBusy ? "wait" : "pointer" }}
                onMouseEnter={e => { if (!imgBusy) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}>
                <IconDownload />
                {imgBusy ? "Preparing image…" : "Download Story Image"}
              </button>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
