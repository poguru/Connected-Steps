"use client";
import React, { useState } from "react";
import Link from "next/link";
import { color, radius, font, transition } from "./tokens";
import { ease } from "./motion";

// ── Breadcrumbs ───────────────────────────────────────────────────────────────

interface Crumb { label: string; href?: string }

export function Breadcrumbs({ items, style }: { items: Crumb[]; style?: React.CSSProperties }) {
  return (
    <nav aria-label="Breadcrumb" style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" as const, ...style }}>
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ color: color.textDisabled, fontSize: "12px", userSelect: "none" }}>›</span>}
          {item.href ? (
            <Link href={item.href} style={{ fontSize: "12px", color: i === items.length - 1 ? color.textSecondary : color.textMuted, textDecoration: "none", fontFamily: font.body, transition: transition.fast }}
              onMouseEnter={e => (e.currentTarget.style.color = color.orange)}
              onMouseLeave={e => (e.currentTarget.style.color = i === items.length - 1 ? color.textSecondary : color.textMuted)}>
              {item.label}
            </Link>
          ) : (
            <span style={{ fontSize: "12px", color: color.textSecondary, fontFamily: font.body }}>{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

interface Tab { key: string; label: string; count?: number; disabled?: boolean }

interface TabsProps {
  tabs:       Tab[];
  active:     string;
  onChange:   (key: string) => void;
  variant?:   "line" | "pill";
  size?:      "sm" | "md";
  style?:     React.CSSProperties;
}

export function Tabs({ tabs, active, onChange, variant = "line", size = "md", style }: TabsProps) {
  const sm = size === "sm";

  if (variant === "pill") {
    return (
      <div role="tablist" style={{ display: "flex", gap: "4px", background: color.surface, borderRadius: radius.md, padding: "3px", ...style }}>
        {tabs.map(tab => {
          const isActive = tab.key === active;
          return (
            <button key={tab.key} role="tab" aria-selected={isActive} disabled={tab.disabled}
              onClick={() => !tab.disabled && onChange(tab.key)}
              style={{
                padding:      sm ? "5px 12px" : "7px 16px",
                fontSize:     sm ? "12px" : "13px",
                fontWeight:   isActive ? 700 : 400,
                color:        isActive ? color.textPrimary : color.textMuted,
                background:   isActive ? color.charcoal : "transparent",
                border:       isActive ? `1px solid ${color.border}` : "1px solid transparent",
                borderRadius: radius.sm,
                cursor:       tab.disabled ? "not-allowed" : "pointer",
                fontFamily:   font.body,
                transition:   ease.fast,
                opacity:      tab.disabled ? 0.4 : 1,
                whiteSpace:   "nowrap" as const,
              }}>
              {tab.label}
              {tab.count !== undefined && (
                <span style={{ marginLeft: 6, fontSize: "10px", background: isActive ? color.orange : color.border, color: isActive ? "#fff" : color.textMuted, borderRadius: radius.full, padding: "1px 6px" }}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // Line variant
  return (
    <div role="tablist" style={{ display: "flex", borderBottom: `1px solid ${color.border}`, gap: "0", ...style }}>
      {tabs.map(tab => {
        const isActive = tab.key === active;
        return (
          <button key={tab.key} role="tab" aria-selected={isActive} disabled={tab.disabled}
            onClick={() => !tab.disabled && onChange(tab.key)}
            style={{
              padding:      sm ? "8px 14px" : "10px 18px",
              fontSize:     sm ? "12px" : "13px",
              fontWeight:   isActive ? 600 : 400,
              color:        isActive ? color.textPrimary : color.textMuted,
              background:   "none",
              border:       "none",
              borderBottom: isActive ? `2px solid ${color.orange}` : "2px solid transparent",
              cursor:       tab.disabled ? "not-allowed" : "pointer",
              fontFamily:   font.body,
              transition:   ease.fast,
              opacity:      tab.disabled ? 0.4 : 1,
              whiteSpace:   "nowrap" as const,
              marginBottom: "-1px",
            }}>
            {tab.label}
            {tab.count !== undefined && (
              <span style={{ marginLeft: 6, fontSize: "10px", background: isActive ? color.orangeMuted : color.surface, color: isActive ? color.orange : color.textMuted, borderRadius: radius.full, padding: "1px 6px" }}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Segmented Control ─────────────────────────────────────────────────────────

interface Segment { key: string; label: string; icon?: string }

export function SegmentedControl({ segments, value, onChange, style }: {
  segments: Segment[];
  value:    string;
  onChange: (key: string) => void;
  style?:   React.CSSProperties;
}) {
  return (
    <div style={{ display: "inline-flex", background: color.surface, border: `1px solid ${color.border}`, borderRadius: radius.md, padding: "3px", gap: "2px", ...style }}>
      {segments.map(seg => {
        const isActive = seg.key === value;
        return (
          <button key={seg.key} onClick={() => onChange(seg.key)}
            style={{
              display:    "inline-flex", alignItems: "center", gap: "5px",
              padding:    "6px 14px", fontSize: "12px", fontWeight: isActive ? 600 : 400,
              color:      isActive ? color.textPrimary : color.textMuted,
              background: isActive ? color.charcoal : "transparent",
              border:     isActive ? `1px solid ${color.border}` : "1px solid transparent",
              borderRadius: radius.sm, cursor: "pointer", fontFamily: font.body, transition: ease.fast,
            }}>
            {seg.icon && <span>{seg.icon}</span>}
            {seg.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────

interface PaginationProps {
  page:      number;
  totalPages:number;
  onChange:  (page: number) => void;
  style?:    React.CSSProperties;
}

export function Pagination({ page, totalPages, onChange, style }: PaginationProps) {
  if (totalPages <= 1) return null;

  const btn = (label: React.ReactNode, target: number, disabled: boolean, active = false) => (
    <button key={String(target)} onClick={() => !disabled && onChange(target)} disabled={disabled}
      style={{
        minWidth: "34px", height: "34px", padding: "0 10px", fontSize: "13px", fontWeight: active ? 700 : 400,
        color:      active ? "#fff" : color.textMuted,
        background: active ? color.orange : "transparent",
        border:     `1px solid ${active ? color.orange : color.border}`,
        borderRadius: radius.sm, cursor: disabled ? "not-allowed" : "pointer", fontFamily: font.body,
        opacity: disabled ? 0.35 : 1, transition: ease.fast,
      }}>
      {label}
    </button>
  );

  // Build page list: always show first, last, current ± 1, with ellipsis
  const pages: (number | "…")[] = [];
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const near  = range(Math.max(2, page - 1), Math.min(totalPages - 1, page + 1));
  pages.push(1);
  if (near[0] > 2)               pages.push("…");
  pages.push(...near);
  if (near[near.length - 1] < totalPages - 1) pages.push("…");
  if (totalPages > 1) pages.push(totalPages);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "4px", ...style }}>
      {btn("‹", page - 1, page <= 1)}
      {pages.map((p, i) => p === "…"
        ? <span key={`e${i}`} style={{ padding: "0 6px", color: color.textMuted, fontSize: "13px" }}>…</span>
        : btn(p, p as number, false, p === page)
      )}
      {btn("›", page + 1, page >= totalPages)}
    </div>
  );
}

// ── Stepper ───────────────────────────────────────────────────────────────────

interface Step { label: string; description?: string }

export function Stepper({ steps, current, style }: { steps: Step[]; current: number; style?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "0", ...style }}>
      {steps.map((step, i) => {
        const done    = i < current;
        const active  = i === current;
        const c       = done ? color.success : active ? color.orange : color.textMuted;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : undefined }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", minWidth: "60px" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", border: `2px solid ${c}`, display: "flex", alignItems: "center", justifyContent: "center", background: done ? color.success : "transparent", color: done ? "#000" : c, fontSize: "12px", fontWeight: 700, flexShrink: 0 }}>
                {done ? "✓" : i + 1}
              </div>
              <div style={{ fontSize: "11px", fontWeight: active ? 700 : 400, color: active ? color.textPrimary : color.textMuted, textAlign: "center", lineHeight: 1.3 }}>{step.label}</div>
              {step.description && active && <div style={{ fontSize: "10px", color: color.textMuted, textAlign: "center" }}>{step.description}</div>}
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: "2px", background: done ? color.success : color.border, margin: "-16px 4px 0" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
