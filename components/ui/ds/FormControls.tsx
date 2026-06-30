"use client";
import React, { useState } from "react";
import { color, radius, font } from "./tokens";
import { ease } from "./motion";

// ── Checkbox ──────────────────────────────────────────────────────────────────

interface CheckboxProps {
  label?:    string;
  checked:   boolean;
  onChange:  (checked: boolean) => void;
  disabled?: boolean;
  hint?:     string;
  style?:    React.CSSProperties;
}

export function Checkbox({ label, checked, onChange, disabled = false, hint, style }: CheckboxProps) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, ...style }}>
      <div style={{ position: "relative", flexShrink: 0, marginTop: "1px" }}>
        <input type="checkbox" checked={checked} disabled={disabled}
          onChange={e => onChange(e.target.checked)}
          style={{ position: "absolute", opacity: 0, width: "100%", height: "100%", cursor: "inherit" }} />
        <div style={{ width: "18px", height: "18px", borderRadius: "4px", border: `2px solid ${checked ? color.orange : color.border}`, background: checked ? color.orange : "transparent", transition: ease.fast, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {checked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.8 7L9 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </div>
      </div>
      {(label || hint) && (
        <div>
          {label && <div style={{ fontSize: "13px", color: color.textPrimary, fontFamily: font.body, lineHeight: 1.4 }}>{label}</div>}
          {hint  && <div style={{ fontSize: "11px", color: color.textMuted,   fontFamily: font.body, marginTop: "2px" }}>{hint}</div>}
        </div>
      )}
    </label>
  );
}

// ── Radio ─────────────────────────────────────────────────────────────────────

interface RadioProps {
  label?:    string;
  value:     string;
  checked:   boolean;
  onChange:  (value: string) => void;
  disabled?: boolean;
  hint?:     string;
  style?:    React.CSSProperties;
}

export function Radio({ label, value, checked, onChange, disabled = false, hint, style }: RadioProps) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, ...style }}>
      <div style={{ position: "relative", flexShrink: 0, marginTop: "1px" }}>
        <input type="radio" value={value} checked={checked} disabled={disabled}
          onChange={() => onChange(value)}
          style={{ position: "absolute", opacity: 0, width: "100%", height: "100%", cursor: "inherit" }} />
        <div style={{ width: "18px", height: "18px", borderRadius: "50%", border: `2px solid ${checked ? color.orange : color.border}`, background: "transparent", transition: ease.fast, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {checked && <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: color.orange }} />}
        </div>
      </div>
      {(label || hint) && (
        <div>
          {label && <div style={{ fontSize: "13px", color: color.textPrimary, fontFamily: font.body }}>{label}</div>}
          {hint  && <div style={{ fontSize: "11px", color: color.textMuted,   fontFamily: font.body, marginTop: "2px" }}>{hint}</div>}
        </div>
      )}
    </label>
  );
}

// ── Toggle (Switch) ───────────────────────────────────────────────────────────

interface ToggleProps {
  checked:   boolean;
  onChange:  (checked: boolean) => void;
  label?:    string;
  disabled?: boolean;
  size?:     "sm" | "md";
  style?:    React.CSSProperties;
}

export function Toggle({ checked, onChange, label, disabled = false, size = "md", style }: ToggleProps) {
  const sm   = size === "sm";
  const w    = sm ? 32 : 44;
  const h    = sm ? 18 : 24;
  const knob = sm ? 12 : 18;

  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: "10px", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, ...style }}>
      <div style={{ position: "relative", width: w, height: h, flexShrink: 0 }}>
        <input type="checkbox" checked={checked} disabled={disabled}
          onChange={e => onChange(e.target.checked)}
          style={{ position: "absolute", opacity: 0, width: "100%", height: "100%", cursor: "inherit" }} />
        <div style={{ width: w, height: h, borderRadius: radius.full, background: checked ? color.orange : color.border, transition: "background 0.2s ease" }} />
        <div style={{ position: "absolute", top: `${(h - knob) / 2}px`, left: checked ? `${w - knob - (h - knob) / 2}px` : `${(h - knob) / 2}px`, width: knob, height: knob, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)", transition: "left 0.2s ease" }} />
      </div>
      {label && <span style={{ fontSize: sm ? "12px" : "13px", color: color.textPrimary, fontFamily: font.body }}>{label}</span>}
    </label>
  );
}

// ── Search Input ──────────────────────────────────────────────────────────────

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
  loading?: boolean;
}

export function SearchInput({ value, onClear, loading, style, ...rest }: SearchInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", ...style }}>
      <span style={{ position: "absolute", left: "10px", color: color.textMuted, fontSize: "15px", pointerEvents: "none" }}>🔍</span>
      <input
        {...rest}
        value={value}
        onFocus={e => { setFocused(true);  rest.onFocus?.(e); }}
        onBlur={e  => { setFocused(false); rest.onBlur?.(e); }}
        style={{
          width:        "100%",
          padding:      "9px 36px 9px 36px",
          background:   color.surface,
          border:       `1px solid ${focused ? color.borderFocus : color.border}`,
          borderRadius: radius.sm,
          color:        color.textPrimary,
          fontSize:     "13px",
          fontFamily:   font.body,
          outline:      "none",
          transition:   ease.fast,
          boxSizing:    "border-box",
        }}
      />
      {loading && (
        <span style={{ position: "absolute", right: "10px", width: 14, height: 14, borderRadius: "50%", border: `2px solid ${color.border}`, borderTopColor: color.orange, animation: "cs-spin-kf 0.7s linear infinite" }} />
      )}
      {!loading && value && onClear && (
        <button onClick={onClear} style={{ position: "absolute", right: "8px", background: "none", border: "none", color: color.textMuted, cursor: "pointer", fontSize: "16px", lineHeight: 1, padding: "0 4px", fontFamily: font.body }}>×</button>
      )}
    </div>
  );
}

// ── Password Input ────────────────────────────────────────────────────────────

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?:  string;
  error?:  string;
}

export function PasswordInput({ label, error, style, ...rest }: PasswordInputProps) {
  const [show,    setShow]    = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {label && (
        <label style={{ fontSize: "11px", fontWeight: 700, color: error ? color.error : color.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: font.body }}>
          {label}
        </label>
      )}
      <div style={{ position: "relative" }}>
        <input
          {...rest}
          type={show ? "text" : "password"}
          onFocus={e => { setFocused(true);  rest.onFocus?.(e); }}
          onBlur={e  => { setFocused(false); rest.onBlur?.(e); }}
          style={{ width: "100%", padding: "10px 40px 10px 12px", background: color.surface, border: `1px solid ${error ? color.errorBorder : focused ? color.borderFocus : color.border}`, borderRadius: radius.sm, color: color.textPrimary, fontSize: "14px", fontFamily: font.body, outline: "none", transition: ease.fast, boxSizing: "border-box", ...style }}
        />
        <button type="button" onClick={() => setShow(s => !s)}
          style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: color.textMuted, cursor: "pointer", fontSize: "15px", lineHeight: 1, padding: 0 }}>
          {show ? "🙈" : "👁"}
        </button>
      </div>
      {error && <span style={{ fontSize: "12px", color: color.error, fontFamily: font.body }}>{error}</span>}
    </div>
  );
}
