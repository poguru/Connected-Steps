"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, Button, Badge, Spinner, Alert } from "@/components/ui/ds";

interface ExtCampaign {
  id:              string;
  name:            string;
  status:          string;
  segment_type:    string;
  subject:         string | null;
  recipient_count: number;
  sent_count:      number;
  failed_count:    number;
  queued_count:    number;
  created_at:      string;
  sent_at:         string | null;
}

interface Stats {
  totalContacts:    number;
  activeContacts:   number;
  unsubscribed:     number;
  campaignsSent:    number;
  emailsSentToday:  number;
  failedEmails:     number;
  lastCampaignAt:   string | null;
}

const STATUS_COLOR: Record<string, string> = {
  draft:      "#6b7280",
  scheduled:  "#3b82f6",
  sending:    "#f59e0b",
  sent:       "#10b981",
  cancelled:  "#6b7280",
  failed:     "#ef4444",
};

const SEGMENT_LABEL: Record<string, string> = {
  external_contacts_all:  "All External Contacts",
  external_contact_list:  "Contact List(s)",
};

function fmt(n: number | null | undefined) {
  return (n ?? 0).toLocaleString();
}

function relTime(iso: string) {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)      return "just now";
  if (s < 3600)    return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)   return `${Math.floor(s / 3600)}h ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function ExternalCampaignsPage() {
  const [campaigns, setCampaigns] = useState<ExtCampaign[]>([]);
  const [stats,     setStats]     = useState<Stats | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [alert,     setAlert]     = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [campRes, statRes] = await Promise.all([
      fetch("/api/admin/campaigns?segment_type=external_contacts_all,external_contact_list&limit=50"),
      fetch("/api/admin/external-contacts?limit=1&stats=1"),
    ]);
    const campData = campRes.ok ? await campRes.json() : { campaigns: [] };
    const statData = statRes.ok ? await statRes.json() : {};

    setCampaigns(campData.campaigns ?? []);

    const camps: ExtCampaign[] = campData.campaigns ?? [];
    const sentToday = camps.filter(c => c.sent_at && new Date(c.sent_at).toDateString() === new Date().toDateString())
      .reduce((a, c) => a + c.sent_count, 0);

    setStats({
      totalContacts:   statData.total ?? 0,
      activeContacts:  statData.active ?? 0,
      unsubscribed:    statData.unsubscribed ?? 0,
      campaignsSent:   camps.filter(c => c.status === "sent").length,
      emailsSentToday: sentToday,
      failedEmails:    camps.reduce((a, c) => a + c.failed_count, 0),
      lastCampaignAt:  camps.find(c => c.sent_at)?.sent_at ?? null,
    });

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function cancelCampaign(id: string) {
    const res = await fetch(`/api/admin/campaigns/${id}/cancel`, { method: "POST" });
    if (res.ok) { setAlert({ type: "success", msg: "Campaign cancelled" }); load(); }
    else { const d = await res.json(); setAlert({ type: "error", msg: d.error ?? "Cancel failed" }); }
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1100, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#fff" }}>External Campaigns</h1>
          <p style={{ margin: "4px 0 0", fontSize: "0.78rem", color: "#555" }}>Send promotional emails to external contacts — not registered platform users</p>
        </div>
        <Link href="/admin/external-campaigns/new">
          <Button variant="primary" size="sm">+ New Campaign</Button>
        </Link>
      </div>

      {alert && <Alert variant={alert.type === "success" ? "success" : "error"} style={{ marginBottom: 14 }}>{alert.msg}</Alert>}

      {/* Stats */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Total Contacts",   value: fmt(stats.totalContacts),   color: "#60a5fa" },
            { label: "Active Contacts",  value: fmt(stats.activeContacts),  color: "#34d399" },
            { label: "Unsubscribed",     value: fmt(stats.unsubscribed),    color: "#f87171" },
            { label: "Campaigns Sent",   value: fmt(stats.campaignsSent),   color: "#e8620a" },
            { label: "Emails Today",     value: fmt(stats.emailsSentToday), color: "#a78bfa" },
            { label: "Failed Emails",    value: fmt(stats.failedEmails),    color: "#f59e0b" },
          ].map(s => (
            <Card key={s.label} style={{ padding: "0.85rem 1rem", textAlign: "center" }}>
              <div style={{ fontSize: "1.4rem", fontWeight: 800, color: s.color, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
              <div style={{ fontSize: "0.63rem", color: "#444", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{s.label}</div>
            </Card>
          ))}
        </div>
      )}

      {/* Last campaign note */}
      {stats?.lastCampaignAt && (
        <div style={{ fontSize: "0.72rem", color: "#444", marginBottom: 14 }}>Last campaign sent {relTime(stats.lastCampaignAt)}</div>
      )}

      {/* Quick links */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <Link href="/admin/contacts"><Button variant="ghost" size="sm">👥 All Contacts</Button></Link>
        <Link href="/admin/contact-lists"><Button variant="ghost" size="sm">📋 Contact Lists</Button></Link>
        <Link href="/admin/contacts/import"><Button variant="ghost" size="sm">📥 Import Contacts</Button></Link>
      </div>

      {/* Campaign list */}
      {loading ? (
        <div style={{ padding: "3rem", textAlign: "center" }}><Spinner /></div>
      ) : campaigns.length === 0 ? (
        <Card style={{ padding: "3rem", textAlign: "center", color: "#555" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📣</div>
          <div style={{ fontWeight: 600, color: "#888", marginBottom: 8 }}>No external campaigns yet</div>
          <div style={{ fontSize: "0.8rem", color: "#555", marginBottom: 20 }}>Create your first campaign to send promotional emails to external contacts</div>
          <Link href="/admin/external-campaigns/new">
            <Button variant="primary" size="sm">+ Create Campaign</Button>
          </Link>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["Campaign", "Segment", "Status", "Recipients", "Sent", "Failed", "Date", ""].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.3)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaigns.map(c => (
                <tr key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "10px 12px" }}>
                    <Link href={`/admin/external-campaigns/${c.id}`} style={{ color: "#fff", fontWeight: 600, textDecoration: "none" }}>{c.name}</Link>
                    {c.subject && <div style={{ fontSize: "0.72rem", color: "#555", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{c.subject}</div>}
                  </td>
                  <td style={{ padding: "10px 12px", color: "#666", fontSize: "0.75rem" }}>
                    {SEGMENT_LABEL[c.segment_type] ?? c.segment_type}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, color: STATUS_COLOR[c.status] ?? "#888", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {c.status}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", color: "#fff", fontVariantNumeric: "tabular-nums" }}>{fmt(c.recipient_count)}</td>
                  <td style={{ padding: "10px 12px", color: "#34d399", fontVariantNumeric: "tabular-nums" }}>{fmt(c.sent_count)}</td>
                  <td style={{ padding: "10px 12px", color: c.failed_count > 0 ? "#f87171" : "#555", fontVariantNumeric: "tabular-nums" }}>{fmt(c.failed_count)}</td>
                  <td style={{ padding: "10px 12px", color: "#555", fontSize: "0.72rem" }}>
                    {c.sent_at ? relTime(c.sent_at) : relTime(c.created_at)}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Link href={`/admin/external-campaigns/${c.id}`}>
                        <Button variant="ghost" size="sm">View</Button>
                      </Link>
                      {["sending", "scheduled", "draft"].includes(c.status) && (
                        <button onClick={() => cancelCampaign(c.id)}
                          style={{ padding: "3px 8px", background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 5, color: "#f87171", cursor: "pointer", fontSize: "0.7rem", fontFamily: "inherit" }}>
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
