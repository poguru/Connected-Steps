"use client";

import { useEffect, useState } from "react";

interface RefundRecord {
  id: string;
  registration_id: string;
  razorpay_refund_id: string | null;
  amount_paise: number;
  status: "pending" | "processed" | "failed";
  reason: string | null;
  initiated_by_email: string | null;
  created_at: string;
  processed_at: string | null;
  failure_reason: string | null;
  metadata: Record<string, unknown>;
  it_run_registrations: {
    id: string;
    registration_code: string;
    lead_email: string;
    final_price: number;
    payment_status: string;
    registration_status: string;
  } | null;
}

interface Stats {
  total: number;
  pending: number;
  processed: number;
  failed: number;
  totalRefunded: number;
}

interface Issue {
  type: string;
  refundId: string;
  registrationCode: string;
  details: string;
}

const ACCENT = "#e8620a";
const GREEN = "#10b981";
const RED = "#ef4444";
const YELLOW = "#f59e0b";

export default function RefundReconciliationPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "processed" | "failed">("all");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/it-run/admin/refund-reconciliation");
        if (res.ok) {
          const data = await res.json();
          setStats(data.stats);
          setIssues(data.issues);
          setRefunds(data.refunds);
        }
      } catch (err) {
        console.error("Failed to load refund reconciliation:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filteredRefunds = refunds.filter(r => filter === "all" || r.status === filter);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "processed":
        return GREEN;
      case "failed":
        return RED;
      case "pending":
        return YELLOW;
      default:
        return "#888";
    }
  };

  const getIssueIcon = (type: string) => {
    switch (type) {
      case "STATUS_MISMATCH":
        return "⚠";
      case "REGISTRATION_NOT_CANCELLED":
        return "🔴";
      case "STALE_PENDING":
        return "⏳";
      default:
        return "•";
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: "0 0 4px" }}>
          Refund Reconciliation
        </h1>
        <div style={{ fontSize: 13, color: "#888" }}>
          Monitor refund status and detect inconsistencies
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 28 }}>
          <div style={{ background: `${GREEN}15`, border: `1px solid ${GREEN}40`, borderRadius: 12, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: GREEN, marginBottom: 4 }}>{stats.total}</div>
            <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em" }}>Total Refunds</div>
          </div>
          <div style={{ background: `${YELLOW}15`, border: `1px solid ${YELLOW}40`, borderRadius: 12, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: YELLOW, marginBottom: 4 }}>{stats.pending}</div>
            <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em" }}>Pending</div>
          </div>
          <div style={{ background: `${GREEN}15`, border: `1px solid ${GREEN}40`, borderRadius: 12, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: GREEN, marginBottom: 4 }}>{stats.processed}</div>
            <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em" }}>Processed</div>
          </div>
          <div style={{ background: `${RED}15`, border: `1px solid ${RED}40`, borderRadius: 12, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: RED, marginBottom: 4 }}>{stats.failed}</div>
            <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em" }}>Failed</div>
          </div>
          <div style={{ background: `${ACCENT}15`, border: `1px solid ${ACCENT}40`, borderRadius: 12, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: ACCENT, marginBottom: 4 }}>₹{(stats.totalRefunded / 100).toLocaleString("en-IN")}</div>
            <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em" }}>Total Amount</div>
          </div>
        </div>
      )}

      {/* Issues section */}
      {issues.length > 0 && (
        <div style={{ marginBottom: 28, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 14 }}>
            Reconciliation Issues ({issues.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {issues.map((issue, i) => (
              <div
                key={i}
                style={{
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 13,
                  color: "#f87171",
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 16, marginTop: 2 }}>{getIssueIcon(issue.type)}</span>
                  <div style={{ flex: 1 }}>
                    <strong style={{ color: "#fff" }}>{issue.registrationCode}</strong>
                    <div style={{ fontSize: 12, color: "#aaa", marginTop: 2 }}>{issue.details}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {(["all", "pending", "processed", "failed"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "8px 16px",
              background: filter === f ? ACCENT : "rgba(255,255,255,0.05)",
              border: filter === f ? `1px solid ${ACCENT}` : "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              color: filter === f ? "#fff" : "#888",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              textTransform: "capitalize",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Refunds table */}
      {loading ? (
        <div style={{ color: "#888", padding: 40, textAlign: "center" }}>Loading…</div>
      ) : (
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, color: "#666", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Registration
                  </th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, color: "#666", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Amount
                  </th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, color: "#666", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Status
                  </th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, color: "#666", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Razorpay ID
                  </th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, color: "#666", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Created
                  </th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, color: "#666", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Reason / Error
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRefunds.map(r => (
                  <tr
                    key={r.id}
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      background: r.status === "failed" ? "rgba(239,68,68,0.04)" : r.status === "pending" ? "rgba(245,158,11,0.04)" : undefined,
                    }}
                  >
                    <td style={{ padding: "12px 16px", fontSize: 13, color: ACCENT, fontFamily: "monospace", fontWeight: 600 }}>
                      {r.it_run_registrations?.registration_code ?? "unknown"}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#fff", fontWeight: 700 }}>
                      ₹{(r.amount_paise / 100).toLocaleString("en-IN")}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12 }}>
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: 6,
                          background: `${getStatusColor(r.status)}18`,
                          color: getStatusColor(r.status),
                          fontWeight: 700,
                          textTransform: "capitalize",
                        }}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#999", fontFamily: "monospace" }}>
                      {r.razorpay_refund_id ? r.razorpay_refund_id.substring(0, 16) + "…" : "—"}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#999" }}>
                      {new Date(r.created_at).toLocaleString("en-IN")}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: r.failure_reason ? RED : "#888", maxWidth: 250 }}>
                      {r.failure_reason || r.reason || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredRefunds.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "#666", fontSize: 13 }}>
              No refunds found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
