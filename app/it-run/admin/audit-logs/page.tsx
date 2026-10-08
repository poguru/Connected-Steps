"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface AuditLog {
  id: string;
  action: string;
  admin_email: string;
  resource_type: string;
  resource_id: string;
  details: Record<string, any> | null;
  timestamp: string;
}

interface AuditLogsResponse {
  logs: AuditLog[];
  total: number;
}

const BG = "#080808";
const ACCENT = "#e8620a";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function actionBadge(action: string): { label: string; color: string; bg: string } {
  switch (action) {
    case "link_registration":
      return { label: "Link", color: "#10b981", bg: "rgba(16,185,129,0.1)" };
    case "unlink_registration":
      return { label: "Unlink", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" };
    default:
      return { label: action, color: "#60a5fa", bg: "rgba(96,165,250,0.1)" };
  }
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<string>("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/it-run/admin/audit-logs");
        if (!res.ok) {
          const err = await res.json() as { error?: string };
          setError(err.error ?? "Failed to load audit logs");
          setLoading(false);
          return;
        }
        const d = await res.json() as AuditLogsResponse;
        setLogs(d.logs ?? []);
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const filteredLogs = filter
    ? logs.filter(
        (log) =>
          log.admin_email.toLowerCase().includes(filter.toLowerCase()) ||
          log.resource_id.toLowerCase().includes(filter.toLowerCase()) ||
          log.action.toLowerCase().includes(filter.toLowerCase())
      )
    : logs;

  return (
    <div style={{ background: BG, color: "#fff", fontFamily: "'Inter',system-ui,sans-serif", minHeight: "100vh" }}>
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          background: "rgba(8,8,8,0.97)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          height: 52,
          display: "flex",
          alignItems: "center",
          padding: "0 clamp(1rem,4vw,2rem)",
          justifyContent: "space-between",
        }}
      >
        <Link href="/it-run/admin" style={{ color: "#888", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
          ← Admin Portal
        </Link>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Audit Logs</div>
      </nav>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "calc(52px + 2rem) clamp(1rem,4vw,2rem) 3rem" }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0, marginBottom: 8 }}>Audit Logs</h1>
          <p style={{ fontSize: 14, color: "#666", margin: 0, marginBottom: 24 }}>
            Complete history of all admin actions on registrations and users.
          </p>

          <input
            type="text"
            placeholder="Search by email, registration ID, or action..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              width: "100%",
              maxWidth: 500,
              padding: "10px 14px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              color: "#fff",
              fontSize: 14,
              fontFamily: "inherit",
            }}
          />
        </div>

        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 60 }}>
            <div
              style={{
                width: 32,
                height: 32,
                border: "3px solid rgba(255,255,255,0.08)",
                borderTopColor: ACCENT,
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
          </div>
        )}

        {!loading && error && (
          <div
            style={{
              background: "rgba(248,113,113,0.06)",
              border: "1px solid rgba(248,113,113,0.2)",
              borderRadius: 12,
              padding: 16,
              color: "#f87171",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && logs.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", height: 40 }}>
                  <th style={{ textAlign: "left", padding: "0 12px", color: "#666", fontWeight: 600, fontSize: 12 }}>
                    TIMESTAMP
                  </th>
                  <th style={{ textAlign: "left", padding: "0 12px", color: "#666", fontWeight: 600, fontSize: 12 }}>
                    ACTION
                  </th>
                  <th style={{ textAlign: "left", padding: "0 12px", color: "#666", fontWeight: 600, fontSize: 12 }}>
                    ADMIN
                  </th>
                  <th style={{ textAlign: "left", padding: "0 12px", color: "#666", fontWeight: 600, fontSize: 12 }}>
                    RESOURCE
                  </th>
                  <th style={{ textAlign: "left", padding: "0 12px", color: "#666", fontWeight: 600, fontSize: 12 }}>
                    DETAILS
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const badge = actionBadge(log.action);
                  return (
                    <tr
                      key={log.id}
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.03)",
                        height: 56,
                      }}
                    >
                      <td style={{ padding: "0 12px", color: "#888", fontFamily: "monospace", fontSize: 12 }}>
                        {formatDate(log.timestamp)}
                      </td>
                      <td style={{ padding: "0 12px" }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "4px 10px",
                            borderRadius: 20,
                            color: badge.color,
                            background: badge.bg,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: "0 12px", color: "#fff" }}>{log.admin_email}</td>
                      <td style={{ padding: "0 12px", color: "#888", fontFamily: "monospace", fontSize: 12 }}>
                        {log.resource_id.slice(0, 8)}...
                      </td>
                      <td
                        style={{
                          padding: "0 12px",
                          color: "#666",
                          fontSize: 12,
                          maxWidth: 200,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={JSON.stringify(log.details || {})}
                      >
                        {log.details ? JSON.stringify(log.details).slice(0, 50) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && logs.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No audit logs yet</h2>
            <p style={{ fontSize: 14, color: "#666" }}>Admin actions will appear here.</p>
          </div>
        )}

        {!loading && !error && logs.length > 0 && filteredLogs.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No matching logs</h2>
            <p style={{ fontSize: 14, color: "#666" }}>Try adjusting your search filter.</p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
