"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { Card, Button, Badge, Spinner, Alert } from "@/components/ui/ds";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Campaign {
  id: string; name: string; description: string | null; channel: string;
  message_type: string; is_transactional: boolean; segment_type: string;
  status: string; recipient_count: number; queued_count: number;
  sent_count: number; failed_count: number; delivered_count: number;
  opened_count: number; clicked_count: number; bounced_count: number;
  created_by: string; created_at: string; sent_at: string | null;
  scheduled_for: string | null; batch_id: string | null;
  subject: string | null; html_body: string | null;
  wa_template_name: string | null;
}

interface QueueRow {
  id: string; recipient_email: string; recipient_name: string;
  status: string; attempts: number; failure_reason: string | null;
  failure_code: string | null; sent_at: string | null;
  opened_at: string | null; clicked_at: string | null;
  bounce_type: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, "green" | "blue" | "yellow" | "red" | "gray" | "purple"> = {
  draft:     "gray", scheduled: "blue", sending: "yellow",
  sent:      "green", cancelled: "gray", failed:  "red",
  delivered: "green", queued:  "yellow", bounced: "red",
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function pct(n: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

const CHANNEL_ICON: Record<string, string> = { email: "📧", whatsapp: "💬", push: "🔔" };

// ── Component ─────────────────────────────────────────────────────────────────

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [campaign,   setCampaign]   = useState<Campaign | null>(null);
  const [rows,       setRows]       = useState<QueueRow[]>([]);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [sending,    setSending]    = useState(false);
  const [retrying,   setRetrying]   = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [alert,      setAlert]      = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const load = useCallback(async () => {
    const [cRes, sRes] = await Promise.all([
      fetch(`/api/admin/campaigns/${id}`),
      fetch(`/api/admin/campaigns/${id}/status?limit=200${statusFilter !== "all" ? `&status=${statusFilter}` : ""}`),
    ]);
    const [cData, sData] = await Promise.all([cRes.json(), sRes.json()]);
    setCampaign(cData.campaign ?? null);
    setRows(sData.recipients ?? []);
    setTotal(sData.total ?? 0);
    setLoading(false);
  }, [id, statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh while sending
  useEffect(() => {
    if (campaign?.status !== "sending") return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [campaign?.status, load]);

  async function sendNow() {
    if (!campaign) return;
    if (!confirm(`Send "${campaign.name}" immediately to all eligible recipients?`)) return;
    setSending(true);
    setAlert(null);
    const res  = await fetch(`/api/admin/campaigns/${id}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const data = await res.json();
    setSending(false);
    if (res.ok) {
      setAlert({ type: "success", msg: `Campaign started · ${data.recipientCount} recipients queued.` });
      await load();
    } else {
      setAlert({ type: "error", msg: data.error ?? "Send failed" });
    }
  }

  async function retryFailed() {
    setRetrying(true);
    const res  = await fetch(`/api/admin/campaigns/${id}/status`, { method: "POST", headers: { "Content-Type": "application/json" } });
    const data = await res.json();
    setRetrying(false);
    if (res.ok) {
      setAlert({ type: "success", msg: `${data.retried} email(s) queued for retry.` });
      await load();
    }
  }

  if (loading) return <div style={{ padding: "3rem", textAlign: "center" }}><Spinner /></div>;
  if (!campaign) return <div style={{ padding: "2rem", color: "rgba(255,255,255,0.4)" }}>Campaign not found.</div>;

  const total_ = campaign.recipient_count || 1;

  return (
    <div style={{ padding: "1.5rem", maxWidth: 960, margin: "0 auto" }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 20 }}>
        <Link href="/admin/campaigns" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>
          ← Campaigns
        </Link>
      </div>

      {alert && <Alert variant={alert.type === "success" ? "success" : "error"} style={{ marginBottom: 16 }}>{alert.msg}</Alert>}

      {/* ── Header card ── */}
      <Card style={{ padding: "1.25rem", marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: "1.2rem" }}>{CHANNEL_ICON[campaign.channel]}</span>
              <h1 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>{campaign.name}</h1>
              <Badge color={STATUS_COLOR[campaign.status] as "green"} size="sm">{campaign.status}</Badge>
              {campaign.is_transactional && <Badge color="blue" size="sm">transactional</Badge>}
            </div>
            {campaign.description && (
              <p style={{ margin: "6px 0 0", fontSize: "0.8rem", color: "rgba(255,255,255,0.4)" }}>{campaign.description}</p>
            )}
            <div style={{ marginTop: 8, fontSize: "0.75rem", color: "rgba(255,255,255,0.35)" }}>
              {campaign.message_type.replace(/_/g, " ")} · {campaign.segment_type.replace(/_/g, " ")} · created by {campaign.created_by} · {fmtDate(campaign.created_at)}
            </div>
            {campaign.scheduled_for && campaign.status === "scheduled" && (
              <div style={{ marginTop: 4, fontSize: "0.75rem", color: "#60a5fa" }}>
                Scheduled for {fmtDate(campaign.scheduled_for)}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["draft", "scheduled"].includes(campaign.status) && (
              <>
                <Link href={`/admin/campaigns/new?clone=${id}`}>
              <Button size="sm" variant="outline">Edit</Button>
            </Link>
                <Button onClick={sendNow} loading={sending} variant="primary" size="sm">Send Now</Button>
              </>
            )}
            {campaign.status === "sent" && campaign.failed_count > 0 && (
              <Button onClick={retryFailed} loading={retrying} size="sm" variant="outline">Retry Failed</Button>
            )}
            <Button onClick={load} size="sm" variant="ghost">↻</Button>
          </div>
        </div>
      </Card>

      {/* ── Stats row ── */}
      {campaign.recipient_count > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10, marginBottom: 16 }}>
          {[
            { label: "Recipients", value: campaign.recipient_count, color: "#fff" },
            { label: "Queued",     value: campaign.queued_count,    color: "#facc15" },
            { label: "Delivered",  value: campaign.sent_count,      color: "#4ade80" },
            { label: "Failed",     value: campaign.failed_count,    color: "#f87171" },
            { label: "Opened",     value: campaign.opened_count,    color: "#a78bfa" },
            { label: "Clicked",    value: campaign.clicked_count,   color: "#60a5fa" },
            { label: "Bounced",    value: campaign.bounced_count,   color: "#fb923c" },
          ].map(stat => (
            <Card key={stat.label} style={{ padding: "0.85rem", textAlign: "center" }}>
              <div style={{ fontSize: "1.4rem", fontWeight: 800, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginTop: 2 }}>{stat.label}</div>
              {stat.label !== "Recipients" && campaign.recipient_count > 0 && (
                <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.25)", marginTop: 1 }}>{pct(stat.value, total_)}</div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* ── Subject preview ── */}
      {campaign.channel === "email" && campaign.subject && (
        <Card style={{ padding: "0.875rem 1.25rem", marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>Subject</span>
          <span style={{ fontSize: "0.875rem", color: "#fff" }}>{campaign.subject}</span>
        </Card>
      )}
      {campaign.channel === "whatsapp" && campaign.wa_template_name && (
        <Card style={{ padding: "0.875rem 1.25rem", marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>Template</span>
          <span style={{ fontSize: "0.875rem", color: "#fff" }}>{campaign.wa_template_name}</span>
        </Card>
      )}

      {/* ── Delivery table ── */}
      {campaign.batch_id && (
        <Card style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>
              Delivery Log — {total} row{total !== 1 ? "s" : ""}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["all", "queued", "delivered", "failed", "bounced"].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  style={{
                    padding: "3px 10px", borderRadius: 20, cursor: "pointer",
                    fontSize: "0.72rem", fontFamily: "inherit", fontWeight: statusFilter === s ? 700 : 400,
                    border: `1px solid ${statusFilter === s ? "#e8620a" : "rgba(255,255,255,0.1)"}`,
                    background: statusFilter === s ? "rgba(232,98,10,0.12)" : "transparent",
                    color: statusFilter === s ? "#e8620a" : "rgba(255,255,255,0.5)",
                  }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {rows.length === 0 ? (
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.85rem" }}>No rows match this filter.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                <thead>
                  <tr style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.7rem", textTransform: "uppercase" }}>
                    {["Recipient", "Status", "Attempts", "Sent At", "Opened", "Failure"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "0 8px 8px 0", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                      <td style={{ padding: "6px 8px 6px 0" }}>
                        <div style={{ fontWeight: 500 }}>{r.recipient_name || r.recipient_email}</div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.7rem" }}>{r.recipient_email}</div>
                      </td>
                      <td style={{ padding: "6px 8px 6px 0" }}>
                        <Badge color={(STATUS_COLOR[r.status] ?? "gray") as "green"} size="sm">{r.status}</Badge>
                      </td>
                      <td style={{ padding: "6px 8px 6px 0", color: "rgba(255,255,255,0.55)" }}>{r.attempts}</td>
                      <td style={{ padding: "6px 8px 6px 0", color: "rgba(255,255,255,0.45)" }}>{fmtDate(r.sent_at)}</td>
                      <td style={{ padding: "6px 8px 6px 0", color: "rgba(255,255,255,0.45)" }}>{fmtDate(r.opened_at)}</td>
                      <td style={{ padding: "6px 8px 6px 0", color: "#f87171", maxWidth: 200 }}>
                        {r.failure_reason ?? (r.bounce_type ? `Bounce: ${r.bounce_type}` : "")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
