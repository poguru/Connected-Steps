"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isTokenValid, handleAuthExpiry } from "@/lib/client-auth";

interface Prefs {
  email_events:    boolean; email_training:  boolean; email_reminders: boolean; email_marketing: boolean;
  wa_events:       boolean; wa_training:     boolean; wa_reminders:    boolean; wa_marketing:    boolean;
  push_events:     boolean; push_training:   boolean; push_reminders:  boolean;
}

const SECTIONS = [
  {
    label: "Email",
    icon:  "📧",
    color: "#60a5fa",
    items: [
      { key: "email_events",    label: "Event Updates",    detail: "Registration confirmations, QR codes, event changes" },
      { key: "email_training",  label: "Training",         detail: "New sessions, training plan updates" },
      { key: "email_reminders", label: "Reminders",        detail: "Event day reminders, BIB collection alerts" },
      { key: "email_marketing", label: "Marketing",        detail: "New events, offers, newsletter" },
    ],
  },
  {
    label: "WhatsApp",
    icon:  "💬",
    color: "#4ade80",
    items: [
      { key: "wa_events",    label: "Event Updates",    detail: "Event day updates, live alerts" },
      { key: "wa_training",  label: "Training",         detail: "Session reminders, coach messages" },
      { key: "wa_reminders", label: "Reminders",        detail: "Event day countdowns, BIB collection" },
      { key: "wa_marketing", label: "Marketing",        detail: "New events, promotions" },
    ],
  },
  {
    label: "Push Notifications",
    icon:  "🔔",
    color: "#a78bfa",
    items: [
      { key: "push_events",    label: "Event Updates",    detail: "Real-time event day alerts" },
      { key: "push_training",  label: "Training",         detail: "Session start reminders" },
      { key: "push_reminders", label: "Reminders",        detail: "Countdown alerts and deadlines" },
    ],
  },
] as const;

export default function NotificationPreferencesPage() {
  const [prefs,     setPrefs]     = useState<Prefs | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState<string | null>(null);
  const [userToken, setUserToken] = useState("");

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2500); }

  useEffect(() => {
    const raw   = localStorage.getItem("cs_user");
    const token = localStorage.getItem("cs_user_token") ?? "";
    if (!raw || !isTokenValid(token)) { handleAuthExpiry("/notifications/preferences"); return; }
    setUserToken(token);

    fetch("/api/user/notification-preferences", { headers: { "x-user-token": token } })
      .then(r => r.json())
      .then(d => setPrefs(d.preferences ?? null))
      .catch(() => showToast("Failed to load preferences"))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(key: keyof Prefs) {
    if (!prefs) return;
    const newVal  = !prefs[key];
    const updated = { ...prefs, [key]: newVal };
    setPrefs(updated);
    setSaving(true);

    const res = await fetch("/api/user/notification-preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-user-token": userToken },
      body: JSON.stringify({ [key]: newVal }),
    });
    const data = await res.json();
    if (!res.ok) {
      setPrefs(prefs); // rollback
      showToast(data.error ?? "Failed to save");
    } else {
      showToast("Saved");
    }
    setSaving(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#f0f0f0", fontFamily: "'Inter',system-ui,sans-serif" }}>
      {toast && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "8px 16px", fontSize: 13, color: "#ddd", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", whiteSpace: "nowrap" }}>
          {saving ? "Saving…" : toast}
        </div>
      )}

      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(8,8,8,0.97)", backdropFilter: "blur(10px)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 16px", height: 52, display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/notifications" style={{ fontSize: 13, color: "#888", textDecoration: "none" }}>← Notifications</Link>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Notification Preferences</span>
      </nav>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 16px 100px" }}>

        {loading ? (
          <div style={{ color: "#444", textAlign: "center", padding: "60px 0" }}>Loading preferences…</div>
        ) : !prefs ? (
          <div style={{ color: "#f87171", textAlign: "center", padding: "60px 0" }}>Failed to load preferences</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Alert: transactional emails always on */}
            <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.2)", fontSize: 12, color: "#93c5fd", lineHeight: 1.5 }}>
              ℹ Transactional messages (OTP codes, payment receipts, registration QR codes) are always sent regardless of these settings.
            </div>

            {SECTIONS.map(section => (
              <div key={section.label}>
                {/* Section header */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 18 }}>{section.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: section.color }}>{section.label}</span>
                </div>

                {/* Preference rows */}
                <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "rgba(255,255,255,0.025)", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
                  {section.items.map(item => {
                    const enabled = prefs[item.key as keyof Prefs];
                    return (
                      <button
                        key={item.key}
                        onClick={() => toggle(item.key as keyof Prefs)}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "14px 16px", background: "transparent", border: "none",
                          borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer",
                          fontFamily: "inherit", textAlign: "left" as const, gap: 12,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: enabled ? "#f0f0f0" : "#555" }}>
                            {item.label}
                          </div>
                          <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>{item.detail}</div>
                        </div>
                        {/* Toggle switch */}
                        <div style={{
                          width: 44, height: 24, borderRadius: 12, flexShrink: 0,
                          background: enabled ? section.color : "rgba(255,255,255,0.08)",
                          position: "relative", transition: "background 0.2s",
                        }}>
                          <div style={{
                            position: "absolute", top: 3, left: enabled ? 23 : 3,
                            width: 18, height: 18, borderRadius: "50%",
                            background: "#fff", transition: "left 0.2s",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                          }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Unsubscribe all */}
            <div style={{ paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 12, color: "#555", marginBottom: 8 }}>
                To completely stop all non-transactional emails, use the unsubscribe link at the bottom of any email we send.
              </div>
              <Link href="/profile"
                style={{ fontSize: 12, color: "#888", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
                ← Back to Profile
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
