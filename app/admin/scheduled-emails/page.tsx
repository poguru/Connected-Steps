"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/ds";

interface ScheduledEmail {
  id:               string;
  batch_id:         string | null;
  subject:          string;
  recipients:       number;
  recipient_filter: string | null;
  scheduled_for:    string;
  event_id:         string;
  events:           { id: string; title: string; share_slug: string | null; start_date: string } | null;
}

const FILTER_LABELS: Record<string, string> = {
  all:           "All registrants",
  paid:          "Paid",
  free:          "Free",
  pending:       "Payment pending",
  checked_in:    "Checked in",
  not_checked_in:"Not yet checked in",
};

function fmtIST(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return "overdue";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 24) return `in ${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0)   return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

export default function ScheduledEmailsPage() {
  const [rows,       setRows]       = useState<ScheduledEmail[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [toast,      setToast]      = useState("");

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res  = await fetch("/api/admin/scheduled-emails");
      if (!res.ok) { setError("Failed to load"); return; }
      const data = await res.json() as { scheduled: ScheduledEmail[] };
      setRows(data.scheduled ?? []);
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function cancel(row: ScheduledEmail) {
    if (!row.batch_id) return;
    if (!confirm(`Cancel this scheduled email?\n\n"${row.subject}"\n\nThis cannot be undone.`)) return;
    setCancelling(row.batch_id);
    try {
      const res = await fetch(
        `/api/admin/events/${row.event_id}/communicate/cancel-scheduled`,
        { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batch_id: row.batch_id }) }
      );
      if (res.ok) { showToast("✅ Scheduled email cancelled"); void load(); }
      else { const d = await res.json() as { error?: string }; showToast(`❌ ${d.error ?? "Failed to cancel"}`); }
    } catch { showToast("❌ Network error"); }
    finally { setCancelling(null); }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#fff", fontFamily: "'Inter',system-ui,sans-serif" }}>

      {toast && (
        <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 999, padding: "10px 20px", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, fontSize: 13, color: "#fff", whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}

      {/* Sticky top bar */}
      <div style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(8,8,8,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 20px", height: 52, display: "flex", alignItems: "center", gap: 16 }}>
        <Link href="/admin/events" style={{ fontSize: 13, color: "#888", textDecoration: "none" }}>← Events</Link>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Scheduled Emails</span>
        {!loading && (
          <span style={{ fontSize: 11, color: "#555" }}>
            {rows.length === 0 ? "None scheduled" : `${rows.length} queued`}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => void load()} style={{ fontSize: 11, color: "#555", background: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>
          Refresh
        </button>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px 80px" }}>

        {error && <Alert variant="error" style={{ marginBottom: 14 }}>{error}</Alert>}

        {loading ? (
          <div style={{ textAlign: "center", padding: "4rem", color: "#555" }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 14, color: "#666", fontWeight: 600 }}>No scheduled emails</div>
            <div style={{ fontSize: 12, color: "#444", marginTop: 6 }}>
              When you schedule an email from an event&apos;s Communicate tab, it appears here.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map(row => {
              const ev = row.events;
              const isOverdue = new Date(row.scheduled_for) < new Date();
              return (
                <div key={row.id} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${isOverdue ? "rgba(248,113,113,0.25)" : "rgba(255,255,255,0.08)"}`, borderRadius: 12, padding: "14px 16px", display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>

                  {/* Left: time pill */}
                  <div style={{ flexShrink: 0, textAlign: "center", minWidth: 90 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: isOverdue ? "#f87171" : "#fbbf24", padding: "3px 10px", background: isOverdue ? "rgba(248,113,113,0.1)" : "rgba(251,191,36,0.08)", border: `1px solid ${isOverdue ? "rgba(248,113,113,0.2)" : "rgba(251,191,36,0.2)"}`, borderRadius: 99, whiteSpace: "nowrap" }}>
                      {isOverdue ? "⚠ Overdue" : `🗓 ${timeUntil(row.scheduled_for)}`}
                    </div>
                    <div style={{ fontSize: 10, color: "#555", marginTop: 5, lineHeight: 1.4 }}>
                      {fmtIST(row.scheduled_for)}
                    </div>
                  </div>

                  {/* Main body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.subject}
                    </div>
                    {ev && (
                      <div style={{ fontSize: 11, color: "#60a5fa", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <Link href={`/admin/events/${ev.id}/communicate`} style={{ color: "inherit", textDecoration: "none" }}>
                          📅 {ev.title}
                        </Link>
                        {ev.start_date && (
                          <span style={{ color: "#555" }}> · {new Date(ev.start_date + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                        )}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "#555" }}>
                      <span style={{ color: "#888" }}>{row.recipients} recipient{row.recipients !== 1 ? "s" : ""}</span>
                      {row.recipient_filter && row.recipient_filter !== "all" && (
                        <span> · {FILTER_LABELS[row.recipient_filter] ?? row.recipient_filter}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                    {ev && (
                      <Link href={`/admin/events/${ev.id}/communicate`}
                        style={{ fontSize: 11, fontWeight: 600, color: "#60a5fa", textDecoration: "none", padding: "5px 10px", background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 6 }}>
                        View →
                      </Link>
                    )}
                    {row.batch_id && (
                      <button
                        onClick={() => void cancel(row)}
                        disabled={cancelling === row.batch_id}
                        style={{ fontSize: 11, fontWeight: 600, color: "#f87171", padding: "5px 10px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", opacity: cancelling === row.batch_id ? 0.5 : 1 }}>
                        {cancelling === row.batch_id ? "…" : "✕ Cancel"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 24, fontSize: 11, color: "#444", lineHeight: 1.7 }}>
          Scheduled emails are processed by the hourly cron at <code style={{ color: "#666" }}>/api/cron/process-scheduled-emails</code>. Cancelling removes all queued messages and marks the batch as cancelled — it cannot be re-sent.
        </div>
      </div>
    </div>
  );
}
