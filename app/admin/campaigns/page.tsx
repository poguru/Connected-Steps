"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, Button, Badge, Spinner, Alert } from "@/components/ui/ds";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Campaign {
  id:               string;
  name:             string;
  description:      string | null;
  channel:          "email" | "whatsapp" | "push";
  message_type:     string;
  is_transactional: boolean;
  segment_type:     string;
  status:           "draft" | "scheduled" | "sending" | "sent" | "cancelled" | "failed";
  recipient_count:  number;
  sent_count:       number;
  failed_count:     number;
  opened_count:     number;
  created_by:       string;
  created_at:       string;
  sent_at:          string | null;
  scheduled_for:    string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CHANNEL_ICON: Record<string, string> = { email: "📧", whatsapp: "💬", push: "🔔" };

const STATUS_COLOR: Record<string, "green" | "blue" | "yellow" | "red" | "gray"> = {
  draft:     "gray",
  scheduled: "blue",
  sending:   "yellow",
  sent:      "green",
  cancelled: "gray",
  failed:    "red",
};

const SEGMENT_LABELS: Record<string, string> = {
  all_users:        "All Users",
  premium_members:  "Premium Members",
  free_members:     "Free Members",
  training_members: "Training Members",
  event_registered: "Event Registrants",
  attended_recent:  "Recent Attendees",
  never_attended:   "Never Attended",
  training_location:"Training Location",
  event_category:   "Event Category",
  waitlisted:       "Waitlisted",
  admins:           "Admins",
  custom_emails:    "Custom Email List",
  custom_phones:    "Custom Phone List",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

const STATUSES = ["all", "draft", "scheduled", "sending", "sent", "failed"] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [statusTab, setStatusTab] = useState<string>("all");
  const [alert,     setAlert]     = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [deleting,  setDeleting]  = useState<string | null>(null);
  const [sending,   setSending]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs  = statusTab !== "all" ? `&status=${statusTab}` : "";
    const res  = await fetch(`/api/admin/campaigns?limit=50${qs}`);
    const data = await res.json();
    setCampaigns(data.campaigns ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [statusTab]);

  useEffect(() => { load(); }, [load]);

  async function sendNow(c: Campaign) {
    if (!confirm(`Send "${c.name}" immediately?`)) return;
    setSending(c.id);
    setAlert(null);
    const res  = await fetch(`/api/admin/campaigns/${c.id}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const data = await res.json();
    setSending(null);
    if (res.ok) {
      setAlert({ type: "success", msg: `Campaign started — ${data.recipientCount} recipient(s) queued.` });
      await load();
    } else {
      setAlert({ type: "error", msg: data.error ?? "Send failed" });
    }
  }

  async function deleteCampaign(c: Campaign) {
    if (!confirm(`Delete "${c.name}"?`)) return;
    setDeleting(c.id);
    const res = await fetch(`/api/admin/campaigns/${c.id}`, { method: "DELETE" });
    setDeleting(null);
    if (res.ok) { await load(); } else {
      const d = await res.json();
      setAlert({ type: "error", msg: d.error ?? "Delete failed" });
    }
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800 }}>Communication Hub</h1>
          <p style={{ margin: "5px 0 0", fontSize: "0.8rem", color: "rgba(255,255,255,0.4)" }}>
            Platform-wide campaigns across email and WhatsApp · {total} total
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/admin/campaigns/new">
            <Button variant="primary">+ New Campaign</Button>
          </Link>
          <a href="/api/admin/consent-report?format=csv">
            <Button variant="outline" size="sm">Export Consent CSV</Button>
          </a>
        </div>
      </div>

      {alert && <Alert variant={alert.type === "success" ? "success" : "error"} style={{ marginBottom: 16 }}>{alert.msg}</Alert>}

      {/* Status tab bar */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid rgba(255,255,255,0.1)", marginBottom: 20, flexWrap: "wrap" }}>
        {STATUSES.map(s => (
          <button key={s} onClick={() => setStatusTab(s)}
            style={{
              padding: "8px 14px", background: "none", border: "none", cursor: "pointer",
              fontSize: "0.82rem", fontFamily: "inherit", fontWeight: statusTab === s ? 700 : 400,
              color: statusTab === s ? "#e8620a" : "rgba(255,255,255,0.5)",
              borderBottom: `2px solid ${statusTab === s ? "#e8620a" : "transparent"}`,
              marginBottom: -1, textTransform: "capitalize",
            }}>
            {s === "all" ? "All" : s}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem" }}><Spinner /></div>
      ) : campaigns.length === 0 ? (
        <Card style={{ textAlign: "center", padding: "3rem", color: "rgba(255,255,255,0.35)" }}>
          {statusTab === "all" ? (
            <>No campaigns yet. <Link href="/admin/campaigns/new" style={{ color: "#e8620a" }}>Create your first campaign →</Link></>
          ) : (
            `No ${statusTab} campaigns.`
          )}
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {campaigns.map(c => (
            <Card key={c.id} style={{ padding: "1rem 1.25rem" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start" }}>

                {/* Left: info */}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "1rem" }}>{CHANNEL_ICON[c.channel]}</span>
                    <Link href={`/admin/campaigns/${c.id}`}
                      style={{ fontWeight: 700, fontSize: "0.9rem", color: "#fff", textDecoration: "none" }}>
                      {c.name}
                    </Link>
                    <Badge color={STATUS_COLOR[c.status]} size="sm">{c.status}</Badge>
                    {c.is_transactional && <Badge color="blue" size="sm">transactional</Badge>}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                    {SEGMENT_LABELS[c.segment_type] ?? c.segment_type}
                    {" · "}
                    {c.message_type.replace(/_/g, " ")}
                    {" · "}
                    by {c.created_by} · {fmtDate(c.created_at)}
                  </div>
                  {c.scheduled_for && c.status === "scheduled" && (
                    <div style={{ fontSize: "0.73rem", color: "#60a5fa", marginTop: 3 }}>
                      Scheduled for {fmtDate(c.scheduled_for)}
                    </div>
                  )}
                </div>

                {/* Middle: delivery stats */}
                <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: "0.78rem", flexWrap: "wrap" }}>
                  {c.recipient_count > 0 && (
                    <>
                      <span style={{ color: "rgba(255,255,255,0.55)" }}>{c.recipient_count} recipients</span>
                      {c.sent_count > 0 && <span style={{ color: "#4ade80" }}>✓ {c.sent_count}</span>}
                      {c.failed_count > 0 && <span style={{ color: "#f87171" }}>✗ {c.failed_count}</span>}
                      {c.opened_count > 0 && <span style={{ color: "#a78bfa" }}>👁 {c.opened_count}</span>}
                    </>
                  )}
                </div>

                {/* Right: actions */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Link href={`/admin/campaigns/${c.id}`}>
                    <Button size="xs" variant="ghost">View</Button>
                  </Link>
                  {["draft", "scheduled"].includes(c.status) && (
                    <Link href={`/admin/campaigns/${c.id}?edit=1`}>
                      <Button size="xs" variant="ghost">Edit</Button>
                    </Link>
                  )}
                  {["draft", "scheduled"].includes(c.status) && (
                    <Button size="xs" variant="primary"
                      loading={sending === c.id}
                      onClick={() => sendNow(c)}>
                      Send Now
                    </Button>
                  )}
                  {["draft", "cancelled"].includes(c.status) && (
                    <Button size="xs" variant="ghost" onClick={() => deleteCampaign(c)}
                      loading={deleting === c.id}
                      style={{ color: "#f87171" }}>
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
