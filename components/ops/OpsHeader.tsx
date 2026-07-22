"use client";

import { useRouter } from "next/navigation";
import { OPS_ROLE_LABELS } from "@/lib/ops-auth";
import type { OpsRole } from "@/lib/ops-auth";

interface Props {
  slug: string;
  eventTitle: string;
  role: OpsRole;
  volunteerName: string;
  countLabel?: string;
  accentColor?: string;
}

export default function OpsHeader({
  slug, eventTitle, role, volunteerName, countLabel, accentColor = "#10b981",
}: Props) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/ops/auth", { method: "DELETE" });
    router.push(`/ops/${slug}/login`);
  }

  return (
    <header style={{
      background: "#0d0d0d",
      borderBottom: "1px solid rgba(255,255,255,0.07)",
      padding: "0 16px", height: 52,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      position: "sticky", top: 0, zIndex: 10,
      fontFamily: "'Inter',system-ui,sans-serif",
    }}>
      {/* Left: role + event */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: accentColor, flexShrink: 0 }}>
          {OPS_ROLE_LABELS[role]}
        </span>
        <span style={{ fontSize: 11, color: "#444" }}>·</span>
        <span style={{ fontSize: 12, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {eventTitle}
        </span>
      </div>

      {/* Right: count + name + logout */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {countLabel && (
          <span style={{ fontSize: 13, fontWeight: 700, color: accentColor }}>{countLabel}</span>
        )}
        <span style={{ fontSize: 11, color: "#555", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {volunteerName}
        </span>
        <button
          onClick={logout}
          style={{
            padding: "5px 10px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 6, color: "#777", fontSize: 11,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Out
        </button>
      </div>
    </header>
  );
}
