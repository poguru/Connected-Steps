"use client";

import { useState } from "react";

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

export default function SessionShareSheet({ session, onClose }: Props) {
  const [busy,     setBusy]     = useState(false);
  const [toast,    setToast]    = useState("");

  const shareImageUrl = `${APP_URL}/api/og/session/${session.id}?format=story`;
  const joinUrl       = `${APP_URL}/join/${session.id}`;
  const dateStr       = formatDate(session.date);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  // Fetch + cache the share image blob
  let cachedBlob: Blob | null = null;
  async function getBlob(): Promise<Blob | null> {
    if (cachedBlob) return cachedBlob;
    try {
      const res = await fetch(shareImageUrl);
      if (!res.ok) return null;
      cachedBlob = await res.blob();
      return cachedBlob;
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
      if (!blob) { showToast("Could not load image. Try Copy Image instead."); return; }
      const file = makeFile(blob);

      // Use native share with file — opens system share sheet (user picks Instagram)
      if (typeof navigator !== "undefined" && navigator.share) {
        const canShare = navigator.canShare ? navigator.canShare({ files: [file] }) : false;
        if (canShare) {
          await navigator.share({ files: [file], title: session.title });
          return;
        }
      }

      // Fallback: download the image and open Instagram
      const url = URL.createObjectURL(blob);
      const a   = document.createElement("a");
      a.href = url; a.download = file.name; a.click();
      URL.revokeObjectURL(url);
      showToast("Image downloaded — open Instagram and add it to your Story.");
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") showToast("Could not share to Instagram.");
    } finally { setBusy(false); }
  }

  // ── WhatsApp ────────────────────────────────────────────────────────────────
  async function shareToWhatsApp() {
    setBusy(true);
    const text = `🏃 *Connected Steps*\n\n*${session.title}*\n\n📅 ${dateStr}${session.time ? `\n⏰ ${session.time}` : ""}\n📍 ${session.venue}\n\nRegister:\n${joinUrl}`;
    try {
      const blob = await getBlob();
      if (blob) {
        const file = makeFile(blob);
        if (typeof navigator !== "undefined" && navigator.share) {
          const canShare = navigator.canShare ? navigator.canShare({ files: [file], text }) : false;
          if (canShare) {
            await navigator.share({ files: [file], text });
            return;
          }
        }
      }
      // Fallback: open wa.me with text (link preview auto-shows OG card)
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") {
        window.open(`https://wa.me/?text=${encodeURIComponent(`${session.title}\n\nRegister: ${joinUrl}`)}`, "_blank");
      }
    } finally { setBusy(false); }
  }

  // ── Copy link ───────────────────────────────────────────────────────────────
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      showToast("Link copied!");
    } catch { showToast("Could not copy link."); }
  }

  // ── Copy image ──────────────────────────────────────────────────────────────
  async function copyImage() {
    setBusy(true);
    try {
      const blob = await getBlob();
      if (!blob) { showToast("Could not load image."); return; }
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      showToast("Image copied! Paste into Instagram, WhatsApp, or any app.");
    } catch {
      // Clipboard API failed — fallback download
      const blob2 = await getBlob();
      if (blob2) {
        const url = URL.createObjectURL(blob2);
        const a   = document.createElement("a");
        a.href = url; a.download = makeFile(blob2).name; a.click();
        URL.revokeObjectURL(url);
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
          <div style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 8, padding: "9px 14px", marginBottom: "1rem", fontSize: "0.8rem", color: "#4ade80", textAlign: "center" }}>
            {toast}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>

          {/* Instagram */}
          <button
            onClick={shareToInstagram}
            disabled={busy}
            style={{ width: "100%", padding: "14px", background: "linear-gradient(135deg,#833ab4 0%,#fd1d1d 50%,#fcb045 100%)", border: "none", borderRadius: 12, color: "#fff", fontSize: "0.9rem", fontWeight: 700, cursor: busy ? "wait" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, opacity: busy ? 0.7 : 1 }}
          >
            <span style={{ fontSize: "1.25rem" }}>📸</span>
            {busy ? "Loading…" : "Share to Instagram Story"}
          </button>

          {/* WhatsApp */}
          <button
            onClick={shareToWhatsApp}
            disabled={busy}
            style={{ width: "100%", padding: "14px", background: "#25D366", border: "none", borderRadius: 12, color: "#fff", fontSize: "0.9rem", fontWeight: 700, cursor: busy ? "wait" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, opacity: busy ? 0.7 : 1 }}
          >
            <span style={{ fontSize: "1.25rem" }}>💬</span>
            {busy ? "Loading…" : "Share on WhatsApp"}
          </button>

          {/* Copy link */}
          <button
            onClick={copyLink}
            style={{ width: "100%", padding: "13px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, color: "#fff", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            🔗 Copy Link
          </button>

          {/* Copy image */}
          <button
            onClick={copyImage}
            disabled={busy}
            style={{ width: "100%", padding: "13px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, color: "#888", fontSize: "0.875rem", fontWeight: 600, cursor: busy ? "wait" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy ? 0.7 : 1 }}
          >
            🖼 Copy Share Image
          </button>
        </div>
      </div>
    </div>
  );
}
