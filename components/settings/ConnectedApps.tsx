"use client";

import { useEffect, useState, useCallback } from "react";
import IntegrationCard, { type IntegrationSource, type IntegrationRow } from "./IntegrationCard";

interface Props { userEmail: string; }

export default function ConnectedApps({ userEmail }: Props) {
  const [sources,      setSources]      = useState<IntegrationSource[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [loading,      setLoading]      = useState(true);

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/integrations?email=${encodeURIComponent(userEmail)}`);
      const data = await res.json();
      setSources(data.sources      ?? []);
      setIntegrations(data.integrations ?? []);
    } catch { /* silent — show skeleton */ }
    finally { setLoading(false); }
  }, [userEmail]);

  useEffect(() => { load(); }, [load]);

  // Partition sources: OAuth (web) / native (app)
  const oauthSources  = sources.filter(s => s.is_oauth);
  const nativeSources = sources.filter(s => s.is_native);

  function integrationFor(sourceId: string): IntegrationRow | null {
    return integrations.find(i => i.provider === sourceId && i.status !== "revoked") ?? null;
  }

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ height: 110, borderRadius: 16, background: "var(--surface-elevated)", opacity: 0.5, animation: "pulse 1.5s ease-in-out infinite" }} />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Web integrations */}
      {oauthSources.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "10px", color: "var(--primary)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, marginBottom: "0.75rem" }}>
            Connect via app
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {oauthSources.map(s => (
              <IntegrationCard
                key={s.id}
                source={s}
                integration={integrationFor(s.id)}
                userEmail={userEmail}
                onRefresh={load}
              />
            ))}
          </div>
        </div>
      )}

      {/* Native integrations */}
      {nativeSources.length > 0 && (
        <div>
          <div style={{ fontSize: "10px", color: "var(--muted-foreground)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, marginBottom: "0.75rem" }}>
            Connect via mobile app
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", lineHeight: 1.6, marginBottom: "0.75rem", padding: "0.6rem 0.9rem", background: "var(--surface-elevated)", borderRadius: 8, borderLeft: "3px solid var(--primary)" }}>
            Android Health Connect and Apple Health require the Connected Steps mobile app. Coming soon to Play Store and App Store.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {nativeSources.map(s => (
              <IntegrationCard
                key={s.id}
                source={s}
                integration={integrationFor(s.id)}
                userEmail={userEmail}
                onRefresh={load}
              />
            ))}
          </div>
        </div>
      )}

      {sources.length === 0 && (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--muted-foreground)", fontSize: "0.85rem" }}>
          No integrations available. Run the database migration first.
        </div>
      )}
    </div>
  );
}
