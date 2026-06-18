"use client";

import { useRef, useState } from "react";
import type { UserPost } from "@/app/api/posts/route";

type PostType = "general" | "run" | "achievement" | "race" | "question";

const POST_TYPES: { id: PostType; label: string; emoji: string; placeholder: string }[] = [
  { id: "general",     label: "Post",        emoji: "✍️",  placeholder: "What's on your mind?" },
  { id: "run",         label: "Run",         emoji: "🏃",  placeholder: "Share your run — distance, how it felt, where you went…" },
  { id: "achievement", label: "Achievement", emoji: "🏅",  placeholder: "Celebrate a milestone — a PR, first race, a new distance…" },
  { id: "race",        label: "Race",        emoji: "🏁",  placeholder: "Race update — result, how it went, what you learned…" },
  { id: "question",    label: "Question",    emoji: "❓",  placeholder: "Ask the community — training, gear, injury, anything…" },
];

interface Props {
  currentUserEmail: string;
  currentUserName:  string;
  onPosted:         (post: UserPost) => void;
  onClose:          () => void;
}

export default function CreatePost({ currentUserEmail, currentUserName, onPosted, onClose }: Props) {
  const [postType,     setPostType]     = useState<PostType>("general");
  const [body,         setBody]         = useState("");
  const [photo,        setPhoto]        = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState("");
  const fileRef  = useRef<HTMLInputElement>(null);
  const textaRef = useRef<HTMLTextAreaElement>(null);

  const selectedType = POST_TYPES.find(t => t.id === postType)!;
  const charCount    = body.length;
  const canPost      = body.trim().length > 0 && charCount <= 800;

  const counterColor =
    charCount >= 800 ? "#f09595" :
    charCount >= 700 ? "#f59e0b" :
    "var(--muted-foreground)";

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("Photo must be under 5MB"); return; }
    setPhoto(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
    setError("");
  }

  function removePhoto() {
    setPhoto(null);
    setPhotoPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit() {
    if (!body.trim()) { setError("Write something first."); return; }
    if (body.length > 800) { setError("Keep it under 800 characters."); return; }
    setSubmitting(true); setError("");

    try {
      const token = typeof window !== "undefined" ? (localStorage.getItem("cs_user_token") ?? "") : "";
      let res: Response;
      if (photo) {
        const form = new FormData();
        form.append("body",        body.trim());
        form.append("post_type",   postType);
        form.append("author_name", currentUserName);
        form.append("photo",       photo);
        res = await fetch("/api/posts", { method: "POST", headers: { "x-user-token": token }, body: form });
      } else {
        res = await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-user-token": token },
          body: JSON.stringify({ body: body.trim(), post_type: postType, author_name: currentUserName }),
        });
      }

      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }
      onPosted(data.post);
    } catch { setError("Network error. Try again."); }
    finally  { setSubmitting(false); }
  }

  return (
    <>
      {/* Overlay — z-index 200 sits above bottom nav (z-index 100) */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.72)",
          zIndex: 200,
          backdropFilter: "blur(4px)",
        }}
      />

      {/* Sheet — flex column so footer never scrolls away */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0,
        zIndex: 201,
        background: "var(--background)",
        borderRadius: "20px 20px 0 0",
        border: "1px solid var(--border)",
        borderBottom: "none",
        maxWidth: 640,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        maxHeight: "85dvh",
      }}>

        {/* Drag handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border)", margin: "12px auto 0", flexShrink: 0 }} />

        {/* ── Header: title + Post CTA ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0.75rem 1.25rem 0.625rem",
          flexShrink: 0,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", fontSize: "1.1rem", padding: 4, lineHeight: 1, fontFamily: "inherit" }}>✕</button>
          <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--foreground)" }}>New Post</span>
          <button
            onClick={submit}
            disabled={submitting || !canPost}
            style={{
              padding: "8px 20px",
              background: canPost ? "var(--gradient-accent)" : "rgba(255,255,255,0.06)",
              border: "none",
              borderRadius: 20,
              color: canPost ? "#fff" : "var(--muted-foreground)",
              fontSize: "0.85rem",
              fontWeight: 700,
              cursor: canPost ? "pointer" : "not-allowed",
              fontFamily: "inherit",
              boxShadow: canPost ? "var(--shadow-orange)" : "none",
              transition: "all 0.15s",
              minWidth: 68,
            }}>
            {submitting ? "Posting…" : "Post"}
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1rem 1.25rem", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>

          {/* Post type chips */}
          <div style={{ display: "flex", gap: "6px", marginBottom: "1rem", overflowX: "auto", paddingBottom: 2 }}>
            {POST_TYPES.map(t => (
              <button key={t.id} onClick={() => setPostType(t.id)}
                style={{
                  flexShrink: 0, padding: "6px 12px", borderRadius: 20, border: "1px solid",
                  cursor: "pointer", fontFamily: "inherit", fontSize: "0.78rem", fontWeight: 600,
                  transition: "all 0.15s",
                  background:   postType === t.id ? "oklch(0.72 0.19 49 / 15%)" : "transparent",
                  borderColor:  postType === t.id ? "oklch(0.72 0.19 49 / 50%)" : "var(--border)",
                  color:        postType === t.id ? "var(--cs-orange)" : "var(--muted-foreground)",
                  whiteSpace: "nowrap",
                }}>
                {t.emoji} {t.label}
              </button>
            ))}
          </div>

          {/* Author row */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.875rem" }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "oklch(0.72 0.19 49 / 15%)", border: "1px solid oklch(0.72 0.19 49 / 25%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, color: "var(--cs-orange)", flexShrink: 0 }}>
              {currentUserName.charAt(0).toUpperCase()}
            </div>
            <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--foreground)" }}>{currentUserName}</div>
          </div>

          {/* Textarea */}
          <textarea
            ref={textaRef}
            value={body}
            onChange={e => { setBody(e.target.value); setError(""); }}
            placeholder={selectedType.placeholder}
            rows={5}
            maxLength={800}
            style={{
              width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)",
              borderRadius: 10, padding: "10px 12px", color: "var(--foreground)", fontSize: "0.875rem",
              fontFamily: "inherit", resize: "none", outline: "none", boxSizing: "border-box", lineHeight: 1.6,
            }}
            onFocus={e => (e.currentTarget.style.borderColor = "oklch(0.72 0.19 49 / 60%)")}
            onBlur={e  => (e.currentTarget.style.borderColor = "var(--border)")}
            autoFocus
          />

          {/* Character counter — subtle, below textarea */}
          <div style={{ fontSize: "11px", color: counterColor, textAlign: "right", marginTop: 4, marginBottom: "0.875rem", fontWeight: charCount >= 700 ? 600 : 400, transition: "color 0.15s" }}>
            {charCount} / 800 characters
          </div>

          {/* Photo preview */}
          {photoPreview && (
            <div style={{ position: "relative", marginBottom: "0.875rem" }}>
              <img src={photoPreview} alt="Preview" style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 8 }} />
              <button onClick={removePhoto}
                style={{ position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", cursor: "pointer", color: "#fff", fontSize: "0.7rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
                ✕
              </button>
            </div>
          )}

          {error && (
            <div style={{ fontSize: "0.78rem", color: "#f09595", marginBottom: "0.75rem" }}>{error}</div>
          )}
        </div>

        {/* ── Sticky footer action row ── */}
        <div style={{
          flexShrink: 0,
          borderTop: "1px solid rgba(255,255,255,0.06)",
          padding: "0.75rem 1.25rem",
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          background: "var(--background)",
        }}>
          <button
            onClick={() => fileRef.current?.click()}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "9px 14px",
              background: photo ? "oklch(0.72 0.19 49 / 12%)" : "transparent",
              border: `1px solid ${photo ? "oklch(0.72 0.19 49 / 40%)" : "var(--border)"}`,
              borderRadius: 8, cursor: "pointer", fontSize: "0.8rem",
              color: photo ? "var(--cs-orange)" : "var(--muted-foreground)",
              fontFamily: "inherit", transition: "all 0.15s",
            }}>
            📷 Photo
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhoto} />

          <div style={{ flex: 1 }} />

          <button onClick={onClose}
            style={{ padding: "9px 16px", background: "transparent", border: "1px solid var(--border)", borderRadius: 8, color: "var(--muted-foreground)", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>

          <button
            onClick={submit}
            disabled={submitting || !canPost}
            style={{
              padding: "9px 22px",
              background: canPost ? "var(--gradient-accent)" : "rgba(255,255,255,0.06)",
              border: "none",
              borderRadius: 8,
              color: canPost ? "#fff" : "var(--muted-foreground)",
              fontSize: "0.85rem", fontWeight: 700,
              cursor: canPost ? "pointer" : "not-allowed",
              fontFamily: "inherit",
              boxShadow: canPost ? "var(--shadow-orange)" : "none",
              transition: "all 0.15s",
            }}>
            {submitting ? "Posting…" : "Post →"}
          </button>
        </div>
      </div>
    </>
  );
}
