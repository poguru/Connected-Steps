"use client";
import React, { createContext, useCallback, useContext, useReducer, useEffect } from "react";
import { color, radius, shadow, font, zIndex } from "./tokens";
import { ease } from "./motion";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToastVariant = "success" | "error" | "warning" | "info";

interface ToastItem {
  id:       string;
  variant:  ToastVariant;
  title:    string;
  message?: string;
  duration: number;
}

type ToastAction =
  | { type: "ADD";    toast: ToastItem }
  | { type: "REMOVE"; id: string };

// ── Context ───────────────────────────────────────────────────────────────────

interface ToastContextValue {
  toast:   (variant: ToastVariant, title: string, message?: string, duration?: number) => void;
  success: (title: string, message?: string) => void;
  error:   (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info:    (title: string, message?: string) => void;
}

const ToastCtx = createContext<ToastContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

function reducer(state: ToastItem[], action: ToastAction): ToastItem[] {
  if (action.type === "ADD")    return [...state, action.toast];
  if (action.type === "REMOVE") return state.filter(t => t.id !== action.id);
  return state;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, dispatch] = useReducer(reducer, []);

  const remove = useCallback((id: string) => dispatch({ type: "REMOVE", id }), []);

  const add = useCallback((variant: ToastVariant, title: string, message?: string, duration = 4000) => {
    const id = Math.random().toString(36).slice(2);
    dispatch({ type: "ADD", toast: { id, variant, title, message, duration } });
    if (duration > 0) setTimeout(() => remove(id), duration);
  }, [remove]);

  const ctx: ToastContextValue = {
    toast:   add,
    success: (t, m) => add("success", t, m),
    error:   (t, m) => add("error",   t, m),
    warning: (t, m) => add("warning", t, m),
    info:    (t, m) => add("info",    t, m),
  };

  return (
    <ToastCtx.Provider value={ctx}>
      {children}
      <ToastContainer toasts={toasts} onRemove={remove} />
    </ToastCtx.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

// ── Container ─────────────────────────────────────────────────────────────────

const toastConfig: Record<ToastVariant, { icon: string; border: string; title: string }> = {
  success: { icon: "✅", border: color.successBorder, title: color.success },
  error:   { icon: "❌", border: color.errorBorder,   title: color.error   },
  warning: { icon: "⚠️", border: color.warningBorder, title: color.warning },
  info:    { icon: "ℹ️", border: color.infoBorder,    title: color.info    },
};

function ToastContainer({ toasts, onRemove }: { toasts: ToastItem[]; onRemove: (id: string) => void }) {
  if (!toasts.length) return null;
  return (
    <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: zIndex.toast, display: "flex", flexDirection: "column", gap: "8px", maxWidth: "360px" }}>
      {toasts.map(t => <ToastItem key={t.id} toast={t} onClose={() => onRemove(t.id)} />)}
    </div>
  );
}

function ToastItem({ toast, onClose }: { toast: ToastItem; onClose: () => void }) {
  const cfg = toastConfig[toast.variant];
  return (
    <div style={{ background: color.charcoal, border: `1px solid ${cfg.border}`, borderRadius: radius.md, padding: "12px 14px", display: "flex", gap: "10px", alignItems: "flex-start", boxShadow: shadow.lg, animation: "cs-slide-up 0.2s ease", fontFamily: font.body, minWidth: "280px" }}>
      <span style={{ fontSize: "16px", flexShrink: 0, marginTop: "1px" }}>{cfg.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: cfg.title }}>{toast.title}</div>
        {toast.message && <div style={{ fontSize: "12px", color: color.textMuted, marginTop: "2px", lineHeight: 1.5 }}>{toast.message}</div>}
      </div>
      <button onClick={onClose} style={{ background: "none", border: "none", color: color.textMuted, cursor: "pointer", fontSize: "16px", lineHeight: 1, padding: "0 2px", flexShrink: 0, fontFamily: font.body }}>×</button>
    </div>
  );
}
