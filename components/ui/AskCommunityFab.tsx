"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

const POST_CATS = ["General", "Recovery", "Shoes & Gear", "Races & Marathons", "Running Tips"];
const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  "Recovery":           { bg: "rgba(74,222,128,0.1)",  color: "#4ade80" },
  "Shoes & Gear":       { bg: "rgba(96,165,250,0.1)",  color: "#60a5fa" },
  "Races & Marathons":  { bg: "rgba(232,98,10,0.12)",  color: "#e8620a" },
  "Running Tips":       { bg: "rgba(251,191,36,0.1)",  color: "#fbbf24" },
  "General":            { bg: "rgba(255,255,255,0.06)", color: "#888"    },
};

function AskModal({ onClose }: { onClose: () => void }) {
  const [form,   setForm]   = useState({ category: "General", title: "", body: "" });
  const [saving, setSaving] = useState(false);
  const [msg,    setMsg]    = useState("");

  async function submit() {
    if (!form.title.trim() || !form.body.trim()) { setMsg("Please fill in both the title and description."); return; }
    setSaving(true); setMsg("");
    try {
      const raw  = typeof window !== "undefined" ? localStorage.getItem("cs_user") : null;
      const user = raw ? JSON.parse(raw) : null;
      if (!user?.email) { setMsg("Please log in to post."); return; }
      const res  = await fetch("/api/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_email: user.email,
          user_name:  `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email.split("@")[0],
          category:   form.category,
          title:      form.title.trim(),
          body:       form.body.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error ?? "Something went wrong."); return; }
      setMsg("✓ Posted! It will appear after admin review.");
      setTimeout(() => onClose(), 2000);
    } catch { setMsg("Something went wrong. Please try again."); }
    finally { setSaving(false); }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "14px", padding: "2rem", width: "100%", maxWidth: "500px", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "1rem", fontWeight: 700, color: "#fff" }}>Ask the Community</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#888", fontSize: "1.25rem", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        <div>
          <div style={{ fontSize: "11px", color: "#888", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>Category</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {POST_CATS.map((cat) => {
              const c = CATEGORY_COLORS[cat];
              const active = form.category === cat;
              return (
                <button key={cat} onClick={() => setForm((f) => ({ ...f, category: cat }))}
                  style={{ padding: "5px 14px", borderRadius: "20px", fontSize: "0.78rem", fontWeight: 500, cursor: "pointer", fontFamily: "inherit", border: "none", background: active ? c.bg : "rgba(255,255,255,0.05)", color: active ? c.color : "#888", outline: active ? `1px solid ${c.color}40` : "none", transition: "all 0.15s" }}>
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div style={{ fontSize: "11px", color: "#888", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>Title / Question</div>
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value.slice(0, 120) }))}
            placeholder="e.g. Best recovery drink after a long run?" maxLength={120}
            style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff", fontSize: "0.875rem", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
          <div style={{ fontSize: "10px", color: "#555", textAlign: "right", marginTop: "3px" }}>{form.title.length}/120</div>
        </div>

        <div>
          <div style={{ fontSize: "11px", color: "#888", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>Details</div>
          <textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value.slice(0, 600) }))}
            placeholder="Share your question, tip, or experience in detail…" maxLength={600} rows={5}
            style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff", fontSize: "0.875rem", outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", lineHeight: 1.6 }} />
          <div style={{ fontSize: "10px", color: "#555", textAlign: "right", marginTop: "3px" }}>{form.body.length}/600</div>
        </div>

        {msg && <div style={{ fontSize: "0.82rem", color: msg.startsWith("✓") ? "#4ade80" : "#f09595", textAlign: "center" }}>{msg}</div>}

        <button onClick={submit} disabled={saving}
          style={{ padding: "12px", background: "#e8620a", color: "#fff", border: "none", borderRadius: "8px", fontSize: "0.9rem", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, fontFamily: "inherit" }}>
          {saving ? "Posting…" : "Post to Community"}
        </button>
      </div>
    </div>
  );
}

export default function AskCommunityFab() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  if (pathname !== "/dashboard") return null;

  function handleClick() {
    const raw = typeof window !== "undefined" ? localStorage.getItem("cs_user") : null;
    if (!raw) { window.location.href = "/auth"; return; }
    setOpen(true);
  }

  return (
    <>
      <button
        onClick={handleClick}
        style={{ position: "fixed", bottom: "160px", right: "24px", zIndex: 50, display: "flex", alignItems: "center", gap: "8px", padding: "13px 22px", background: "var(--cs-orange)", color: "#fff", border: "none", borderRadius: "50px", fontSize: "0.875rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 20px rgba(232,98,10,0.45)", transition: "transform 0.15s, box-shadow 0.15s" }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 28px rgba(232,98,10,0.55)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(232,98,10,0.45)"; }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Ask a question
      </button>
      {open && <AskModal onClose={() => setOpen(false)} />}
    </>
  );
}
