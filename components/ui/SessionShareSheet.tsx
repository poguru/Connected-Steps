"use client";

import { useState, useRef } from "react";

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
  const lines = [
    `🏃 ${session.title}`,
    "",
    `📅 ${dateStr}`,
    session.time ? `⏰ ${session.time}` : null,
    `📍 ${session.venue}`,
    "",
    "Join us for this community run.",
    "",
    "Register:",
    joinUrl,
    "",
    "#ConnectedSteps",
  ].filter(l => l !== null) as string[];
  return lines.join("\n");
}

export default function SessionShareSheet({ session, onClose }: Props) {
  const [busy,       setBusy]       = useState(false);
  const [toast,      setToast]      = useState("");
  const [toastGreen, setToastGreen] = useState(true);
  const blobRef = useRef<Blob | null>(null);

  const shareImageUrl = `${APP_URL}/api/og/session/${session.id}?format=story&v=3`;
  const joinUrl       = `${APP_URL}/join/${session.id}`;
  const dateStr       = formatDate(session.date);
  const caption       = buildCaption(session, joinUrl, dateStr);

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

  // ── Instagram ───────────────────────────────────────────────────────────────
  async function shareToInstagram() {
    setBusy(true);
    try {
      const blob = await getBlob();
      if (!blob) { showToast("Could not load image. Try Copy Image instead.", false); return; }
      const file = makeFile(blob);
      if (typeof navigator !== "undefined" && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: session.title });
        return;
      }
      // Fallback: download
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl; a.download = file.name; a.click();
      URL.revokeObjectURL(objectUrl);
      showToast("Image saved — open Instagram and add it to your Story.");
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") showToast("Could not share to Instagram.", false);
    } finally { setBusy(false); }
  }

  // ── WhatsApp ────────────────────────────────────────────────────────────────
  // Always use wa.me with the text caption — WhatsApp auto-renders a rich
  // link preview card from the join URL (showing the session OG poster image).
  // This gives one clean, professional message on all devices.
  //
  // Note: navigator.share({ files, text }) is intentionally NOT used here
  // because Android WhatsApp strips the text when a file is attached, causing
  // the image and caption to send as two separate messages.
  function shareToWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, "_blank");
  }

  // ── Copy link ───────────────────────────────────────────────────────────────
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      showToast("Link copied!");
    } catch { showToast("Could not copy link.", false); }
  }

  // ── Copy image ──────────────────────────────────────────────────────────────
  async function copyImage() {
    setBusy(true);
    try {
      const blob = await getBlob();
      if (!blob) { showToast("Could not load image.", false); return; }
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      showToast("Image copied — paste into Instagram, WhatsApp, or any app.");
    } catch {
      // Clipboard write failed — download instead
      const blob2 = await getBlob();
      if (blob2) {
        const objectUrl = URL.createObjectURL(blob2);
        const a = document.createElement("a");
        a.href = objectUrl; a.download = makeFile(blob2).name; a.click();
        URL.revokeObjectURL(objectUrl);
        showToast("Image downloaded — paste it into your app.");
      }
    } finally { setBusy(false); }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 440, background: "#1a1a1a", borderRadius: "20px 20px 0 0", padding: "1.5rem 1.5rem 2.5rem" }}
      >
        {/* Handle */}
        <div style={{ width: 40, height: 4, background: "rgba(255,255,255,0.15)", borderRadius: 99, margin: "0 auto 1.25rem" }} />

        {/* Session preview */}
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "0.875rem 1rem", marginBottom: "1.25rem" }}>
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#fff", marginBottom: 3 }}>{session.title}</div>
          <div style={{ fontSize: "0.75rem", color: "#888", lineHeight: 1.6 }}>
            {dateStr}{session.time ? ` · ${session.time}` : ""}{session.venue ? ` · ${session.venue}` : ""}
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div style={{
            background: toastGreen ? "rgba(74,222,128,0.1)" : "rgba(240,149,149,0.1)",
            border: `1px solid ${toastGreen ? "rgba(74,222,128,0.25)" : "rgba(240,149,149,0.25)"}`,
            borderRadius: 8, padding: "9px 14px", marginBottom: "1rem",
            fontSize: "0.8rem", color: toastGreen ? "#4ade80" : "#f09595", textAlign: "center",
          }}>
            {toast}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>

          {/* Instagram */}
          <button onClick={shareToInstagram} disabled={busy}
            style={{ width: "100%", padding: "14px", background: "linear-gradient(135deg,#833ab4 0%,#fd1d1d 50%,#fcb045 100%)", border: "none", borderRadius: 12, color: "#fff", fontSize: "0.9rem", fontWeight: 700, cursor: busy ? "wait" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, opacity: busy ? 0.7 : 1 }}>
            <span style={{ fontSize: "1.25rem" }}>📸</span>
            {busy ? "Loading image…" : "Share to Instagram Story"}
          </button>

          {/* WhatsApp */}
          <button onClick={shareToWhatsApp}
            style={{ width: "100%", padding: "14px", background: "#25D366", border: "none", borderRadius: 12, color: "#fff", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <span style={{ fontSize: "1.25rem" }}>💬</span>
            Share on WhatsApp
          </button>

          {/* Copy link */}
          <button onClick={copyLink}
            style={{ width: "100%", padding: "13px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, color: "#fff", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            🔗 Copy Link
          </button>

          {/* Copy image */}
          <button onClick={copyImage} disabled={busy}
            style={{ width: "100%", padding: "13px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, color: "#888", fontSize: "0.875rem", fontWeight: 600, cursor: busy ? "wait" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy ? 0.7 : 1 }}>
            🖼 Copy Share Image
          </button>

        </div>
      </div>
    </div>
  );
}
