"use client";

import Link from "next/link";
import { Card } from "@/components/ui/ds";

const SETTINGS = [
  {
    href:  "/admin/settings/notifications",
    title: "Notification Settings",
    desc:  "Birthday emails, WhatsApp automation, and MSG91 template names.",
  },
];

export default function SettingsPage() {
  return (
    <div style={{ padding: "2rem", maxWidth: 680, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 4px", fontSize: "1.3rem", fontWeight: 700, color: "#fff" }}>Settings</h1>
      <p style={{ margin: "0 0 2rem", fontSize: 13, color: "#555" }}>Configure app-wide settings and automations.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {SETTINGS.map(s => (
          <Link key={s.href} href={s.href} style={{ textDecoration: "none" }}>
            <Card hoverable style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{s.title}</div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 3 }}>{s.desc}</div>
              </div>
              <span style={{ color: "#333", fontSize: 18, flexShrink: 0 }}>→</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
