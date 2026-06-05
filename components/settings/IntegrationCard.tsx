"use client";

import { useState } from "react";

export interface IntegrationSource {
  id:          string;
  label:       string;
  description: string;
  icon:        string;
  is_native:   boolean;
  is_oauth:    boolean;
}

export interface IntegrationRow {
  id:             string;
  provider:       string;
  status:         "pending" | "active" | "paused" | "error" | "revoked";
  last_sync_at?:  string;
  last_sync_count: number;
  total_synced:   number;
  error_message?: string;
}

interface Props {
  source:      IntegrationSource;
  integration: IntegrationRow | null;
  userEmail:   string;
  onRefresh:   () => void;
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60)   return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400)return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function IntegrationCard({ source, integration, userEmail, onRefresh }: Props) {
  const [syncing,      setSyncing]      = useState(false);
  const [connecting,   setConnecting]   = useState(false);
  const [disconnecting,setDisconnecting]= useState(false);
  const [syncMsg,      setSyncMsg]      = useState("");
  const [error,        setError]        = useState("");

  const isConnected = integration?.status === "active" || integration?.status === "paused";
  const hasError    = integration?.status === "error";

  async function handleConnect() {
    setConnecting(true); setError("");
    try {
      const res  = await fetch(`/api/integrations/${source.id}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Connection failed"); return; }

      if (data.type === "oauth" && data.authUrl) {
        window.location.href = data.authUrl;
      } else if (data.type === "native") {
        setError(data.instructions);
      }
    } catch { setError("Something went wrong. Please try again."); }
    finally  { setConnecting(false); }
  }

  async function handleSync() {
    setSyncing(true); setSyncMsg(""); setError("");
    try {
      const res  = await fetch(`/api/integrations/${source.id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Sync failed"); return; }
      setSyncMsg(data.message ?? "Sync complete");
      onRefresh();
    } catch { setError("Sync failed. Please try again."); }
    finally  { setSyncing(false); }
  }

  async function handleDisconnect() {
    if (!window.confirm(`Disconnect ${source.label}? Your synced activities will remain.`)) return;
    setDisconnecting(true); setError("");
    try {
      const res = await fetch(`/api/integrations/${source.id}/disconnect`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to disconnect"); return; }
      onRefresh();
    } catch { setError("Something went wrong."); }
    finally  { setDisconnecting(false); }
  }

  // Status pill
  const pill = (() => {
    if (!integration || integration.status === "revoked") return { text: "Not connected", color: "rgba(255,255,255,0.15)", textColor: "var(--muted-foreground)" };
    if (integration.status === "active")  return { text: "Connected",     color: "rgba(74,222,128,0.15)",  textColor: "#4ade80" };
    if (integration.status === "error")   return { text: "Error",         color: "rgba(240,149,149,0.15)", textColor: "#f09595" };
    if (integration.status === "paused")  return { text: "Paused",        color: "rgba(251,191,36,0.15)",  textColor: "#fbbf24" };
    return { text: "Pending", color: "rgba(255,255,255,0.1)", textColor: "var(--muted-foreground)" };
  })();

  return (
    <div style={{
      background: "var(--surface)",
      border: `1px solid ${isConnected ? "rgba(74,222,128,0.15)" : "var(--border)"}`,
      borderRadius: 16,
      padding: "1.25rem",
      boxShadow: "var(--shadow-md)",
      display: "flex",
      flexDirection: "column",
      gap: "0.75rem",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.875rem" }}>
        <div style={{ fontSize: "2rem", lineHeight: 1, flexShrink: 0 }}>{source.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "2px" }}>
            <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--foreground)" }}>{source.label}</span>
            {source.is_native && (
              <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--primary)", background: "oklch(0.72 0.19 49 / 10%)", border: "1px solid oklch(0.72 0.19 49 / 20%)", borderRadius: 4, padding: "1px 5px" }}>
                App required
              </span>
            )}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", lineHeight: 1.4 }}>{source.description}</div>
        </div>
        {/* Status pill */}
        <div style={{ flexShrink: 0, fontSize: "10px", fontWeight: 600, letterSpacing: "0.04em", padding: "3px 8px", borderRadius: 999, background: pill.color, color: pill.textColor }}>
          {pill.text}
        </div>
      </div>

      {/* Stats (connected only) */}
      {isConnected && integration && (
        <div style={{ display: "flex", gap: "1.25rem", borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
          <div>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--primary)" }}>{integration.total_synced}</div>
            <div style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>Activities synced</div>
          </div>
          {integration.last_sync_at && (
            <div>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--foreground)" }}>{timeAgo(integration.last_sync_at)}</div>
              <div style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>Last synced</div>
            </div>
          )}
          {integration.last_sync_count > 0 && (
            <div>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--foreground)" }}>{integration.last_sync_count}</div>
              <div style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>Last import</div>
            </div>
          )}
        </div>
      )}

      {/* Error message */}
      {hasError && integration?.error_message && (
        <div style={{ fontSize: "0.75rem", color: "#f09595", background: "rgba(240,149,149,0.06)", border: "1px solid rgba(240,149,149,0.2)", borderRadius: 8, padding: "0.5rem 0.75rem" }}>
          ⚠️ {integration.error_message}
        </div>
      )}

      {/* Sync success/info message */}
      {syncMsg && (
        <div style={{ fontSize: "0.78rem", color: "#4ade80", background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 8, padding: "0.5rem 0.75rem" }}>
          {syncMsg}
        </div>
      )}

      {/* Generic error */}
      {error && (
        <div style={{ fontSize: "0.75rem", color: "#f09595", background: "rgba(240,149,149,0.06)", border: "1px solid rgba(240,149,149,0.2)", borderRadius: 8, padding: "0.5rem 0.75rem" }}>
          {error}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {!isConnected ? (
          <button onClick={handleConnect} disabled={connecting}
            style={{ flex: 1, padding: "9px 16px", background: connecting ? "var(--surface-elevated)" : "var(--gradient-accent)", color: connecting ? "var(--muted-foreground)" : "var(--accent-foreground)", border: "none", borderRadius: 8, fontSize: "0.8rem", fontWeight: 700, cursor: connecting ? "not-allowed" : "pointer", fontFamily: "var(--font-body)", boxShadow: connecting ? "none" : "var(--shadow-orange)", transition: "all 0.2s" }}>
            {connecting ? "Connecting…" : source.is_native ? "Open in App" : `Connect ${source.label}`}
          </button>
        ) : (
          <>
            <button onClick={handleSync} disabled={syncing}
              style={{ flex: 1, padding: "9px 16px", background: "var(--surface-elevated)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 8, fontSize: "0.8rem", fontWeight: 600, cursor: syncing ? "not-allowed" : "pointer", fontFamily: "var(--font-body)", opacity: syncing ? 0.6 : 1 }}>
              {syncing ? "Syncing…" : "Sync now"}
            </button>
            <button onClick={handleDisconnect} disabled={disconnecting}
              style={{ padding: "9px 14px", background: "transparent", color: "#f09595", border: "1px solid rgba(240,149,149,0.3)", borderRadius: 8, fontSize: "0.8rem", fontWeight: 600, cursor: disconnecting ? "not-allowed" : "pointer", fontFamily: "var(--font-body)", opacity: disconnecting ? 0.6 : 1 }}>
              {disconnecting ? "…" : "Disconnect"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
