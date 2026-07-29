"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, Button, Alert, Badge, EmptyState, Spinner } from "@/components/ui/ds";

interface EventSummary {
  id:                string;
  title:             string;
  start_date:        string;
  location:          string;
  status:            string;
  max_participants:  number | null;
  participant_count: number | null;
  price:             number;
  registration_closes_at: string | null;
}

interface RegStats {
  event_id: string;
  total:    number;
  paid:     number;
  free:     number;
  pending:  number;
  revenue:  number;
}

interface AuditRow {
  id: string;
  registration_code: string;
  user_name: string;
  user_email: string;
  email_status: string | null;
  confirmation_email_sent_at: string | null;
  qr_token: string | null;
  created_at: string;
  events: { id: string; title: string; start_date: string } | null;
}

interface AuditResult {
  missing_email: AuditRow[];
  failed_email:  AuditRow[];
  missing_qr:    AuditRow[];
}

interface ReconcileResult {
  checked:   number;
  recovered: number;
  skipped:   number;
  dry_run:   boolean;
  details:   { registration_code: string; user_email: string; action: string }[];
}

interface ResendResult {
  sent:    number;
  skipped: number;
  failed:  number;
  dry_run: boolean;
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function statusBadge(ev: EventSummary) {
  const nowISO    = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString();
  const regClosed = ev.registration_closes_at && nowISO >= ev.registration_closes_at;
  const full      = ev.max_participants != null && (ev.participant_count ?? 0) >= ev.max_participants;
  if (ev.status !== "published") return { label: "Draft",        color: "#666" };
  if (full)                       return { label: "Sold Out",     color: "#ef4444" };
  if (regClosed)                  return { label: "Reg. Closed",  color: "#eab308" };
  return                                 { label: "Open",         color: "#4ade80" };
}

const TAB_STYLE = (active: boolean): React.CSSProperties => ({
  padding: "8px 16px", fontSize: "0.85rem", background: "none", border: "none",
  cursor: "pointer", marginBottom: -1, fontFamily: "inherit", fontWeight: active ? 600 : 400,
  color: active ? "#fff" : "rgba(255,255,255,0.45)",
  borderBottom: active ? "2px solid #e8620a" : "2px solid transparent",
});

export default function AdminEventRegistrationsIndex() {
  const [tab,     setTab]     = useState<"events" | "health">("events");
  const [events,  setEvents]  = useState<EventSummary[]>([]);
  const [stats,   setStats]   = useState<Record<string, RegStats>>({});
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  // Health tab state
  const [auditResult,     setAuditResult]     = useState<AuditResult | null>(null);
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null);
  const [resendResult,    setResendResult]    = useState<ResendResult | null>(null);
  const [healthLoading,   setHealthLoading]   = useState(false);
  const [healthMsg,       setHealthMsg]       = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/events").then(r => r.json()),
      fetch("/api/admin/events/registrations/summary").then(r => r.json()).catch(() => ({ summaries: [] })),
    ])
      .then(([evData, sumData]) => {
        setEvents(evData.data ?? []);
        const map: Record<string, RegStats> = {};
        for (const s of sumData.summaries ?? []) map[s.event_id] = s;
        setStats(map);
      })
      .catch(() => setError("Failed to load events."))
      .finally(() => setLoading(false));
  }, []);

  const runAudit = useCallback(async () => {
    setHealthLoading(true); setHealthMsg(""); setAuditResult(null);
    try {
      const res  = await fetch("/api/admin/events/registrations/audit");
      const data = await res.json() as AuditResult;
      setAuditResult(data);
    } catch { setHealthMsg("❌ Audit failed"); }
    finally { setHealthLoading(false); }
  }, []);

  async function runReconcile(dryRun: boolean) {
    setHealthLoading(true); setHealthMsg(""); setReconcileResult(null);
    try {
      const res  = dryRun
        ? await fetch("/api/admin/events/registrations/reconcile")
        : await fetch("/api/admin/events/registrations/reconcile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dry_run: false }) });
      const data = await res.json() as ReconcileResult;
      setReconcileResult(data);
      if (!dryRun) setHealthMsg(`✅ Reconciled ${data.recovered} payments`);
    } catch { setHealthMsg("❌ Reconcile failed"); }
    finally { setHealthLoading(false); }
  }

  async function runResend(dryRun: boolean) {
    setHealthLoading(true); setHealthMsg(""); setResendResult(null);
    try {
      const res  = await fetch("/api/admin/events/registrations/resend-missing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry_run: dryRun }),
      });
      const data = await res.json() as ResendResult;
      setResendResult(data);
      if (!dryRun) setHealthMsg(`✅ Sent ${data.sent} emails`);
    } catch { setHealthMsg("❌ Resend failed"); }
    finally { setHealthLoading(false); }
  }

  const auditIssueCount = auditResult
    ? auditResult.missing_email.length + auditResult.failed_email.length + auditResult.missing_qr.length
    : null;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", height: "60px", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <Link href="/admin" style={{ textDecoration: "none" }}>
          <Image src="/logo.png" alt="" width={28} height={28} className="rounded-full" />
        </Link>
        <span style={{ fontWeight: 600 }}>Admin</span>
        <span style={{ color: "#444" }}>/</span>
        <Link href="/admin/events" style={{ color: "#888", textDecoration: "none", fontSize: "0.85rem" }}>Events</Link>
        <span style={{ color: "#444" }}>/</span>
        <span style={{ color: "#888", fontSize: "0.85rem" }}>Registrations</span>
      </header>

      {/* Tabs */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "#0d0d0d" }}>
        <div style={{ maxWidth: 940, margin: "0 auto", padding: "0 1.5rem", display: "flex", gap: 4 }}>
          <button style={TAB_STYLE(tab === "events")} onClick={() => setTab("events")}>Events</button>
          <button style={TAB_STYLE(tab === "health")} onClick={() => setTab("health")}>Registration Health</button>
        </div>
      </div>

      <div style={{ maxWidth: "940px", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Events tab */}
        {tab === "events" && (
          <>
            <h1 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#fff", marginBottom: "1.5rem" }}>Event Registrations</h1>
            {loading && <div style={{ textAlign: "center", padding: "4rem" }}><Spinner /></div>}
            {error   && <Alert variant="error">{error}</Alert>}
            {!loading && events.length === 0 && <EmptyState title="No events found." />}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {events.map(ev => {
                const s     = stats[ev.id];
                const badge = statusBadge(ev);
                const left  = ev.max_participants != null ? ev.max_participants - (ev.participant_count ?? 0) : null;
                return (
                  <Card key={ev.id}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{ev.title}</span>
                          <Badge size="sm" style={{ color: badge.color, background: `${badge.color}18`, borderColor: `${badge.color}30` }}>{badge.label}</Badge>
                        </div>
                        <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>📅 {fmtDate(ev.start_date)} &nbsp;·&nbsp; 📍 {ev.location}</div>
                        {ev.max_participants != null && (
                          <div style={{ fontSize: 12, color: "#555" }}>{ev.participant_count ?? 0} registered · {left ?? "∞"} available · {ev.max_participants} capacity</div>
                        )}
                      </div>
                      {s ? (
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" as const, alignItems: "center" }}>
                          {[{ v: s.total, l: "Total", c: "#fff" }, { v: s.paid, l: "Paid", c: "#4ade80" }, { v: s.free, l: "Free", c: "#60a5fa" }, { v: s.pending, l: "Pending", c: "#eab308" }].map(x => (
                            <div key={x.l} style={{ textAlign: "center" }}>
                              <div style={{ fontSize: 18, fontWeight: 800, color: x.c }}>{x.v}</div>
                              <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase" }}>{x.l}</div>
                            </div>
                          ))}
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 16, fontWeight: 800, color: "#e8620a" }}>₹{s.revenue.toLocaleString("en-IN")}</div>
                            <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase" }}>Revenue</div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: "#555" }}>No registrations yet</div>
                      )}
                      <Link href={`/admin/events/${ev.id}/registrations`}><Button size="sm">View Registrations →</Button></Link>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {/* Health tab */}
        {tab === "health" && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#fff", marginBottom: 6 }}>Registration Health</h1>
              <p style={{ fontSize: 13, color: "#555", margin: 0 }}>Audit all confirmed registrations to find missing emails, failed deliveries, or payment mismatches — then fix them in one click.</p>
            </div>

            {healthMsg && (
              <Alert variant={healthMsg.startsWith("✅") ? "success" : "error"} style={{ marginBottom: 16 }}>{healthMsg}</Alert>
            )}

            {/* Step 1 — Audit */}
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: auditResult ? 16 : 0 }}>
                <div>
                  <div style={{ fontWeight: 700, color: "#fff", marginBottom: 4 }}>1. Run Audit</div>
                  <div style={{ fontSize: 12, color: "#555" }}>Finds confirmed registrations with no email sent, bounced deliveries, or missing QR tokens.</div>
                </div>
                <Button size="sm" loading={healthLoading} onClick={runAudit}>Run Audit</Button>
              </div>

              {auditResult && (
                <div>
                  {auditIssueCount === 0 ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#4ade80", fontSize: 13, fontWeight: 600, padding: "10px 0" }}>
                      <span style={{ fontSize: 18 }}>✓</span> All registrations are healthy — no issues found
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {[
                        { rows: auditResult.missing_email, label: "Missing confirmation email",   color: "#fbbf24" },
                        { rows: auditResult.failed_email,  label: "Failed/bounced email",         color: "#f87171" },
                        { rows: auditResult.missing_qr,    label: "Missing QR token",             color: "#c084fc" },
                      ].filter(g => g.rows.length > 0).map(group => (
                        <div key={group.label}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: group.color, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 }}>
                            {group.label} ({group.rows.length})
                          </div>
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                              <thead>
                                <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                                  {["Code", "Name", "Email", "Event", "Registered"].map(h => (
                                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, color: "#444", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {group.rows.slice(0, 10).map(r => (
                                  <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                                    <td style={{ padding: "6px 10px" }}><code style={{ color: "#e8620a", fontSize: 11 }}>{r.registration_code}</code></td>
                                    <td style={{ padding: "6px 10px", color: "#ccc" }}>{r.user_name}</td>
                                    <td style={{ padding: "6px 10px", color: "#888" }}>{r.user_email}</td>
                                    <td style={{ padding: "6px 10px", color: "#888" }}>{r.events?.title ?? "—"}</td>
                                    <td style={{ padding: "6px 10px", color: "#555", fontSize: 11 }}>{new Date(r.created_at).toLocaleDateString("en-IN")}</td>
                                  </tr>
                                ))}
                                {group.rows.length > 10 && (
                                  <tr><td colSpan={5} style={{ padding: "6px 10px", color: "#555", fontSize: 11 }}>… and {group.rows.length - 10} more</td></tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Step 2 — Resend missing emails */}
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: resendResult ? 16 : 0 }}>
                <div>
                  <div style={{ fontWeight: 700, color: "#fff", marginBottom: 4 }}>2. Resend Missing Confirmation Emails</div>
                  <div style={{ fontSize: 12, color: "#555" }}>Sends confirmation + QR code emails to all confirmed registrations that never received one.</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button size="sm" variant="ghost" loading={healthLoading} onClick={() => runResend(true)}>Dry Run</Button>
                  <Button size="sm" loading={healthLoading} onClick={() => runResend(false)}>Send Now</Button>
                </div>
              </div>

              {resendResult && (
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  {[
                    { v: resendResult.sent,    l: resendResult.dry_run ? "Would Send" : "Sent",     c: "#4ade80" },
                    { v: resendResult.skipped, l: "Skipped (already sent)",                          c: "#555" },
                    { v: resendResult.failed,  l: "Failed",                                          c: resendResult.failed > 0 ? "#f87171" : "#555" },
                  ].map(x => (
                    <div key={x.l}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: x.c }}>{x.v}</div>
                      <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".06em" }}>{x.l}</div>
                    </div>
                  ))}
                  {resendResult.dry_run && <div style={{ fontSize: 11, color: "#eab308", alignSelf: "center" }}>Dry run — no emails sent</div>}
                </div>
              )}
            </Card>

            {/* Step 3 — Payment reconcile */}
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: reconcileResult ? 16 : 0 }}>
                <div>
                  <div style={{ fontWeight: 700, color: "#fff", marginBottom: 4 }}>3. Reconcile Payments</div>
                  <div style={{ fontSize: 12, color: "#555" }}>Finds Razorpay payments marked as captured that don't have a confirmed registration, and recovers them.</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button size="sm" variant="ghost" loading={healthLoading} onClick={() => runReconcile(true)}>Preview</Button>
                  <Button size="sm" loading={healthLoading} onClick={() => runReconcile(false)}>Reconcile</Button>
                </div>
              </div>

              {reconcileResult && (
                <>
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)", marginBottom: 12 }}>
                    {[
                      { v: reconcileResult.checked,   l: "Checked",                             c: "#fff" },
                      { v: reconcileResult.recovered, l: reconcileResult.dry_run ? "Would Recover" : "Recovered", c: "#4ade80" },
                      { v: reconcileResult.skipped,   l: "Already OK",                          c: "#555" },
                    ].map(x => (
                      <div key={x.l}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: x.c }}>{x.v}</div>
                        <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".06em" }}>{x.l}</div>
                      </div>
                    ))}
                    {reconcileResult.dry_run && <div style={{ fontSize: 11, color: "#eab308", alignSelf: "center" }}>Preview only — no changes made</div>}
                  </div>
                  {reconcileResult.details && reconcileResult.details.length > 0 && (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr>
                            {["Registration Code", "Email", "Action"].map(h => (
                              <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, color: "#444", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {reconcileResult.details.map((d, i) => (
                            <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                              <td style={{ padding: "6px 10px" }}><code style={{ color: "#e8620a", fontSize: 11 }}>{d.registration_code}</code></td>
                              <td style={{ padding: "6px 10px", color: "#888" }}>{d.user_email}</td>
                              <td style={{ padding: "6px 10px", color: "#4ade80", fontSize: 11 }}>{d.action}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
