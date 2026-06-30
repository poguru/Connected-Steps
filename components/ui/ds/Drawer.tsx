"use client";
import React, { useEffect } from "react";
import { color, shadow, font, zIndex } from "./tokens";
import { ease } from "./motion";

interface DrawerProps {
  open:       boolean;
  onClose:    () => void;
  title?:     string;
  children:   React.ReactNode;
  footer?:    React.ReactNode;
  placement?: "right" | "left" | "bottom";
  width?:     number | string;
}

export function Drawer({ open, onClose, title, children, footer, placement = "right", width = 400 }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const isVertical = placement === "bottom";

  const drawerStyle: React.CSSProperties = {
    position:  "fixed",
    zIndex:    zIndex.modal,
    background: color.dark,
    boxShadow: shadow.lg,
    display:   "flex",
    flexDirection: "column",
    fontFamily: font.body,
    ...(placement === "right"  ? { top: 0, right: 0, bottom: 0, width, borderLeft:   `1px solid ${color.border}`, transform: open ? "translateX(0)" : "translateX(100%)" } : {}),
    ...(placement === "left"   ? { top: 0, left:  0, bottom: 0, width, borderRight:  `1px solid ${color.border}`, transform: open ? "translateX(0)" : "translateX(-100%)" } : {}),
    ...(placement === "bottom" ? { left: 0, right: 0, bottom: 0, maxHeight: "80vh",  borderTop: `1px solid ${color.border}`, borderRadius: "16px 16px 0 0", transform: open ? "translateY(0)" : "translateY(100%)" } : {}),
    transition: `transform 0.28s cubic-bezier(0.32,0.72,0,1)`,
    overflow:   "hidden",
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: zIndex.overlay, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none", transition: "opacity 0.25s ease" }}
      />

      {/* Drawer panel */}
      <div style={drawerStyle}>
        {/* Header */}
        {(title || true) && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${color.border}`, flexShrink: 0 }}>
            {title ? (
              <div style={{ fontSize: "15px", fontWeight: 700, color: color.textPrimary }}>{title}</div>
            ) : (
              <div style={{ width: "48px", height: "4px", background: color.border, borderRadius: "2px", margin: "0 auto" }} />
            )}
            <button onClick={onClose} style={{ background: "none", border: "none", color: color.textMuted, cursor: "pointer", fontSize: "20px", lineHeight: 1, padding: "0 4px", marginLeft: "auto" }}>×</button>
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{ padding: "14px 20px", borderTop: `1px solid ${color.border}`, display: "flex", gap: "10px", justifyContent: "flex-end", flexShrink: 0 }}>
            {footer}
          </div>
        )}
      </div>
    </>
  );
}
