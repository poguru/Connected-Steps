import React from "react";
import { color, radius, transition, font } from "./tokens";

// ── Input ─────────────────────────────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?:   string;
  error?:   string;
  hint?:    string;
  icon?:    React.ReactNode;
  fullWidth?: boolean;
}

export function Input({ label, error, hint, icon, fullWidth = true, style, ...rest }: InputProps) {
  const [focused, setFocused] = React.useState(false);

  const inputStyle: React.CSSProperties = {
    width:        fullWidth ? "100%" : undefined,
    padding:      icon ? "10px 12px 10px 38px" : "10px 12px",
    background:   color.surface,
    border:       `1px solid ${error ? color.errorBorder : focused ? color.borderFocus : color.border}`,
    borderRadius: radius.sm,
    color:        color.textPrimary,
    fontSize:     "14px",
    fontFamily:   font.body,
    outline:      "none",
    transition:   transition.fast,
    boxSizing:    "border-box",
    ...style,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: fullWidth ? "100%" : undefined }}>
      {label && (
        <label style={{ fontSize: "11px", fontWeight: 700, color: error ? color.error : color.textMuted, textTransform: "uppercase", letterSpacing: "0.07em" }}>
          {label}
        </label>
      )}
      <div style={{ position: "relative" }}>
        {icon && (
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: color.textMuted, display: "flex", alignItems: "center" }}>
            {icon}
          </span>
        )}
        <input
          {...rest}
          style={inputStyle}
          onFocus={e => { setFocused(true);  rest.onFocus?.(e); }}
          onBlur={e  => { setFocused(false); rest.onBlur?.(e);  }}
        />
      </div>
      {error && <span style={{ fontSize: "12px", color: color.error }}>{error}</span>}
      {hint && !error && <span style={{ fontSize: "12px", color: color.textMuted }}>{hint}</span>}
    </div>
  );
}

// ── Textarea ──────────────────────────────────────────────────────────────────

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?:     string;
  error?:     string;
  hint?:      string;
  fullWidth?: boolean;
}

export function Textarea({ label, error, hint, fullWidth = true, style, ...rest }: TextareaProps) {
  const [focused, setFocused] = React.useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: fullWidth ? "100%" : undefined }}>
      {label && (
        <label style={{ fontSize: "11px", fontWeight: 700, color: error ? color.error : color.textMuted, textTransform: "uppercase", letterSpacing: "0.07em" }}>
          {label}
        </label>
      )}
      <textarea
        {...rest}
        style={{
          width:        fullWidth ? "100%" : undefined,
          padding:      "10px 12px",
          background:   color.surface,
          border:       `1px solid ${error ? color.errorBorder : focused ? color.borderFocus : color.border}`,
          borderRadius: radius.sm,
          color:        color.textPrimary,
          fontSize:     "14px",
          fontFamily:   font.body,
          outline:      "none",
          transition:   transition.fast,
          resize:       "vertical",
          boxSizing:    "border-box",
          minHeight:    "100px",
          ...style,
        }}
        onFocus={e => { setFocused(true);  rest.onFocus?.(e); }}
        onBlur={e  => { setFocused(false); rest.onBlur?.(e);  }}
      />
      {error && <span style={{ fontSize: "12px", color: color.error }}>{error}</span>}
      {hint && !error && <span style={{ fontSize: "12px", color: color.textMuted }}>{hint}</span>}
    </div>
  );
}

// ── Select ────────────────────────────────────────────────────────────────────

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?:     string;
  error?:     string;
  hint?:      string;
  fullWidth?: boolean;
}

export function Select({ label, error, hint, fullWidth = true, style, children, ...rest }: SelectProps) {
  const [focused, setFocused] = React.useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: fullWidth ? "100%" : undefined }}>
      {label && (
        <label style={{ fontSize: "11px", fontWeight: 700, color: error ? color.error : color.textMuted, textTransform: "uppercase", letterSpacing: "0.07em" }}>
          {label}
        </label>
      )}
      <select
        {...rest}
        style={{
          width:        fullWidth ? "100%" : undefined,
          padding:      "10px 12px",
          background:   color.dark,
          border:       `1px solid ${error ? color.errorBorder : focused ? color.borderFocus : color.border}`,
          borderRadius: radius.sm,
          color:        color.textPrimary,
          fontSize:     "14px",
          fontFamily:   font.body,
          outline:      "none",
          transition:   transition.fast,
          cursor:       "pointer",
          boxSizing:    "border-box",
          colorScheme:  "dark",
          ...style,
        }}
        onFocus={e => { setFocused(true);  rest.onFocus?.(e); }}
        onBlur={e  => { setFocused(false); rest.onBlur?.(e);  }}
      >
        {children}
      </select>
      {error && <span style={{ fontSize: "12px", color: color.error }}>{error}</span>}
      {hint && !error && <span style={{ fontSize: "12px", color: color.textMuted }}>{hint}</span>}
    </div>
  );
}

// ── FormGroup ─────────────────────────────────────────────────────────────────

export function FormGroup({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: "14px", ...style }}>{children}</div>;
}

// ── FormRow (two columns) ─────────────────────────────────────────────────────

export function FormRow({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", ...style }}>
      {children}
    </div>
  );
}
