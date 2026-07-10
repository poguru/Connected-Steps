"use client";

import { useRef } from "react";

interface OtpInputProps {
  value:       string;
  onChange:    (v: string) => void;
  onComplete?: (v: string) => void;  // called when all digits are filled
  length?:     number;
  disabled?:   boolean;
}

export default function OtpInput({ value, onChange, onComplete, length = 6, disabled = false }: OtpInputProps) {
  const refs   = useRef<(HTMLInputElement | null)[]>(Array(length).fill(null));
  const digits = Array(length).fill("").map((_, i) => value[i] ?? "");

  function handleChange(index: number, raw: string) {
    const char = raw.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = char;
    const joined = next.join("");
    onChange(joined);
    if (char) {
      if (index < length - 1) {
        refs.current[index + 1]?.focus();
      } else if (joined.length === length && onComplete) {
        // All digits filled — trigger auto-submit after a microtask so the
        // state update from onChange has settled first.
        setTimeout(() => onComplete(joined), 0);
      }
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[index]) {
        const next = [...digits]; next[index] = ""; onChange(next.join(""));
      } else if (index > 0) {
        refs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    const joined = pasted.padEnd(length, "").slice(0, length);
    onChange(joined);
    const focusIdx = Math.min(pasted.length, length - 1);
    refs.current[focusIdx]?.focus();
    if (pasted.length === length && onComplete) {
      setTimeout(() => onComplete(joined), 0);
    }
  }

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.select();
  }

  return (
    <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={d}
          disabled={disabled}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={handleFocus}
          autoComplete="one-time-code"
          style={{
            width: 44, height: 54,
            textAlign: "center",
            fontSize: d ? "1.4rem" : "1rem",
            fontWeight: 700,
            background: d ? "oklch(0.72 0.19 49 / 10%)" : "var(--surface)",
            border: `1.5px solid ${d ? "var(--primary)" : "var(--border)"}`,
            borderRadius: 10,
            color: "var(--foreground)",
            outline: "none",
            fontFamily: "var(--font-body)",
            transition: "border-color 0.15s, background 0.15s",
            caretColor: "transparent",
            boxSizing: "border-box",
            opacity: disabled ? 0.5 : 1,
            cursor: disabled ? "not-allowed" : "text",
          }}
          onFocusCapture={e => { if (!disabled) { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px oklch(0.72 0.19 49 / 15%)"; } }}
          onBlurCapture={e  => { e.currentTarget.style.boxShadow = "none"; if (!e.currentTarget.value) e.currentTarget.style.borderColor = "var(--border)"; }}
        />
      ))}
    </div>
  );
}
