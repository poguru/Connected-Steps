"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export interface ScanResult {
  valid: boolean;
  already_done?: boolean;
  message: string;
  done_at?: string | null;
  done_by?: string | null;
  participant?: {
    id: string;
    name: string;
    distance_category: string | null;
    tshirt_size: string | null;
    bib_number: string | null;
    wave: string | null;
  };
  error?: string;
}

interface Props {
  eventId: string;
  service: string;
  serviceLabel: string;
  accentColor?: string;
  onScanCount?: (count: number) => void;
}

const GREEN  = "#10b981";
const ORANGE = "#e8620a";
const PURPLE = "#818cf8";

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function ScannerModule({
  eventId,
  service,
  serviceLabel,
  accentColor = GREEN,
  onScanCount,
}: Props) {
  const [query,   setQuery]   = useState("");
  const [result,  setResult]  = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [count,   setCount]   = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const scan = useCallback(async (token: string) => {
    if (!token.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res  = await fetch(`/api/ops/events/${eventId}/scan`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ service, qr_token: token.trim() }),
      });
      const data = await res.json() as ScanResult;
      setResult(data);
      if (res.ok && data.valid && !data.already_done) {
        setCount(c => {
          const next = c + 1;
          onScanCount?.(next);
          return next;
        });
      }
    } catch {
      setResult({ valid: false, message: "Network error. Please try again.", error: "network" });
    } finally {
      setLoading(false);
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [eventId, service, onScanCount]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void scan(query);
  }

  function reset() {
    setResult(null);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  // Determine message colour based on result type
  const msgColor =
    !result           ? ORANGE
    : result.already_done ? PURPLE
    : result.valid        ? accentColor
    :                       "#f87171";

  const msgBg =
    !result           ? "transparent"
    : result.already_done ? "rgba(99,102,241,0.07)"
    : result.valid        ? `${accentColor}12`
    :                       "rgba(239,68,68,0.07)";

  const msgBorder =
    !result           ? "transparent"
    : result.already_done ? "rgba(99,102,241,0.25)"
    : result.valid        ? `${accentColor}40`
    :                       "rgba(239,68,68,0.25)";

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "clamp(1rem,4vw,1.5rem) 16px 80px" }}>

      {/* Scan count chip */}
      {count > 0 && (
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: accentColor,
            background: `${accentColor}15`, padding: "5px 16px", borderRadius: 999 }}>
            {count} {serviceLabel.toLowerCase()} this session
          </span>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Scan QR code or enter BIB number…`}
            style={{
              flex: 1, padding: "13px 16px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 12, color: "#fff", fontSize: 15,
              fontFamily: "inherit", outline: "none",
              caretColor: accentColor,
            }}
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            style={{
              padding: "13px 20px",
              background: loading || !query.trim() ? "rgba(255,255,255,0.08)" : accentColor,
              border: "none", borderRadius: 12, color: "#fff",
              fontSize: 15, fontWeight: 700, cursor: loading || !query.trim() ? "not-allowed" : "pointer",
              fontFamily: "inherit", flexShrink: 0, minWidth: 64,
              transition: "background 0.15s",
            }}
          >
            {loading ? "…" : "Go"}
          </button>
        </div>
      </form>

      {/* Result card */}
      {result && (
        <div style={{
          background: msgBg,
          border: `1px solid ${msgBorder}`,
          borderRadius: 16, overflow: "hidden",
          animation: "fadeIn 0.15s ease",
        }}>
          <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>

          {/* Colour bar at top */}
          <div style={{ height: 4, background: msgColor }} />

          <div style={{ padding: "20px 20px 24px" }}>
            {/* Status icon + message */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>
                {result.already_done ? "ℹ️" : result.valid ? "✅" : "❌"}
              </span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: msgColor, lineHeight: 1.3 }}>
                  {result.message}
                </div>
                {result.already_done && result.done_at && (
                  <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                    at {fmt(result.done_at)}
                    {result.done_by ? ` · by ${result.done_by}` : ""}
                  </div>
                )}
              </div>
            </div>

            {/* Participant details */}
            {result.participant && (
              <div style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 10, padding: "12px 14px",
                display: "grid", gridTemplateColumns: "1fr 1fr",
                gap: "6px 16px", marginBottom: 16, fontSize: 13,
              }}>
                <Field label="Name"     value={result.participant.name} span />
                {result.participant.distance_category && (
                  <Field label="Category" value={result.participant.distance_category} />
                )}
                {result.participant.tshirt_size && (
                  <Field label="T-Shirt"  value={result.participant.tshirt_size} />
                )}
                {result.participant.bib_number && (
                  <Field label="BIB"      value={`#${result.participant.bib_number}`} />
                )}
                {result.participant.wave && (
                  <Field label="Wave"     value={`Wave ${result.participant.wave}`} />
                )}
              </div>
            )}

            {/* Actions */}
            <button
              onClick={reset}
              style={{
                width: "100%", padding: "12px",
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 10, color: "#ccc",
                fontSize: 14, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, span }: { label: string; value: string; span?: boolean }) {
  return (
    <div style={span ? { gridColumn: "1/-1" } : undefined}>
      <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontWeight: 600, color: "#eee" }}>{value}</div>
    </div>
  );
}
