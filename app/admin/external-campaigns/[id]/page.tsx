"use client";

import { use, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, Button, Alert, Spinner, Badge } from "@/components/ui/ds";

interface Campaign {
  id:              string;
  name:            string;
  subject:         string | null;
  status:          string;
  segment_type:    string;
  segment_config:  Record<string, unknown>;
  sender_name:     string | null;
  reply_to:        string | null;
  recipient_count: number;
  sent_count:      number;
  failed_count:    number;
  queued_count:    number;
  delivered_count: number;
  opened_count:    number;
  created_by:      string | null;
  created_at:      string;
  sent_at:         string | null;
}

interface QueueRow {
  id:              string;
  recipient_email: string;
  recipient_name:  string;
  status:          string;
  attempts:        number;
  failure_reason:  string | null;
  failure_code:    string | null;
  is_permanent:    boolean | null;
  sent_at:         string | null;
  opened_at:       string | null;
}

const STATUS_COLOR: Record<string, string> = {
  draft:      "#6b7280",
  scheduled:  "#3b82f6",
  sending:    "#f59e0b",
  sent:       "#10b981",
  cancelled:  "#6b7280",
  failed:     "#ef4444",
};

function fmt(n: number | null | undefined) { return (n ?? 0).toLocaleString(); }
function pct(a: number, b: number) { return b ? `${Math.round((a / b) * 100)}%` : "—"; }
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ExtCampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [campaign,  setCampaign]  = useState<Campaign | null>(null);
  const [rows,      setRows]      = useState<QueueRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [rowTab,    setRowTab]    = useState<"failed" | "all">("failed");
  const [alert,     setAlert]     = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [working,   setWorking]   = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    const [campRes, rowRes] = await Promise.all([
      fetch(`/api/admin/campaigns/${id}`),
      fetch(`/api/admin/campaigns/${id}/status`),
    ]);
    if (campRes.ok) { const d = await campRes.json(); setCampaign(d.campaign); }
    if (rowRes.ok)  { const d = await rowRes.json(); setRows(d.recipients ?? []); }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh while sending
  useEffect(() => {
    if (!autoRefresh || !campaign || !["sending"].includes(campaign.status)) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [campaign, autoRefresh, load]);

  async function doCancel() {
    setWorking(true);
    const res = await fetch(`/api/admin/campaigns/${id}/cancel`, { method: "POST" });
    const d   = await res.json();
    setWorking(false);
    if (res.ok) { setAlert({ type: "success", msg: `Cancelled — ${d.cancelledEmailCount} emails removed from queue` }); load(); }
    else setAlert({ type: "error", msg: d.error ?? "Cancel failed" });
  }

  async function doRetry() {
    setWorking(true);
    const res = await fetch(`/api/admin/campaigns/${id}/retry`, { method: "POST" });
    const d   = await res.json();
    setWorking(false);
    if (res.ok) {
      setAlert({ type: "success", msg: d.retried ? `Retrying ${d.retriedCount} failed emails` : d.message });
      load();
    } else setAlert({ type: "error", msg: d.error ?? "Retry failed" });
  }

  async function doProcess() {
    setWorking(true);
    const res = await fetch(`/api/admin/campaigns/${id}/process`, { method: "POST" });
    const d   = await res.json();
    setWorking(false);
    if (res.ok) { setAlert({ type: "success", msg: `Processing resumed — ${d.queuedRows} emails in queue` }); load(); }
    else setAlert({ type: "error", msg: d.error ?? "Process failed" });
  }

  if (loading) return <div style={{ padding: "3rem", textAlign: "center" }}><Spinner /></div>;
  if (!campaign) return <div style={{ padding: "3rem", color: "#f87171", textAlign: "center" }}>Campaign not found.</div>;

  const failedRows = rows.filter(r => r.status === "failed");
  const queuedRows = rows.filter(r => r.status === "queued");
  const displayRows = rowTab === "failed" ? failedRows : rows;

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1000, margin: "0 auto" }}>

      {/* Breadcrumb + header */}
      <div style={{ fontSize: "0.72rem", color: "#555", marginBottom: 8 }}>
        <Link href="/admin/external-campaigns" style={{ color: "#555", textDecoration: "none" }}>External Campaigns</Link> /
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "#fff" }}>{campaign.name}</h1>
            <span style={{ fontSize: "0.7rem", fontWeight: 700, color: STATUS_COLOR[campaign.status] ?? "#888", textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 8px", border: `1px solid ${STATUS_COLOR[campaign.status] ?? "#555"}`, borderRadius: 4 }}>
              {campaign.status}
            </span>
          </div>
          {campaign.subject && <div style={{ fontSize: "0.82rem", color: "#555", marginTop: 4 }}>{campaign.subject}</div>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {campaign.status === "sending" && (
            <button onClick={() => setAutoRefresh(r => !r)}
              style={{ fontSize: "0.7rem", color: autoRefresh ? "#10b981" : "#555", background: "none", border: "1px solid", borderRadius: 5, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", borderColor: autoRefresh ? "#10b981" : "#333" }}>
              {autoRefresh ? "● Live" : "○ Paused"}
            </button>
          )}
          {["sending", "scheduled", "draft"].includes(campaign.status) && (
            <Button size="sm" variant="ghost" onClick={doCancel} disabled={working}>Cancel Campaign</Button>
          )}
          {["sent", "failed", "sending"].includes(campaign.status) && failedRows.length > 0 && (
            <Button size="sm" variant="outline" onClick={doRetry} disabled={working}>Retry Failed ({failedRows.length})</Button>
          )}
          {campaign.status === "sending" && queuedRows.length > 0 && (
            <Button size="sm" variant="primary" onClick={doProcess} disabled={working}>Resume Sending</Button>
          )}
        </div>
      </div>

      {alert && <Alert variant={alert.type === "success" ? "success" : "error"} style={{ marginBottom: 14 }}>{alert.msg}</Alert>}

      {/* Progress bar */}
      {campaign.recipient_count > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "#555", marginBottom: 4 }}>
            <span>Delivery progress</span>
            <span>{pct(campaign.sent_count + campaign.failed_count, campaign.recipient_count)}</span>
          </div>
          <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ display: "flex", height: "100%" }}>
              <div style={{ width: pct(campaign.sent_count, campaign.recipient_count), background: "#10b981", transition: "width 0.5s" }} />
              <div style={{ width: pct(campaign.failed_count, campaign.recipient_count), background: "#ef4444", transition: "width 0.5s" }} />
            </div>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Total",    value: fmt(campaign.recipient_count), color: "#fff" },
          { label: "Queued",   value: fmt(campaign.queued_count),    color: "#f59e0b" },
          { label: "Sent",     value: fmt(campaign.sent_count),      color: "#34d399" },
          { label: "Failed",   value: fmt(campaign.failed_count),    color: "#f87171" },
        ].map(s => (
          <Card key={s.label} style={{ padding: "0.85rem 1rem", textAlign: "center" }}>
            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: s.color, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
            <div style={{ fontSize: "0.63rem", color: "#444", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Campaign details */}
      <Card style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Campaign Details</div>
        {[
          { label: "From",        value: `${campaign.sender_name ?? "Connected Steps"} <info@connectedsteps.in>` },
          { label: "Reply-To",    value: campaign.reply_to ?? "(same as from)" },
          { label: "Segment",     value: campaign.segment_type === "external_contact_list" ? "Contact List(s)" : "All External Contacts" },
          { label: "Created",     value: fmtDate(campaign.created_at) },
          { label: "Sent at",     value: fmtDate(campaign.sent_at) },
        ].map(r => (
          <div key={r.label} style={{ display: "flex", gap: 12, borderBottom: "1px solid rgba(255,255,255,0.04)", padding: "7px 0" }}>
            <div style={{ width: 80, fontSize: "0.72rem", color: "#555", flexShrink: 0 }}>{r.label}</div>
            <div style={{ fontSize: "0.8rem", color: "#ccc" }}>{r.value}</div>
          </div>
        ))}
      </Card>

      {/* Queue rows */}
      {rows.length > 0 && (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8 }}>
            {(["failed", "all"] as const).map(t => (
              <button key={t} onClick={() => setRowTab(t)}
                style={{ padding: "5px 12px", borderRadius: 6, border: "none", fontFamily: "inherit", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                  background: rowTab === t ? "rgba(232,98,10,0.12)" : "transparent",
                  color: rowTab === t ? "#e8620a" : "#555" }}>
                {t === "failed" ? `Failed (${failedRows.length})` : `All (${rows.length})`}
              </button>
            ))}
          </div>
          {displayRows.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "#555", fontSize: "0.88rem" }}>
              {rowTab === "failed" ? "No failed emails" : "No emails to show"}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    {["Email", "Name", "Status", "Attempts", "Reason", "Sent At"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: "0.65rem", color: "#444", fontWeight: 700, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.slice(0, 200).map(r => (
                    <tr key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                      <td style={{ padding: "7px 12px", color: "#60a5fa" }}>{r.recipient_email}</td>
                      <td style={{ padding: "7px 12px", color: "#888" }}>{r.recipient_name || "—"}</td>
                      <td style={{ padding: "7px 12px" }}>
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase",
                          color: r.status === "delivered" ? "#34d399" : r.status === "failed" ? "#f87171" : r.status === "cancelled" ? "#6b7280" : "#f59e0b" }}>
                          {r.status}
                        </span>
                        {r.is_permanent && <span style={{ marginLeft: 4, fontSize: "0.6rem", color: "#f87171" }}>(perm)</span>}
                      </td>
                      <td style={{ padding: "7px 12px", color: "#555" }}>{r.attempts}</td>
                      <td style={{ padding: "7px 12px", color: "#f87171", fontSize: "0.72rem", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.failure_reason ?? "—"}
                      </td>
                      <td style={{ padding: "7px 12px", color: "#555", fontSize: "0.72rem" }}>
                        {r.sent_at ? new Date(r.sent_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {displayRows.length > 200 && (
                <div style={{ padding: "10px 16px", color: "#555", fontSize: "0.75rem", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  Showing 200 of {displayRows.length} rows
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
