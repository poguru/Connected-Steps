"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { Button, Card, Alert } from "@/components/ui/ds";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RefundRule { days_before: number; refund_pct: number; }

interface PolicyConfig {
  enabled:        boolean;
  rules:          RefundRule[];
  contact_email:  string;
  contact_phone:  string;
}

const DEFAULT_CONFIG: PolicyConfig = {
  enabled:       true,
  rules:         [
    { days_before: 30, refund_pct: 100 },
    { days_before: 14, refund_pct: 75  },
    { days_before: 7,  refund_pct: 50  },
    { days_before: 0,  refund_pct: 0   },
  ],
  contact_email: "info@connectedsteps.in",
  contact_phone: "",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RefundPolicyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);

  const [eventTitle,   setEventTitle]   = useState("");
  const [policy,       setPolicy]       = useState<string>("");          // human-readable text
  const [cancelPolicy, setCancelPolicy] = useState<string>("");
  const [config,       setConfig]       = useState<PolicyConfig>(DEFAULT_CONFIG);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [error,        setError]        = useState("");

  useEffect(() => {
    fetch(`/api/admin/events/${eventId}/refund-policy`)
      .then(r => r.json())
      .then(d => {
        const ev = d.event;
        setEventTitle(ev?.title ?? "");
        setPolicy(ev?.refund_policy ?? "");
        setCancelPolicy(ev?.cancellation_policy ?? "");
        if (ev?.refund_policy_config) {
          setConfig({ ...DEFAULT_CONFIG, ...ev.refund_policy_config });
        }
      })
      .catch(() => setError("Failed to load event"))
      .finally(() => setLoading(false));
  }, [eventId]);

  function addRule() {
    setConfig(c => ({ ...c, rules: [...c.rules, { days_before: 7, refund_pct: 50 }] }));
  }

  function removeRule(i: number) {
    setConfig(c => ({ ...c, rules: c.rules.filter((_, idx) => idx !== i) }));
  }

  function updateRule(i: number, field: keyof RefundRule, val: number) {
    setConfig(c => ({
      ...c,
      rules: c.rules.map((r, idx) => idx === i ? { ...r, [field]: val } : r),
    }));
  }

  async function save() {
    setSaving(true); setSaved(false); setError("");
    try {
      const res = await fetch(`/api/admin/events/${eventId}/refund-policy`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refund_policy:        policy,
          cancellation_policy:  cancelPolicy,
          refund_policy_config: config,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to save"); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { setError("Network error. Please try again."); }
    finally { setSaving(false); }
  }

  const S = {
    input: {
      padding: "8px 12px", background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7,
      color: "#fff", fontSize: "0.85rem", outline: "none",
      fontFamily: "inherit", width: "100%", boxSizing: "border-box" as const,
    },
    label: {
      display: "block", fontSize: 11, color: "#555", fontWeight: 700,
      textTransform: "uppercase" as const, letterSpacing: ".06em", marginBottom: 6,
    },
    numInput: {
      padding: "6px 10px", background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
      color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit",
      width: 80, textAlign: "center" as const,
    },
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff" }}>
      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)",
        borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 1.5rem",
        height: 60, display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <Link href={`/admin/events/${eventId}/manage`}
          style={{ color: "#555", fontSize: 13, textDecoration: "none", whiteSpace: "nowrap" }}>
          ← Event Hub
        </Link>
        <span style={{ color: "#333" }}>/</span>
        <span style={{ color: "#888", fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
          Refund Policy{eventTitle ? ` — ${eventTitle}` : ""}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {saved && <span style={{ fontSize: 12, color: "#4ade80", alignSelf: "center" }}>✓ Saved</span>}
          <Button loading={saving} onClick={save}>Save Changes</Button>
        </div>
      </header>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "#555" }}>Loading…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

            {error && (
              <Alert variant="error">{error}</Alert>
            )}

            {/* Structured policy config */}
            <Card>
              <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#fff", marginBottom: "1rem" }}>
                Refund Policy Rules
              </div>
              <p style={{ fontSize: 12, color: "#666", marginBottom: "1rem", lineHeight: 1.6 }}>
                Define tiered refund amounts based on how many days before the event the cancellation is requested.
                Rules are applied in order — the first matching rule wins.
              </p>

              {/* Enable toggle */}
              <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.25rem", cursor: "pointer" }}>
                <input type="checkbox" checked={config.enabled} onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))} />
                <span style={{ fontSize: 13, color: "#ccc" }}>Enable refunds for this event</span>
              </label>

              {config.enabled && (
                <>
                  {/* Rules table */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "1rem" }}>
                    {/* Header */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, padding: "6px 0" }}>
                      <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 700 }}>Days Before Event</div>
                      <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 700 }}>Refund %</div>
                      <div />
                    </div>

                    {config.rules.map((rule, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "center",
                        padding: "8px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input type="number" min="0" max="365" value={rule.days_before}
                            onChange={e => updateRule(i, "days_before", parseInt(e.target.value) || 0)}
                            style={S.numInput} />
                          <span style={{ fontSize: 12, color: "#666" }}>days before</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input type="number" min="0" max="100" value={rule.refund_pct}
                            onChange={e => updateRule(i, "refund_pct", parseInt(e.target.value) || 0)}
                            style={S.numInput} />
                          <span style={{ fontSize: 12, color: "#666" }}>%</span>
                        </div>
                        <button onClick={() => removeRule(i)}
                          style={{ padding: "4px 8px", borderRadius: 5, border: "1px solid rgba(239,68,68,0.3)",
                            background: "transparent", color: "#f87171", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
                          Remove
                        </button>
                      </div>
                    ))}

                    <Button size="sm" variant="ghost" onClick={addRule} style={{ alignSelf: "flex-start" }}>+ Add Rule</Button>
                  </div>

                  {/* Preview */}
                  {config.rules.length > 0 && (
                    <div style={{ padding: "10px 14px", background: "rgba(96,165,250,0.05)", border: "1px solid rgba(96,165,250,0.15)", borderRadius: 8, fontSize: 12, color: "#888", lineHeight: 1.7 }}>
                      <strong style={{ color: "#60a5fa" }}>Preview:</strong>{" "}
                      {[...config.rules]
                        .sort((a, b) => b.days_before - a.days_before)
                        .map((r, i) =>
                          r.days_before === 0
                            ? `On the day or after: ${r.refund_pct}% refund`
                            : `${r.days_before}+ days before: ${r.refund_pct}% refund`
                        ).join(" · ")}
                    </div>
                  )}
                </>
              )}
            </Card>

            {/* Contact details */}
            <Card>
              <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#fff", marginBottom: "1rem" }}>
                Support Contact
              </div>
              <p style={{ fontSize: 12, color: "#666", marginBottom: "1rem" }}>
                Shown to users on the cancellation request form.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={S.label}>Contact Email</label>
                  <input value={config.contact_email} onChange={e => setConfig(c => ({ ...c, contact_email: e.target.value }))}
                    placeholder="info@connectedsteps.in" style={S.input} />
                </div>
                <div>
                  <label style={S.label}>Contact Phone</label>
                  <input value={config.contact_phone} onChange={e => setConfig(c => ({ ...c, contact_phone: e.target.value }))}
                    placeholder="+91 98765 43210" style={S.input} />
                </div>
              </div>
            </Card>

            {/* Human-readable policy text */}
            <Card>
              <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#fff", marginBottom: "1rem" }}>
                Refund Policy Text
                <span style={{ fontSize: 11, color: "#555", fontWeight: 400, marginLeft: 8 }}>Displayed publicly on the event page</span>
              </div>
              <textarea value={policy} onChange={e => setPolicy(e.target.value)}
                placeholder="e.g. Full refund if cancelled 30+ days before. 50% refund within 14 days. No refund within 7 days of event."
                style={{ ...S.input, minHeight: 100, resize: "vertical" } as React.CSSProperties} />
            </Card>

            {/* Cancellation policy text */}
            <Card>
              <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#fff", marginBottom: "1rem" }}>
                Cancellation Policy Text
                <span style={{ fontSize: 11, color: "#555", fontWeight: 400, marginLeft: 8 }}>Displayed publicly on the event page</span>
              </div>
              <textarea value={cancelPolicy} onChange={e => setCancelPolicy(e.target.value)}
                placeholder="e.g. Cancellation requests must be submitted via the dashboard. All cancellations require admin approval."
                style={{ ...S.input, minHeight: 80, resize: "vertical" } as React.CSSProperties} />
            </Card>

            <Button loading={saving} onClick={save} fullWidth>Save Refund Policy</Button>
          </div>
        )}
      </div>
    </div>
  );
}
