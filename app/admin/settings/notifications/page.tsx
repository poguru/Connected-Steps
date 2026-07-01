"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, Button, Alert, Badge } from "@/components/ui/ds";

interface Setting { key: string; value: string; updated_at: string; }

const labelMap: Record<string, string> = {
  birthday_email_enabled: "Birthday Email",
  birthday_wa_enabled:    "Birthday WhatsApp",
  birthday_wa_template:   "WhatsApp Template Name",
};

const descMap: Record<string, string> = {
  birthday_email_enabled: "Send a personalised birthday email to members on their birthday.",
  birthday_wa_enabled:    "Send a WhatsApp message to members on their birthday via MSG91.",
  birthday_wa_template:   "The MSG91 template name registered for birthday wishes.",
};

const toggleKeys = ["birthday_email_enabled", "birthday_wa_enabled"] as const;
const textKeys   = ["birthday_wa_template"]                           as const;

export default function NotificationsSettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [saving,   setSaving]   = useState<Record<string, boolean>>({});
  const [saved,    setSaved]    = useState<Record<string, boolean>>({});
  const [loadErr,  setLoadErr]  = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/settings");
    if (!res.ok) { setLoadErr("Failed to load settings."); return; }
    const { settings: rows } = await res.json();
    setSettings(rows ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  function get(key: string) {
    return settings.find(s => s.key === key)?.value ?? "";
  }

  async function toggle(key: string) {
    const current = get(key) !== "false";
    await save(key, current ? "false" : "true");
  }

  async function save(key: string, value: string) {
    setSaving(p => ({ ...p, [key]: true }));
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    if (res.ok) {
      setSettings(p => p.map(s => s.key === key ? { ...s, value, updated_at: new Date().toISOString() } : s));
      setSaved(p => ({ ...p, [key]: true }));
      setTimeout(() => setSaved(p => ({ ...p, [key]: false })), 2000);
    }
    setSaving(p => ({ ...p, [key]: false }));
  }

  return (
    <div style={{ padding: "2rem", maxWidth: 620, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 4px", fontSize: "1.3rem", fontWeight: 700, color: "#fff" }}>Notification Settings</h1>
      <p style={{ margin: "0 0 2rem", fontSize: 13, color: "#555" }}>Control automated messages sent to members.</p>

      {loadErr && <Alert variant="error" style={{ marginBottom: "1rem" }}>{loadErr}</Alert>}

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

        {toggleKeys.map(key => {
          const isOn = get(key) !== "false";
          return (
            <Card key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#fff", marginBottom: 3 }}>{labelMap[key]}</div>
                <div style={{ fontSize: 12, color: "#555" }}>{descMap[key]}</div>
              </div>
              <button
                onClick={() => toggle(key)}
                disabled={saving[key]}
                aria-label={isOn ? `Disable ${labelMap[key]}` : `Enable ${labelMap[key]}`}
                style={{
                  width: 48, height: 26, borderRadius: 999, border: "none", cursor: "pointer",
                  background: isOn ? "#e8620a" : "rgba(255,255,255,0.1)",
                  position: "relative", transition: "background 0.2s", flexShrink: 0,
                  opacity: saving[key] ? 0.5 : 1,
                }}
              >
                <span style={{ position: "absolute", top: 3, left: isOn ? 24 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
              </button>
              {saved[key] && <Badge color="green" size="sm">Saved</Badge>}
            </Card>
          );
        })}

        {textKeys.map(key => {
          const val = get(key);
          return (
            <Card key={key}>
              <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#fff", marginBottom: 3 }}>{labelMap[key]}</div>
              <div style={{ fontSize: 12, color: "#555", marginBottom: "0.75rem" }}>{descMap[key]}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  key={val}
                  id={`input-${key}`}
                  defaultValue={val}
                  style={{ flex: 1, padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, color: "#fff", fontSize: 13, outline: "none", fontFamily: "monospace" }}
                />
                <Button loading={saving[key]} onClick={() => {
                    const el = document.getElementById(`input-${key}`) as HTMLInputElement | null;
                    if (el) save(key, el.value.trim());
                  }}>
                  {saved[key] ? "Saved ✓" : "Save"}
                </Button>
              </div>
            </Card>
          );
        })}

      </div>

      <Card style={{ marginTop: "2rem" }}>
        <div style={{ fontSize: 11, color: "#444", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Birthday cron schedule</div>
        <div style={{ fontSize: 13, color: "#666", lineHeight: 1.7 }}>
          Runs daily at <strong style={{ color: "#ccc" }}>7:00 AM IST</strong>.
          Sends to all members whose birthday matches today.
          Duplicates are prevented via <code style={{ fontSize: 11, background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 3 }}>birthday_email_sent</code> / <code style={{ fontSize: 11, background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 3 }}>birthday_wa_sent</code> columns.
        </div>
      </Card>
    </div>
  );
}
