"use client";
import React, { useEffect } from "react";
import { color, radius, shadow, transition, font } from "./tokens";

interface ModalProps {
  open:        boolean;
  onClose:     () => void;
  title?:      string;
  children:    React.ReactNode;
  footer?:     React.ReactNode;
  maxWidth?:   number;
  closable?:   boolean;
}

export function Modal({ open, onClose, title, children, footer, maxWidth = 520, closable = true }: ModalProps) {
  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && closable) onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, closable, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget && closable) onClose(); }}
      style={{
        position:        "fixed",
        inset:           0,
        zIndex:          9000,
        background:      "rgba(0,0,0,0.75)",
        backdropFilter:  "blur(8px)",
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
        padding:         "20px",
        animation:       "cs-fade-in 0.15s ease",
      }}
    >
      <div
        style={{
          background:   color.dark,
          border:       `1px solid ${color.border}`,
          borderRadius: radius.xl,
          boxShadow:    shadow.lg,
          width:        "100%",
          maxWidth,
          maxHeight:    "90vh",
          overflow:     "hidden",
          display:      "flex",
          flexDirection:"column",
          animation:    "cs-slide-up 0.18s ease",
          fontFamily:   font.body,
        }}
      >
        {/* Header */}
        {(title || closable) && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${color.border}`, flexShrink: 0 }}>
            {title && <div style={{ fontSize: "15px", fontWeight: 700, color: color.textPrimary }}>{title}</div>}
            {closable && (
              <button
                onClick={onClose}
                aria-label="Close modal"
                style={{ background: "none", border: "none", color: color.textMuted, cursor: "pointer", fontSize: "18px", lineHeight: 1, padding: "2px 6px", borderRadius: radius.sm, transition: transition.fast, marginLeft: "auto" }}
              >
                ×
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div style={{ padding: "20px", overflowY: "auto", flex: 1 }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{ padding: "14px 20px", borderTop: `1px solid ${color.border}`, display: "flex", gap: "10px", justifyContent: "flex-end", flexShrink: 0 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// Confirmation dialog
interface ConfirmProps {
  open:        boolean;
  onClose:     () => void;
  onConfirm:   () => void;
  title:       string;
  message:     string;
  confirmLabel?: string;
  danger?:     boolean;
  loading?:    boolean;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = "Confirm", danger = false, loading = false }: ConfirmProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth={400}
      footer={
        <>
          <button onClick={onClose} style={{ padding: "8px 18px", background: "none", border: `1px solid ${color.border}`, borderRadius: radius.sm, color: color.textMuted, cursor: "pointer", fontFamily: font.body, fontSize: "13px", fontWeight: 600 }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            style={{ padding: "8px 18px", background: danger ? color.errorBg : "linear-gradient(135deg,#e8620a,#f07c2a)", border: danger ? `1px solid ${color.errorBorder}` : "none", borderRadius: radius.sm, color: danger ? color.error : "#fff", cursor: loading ? "not-allowed" : "pointer", fontFamily: font.body, fontSize: "13px", fontWeight: 600, opacity: loading ? 0.6 : 1 }}>
            {loading ? "Please wait…" : confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: "14px", color: color.textSecondary, lineHeight: 1.6 }}>{message}</p>
    </Modal>
  );
}
