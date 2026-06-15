"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

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

export default function BirthdaySettingsPage() {
  const [authed,   setAuthed]   = useState(false);
  const [pw,       setPw]       = useState("");
  const [pwErr,    setPwErr]    = useState("");
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

  useEffect(() => {
    fetch("/api/admin/auth").then(r => { if (r.ok) { setAuthed(true); load(); } }).catch(() => {});
  }, [load]);

  async function verify(password: string) {
    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) { setAuthed(true); load(); }
    else        { setPwErr("Incorrect password."); }
  }

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

  if (!authed) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "2rem", width: 320 }}>
        <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#fff", marginBottom: 4 }}>Connected Steps — Admin</div>
        <div style={{ fontSize: "11px", color: "#888", marginBottom: "1.5rem" }}>Birthday Settings</div>
        <input type="password" placeholder="Admin password" value={pw}
          onChange={e => { setPw(e.target.value); setPwErr(""); }}
          onKeyDown={e => e.key === "Enter" && verify(pw)}
          style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", fontSize: "0.875rem", outline: "none", boxSizing: "border-box", marginBottom: "0.75rem", fontFamily: "inherit" }}
        />
        {pwErr && <div style={{ fontSize: "0.8rem", color: "#f09595", marginBottom: "0.75rem" }}>{pwErr}</div>}
        <button onClick={() => verify(pw)}
          style={{ width: "100%", padding: 10, background: "#e8620a", color: "#fff", border: "none", borderRadius: 6, fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          Access Admin
        </button>
        <Link href="/admin" style={{ display: "block", textAlign: "center", marginTop: "1rem", fontSize: "0.75rem", color: "#555", textDecoration: "none" }}>← Admin home</Link>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", padding: "2rem", maxWidth: 620, margin: "0 auto" }}>
      <Link href="/admin" style={{ fontSize: 12, color: "#e8620a", textDecoration: "none", display: "inline-block", marginBottom: "1.5rem" }}>← Admin home</Link>
      <h1 style={{ margin: "0 0 4px", fontSize: "1.3rem", fontWeight: 700 }}>Birthday Settings</h1>
      <p style={{ margin: "0 0 2rem", fontSize: 13, color: "#888" }}>Control automated birthday messages sent to members.</p>

      {loadErr && <div style={{ background: "oklch(0.62 0.22 22 / 10%)", border: "1px solid oklch(0.62 0.22 22 / 30%)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#f09595", marginBottom: "1rem" }}>{loadErr}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

        {/* Toggle settings */}
        {toggleKeys.map(key => {
          const isOn = get(key) !== "false";
          return (
            <div key={key} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "1.25rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 3 }}>{labelMap[key]}</div>
                <div style={{ fontSize: 12, color: "#888" }}>{descMap[key]}</div>
              </div>
              <button
                onClick={() => toggle(key)}
                disabled={saving[key]}
                style={{
                  width: 48, height: 26, borderRadius: 999, border: "none", cursor: "pointer",
                  background: isOn ? "#e8620a" : "rgba(255,255,255,0.1)",
                  position: "relative", transition: "background 0.2s", flexShrink: 0,
                  opacity: saving[key] ? 0.5 : 1,
                }}
                aria-label={isOn ? `Disable ${labelMap[key]}` : `Enable ${labelMap[key]}`}
              >
                <span style={{
                  position: "absolute", top: 3, left: isOn ? 24 : 3, width: 20, height: 20,
                  borderRadius: "50%", background: "#fff", transition: "left 0.2s",
                }} />
              </button>
              {saved[key] && <span style={{ fontSize: 11, color: "#4ade80", flexShrink: 0 }}>Saved</span>}
            </div>
          );
        })}

        {/* Text settings */}
        {textKeys.map(key => {
          const val = get(key);
          return (
            <div key={key} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "1.25rem 1.5rem" }}>
              <div style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 3 }}>{labelMap[key]}</div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: "0.75rem" }}>{descMap[key]}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  defaultValue={val}
                  key={val}
                  id={`input-${key}`}
                  style={{ flex: 1, padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, color: "#fff", fontSize: 13, outline: "none", fontFamily: "monospace" }}
                />
                <button
                  onClick={() => {
                    const el = document.getElementById(`input-${key}`) as HTMLInputElement | null;
                    if (el) save(key, el.value.trim());
                  }}
                  disabled={saving[key]}
                  style={{ padding: "9px 18px", background: "#e8620a", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: saving[key] ? 0.5 : 1 }}
                >
                  {saving[key] ? "Saving…" : saved[key] ? "Saved ✓" : "Save"}
                </button>
              </div>
            </div>
          );
        })}

      </div>

      <div style={{ marginTop: "2rem", background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "1rem 1.5rem" }}>
        <div style={{ fontSize: 12, color: "#555", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>About birthday cron</div>
        <div style={{ fontSize: 13, color: "#888", lineHeight: 1.7 }}>
          The birthday cron runs every day at <strong style={{ color: "#ccc" }}>7:00 AM IST</strong>.
          It sends to all members whose birthday matches today&apos;s date.
          Duplicate sends are prevented via <code style={{ fontSize: 11, background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 3 }}>birthday_email_sent</code> / <code style={{ fontSize: 11, background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 3 }}>birthday_wa_sent</code> columns.
        </div>
      </div>
    </div>
  );
}
