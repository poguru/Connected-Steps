"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const FEATURE_META: Record<string, { label: string; description: string; icon: string }> = {
  corporate_wellness:  { label: "Corporate Wellness",   description: "Corporate wellness programmes and team events",       icon: "🏢" },
  memberships:         { label: "Memberships",          description: "Paid membership plans for community access",           icon: "🎖" },
  donations:           { label: "Donations",            description: "Accept charitable donations during registration",      icon: "💝" },
  merchandise:         { label: "Merchandise",          description: "T-shirt and merchandise distribution system",          icon: "👕" },
  certificates:        { label: "Certificates",         description: "Generate and distribute finisher certificates",        icon: "🏅" },
  achievements:        { label: "Achievements",         description: "Gamification badges and achievement system",           icon: "⭐" },
  push_notifications:  { label: "Push Notifications",  description: "Browser and mobile push notifications",               icon: "🔔" },
  whatsapp_comms:      { label: "WhatsApp",             description: "WhatsApp template message delivery",                  icon: "💬" },
  email_comms:         { label: "Email",                description: "Transactional and marketing email delivery",           icon: "📧" },
  referrals:           { label: "Referrals",            description: "Participant referral tracking and rewards",            icon: "🔗" },
  leaderboard:         { label: "Leaderboard",          description: "Public participant points and ranking system",         icon: "🏆" },
  waitlist:            { label: "Waitlist",             description: "Waitlist management for full events",                  icon: "⏳" },
};

interface Feature { feature: string; enabled: boolean }

export default function OrgFeaturesPage() {
  const params = useParams<{ id: string }>();
  const id     = params.id;

  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [orgName,  setOrgName]  = useState("");
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/admin/orgs/${id}/features`).then(r => r.json()),
      fetch(`/api/admin/orgs/${id}`).then(r => r.json()),
    ]).then(([fData, oData]) => {
      setFeatures(fData.features ?? {});
      setOrgName(oData.org?.name ?? "");
    }).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function toggle(feature: string, enabled: boolean) {
    setSaving(feature);
    // Optimistic update
    setFeatures(f => ({ ...f, [feature]: enabled }));
    try {
      const r = await fetch(`/api/admin/orgs/${id}/features`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature, enabled }),
      });
      if (!r.ok) throw new Error("Failed");
    } catch {
      // Roll back
      setFeatures(f => ({ ...f, [feature]: !enabled }));
    } finally { setSaving(null); }
  }

  const featureKeys = Object.keys(FEATURE_META);
  const enabled  = featureKeys.filter(k => features[k] !== false).length;
  const disabled = featureKeys.length - enabled;

  return (
    <div style={{ padding: "28px 24px", maxWidth: 860, margin: "0 auto" }}>
      <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>
        <Link href="/admin/orgs" style={{ color: "#555", textDecoration: "none" }}>Organizations</Link>
        {" / "}
        <Link href={`/admin/orgs/${id}`} style={{ color: "#555", textDecoration: "none" }}>{orgName}</Link>
        {" / Features"}
      </div>

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>Feature Flags</div>
        <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>{enabled} enabled · {disabled} disabled</div>
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: "center", color: "#555" }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {featureKeys.map(key => {
            const meta    = FEATURE_META[key];
            const isOn    = features[key] !== false;
            const isSaving = saving === key;
            return (
              <div key={key}
                style={{ background: "#0f0f0f", border: `1px solid ${isOn ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)"}`, borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, opacity: isSaving ? 0.7 : 1, transition: "opacity 0.15s" }}>
                <span style={{ fontSize: 22, flexShrink: 0, opacity: isOn ? 1 : 0.3 }}>{meta.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: isOn ? "#fff" : "#555" }}>{meta.label}</div>
                  <div style={{ fontSize: 12, color: "#444", marginTop: 2 }}>{meta.description}</div>
                </div>
                <button
                  disabled={isSaving}
                  onClick={() => toggle(key, !isOn)}
                  style={{
                    width: 48, height: 26, borderRadius: 13, border: "none", cursor: "pointer",
                    background: isOn ? "#e8620a" : "rgba(255,255,255,0.08)",
                    position: "relative", flexShrink: 0, transition: "background 0.2s",
                  }}
                  aria-label={isOn ? `Disable ${meta.label}` : `Enable ${meta.label}`}
                  aria-pressed={isOn}
                >
                  <span style={{
                    position: "absolute", top: 3, left: isOn ? 25 : 3,
                    width: 20, height: 20, borderRadius: "50%", background: "#fff",
                    transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                  }} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 20, padding: 14, background: "rgba(232,98,10,0.06)", border: "1px solid rgba(232,98,10,0.15)", borderRadius: 10, fontSize: 12, color: "#888" }}>
        Feature flags apply immediately. Disabling a feature hides its UI but does not delete existing data.
        Participant-facing pages check feature flags at runtime. Only org Owners can change feature flags.
      </div>
    </div>
  );
}
