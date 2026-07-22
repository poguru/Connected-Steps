"use client";

import { useState, useEffect, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ServiceConfig {
  service_name:  string;
  label:         string;
  emoji:         string;
  enabled:       boolean;
  display_order: number;
  config:        Record<string, unknown>;
}

const S: Record<string, React.CSSProperties> = {
  btn:        { padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#ccc", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" },
  btnPrimary: { padding: "9px 20px", borderRadius: 8, border: "none", background: "#e8620a", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" },
};

export default function ServicesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const router = useRouter();

  const [services, setServices] = useState<ServiceConfig[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/events/${eventId}/service-config`);
      if (r.status === 401) { router.replace("/admin/login"); return; }
      if (r.ok) { const d = await r.json() as { services: ServiceConfig[] }; setServices(d.services ?? []); }
    } finally { setLoading(false); }
  }, [eventId, router]);

  useEffect(() => { void load(); }, [load]);

  function toggle(serviceName: string) {
    setServices(prev => prev.map(s => s.service_name === serviceName ? { ...s, enabled: !s.enabled } : s));
    setSaved(false);
  }

  async function save() {
    setSaving(true); setSaved(false);
    const r = await fetch(`/api/admin/events/${eventId}/service-config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ services }),
    });
    if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    setSaving(false);
  }

  const enabledCount = services.filter(s => s.enabled).length;

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#fff", fontFamily: "'Inter',system-ui,sans-serif" }}>
      <nav style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(8,8,8,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 20px", height: 52, display: "flex", alignItems: "center", gap: 16 }}>
        <Link href={`/admin/events/${eventId}/manage`} style={{ fontSize: 13, color: "#888", textDecoration: "none" }}>← Event Hub</Link>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Service Modules</span>
        {!loading && <span style={{ fontSize: 11, color: "#555" }}>{enabledCount} of {services.length} enabled</span>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {saved && <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 600 }}>✓ Saved</span>}
          <button style={S.btnPrimary} onClick={() => void save()} disabled={saving || loading}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px 80px" }}>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#555" }}>Loading…</div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: "#666", marginBottom: 20, lineHeight: 1.6 }}>
              Enable or disable service modules for this event. Enabled modules appear in the ops portal for volunteers and are tracked per participant.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {services.map(s => (
                <button
                  key={s.service_name}
                  onClick={() => toggle(s.service_name)}
                  style={{
                    display: "flex", alignItems: "center", gap: 14, width: "100%",
                    padding: "14px 16px", borderRadius: 12, cursor: "pointer", textAlign: "left",
                    fontFamily: "inherit", transition: "border-color 0.15s, background 0.15s",
                    background: s.enabled ? "rgba(232,98,10,0.06)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${s.enabled ? "rgba(232,98,10,0.25)" : "rgba(255,255,255,0.07)"}`,
                  }}>
                  {/* Emoji */}
                  <span style={{ fontSize: 22, flexShrink: 0, width: 32, textAlign: "center" }}>{s.emoji}</span>
                  {/* Label */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: s.enabled ? "#fff" : "#888" }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>
                      {s.service_name === "checkin"     && "Scan QR codes at the entry gate, track arrivals"}
                      {s.service_name === "tshirt"      && "T-shirt distribution desk, size tracking per participant"}
                      {s.service_name === "breakfast"   && "Breakfast / refreshment distribution counter"}
                      {s.service_name === "bib"         && "BIB number collection, confirm bib pick-up"}
                      {s.service_name === "medal"       && "Medal issuance at the finish area"}
                      {s.service_name === "certificate" && "Digital certificate generation and download"}
                    </div>
                  </div>
                  {/* Toggle */}
                  <div style={{
                    width: 42, height: 24, borderRadius: 12, flexShrink: 0, position: "relative",
                    background: s.enabled ? "#e8620a" : "rgba(255,255,255,0.08)",
                    border: `1px solid ${s.enabled ? "#e8620a" : "rgba(255,255,255,0.1)"}`,
                    transition: "background 0.2s",
                  }}>
                    <div style={{
                      position: "absolute", top: 3, left: s.enabled ? 20 : 3,
                      width: 16, height: 16, borderRadius: "50%", background: "#fff",
                      transition: "left 0.2s",
                    }} />
                  </div>
                </button>
              ))}
            </div>

            {/* Mobile save button */}
            <div style={{ marginTop: 24 }}>
              <button style={{ ...S.btnPrimary, width: "100%" }} onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
              {saved && <div style={{ fontSize: 12, color: "#4ade80", marginTop: 8, textAlign: "center" }}>✓ Changes saved</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
