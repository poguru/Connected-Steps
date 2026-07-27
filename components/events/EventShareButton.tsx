"use client";

interface Props { title: string; url: string }

export default function EventShareButton({ title, url }: Props) {
  async function share() {
    if (navigator.share) {
      try { await navigator.share({ title, url }); return; } catch { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      const btn = document.getElementById("ep-share-btn");
      if (btn) { btn.textContent = "✓ Copied!"; setTimeout(() => { btn.textContent = "Share"; }, 2000); }
    } catch { /* ignore */ }
  }

  return (
    <button
      id="ep-share-btn"
      onClick={share}
      style={{
        padding: "5px 12px", borderRadius: 999,
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
        color: "rgba(255,255,255,0.5)", fontSize: "11px", fontWeight: 600,
        cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
      }}
    >
      Share
    </button>
  );
}
