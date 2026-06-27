import React from "react";

interface EmptyStateProps {
  icon?:    string;
  title:    string;
  body?:    string;
  action?:  React.ReactNode;
}

export function EmptyState({ icon = "📭", title, body, action }: EmptyStateProps) {
  return (
    <div style={{ textAlign: "center" as const, padding: "3rem 1rem" }}>
      <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#555", marginBottom: body ? "0.4rem" : 0 }}>{title}</div>
      {body  && <div style={{ fontSize: "0.8rem", color: "#444", lineHeight: 1.6, maxWidth: 320, margin: "0 auto" }}>{body}</div>}
      {action && <div style={{ marginTop: "1.25rem" }}>{action}</div>}
    </div>
  );
}
