"use client";

import { useEffect, useState, useRef } from "react";

interface Photo {
  id: string;
  uploader_email: string;
  uploader_name: string;
  photo_url: string;
  caption: string | null;
  created_at: string;
  likes: number;
  user_liked: boolean;
}

interface PhotoComment {
  id: string;
  commenter_email: string;
  commenter_name: string;
  comment: string;
  created_at: string;
}

interface SessionPhotosProps {
  sessionId: number;
  userEmail: string;
  userName: string;
}

export default function SessionPhotos({ sessionId, userEmail, userName }: SessionPhotosProps) {
  const [photos, setPhotos]       = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption]     = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [error, setError]         = useState("");
  const [lightbox, setLightbox]   = useState<Photo | null>(null);
  const [comments, setComments]   = useState<PhotoComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}/photos?user_email=${encodeURIComponent(userEmail)}`)
      .then(r => r.json())
      .then(d => setPhotos(d.photos ?? []));
  }, [sessionId, userEmail]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError("");
    try {
      const form = new FormData();
      form.append("photo", file);
      form.append("uploader_email", userEmail);
      form.append("uploader_name", userName);
      if (caption.trim()) form.append("caption", caption.trim());
      const res  = await fetch(`/api/sessions/${sessionId}/photos`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Upload failed"); return; }
      setPhotos(prev => [{ ...data.photo, user_liked: false }, ...prev]);
      setCaption(""); setShowUpload(false);
    } catch { setError("Upload failed. Try again."); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function toggleLike(photoId: string) {
    const res  = await fetch(`/api/sessions/${sessionId}/photos/${photoId}?action=like`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_email: userEmail }),
    });
    const data = await res.json();
    const liked = data.action === "liked";
    setPhotos(prev => prev.map(p =>
      p.id === photoId
        ? { ...p, likes: p.likes + (liked ? 1 : -1), user_liked: liked }
        : p
    ));
    if (lightbox?.id === photoId) {
      setLightbox(prev => prev ? { ...prev, likes: prev.likes + (liked ? 1 : -1), user_liked: liked } : null);
    }
  }

  async function deletePhoto(photoId: string) {
    await fetch(`/api/sessions/${sessionId}/photos/${photoId}?email=${encodeURIComponent(userEmail)}`, { method: "DELETE" });
    setPhotos(prev => prev.filter(p => p.id !== photoId));
    if (lightbox?.id === photoId) setLightbox(null);
  }

  function openLightbox(photo: Photo) {
    setLightbox(photo);
    setComments([]);
    setNewComment("");
    fetch(`/api/sessions/${sessionId}/photos/${photo.id}/comments`)
      .then(r => r.json())
      .then(d => setComments(d.comments ?? []));
  }

  async function postComment() {
    if (!newComment.trim() || !lightbox) return;
    setPostingComment(true);
    try {
      const res  = await fetch(`/api/sessions/${sessionId}/photos/${lightbox.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commenter_email: userEmail, commenter_name: userName, comment: newComment.trim() }),
      });
      const data = await res.json();
      if (res.ok) { setComments(prev => [...prev, data.comment]); setNewComment(""); }
    } finally { setPostingComment(false); }
  }

  async function deleteComment(commentId: string) {
    if (!lightbox) return;
    await fetch(`/api/sessions/${sessionId}/photos/${lightbox.id}/comments?comment_id=${commentId}&email=${encodeURIComponent(userEmail)}`, { method: "DELETE" });
    setComments(prev => prev.filter(c => c.id !== commentId));
  }

  return (
    <>
      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
        >
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: "min(560px, 95vw)", width: "100%", background: "var(--cs-dark)", borderRadius: "12px", overflow: "hidden", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
            <img src={lightbox.photo_url} alt={lightbox.caption ?? "Session photo"} style={{ width: "100%", maxHeight: "50vh", objectFit: "contain", display: "block", background: "#000", flexShrink: 0 }} />

            <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
              {/* Uploader + like + delete */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--cs-white)", flex: 1 }}>{lightbox.uploader_name}</span>
                <button onClick={() => toggleLike(lightbox.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "1.1rem", lineHeight: 1 }}>
                  {lightbox.user_liked ? "❤️" : "🤍"}
                </button>
                <span style={{ fontSize: "0.82rem", color: "var(--cs-muted)", minWidth: "20px" }}>{lightbox.likes}</span>
                {lightbox.uploader_email === userEmail && (
                  <button onClick={() => deletePhoto(lightbox.id)} style={{ background: "rgba(240,149,149,0.12)", border: "1px solid rgba(240,149,149,0.25)", borderRadius: "4px", cursor: "pointer", padding: "4px 10px", fontSize: "0.72rem", color: "#f09595", fontFamily: "inherit" }}>
                    Delete
                  </button>
                )}
              </div>
              {lightbox.caption && <div style={{ fontSize: "0.78rem", color: "var(--cs-muted)", marginTop: "0.3rem", lineHeight: 1.5 }}>{lightbox.caption}</div>}
            </div>

            {/* Comments */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0.6rem 1rem" }}>
              {comments.length === 0 ? (
                <div style={{ fontSize: "0.75rem", color: "var(--cs-muted)", textAlign: "center", padding: "0.5rem 0" }}>No comments yet. Be the first!</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {comments.map(c => (
                    <div key={c.id} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                      <div style={{ width: 26, height: 26, borderRadius: "50%", background: "oklch(0.72 0.19 49 / 15%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 700, color: "var(--cs-orange)", flexShrink: 0 }}>
                        {c.commenter_name[0]?.toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--cs-white)" }}>{c.commenter_name} </span>
                        <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>{c.comment}</span>
                      </div>
                      {c.commenter_email === userEmail && (
                        <button onClick={() => deleteComment(c.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "10px", color: "rgba(240,149,149,0.5)", flexShrink: 0 }}>✕</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Comment input */}
            <div style={{ padding: "0.6rem 1rem", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: "0.5rem", alignItems: "center", flexShrink: 0 }}>
              <input
                ref={commentInputRef}
                type="text"
                placeholder="Add a comment…"
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") postComment(); }}
                style={{ flex: 1, padding: "7px 10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "var(--cs-white)", fontSize: "0.8rem", fontFamily: "inherit", outline: "none" }}
              />
              <button
                onClick={postComment}
                disabled={postingComment || !newComment.trim()}
                style={{ padding: "7px 14px", background: newComment.trim() ? "var(--cs-orange)" : "rgba(255,255,255,0.08)", border: "none", borderRadius: "6px", cursor: newComment.trim() ? "pointer" : "default", fontSize: "0.78rem", fontWeight: 600, color: newComment.trim() ? "#fff" : "var(--cs-muted)", fontFamily: "inherit", flexShrink: 0 }}
              >
                {postingComment ? "…" : "Post"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "0.875rem 1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.65rem" }}>
          <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.07em", textTransform: "uppercase" }}>
            Photos{photos.length > 0 ? ` · ${photos.length}` : ""}
          </div>
          <button
            onClick={() => setShowUpload(v => !v)}
            style={{ fontSize: "0.75rem", color: "var(--cs-orange)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0, fontWeight: 600 }}
          >
            {showUpload ? "Cancel" : "+ Add photo"}
          </button>
        </div>

        {showUpload && (
          <div style={{ marginBottom: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <input
              type="text"
              placeholder="Add a caption (optional)"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "var(--cs-white)", fontSize: "0.8rem", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{ alignSelf: "flex-start", padding: "7px 16px", background: "var(--cs-orange)", color: "#fff", border: "none", borderRadius: "4px", fontSize: "0.78rem", fontWeight: 600, cursor: uploading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: uploading ? 0.7 : 1 }}
            >
              {uploading ? "Uploading…" : "Choose Photo"}
            </button>
            {error && <div style={{ fontSize: "0.75rem", color: "#f09595" }}>{error}</div>}
          </div>
        )}

        {photos.length > 0 ? (
          <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "6px" }}>
            {photos.map(photo => (
              <div key={photo.id} style={{ flexShrink: 0, width: "120px" }}>
                <div
                  onClick={() => openLightbox(photo)}
                  style={{ cursor: "pointer", position: "relative", borderRadius: "6px", overflow: "hidden" }}
                >
                  <img
                    src={photo.photo_url}
                    alt={photo.caption ?? "Session photo"}
                    style={{ width: "120px", height: "90px", objectFit: "cover", display: "block" }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "4px", paddingLeft: "2px" }}>
                  <button
                    onClick={() => toggleLike(photo.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "13px", lineHeight: 1 }}
                  >
                    {photo.user_liked ? "❤️" : "🤍"}
                  </button>
                  <span style={{ fontSize: "11px", color: "var(--cs-muted)", flex: 1 }}>{photo.likes > 0 ? photo.likes : ""}</span>
                  {photo.uploader_email === userEmail && (
                    <button
                      onClick={() => deletePhoto(photo.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "11px", color: "rgba(240,149,149,0.5)", lineHeight: 1 }}
                      title="Delete photo"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", marginTop: "1px", paddingLeft: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {photo.uploader_name}
                </div>
                {photo.caption && (
                  <div style={{ fontSize: "10px", color: "var(--cs-muted)", marginTop: "1px", paddingLeft: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {photo.caption}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : !showUpload ? (
          <div style={{ fontSize: "0.78rem", color: "var(--cs-muted)" }}>
            Be the first to share a photo from this session!
          </div>
        ) : null}
      </div>
    </>
  );
}
