"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight, Play, Image as ImageIcon } from "lucide-react";

export interface GalleryItem {
  id:        string;
  type:      "image" | "video";
  url:       string;
  thumb:     string;          // thumbnail URL (same as url for images)
  caption?:  string | null;
}

interface Props {
  items:         GalleryItem[];
  initialIndex?: number;
  title?:        string;
  onClose:       () => void;
}

// Pause all video elements in the document except one
function pauseOtherVideos(except?: HTMLVideoElement | null) {
  document.querySelectorAll<HTMLVideoElement>("video").forEach(v => {
    if (v !== except) { v.pause(); }
  });
}

export default function MediaGallery({ items, initialIndex = 0, title, onClose }: Props) {
  const [index,    setIndex]    = useState(initialIndex);
  const [loading,  setLoading]  = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const current = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape")      onClose();
      if (e.key === "ArrowLeft"  && hasPrev) go(index - 1);
      if (e.key === "ArrowRight" && hasNext) go(index + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, hasPrev, hasNext]);

  // Autoplay video when it becomes current
  useEffect(() => {
    setLoading(true);
    if (current?.type === "video" && videoRef.current) {
      pauseOtherVideos(videoRef.current);
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    } else {
      pauseOtherVideos();
    }
  }, [current]);

  // Touch swipe
  const touchStart = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touchStart.current = e.touches[0].clientX; };
  const onTouchEnd   = (e: React.TouchEvent) => {
    if (touchStart.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStart.current;
    if (Math.abs(delta) > 50) {
      if (delta < 0 && hasNext) go(index + 1);
      if (delta > 0 && hasPrev) go(index - 1);
    }
    touchStart.current = null;
  };

  const go = useCallback((i: number) => {
    setLoading(true);
    setIndex(i);
  }, []);

  return (
    <AnimatePresence>
      <motion.div
        key="gallery-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        style={{
          position:  "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.96)",
          backdropFilter: "blur(20px)",
          display: "flex", flexDirection: "column",
        }}
        aria-modal="true"
        role="dialog"
        aria-label={title ?? "Media gallery"}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* ── Header ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}>
          <div>
            {title && (
              <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#fff" }}>{title}</div>
            )}
            <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
              {index + 1} / {items.length}
              {current?.type === "video" && (
                <span style={{ marginLeft: 8, color: "var(--cs-orange)" }}>● Video</span>
              )}
            </div>
          </div>

          {/* Thumbnail strip */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", maxWidth: "50vw", padding: "4px 0" }}>
            {items.map((item, i) => (
              <button
                key={item.id}
                onClick={() => go(i)}
                style={{
                  width: 44, height: 44, flexShrink: 0, borderRadius: 8,
                  overflow: "hidden", border: `2px solid ${i === index ? "var(--cs-orange)" : "transparent"}`,
                  padding: 0, background: "rgba(255,255,255,0.06)", cursor: "pointer",
                  position: "relative",
                }}
                aria-label={`Go to item ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.thumb}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  loading="lazy"
                />
                {item.type === "video" && (
                  <div style={{
                    position: "absolute", inset: 0, display: "flex",
                    alignItems: "center", justifyContent: "center",
                    background: "rgba(0,0,0,0.35)",
                  }}>
                    <Play size={12} style={{ color: "#fff" }} />
                  </div>
                )}
              </button>
            ))}
          </div>

          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
              color: "#fff", width: 38, height: 38, borderRadius: "50%",
              cursor: "pointer", fontSize: "1.1rem",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
            aria-label="Close gallery"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Main viewer ── */}
        <div style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", overflow: "hidden",
          padding: "0 60px",
        }}>

          {/* Prev */}
          {hasPrev && (
            <button
              onClick={() => go(index - 1)}
              style={{
                position: "absolute", left: 12, zIndex: 2,
                background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.12)",
                color: "#fff", width: 44, height: 44, borderRadius: "50%",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}
              aria-label="Previous"
            >
              <ChevronLeft size={22} />
            </button>
          )}

          {/* Media display */}
          <AnimatePresence mode="wait">
            <motion.div
              key={current?.id}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.22 }}
              style={{
                maxWidth: "100%", maxHeight: "calc(100vh - 180px)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {current?.type === "video" ? (
                <video
                  ref={videoRef}
                  src={current.url}
                  controls
                  playsInline
                  style={{
                    maxWidth: "100%", maxHeight: "calc(100vh - 180px)",
                    borderRadius: 12, display: "block",
                    outline: "none",
                  }}
                  onLoadedData={() => setLoading(false)}
                  onError={() => setLoading(false)}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current?.url}
                  alt={current?.caption ?? ""}
                  style={{
                    maxWidth: "100%", maxHeight: "calc(100vh - 180px)",
                    borderRadius: 12, display: "block",
                    objectFit: "contain",
                  }}
                  onLoad={() => setLoading(false)}
                  onError={() => setLoading(false)}
                />
              )}
            </motion.div>
          </AnimatePresence>

          {/* Loading spinner */}
          {loading && (
            <div style={{
              position: "absolute", inset: 0, display: "flex",
              alignItems: "center", justifyContent: "center",
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                border: "3px solid rgba(255,255,255,0.1)",
                borderTopColor: "var(--cs-orange)",
                animation: "spin 0.8s linear infinite",
              }} />
            </div>
          )}

          {/* Next */}
          {hasNext && (
            <button
              onClick={() => go(index + 1)}
              style={{
                position: "absolute", right: 12, zIndex: 2,
                background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.12)",
                color: "#fff", width: 44, height: 44, borderRadius: "50%",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}
              aria-label="Next"
            >
              <ChevronRight size={22} />
            </button>
          )}
        </div>

        {/* ── Caption ── */}
        {current?.caption && (
          <div style={{
            padding: "12px 20px", textAlign: "center",
            fontSize: "0.78rem", color: "rgba(255,255,255,0.5)",
            flexShrink: 0,
          }}>
            {current.caption}
          </div>
        )}

        {/* ── Media type indicator strip ── */}
        <div style={{
          display: "flex", justifyContent: "center", gap: 6,
          padding: "12px 20px 20px", flexShrink: 0,
        }}>
          {items.map((item, i) => (
            <button
              key={item.id}
              onClick={() => go(i)}
              style={{
                width: i === index ? 20 : 6, height: 6, borderRadius: 3,
                background: i === index ? "var(--cs-orange)" : "rgba(255,255,255,0.2)",
                border: "none", cursor: "pointer", padding: 0,
                transition: "width 0.3s ease, background 0.2s",
              }}
              aria-label={`Item ${i + 1}`}
            />
          ))}
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </motion.div>
    </AnimatePresence>
  );
}
