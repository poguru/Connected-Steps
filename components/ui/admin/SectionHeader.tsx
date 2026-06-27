import React from "react";

interface SectionHeaderProps {
  title:   string;
  action?: React.ReactNode;
  sub?:    string;
}

export function SectionHeader({ title, action, sub }: SectionHeaderProps) {
  return (
    <div style={{ display: "flex", alignItems: sub ? "flex-start" : "center", justifyContent: "space-between", marginBottom: 14 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: ".08em" }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>{sub}</div>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
