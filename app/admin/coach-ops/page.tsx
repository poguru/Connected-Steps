"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, Button, Input, Alert, Badge, Tabs, StatCard, Avatar, EmptyState, Spinner } from "@/components/ui/ds";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Athlete {
  email: string; first_name: string; last_name: string;
  phone: string; goal: string; location: string; joined: string;
  is_active_member: boolean; membership_plan: string | null; membership_expires: string | null;
  training_plan: string | null; last_session_date: string | null; last_session_title: string | null;
  attended_count: number; attendance_pct: number; streak: number;
  is_at_risk: boolean; is_low_att: boolean; has_plan: boolean; cohorts: string[];
}

interface Stats { total: number; active_members: number; at_risk: number; low_att: number; no_plan: number }

interface Cohort { id: string; name: string; description: string; color: string; member_count: number }

interface Template {
  id: string; name: string; description: string;
  days: { type: string; detail: string; emoji: string }[];
}

type Tab     = "athletes" | "cohorts" | "broadcast" | "templates";
type AtFilter = "all" | "at_risk" | "low_att" | "no_plan" | "members";

// ── Shared style tokens ───────────────────────────────────────────────────────

const S = {
  inp: { width: "100%", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", padding: "8px 12px", color: "#fff", fontSize: "0.82rem", fontFamily: "inherit", outline: "none", boxSizing: "border-box" } as React.CSSProperties,
  sel: { width: "100%", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", padding: "8px 12px", color: "#fff", fontSize: "0.82rem", fontFamily: "inherit", outline: "none", cursor: "pointer", colorScheme: "dark" as const } as React.CSSProperties,
  tag: (color: string, bg: string): React.CSSProperties => ({ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "20px", background: bg, color, whiteSpace: "nowrap" as const }),
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const TYPE_PRESETS: Record<string, string> = {
  "Rest": "😴", "Endurance training": "🏃", "Speed training": "⚡", "Tempo training": "🔥",
  "Hill Training": "⛰️", "Interval training": "🎯", "Strength training": "💪",
  "Core stability and mobility training": "🧘", "Recovery training": "🚶",
  "Race - specific training": "🏅", "Flexibility and mobility training": "🤸",
};

const COHORT_COLORS = ["#e8620a", "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899"];

const QUICK_MESSAGES = [
  { label: "Session reminder",  text: "Hi {{name}}! 👋 Don't forget — we have a group run this Saturday at 6am. See you on the track! 🏃" },
  { label: "Motivation",        text: "Hi {{name}}! Every run counts. You're building something great — one step at a time. Keep going! 💪" },
  { label: "Check-in",          text: "Hi {{name}}, how is your training going this week? Any questions or feedback for your coach? We're here for you. 🙌" },
  { label: "Attendance nudge",  text: "Hi {{name}}! We've missed you at recent sessions. Come join us this weekend — the community would love to have you back. 🧡" },
];

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// Credential is either "" (admin session cookie) or "__token__<coachToken>"
function makeAuthHeaders(credential: string): Record<string, string> {
  if (credential.startsWith("__token__")) return { "x-coach-token": credential.slice(9) };
  return {}; // admin session cookie sent automatically
}

function emptyDays() {
  return DAYS.map(() => ({ type: "Rest", detail: "Recovery day", emoji: "😴" }));
}

// ── Auth gate ─────────────────────────────────────────────────────────────────

function AuthGate({ onAuth }: { onAuth: (credential: string) => void }) {
  const [pw, setPw]     = useState("");
  const [err, setErr]   = useState("");
  const [busy, setBusy] = useState(false);

  async function verifyCoach(credential: string) {
    setBusy(true); setErr("");
    const res = await fetch("/api/admin/coach-ops/athletes", { headers: makeAuthHeaders(credential) });
    setBusy(false);
    if (res.ok) onAuth(credential);
    else setErr("Coach token is invalid or expired.");
  }

  async function loginAdmin() {
    if (!pw) return;
    setBusy(true); setErr("");
    const res = await fetch("/api/admin/auth", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    setBusy(false);
    if (res.ok) onAuth("");
    else setErr("Incorrect password.");
  }

  useEffect(() => {
    // Check admin session cookie first
    fetch("/api/admin/auth").then(r => {
      if (r.ok) { onAuth(""); return; }
      // Not an admin — try coach token from user session
      try {
        const user = JSON.parse(localStorage.getItem("cs_user") ?? "{}");
        if (user.coachToken) verifyCoach(`__token__${user.coachToken}`);
      } catch {}
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "320px" }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.5rem" }}>
            <Image src="/logo.png" alt="" width={32} height={32} className="rounded-full" />
            <div>
              <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#fff" }}>Connected Steps</div>
              <Badge color="orange" size="sm" style={{ marginTop: 3 }}>Coach Operations</Badge>
            </div>
          </div>
          <Input type="password" placeholder="Admin password" value={pw}
            onChange={e => { setPw(e.target.value); setErr(""); }}
            onKeyDown={e => e.key === "Enter" && loginAdmin()}
            style={{ marginBottom: "0.75rem" }} />
          {err && <Alert variant="error" style={{ marginBottom: "0.75rem" }}>{err}</Alert>}
          <Button fullWidth loading={busy} onClick={loginAdmin}>Access Dashboard</Button>
          <Link href="/admin" style={{ display: "block", textAlign: "center", marginTop: "1rem", fontSize: "0.75rem", color: "#555", textDecoration: "none" }}>← Back to admin</Link>
        </Card>
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function CoachOpsDashboard() {
  const [pw,        setPw]        = useState("");
  const [authed,    setAuthed]    = useState(true);
  const [tab,       setTab]       = useState<Tab>("athletes");

  // Athletes
  const [athletes,  setAthletes]  = useState<Athlete[]>([]);
  const [stats,     setStats]     = useState<Stats | null>(null);
  const [atFilter,  setAtFilter]  = useState<AtFilter>("all");
  const [search,    setSearch]    = useState("");
  const [cohFilter, setCohFilter] = useState("all");
  const [loading,   setLoading]   = useState(false);

  // Per-row action state
  const [assignOpen, setAssignOpen] = useState<string | null>(null);  // email
  const [cohortOpen, setCohortOpen] = useState<string | null>(null);  // email

  // Cohorts
  const [cohorts,   setCohorts]   = useState<Cohort[]>([]);
  const [newCName,  setNewCName]  = useState("");
  const [newCDesc,  setNewCDesc]  = useState("");
  const [newCColor, setNewCColor] = useState(COHORT_COLORS[0]);
  const [cSaving,   setCSaving]   = useState(false);
  const [expandedC, setExpandedC] = useState<string | null>(null);
  const [cohMembers, setCohMembers] = useState<{ email: string; name: string; phone: string }[]>([]);
  const [cohMemberSearch, setCohMemberSearch] = useState("");

  // Broadcast
  const [bcChannel,  setBcChannel]  = useState<"email" | "whatsapp">("email");
  const [bcTarget,   setBcTarget]   = useState<"all" | "members" | "at_risk" | "cohort" | "custom">("all");
  const [bcCohort,   setBcCohort]   = useState("");
  const [bcSubject,  setBcSubject]  = useState("");
  const [bcMessage,  setBcMessage]  = useState("");
  const [bcSending,  setBcSending]  = useState(false);
  const [bcResult,   setBcResult]   = useState<{ sent: number; failed: number; skipped: number } | null>(null);
  const [bcCustom,   setBcCustom]   = useState<Set<string>>(new Set());

  // Templates
  const [templates,   setTemplates]   = useState<Template[]>([]);
  const [tplName,     setTplName]     = useState("");
  const [tplDesc,     setTplDesc]     = useState("");
  const [tplDays,     setTplDays]     = useState(emptyDays());
  const [tplSaving,   setTplSaving]   = useState(false);
  const [tplMsg,      setTplMsg]      = useState("");
  const [showTplForm, setShowTplForm] = useState(false);
  const [assigningTpl, setAssigningTpl] = useState<Template | null>(null);
  const [tplTargets,   setTplTargets]  = useState<Set<string>>(new Set());
  const [tplAssigning, setTplAssigning] = useState(false);
  const [tplAssignMsg, setTplAssignMsg] = useState("");

  const h = useCallback((credential: string) => ({
    ...makeAuthHeaders(credential),
    "Content-Type": "application/json",
  }), []);

  // ── Loaders ─────────────────────────────────────────────────────────────────

  const loadAthletes = useCallback(async (credential: string) => {
    setLoading(true);
    const res = await fetch("/api/admin/coach-ops/athletes", { headers: makeAuthHeaders(credential) });
    const data = await res.json().catch(() => ({}));
    setAthletes(data.athletes ?? []);
    setStats(data.stats ?? null);
    setLoading(false);
  }, []);

  const loadCohorts = useCallback(async (credential: string) => {
    const res  = await fetch("/api/admin/cohorts", { headers: makeAuthHeaders(credential) });
    const data = await res.json().catch(() => ({}));
    setCohorts(data.cohorts ?? []);
  }, []);

  const loadTemplates = useCallback(async (credential: string) => {
    const res  = await fetch("/api/admin/plan-templates", { headers: makeAuthHeaders(credential) });
    const data = await res.json().catch(() => ({}));
    setTemplates(data.templates ?? []);
  }, []);

  // Auto-load on mount — admin layout already verified the session cookie
  useEffect(() => {
    loadAthletes("");
    loadCohorts("");
    loadTemplates("");
  }, [loadAthletes, loadCohorts, loadTemplates]);

  function onAuth(password: string) {
    setPw(password);
    setAuthed(true);
    loadAthletes(password);
    loadCohorts(password);
    loadTemplates(password);
  }

  // ── Filtered athletes ────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = athletes;
    if (atFilter === "at_risk")  list = list.filter(a => a.is_at_risk);
    if (atFilter === "low_att")  list = list.filter(a => a.is_low_att);
    if (atFilter === "no_plan")  list = list.filter(a => !a.has_plan && a.is_active_member);
    if (atFilter === "members")  list = list.filter(a => a.is_active_member);
    if (cohFilter !== "all")     list = list.filter(a => a.cohorts.includes(cohFilter));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        `${a.first_name} ${a.last_name}`.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) || a.phone.includes(q)
      );
    }
    return list;
  }, [athletes, atFilter, cohFilter, search]);

  // ── Broadcast recipients ─────────────────────────────────────────────────────

  const bcRecipients = useMemo(() => {
    if (bcTarget === "all")     return athletes;
    if (bcTarget === "members") return athletes.filter(a => a.is_active_member);
    if (bcTarget === "at_risk") return athletes.filter(a => a.is_at_risk);
    if (bcTarget === "cohort")  return athletes.filter(a => a.cohorts.includes(bcCohort));
    if (bcTarget === "custom")  return athletes.filter(a => bcCustom.has(a.email));
    return [];
  }, [athletes, bcTarget, bcCohort, bcCustom]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function addToCohort(athleteEmail: string, cohortId: string) {
    await fetch(`/api/admin/cohorts/${cohortId}`, {
      method: "PUT", headers: h(pw),
      body: JSON.stringify({ action: "add", emails: [athleteEmail] }),
    });
    loadAthletes(pw);
    setCohortOpen(null);
  }

  async function assignTemplate(template: Template, emails: string[]) {
    setTplAssigning(true); setTplAssignMsg("");
    let ok = 0;
    for (const email of emails) {
      const res = await fetch("/api/admin/training-plans", {
        method: "POST", headers: h(pw),
        body: JSON.stringify({ user_email: email, title: template.name, coach_name: "", days: template.days }),
      });
      if (res.ok) ok++;
    }
    setTplAssignMsg(`✓ Assigned to ${ok} athlete${ok !== 1 ? "s" : ""}`);
    setTplAssigning(false);
    setTimeout(() => { setAssigningTpl(null); setTplTargets(new Set()); setTplAssignMsg(""); }, 2000);
    loadAthletes(pw);
  }

  async function createCohort() {
    if (!newCName.trim()) return;
    setCSaving(true);
    const res  = await fetch("/api/admin/cohorts", { method: "POST", headers: h(pw), body: JSON.stringify({ name: newCName, description: newCDesc, color: newCColor }) });
    const data = await res.json().catch(() => ({}));
    if (data.cohort) { setCohorts(prev => [...prev, { ...data.cohort, member_count: 0 }]); setNewCName(""); setNewCDesc(""); }
    setCSaving(false);
  }

  async function deleteCohort(id: string) {
    if (!confirm("Delete this cohort? Members won't be affected.")) return;
    await fetch(`/api/admin/cohorts/${id}`, { method: "DELETE", headers: h(pw) });
    setCohorts(prev => prev.filter(c => c.id !== id));
    if (expandedC === id) setExpandedC(null);
  }

  async function loadCohortMembers(id: string) {
    const res  = await fetch(`/api/admin/cohorts/${id}`, { headers: h(pw) });
    const data = await res.json().catch(() => ({}));
    setCohMembers(data.members ?? []);
  }

  async function removeFromCohort(cohortId: string, email: string) {
    await fetch(`/api/admin/cohorts/${cohortId}`, { method: "PUT", headers: h(pw), body: JSON.stringify({ action: "remove", emails: [email] }) });
    setCohMembers(prev => prev.filter(m => m.email !== email));
    setCohorts(prev => prev.map(c => c.id === cohortId ? { ...c, member_count: Math.max(0, c.member_count - 1) } : c));
    loadAthletes(pw);
  }

  async function sendBroadcast() {
    if (!bcMessage.trim() || bcRecipients.length === 0) return;
    setBcSending(true); setBcResult(null);
    const res  = await fetch("/api/admin/coach-ops/broadcast", {
      method: "POST", headers: h(pw),
      body: JSON.stringify({
        channel:    bcChannel,
        subject:    bcSubject || undefined,
        message:    bcMessage,
        recipients: bcRecipients.map(a => ({ email: a.email, name: `${a.first_name} ${a.last_name}`, phone: a.phone })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBcResult(data);
    setBcSending(false);
  }

  async function saveTemplate() {
    if (!tplName.trim()) return;
    setTplSaving(true); setTplMsg("");
    const res  = await fetch("/api/admin/plan-templates", { method: "POST", headers: h(pw), body: JSON.stringify({ name: tplName, description: tplDesc, days: tplDays }) });
    const data = await res.json().catch(() => ({}));
    if (data.template) { setTemplates(prev => [data.template, ...prev]); setTplName(""); setTplDesc(""); setTplDays(emptyDays()); setShowTplForm(false); setTplMsg(""); }
    else setTplMsg(data.error ?? "Error saving template.");
    setTplSaving(false);
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Delete this template?")) return;
    await fetch("/api/admin/plan-templates", { method: "DELETE", headers: h(pw), body: JSON.stringify({ id }) });
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  function updateTplDay(i: number, field: string, value: string) {
    setTplDays(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === "type") { next[i].emoji = TYPE_PRESETS[value] ?? "📝"; if (value === "Rest") next[i].detail = "Recovery day"; }
      return next;
    });
  }

  if (!authed) return <AuthGate onAuth={onAuth} />;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff" }}>

      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 1.25rem", height: "56px", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <Link href="/admin" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
          <Image src="/logo.png" alt="" width={26} height={26} className="rounded-full" />
        </Link>
        <span style={{ color: "#333" }}>/</span>
        <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>Coach Operations</span>
        <Button size="xs" variant="ghost" style={{ marginLeft: "auto" }} onClick={() => loadAthletes(pw)}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </header>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "1.5rem 1rem" }}>

        {/* Metric strip */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
            {[
              { label: "Total Athletes",   value: stats.total,          color: "#fff",    filter: "all"     as AtFilter },
              { label: "Active Members",   value: stats.active_members, color: "#4ade80", filter: "members" as AtFilter },
              { label: "At Risk",          value: stats.at_risk,        color: "#f09595", filter: "at_risk" as AtFilter },
              { label: "Low Attendance",   value: stats.low_att,        color: "#fbbf24", filter: "low_att" as AtFilter },
              { label: "No Plan (members)",value: stats.no_plan,        color: "#818cf8", filter: "no_plan" as AtFilter },
            ].map(s => (
              <StatCard key={s.label} label={s.label} value={s.value} color={s.color}
                style={{ cursor: "pointer", borderColor: atFilter === s.filter && tab === "athletes" ? "rgba(232,98,10,0.4)" : undefined, background: atFilter === s.filter && tab === "athletes" ? "rgba(232,98,10,0.1)" : undefined }}
                onClick={() => { setAtFilter(s.filter); setTab("athletes"); }} />
            ))}
          </div>
        )}

        {/* Tabs */}
        <Tabs variant="pill" style={{ marginBottom: "1.25rem" }}
          tabs={[
            { key:"athletes",  label:"Athletes"      },
            { key:"cohorts",   label:"Cohorts"       },
            { key:"broadcast", label:"Bulk Actions"  },
            { key:"templates", label:"Plan Templates" },
          ]}
          active={tab}
          onChange={k => setTab(k as Tab)} />

        {/* ══ ATHLETES TAB ══════════════════════════════════════════════════════ */}
        {tab === "athletes" && (
          <div>
            {/* Filters */}
            <div style={{ display: "flex", gap: "0.6rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
              <input placeholder="Search name, email, phone…" value={search} onChange={e => setSearch(e.target.value)}
                style={{ ...S.inp, flex: 1, minWidth: "180px" }} />
              <select value={cohFilter} onChange={e => setCohFilter(e.target.value)} style={{ ...S.sel, width: "auto", minWidth: "130px" }}>
                <option value="all">All Cohorts</option>
                {cohorts.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              <div style={{ display: "flex", gap: "3px", background: "rgba(255,255,255,0.04)", borderRadius: "6px", padding: "3px" }}>
                {([["all","All"],["members","Members"],["at_risk","At Risk"],["low_att","Low Att."],["no_plan","No Plan"]] as [AtFilter,string][]).map(([f, l]) => (
                  <button key={f} onClick={() => setAtFilter(f)}
                    style={{ padding: "5px 10px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: 500, cursor: "pointer", fontFamily: "inherit", border: "none", background: atFilter === f ? "#e8620a" : "transparent", color: atFilter === f ? "#fff" : "#666", transition: "all 0.15s", whiteSpace: "nowrap" }}>
                    {l}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: "0.75rem", color: "#444" }}>{filtered.length} athletes</span>
            </div>

            {/* Table (desktop) / Cards (mobile) */}
            <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", overflow: "hidden" }}>
              {/* Scrollable wrapper — prevents right-side column clipping */}
              <div style={{ overflowX: "auto" }}>
              {/* Desktop header */}
              <div className="coach-ops-table-header" style={{ display: "grid", gridTemplateColumns: "minmax(160px,1.8fr) 90px minmax(130px,1.2fr) minmax(130px,1fr) 70px 60px 50px 90px", gap: 0, padding: "0.65rem 1rem", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: "10px", color: "#444", textTransform: "uppercase", letterSpacing: "0.08em", minWidth: "820px" }}>
                <div>Athlete</div><div>Membership</div><div>Training Plan</div>
                <div>Last Session</div><div>Att %</div><div>Streak</div><div>Risk</div><div>Actions</div>
              </div>

              {filtered.length === 0 ? (
                <div style={{ padding: "3rem", textAlign: "center", color: "#444", fontSize: "0.875rem" }}>No athletes found.</div>
              ) : filtered.map(a => {
                const name = `${a.first_name} ${a.last_name}`;
                return (
                  <div key={a.email} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    {/* Desktop row */}
                    <div className="coach-ops-table-row" style={{ display: "grid", gridTemplateColumns: "minmax(160px,1.8fr) 90px minmax(130px,1.2fr) minmax(130px,1fr) 70px 60px 50px 90px", gap: 0, padding: "0.75rem 1rem", fontSize: "0.8rem", alignItems: "center", minWidth: "820px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "#fff" }}>{name}</div>
                        <div style={{ fontSize: "11px", color: "#444", marginTop: "2px" }}>{a.goal?.toUpperCase()} · {a.location || "—"}</div>
                        {a.cohorts.length > 0 && (
                          <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", marginTop: "4px" }}>
                            {a.cohorts.map(c => <span key={c} style={{ fontSize: "9px", background: "rgba(232,98,10,0.12)", color: "#e8620a", border: "1px solid rgba(232,98,10,0.2)", borderRadius: "20px", padding: "1px 6px" }}>{c}</span>)}
                          </div>
                        )}
                      </div>
                      <div>
                        {a.is_active_member
                          ? <span style={S.tag("#4ade80", "rgba(74,222,128,0.1)")}>Active</span>
                          : <span style={S.tag("#555", "rgba(255,255,255,0.04)")}>Free</span>}
                      </div>
                      <div style={{ color: a.training_plan ? "#ccc" : "#444", fontSize: "0.78rem" }}>
                        {a.training_plan ?? <span style={{ color: "#555" }}>No plan</span>}
                      </div>
                      <div style={{ color: "#666", fontSize: "0.78rem" }}>
                        <div>{fmtDate(a.last_session_date)}</div>
                        {a.last_session_title && <div style={{ fontSize: "10px", color: "#444", marginTop: "1px" }}>{a.last_session_title}</div>}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: a.attendance_pct >= 60 ? "#4ade80" : a.attendance_pct >= 30 ? "#fbbf24" : "#f09595" }}>{a.attendance_pct}%</div>
                        <div style={{ fontSize: "10px", color: "#444" }}>{a.attended_count} sessions</div>
                      </div>
                      <div style={{ fontWeight: 700, color: a.streak >= 3 ? "#4ade80" : "#888" }}>
                        {a.streak > 0 ? `🔥 ${a.streak}` : "—"}
                      </div>
                      <div>
                        {a.is_at_risk  && <div style={S.tag("#f09595", "rgba(240,149,149,0.1)")}>At Risk</div>}
                        {a.is_low_att  && !a.is_at_risk && <div style={S.tag("#fbbf24", "rgba(251,191,36,0.1)")}>Low Att</div>}
                        {!a.is_at_risk && !a.is_low_att && <span style={{ color: "#333" }}>—</span>}
                      </div>
                      {/* Actions */}
                      <div style={{ display: "flex", gap: "4px", position: "relative" }}>
                        {/* Assign plan */}
                        <div style={{ position: "relative" }}>
                          <button onClick={() => setAssignOpen(assignOpen === a.email ? null : a.email)}
                            title="Assign plan template"
                            style={{ padding: "5px 8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "5px", color: "#888", cursor: "pointer", fontSize: "12px" }}>
                            📋
                          </button>
                          {assignOpen === a.email && (
                            <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "8px", zIndex: 50, minWidth: "180px", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                              <div style={{ padding: "8px 12px", fontSize: "10px", color: "#555", borderBottom: "1px solid rgba(255,255,255,0.06)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Assign Plan</div>
                              {templates.length === 0
                                ? <div style={{ padding: "12px", fontSize: "0.78rem", color: "#555" }}>No templates yet</div>
                                : templates.map(t => (
                                    <button key={t.id} onClick={async () => { setAssignOpen(null); await assignTemplate(t, [a.email]); }}
                                      style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: "0.8rem", fontFamily: "inherit", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                      {t.name}
                                      {t.description && <div style={{ fontSize: "10px", color: "#555", marginTop: "1px" }}>{t.description}</div>}
                                    </button>
                                  ))
                              }
                            </div>
                          )}
                        </div>
                        {/* Add to cohort */}
                        <div style={{ position: "relative" }}>
                          <button onClick={() => setCohortOpen(cohortOpen === a.email ? null : a.email)}
                            title="Add to cohort"
                            style={{ padding: "5px 8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "5px", color: "#888", cursor: "pointer", fontSize: "12px" }}>
                            👥
                          </button>
                          {cohortOpen === a.email && (
                            <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "8px", zIndex: 50, minWidth: "160px", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                              <div style={{ padding: "8px 12px", fontSize: "10px", color: "#555", borderBottom: "1px solid rgba(255,255,255,0.06)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Add to Cohort</div>
                              {cohorts.length === 0
                                ? <div style={{ padding: "12px", fontSize: "0.78rem", color: "#555" }}>No cohorts yet</div>
                                : cohorts.map(c => (
                                    <button key={c.id} onClick={() => addToCohort(a.email, c.id)}
                                      style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", fontFamily: "inherit", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                      <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: c.color, marginRight: "6px", verticalAlign: "middle" }} />
                                      <span style={{ color: a.cohorts.includes(c.name) ? "#4ade80" : "#ccc" }}>{c.name}</span>
                                    </button>
                                  ))
                              }
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Mobile card */}
                    <div className="coach-ops-card" style={{ display: "none", padding: "1rem", fontSize: "0.82rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                        <div>
                          <div style={{ fontWeight: 600, color: "#fff" }}>{name}</div>
                          <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>{a.goal?.toUpperCase()} · {a.location || "—"}</div>
                        </div>
                        <div style={{ display: "flex", gap: "4px" }}>
                          {a.is_active_member ? <span style={S.tag("#4ade80", "rgba(74,222,128,0.1)")}>Active</span> : <span style={S.tag("#555", "rgba(255,255,255,0.04)")}>Free</span>}
                          {a.is_at_risk && <span style={S.tag("#f09595", "rgba(240,149,149,0.1)")}>At Risk</span>}
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", marginBottom: "8px" }}>
                        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "5px", padding: "6px 8px" }}>
                          <div style={{ fontSize: "10px", color: "#444", marginBottom: "2px" }}>Attendance</div>
                          <div style={{ fontWeight: 700, color: a.attendance_pct >= 60 ? "#4ade80" : a.attendance_pct >= 30 ? "#fbbf24" : "#f09595" }}>{a.attendance_pct}%</div>
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "5px", padding: "6px 8px" }}>
                          <div style={{ fontSize: "10px", color: "#444", marginBottom: "2px" }}>Streak</div>
                          <div style={{ fontWeight: 700, color: "#888" }}>{a.streak > 0 ? `🔥 ${a.streak}` : "—"}</div>
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "5px", padding: "6px 8px" }}>
                          <div style={{ fontSize: "10px", color: "#444", marginBottom: "2px" }}>Last Session</div>
                          <div style={{ color: "#888", fontSize: "11px" }}>{fmtDate(a.last_session_date)}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: "11px", color: "#555", marginBottom: "6px" }}>
                        Plan: <span style={{ color: a.training_plan ? "#ccc" : "#444" }}>{a.training_plan ?? "Not assigned"}</span>
                      </div>
                      {a.cohorts.length > 0 && (
                        <div style={{ display: "flex", gap: "3px", flexWrap: "wrap" }}>
                          {a.cohorts.map(c => <span key={c} style={{ fontSize: "9px", background: "rgba(232,98,10,0.12)", color: "#e8620a", borderRadius: "20px", padding: "1px 6px" }}>{c}</span>)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>{/* end overflowX:auto */}
            </div>
          </div>
        )}

        {/* ══ COHORTS TAB ═══════════════════════════════════════════════════════ */}
        {tab === "cohorts" && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,340px)", gap: "1.25rem" }} className="coach-ops-cohorts">

            {/* Left: cohort list */}
            <div>
              <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", overflow: "hidden", marginBottom: "1rem" }}>
                {cohorts.length === 0 ? (
                  <div style={{ padding: "2.5rem", textAlign: "center", color: "#444", fontSize: "0.875rem" }}>No cohorts yet. Create one →</div>
                ) : cohorts.map(c => (
                    <div key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.9rem 1rem", cursor: "pointer" }}
                        onClick={() => {
                          if (expandedC === c.id) { setExpandedC(null); }
                          else { setExpandedC(c.id); setCohMemberSearch(""); loadCohortMembers(c.id); }
                        }}>
                        <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>{c.name}</div>
                          {c.description && <div style={{ fontSize: "11px", color: "#555", marginTop: "1px" }}>{c.description}</div>}
                        </div>
                        <span style={S.tag("#e8620a", "rgba(232,98,10,0.1)")}>{c.member_count} members</span>
                        <button onClick={e => { e.stopPropagation(); deleteCohort(c.id); }}
                          style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: "14px", padding: "2px 4px" }}>✕</button>
                      </div>

                      {expandedC === c.id && (
                        <div style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.05)", padding: "0.75rem 1rem" }}>
                          <div style={{ fontSize: "10px", color: "#444", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.6rem" }}>Members</div>
                          <input placeholder="Search to add athlete…" value={cohMemberSearch} onChange={e => setCohMemberSearch(e.target.value)}
                            style={{ ...S.inp, marginBottom: "0.6rem" }} />
                          {cohMemberSearch.trim() && (
                            <div style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", marginBottom: "0.6rem", maxHeight: "160px", overflowY: "auto" }}>
                              {athletes.filter(a => {
                                const q = cohMemberSearch.toLowerCase();
                                return (`${a.first_name} ${a.last_name}`.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)) && !cohMembers.find(m => m.email === a.email);
                              }).slice(0, 8).map(a => (
                                <button key={a.email} onClick={async () => { await addToCohort(a.email, c.id); setCohortOpen(null); loadCohortMembers(c.id); setCohorts(prev => prev.map(x => x.id === c.id ? { ...x, member_count: x.member_count + 1 } : x)); setCohMemberSearch(""); }}
                                  style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: "0.8rem", fontFamily: "inherit", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                  <span style={{ flex: 1 }}>{a.first_name} {a.last_name}</span>
                                  <span style={{ color: "#555", fontSize: "11px" }}>{a.goal?.toUpperCase()}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            {cohMembers.map(m => (
                              <div key={m.email} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 8px", background: "rgba(255,255,255,0.03)", borderRadius: "5px" }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: "0.82rem", color: "#ccc" }}>{m.name}</div>
                                  <div style={{ fontSize: "10px", color: "#444" }}>{m.phone || m.email}</div>
                                </div>
                                <button onClick={() => removeFromCohort(c.id, m.email)}
                                  style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: "13px" }}>✕</button>
                              </div>
                            ))}
                            {cohMembers.length === 0 && !cohMemberSearch && <div style={{ fontSize: "0.78rem", color: "#444", padding: "6px 0" }}>No members. Search above to add.</div>}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                }
              </div>
            </div>

            {/* Right: create cohort form */}
            <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", padding: "1.25rem", alignSelf: "start" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "1rem" }}>Create Cohort</div>
              <label style={{ fontSize: "10px", color: "#555", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "4px" }}>Name *</label>
              <input value={newCName} onChange={e => setNewCName(e.target.value)} placeholder="e.g. Half Marathon Group"
                style={{ ...S.inp, marginBottom: "0.75rem" }} />
              <label style={{ fontSize: "10px", color: "#555", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "4px" }}>Description</label>
              <input value={newCDesc} onChange={e => setNewCDesc(e.target.value)} placeholder="Optional note"
                style={{ ...S.inp, marginBottom: "0.75rem" }} />
              <label style={{ fontSize: "10px", color: "#555", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "6px" }}>Color</label>
              <div style={{ display: "flex", gap: "6px", marginBottom: "1rem" }}>
                {COHORT_COLORS.map(col => (
                  <button key={col} onClick={() => setNewCColor(col)}
                    style={{ width: "24px", height: "24px", borderRadius: "50%", background: col, border: newCColor === col ? "2px solid #fff" : "2px solid transparent", cursor: "pointer", padding: 0 }} />
                ))}
              </div>
              <Button fullWidth loading={cSaving} disabled={!newCName.trim()} onClick={createCohort}>Create Cohort</Button>
            </div>
          </div>
        )}

        {/* ══ BROADCAST TAB ═════════════════════════════════════════════════════ */}
        {tab === "broadcast" && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,320px)", gap: "1.25rem" }} className="coach-ops-broadcast">
            <div>
              {/* Step 1: Target */}
              <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", padding: "1.25rem", marginBottom: "1rem" }}>
                <div style={{ fontSize: "10px", color: "#e8620a", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: "0.75rem" }}>1 · Target Audience</div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: bcTarget === "cohort" ? "0.75rem" : 0 }}>
                  {([["all","All Athletes"],["members","Members Only"],["at_risk","At Risk"],["cohort","By Cohort"],["custom","Custom"]] as [typeof bcTarget, string][]).map(([v, l]) => (
                    <button key={v} onClick={() => setBcTarget(v)}
                      style={{ padding: "7px 14px", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: "1px solid", background: bcTarget === v ? "rgba(232,98,10,0.15)" : "transparent", borderColor: bcTarget === v ? "rgba(232,98,10,0.5)" : "rgba(255,255,255,0.1)", color: bcTarget === v ? "#e8620a" : "#666", transition: "all 0.15s" }}>
                      {l}
                    </button>
                  ))}
                </div>
                {bcTarget === "cohort" && (
                  <select value={bcCohort} onChange={e => setBcCohort(e.target.value)} style={{ ...S.sel, marginTop: "0.75rem" }}>
                    <option value="">Select cohort…</option>
                    {cohorts.map(c => <option key={c.id} value={c.name}>{c.name} ({c.member_count})</option>)}
                  </select>
                )}
                {bcTarget === "custom" && (
                  <div style={{ marginTop: "0.75rem", maxHeight: "200px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "3px" }}>
                    {athletes.map(a => (
                      <label key={a.email} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 6px", borderRadius: "4px", cursor: "pointer", fontSize: "0.8rem" }}>
                        <input type="checkbox" checked={bcCustom.has(a.email)} onChange={e => setBcCustom(prev => { const s = new Set(prev); e.target.checked ? s.add(a.email) : s.delete(a.email); return s; })} />
                        <span style={{ color: "#ccc" }}>{a.first_name} {a.last_name}</span>
                        <span style={{ color: "#444", fontSize: "11px", marginLeft: "auto" }}>{a.goal?.toUpperCase()}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Step 2: Channel */}
              <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", padding: "1.25rem", marginBottom: "1rem" }}>
                <div style={{ fontSize: "10px", color: "#e8620a", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: "0.75rem" }}>2 · Channel</div>
                <div style={{ display: "flex", gap: "6px" }}>
                  {([["email","✉ Email"],["whatsapp","💬 WhatsApp"]] as ["email"|"whatsapp", string][]).map(([v, l]) => (
                    <button key={v} onClick={() => setBcChannel(v)}
                      style={{ padding: "7px 18px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: "1px solid", background: bcChannel === v ? "rgba(232,98,10,0.15)" : "transparent", borderColor: bcChannel === v ? "rgba(232,98,10,0.5)" : "rgba(255,255,255,0.1)", color: bcChannel === v ? "#e8620a" : "#666", transition: "all 0.15s" }}>
                      {l}
                    </button>
                  ))}
                </div>
                {bcChannel === "whatsapp" && <div style={{ fontSize: "11px", color: "#555", marginTop: "6px" }}>Only athletes with a phone number on file will receive WhatsApp messages.</div>}
              </div>

              {/* Step 3: Message */}
              <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", padding: "1.25rem", marginBottom: "1rem" }}>
                <div style={{ fontSize: "10px", color: "#e8620a", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: "0.75rem" }}>3 · Message</div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                  {QUICK_MESSAGES.map(q => (
                    <button key={q.label} onClick={() => setBcMessage(q.text)}
                      style={{ padding: "5px 12px", borderRadius: "20px", fontSize: "0.75rem", cursor: "pointer", fontFamily: "inherit", border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#888", transition: "all 0.15s" }}>
                      {q.label}
                    </button>
                  ))}
                </div>
                {bcChannel === "email" && (
                  <>
                    <label style={{ fontSize: "10px", color: "#555", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "4px" }}>Subject</label>
                    <input value={bcSubject} onChange={e => setBcSubject(e.target.value)} placeholder="e.g. Saturday run reminder"
                      style={{ ...S.inp, marginBottom: "0.75rem" }} />
                  </>
                )}
                <label style={{ fontSize: "10px", color: "#555", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "4px" }}>Message body <span style={{ color: "#444", fontStyle: "italic" }}>(use {"{{name}}"} for personalisation)</span></label>
                <textarea value={bcMessage} onChange={e => setBcMessage(e.target.value)} rows={5}
                  placeholder="Type your message here…"
                  style={{ ...S.inp, resize: "vertical", lineHeight: 1.6 }} />
              </div>

              {/* Step 4: Send */}
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                <Button loading={bcSending} disabled={!bcMessage.trim() || bcRecipients.length === 0} onClick={sendBroadcast}>
                  {`Send to ${bcRecipients.length} athlete${bcRecipients.length !== 1 ? "s" : ""}`}
                </Button>
                {bcResult && (
                  <Badge color={bcResult.failed === 0 ? "green" : "yellow"} size="sm">
                    ✓ {bcResult.sent} sent{bcResult.failed > 0 ? `, ${bcResult.failed} failed` : ""}{bcResult.skipped > 0 ? `, ${bcResult.skipped} skipped` : ""}
                  </Badge>
                )}
              </div>
            </div>

            {/* Right: preview */}
            <div style={{ alignSelf: "start", position: "sticky", top: "72px" }}>
              <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", padding: "1.25rem" }}>
                <div style={{ fontSize: "10px", color: "#555", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.75rem" }}>Preview</div>
                <div style={{ fontSize: "0.78rem", color: "#666", marginBottom: "0.5rem" }}>To: <strong style={{ color: "#ccc" }}>{bcRecipients.length} recipients</strong></div>
                {bcChannel === "email" && bcSubject && <div style={{ fontSize: "0.78rem", color: "#666", marginBottom: "0.5rem" }}>Subject: <strong style={{ color: "#ccc" }}>{bcSubject}</strong></div>}
                <div style={{ background: "#0d0d0d", borderRadius: "6px", padding: "12px", fontSize: "0.8rem", color: "#ccc", lineHeight: 1.6, whiteSpace: "pre-wrap", minHeight: "80px", border: "1px solid rgba(255,255,255,0.05)" }}>
                  {bcMessage ? bcMessage.replace(/\{\{name\}\}/gi, "Rahul") : <span style={{ color: "#444" }}>Your message will appear here…</span>}
                </div>
                {bcRecipients.length > 0 && (
                  <div style={{ marginTop: "0.75rem" }}>
                    <div style={{ fontSize: "10px", color: "#444", marginBottom: "4px" }}>Recipients preview</div>
                    {bcRecipients.slice(0, 5).map(r => (
                      <div key={r.email} style={{ fontSize: "11px", color: "#555", padding: "2px 0" }}>{r.first_name} {r.last_name} · {r.email}</div>
                    ))}
                    {bcRecipients.length > 5 && <div style={{ fontSize: "11px", color: "#444" }}>+{bcRecipients.length - 5} more…</div>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══ TEMPLATES TAB ═════════════════════════════════════════════════════ */}
        {tab === "templates" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.82rem", color: "#555" }}>{templates.length} template{templates.length !== 1 ? "s" : ""} saved</div>
              <Button size="sm" variant={showTplForm ? "secondary" : "primary"} onClick={() => setShowTplForm(f => !f)}>
                {showTplForm ? "Cancel" : "+ New Template"}
              </Button>
            </div>

            {/* Create form */}
            {showTplForm && (
              <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", padding: "1.25rem", marginBottom: "1.25rem" }}>
                <div style={{ fontSize: "0.88rem", fontWeight: 600, marginBottom: "1rem" }}>New Plan Template</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                  <div>
                    <label style={{ fontSize: "10px", color: "#555", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "4px" }}>Template Name *</label>
                    <input value={tplName} onChange={e => setTplName(e.target.value)} placeholder="e.g. 10K Base Builder"
                      style={S.inp} />
                  </div>
                  <div>
                    <label style={{ fontSize: "10px", color: "#555", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "4px" }}>Description</label>
                    <input value={tplDesc} onChange={e => setTplDesc(e.target.value)} placeholder="e.g. Week 1 of 12-week plan"
                      style={S.inp} />
                  </div>
                </div>

                <div style={{ marginBottom: "1rem" }}>
                  <div style={{ fontSize: "10px", color: "#555", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.6rem" }}>Daily Schedule (Mon → Sun)</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {DAYS.map((day, i) => (
                      <div key={day} style={{ display: "grid", gridTemplateColumns: "36px 1fr 44px 1fr", gap: "6px", alignItems: "center" }}>
                        <div style={{ fontSize: "11px", color: "#e8620a", fontWeight: 700 }}>{day}</div>
                        <select value={tplDays[i].type} onChange={e => updateTplDay(i, "type", e.target.value)} style={S.sel}>
                          {Object.keys(TYPE_PRESETS).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <input value={tplDays[i].emoji} onChange={e => updateTplDay(i, "emoji", e.target.value)} maxLength={4}
                          style={{ ...S.inp, textAlign: "center", fontSize: "1rem" }} />
                        <input value={tplDays[i].detail} onChange={e => updateTplDay(i, "detail", e.target.value)}
                          disabled={tplDays[i].type === "Rest"}
                          placeholder={tplDays[i].type === "Rest" ? "Rest day" : "Session detail…"}
                          style={{ ...S.inp, opacity: tplDays[i].type === "Rest" ? 0.4 : 1, cursor: tplDays[i].type === "Rest" ? "not-allowed" : "text" }} />
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <Button loading={tplSaving} disabled={!tplName.trim()} onClick={saveTemplate}>Save Template</Button>
                  {tplMsg && <Alert variant="error">{tplMsg}</Alert>}
                </div>
              </div>
            )}

            {/* Template grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: "1rem" }}>
              {templates.length === 0 && !showTplForm && (
                <div style={{ gridColumn: "1/-1" }}><EmptyState title='No templates yet.' body='Click "+ New Template" to create one.' /></div>
              )}
              {templates.map(t => (
                <div key={t.id} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", padding: "1.1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{t.name}</div>
                      {t.description && <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>{t.description}</div>}
                    </div>
                    <Button size="xs" variant="ghost" onClick={() => deleteTemplate(t.id)}>✕</Button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "3px" }}>
                    {t.days.map((d, i) => (
                      <div key={i} style={{ textAlign: "center", background: "rgba(255,255,255,0.03)", borderRadius: "4px", padding: "4px 2px" }}>
                        <div style={{ fontSize: "9px", color: "#444", marginBottom: "2px" }}>{DAYS[i]}</div>
                        <div style={{ fontSize: "14px" }}>{d.emoji}</div>
                      </div>
                    ))}
                  </div>

                  <Button size="sm" onClick={() => { setAssigningTpl(t); setTplTargets(new Set()); setTplAssignMsg(""); }}>Assign to Athletes</Button>
                </div>
              ))}
            </div>

            {/* Assign modal */}
            {assigningTpl && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
                <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "1.5rem", width: "100%", maxWidth: "440px", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
                  <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Assign: {assigningTpl.name}</div>
                  <div style={{ fontSize: "0.8rem", color: "#555", marginBottom: "1rem" }}>Select athletes to assign this plan to.</div>
                  <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "3px", marginBottom: "1rem" }}>
                    {athletes.filter(a => a.is_active_member).map(a => (
                      <label key={a.email} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 8px", borderRadius: "5px", cursor: "pointer", background: tplTargets.has(a.email) ? "rgba(232,98,10,0.08)" : "transparent" }}>
                        <input type="checkbox" checked={tplTargets.has(a.email)} onChange={e => setTplTargets(prev => { const s = new Set(prev); e.target.checked ? s.add(a.email) : s.delete(a.email); return s; })} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "0.82rem", color: "#ccc" }}>{a.first_name} {a.last_name}</div>
                          <div style={{ fontSize: "10px", color: "#444" }}>{a.goal?.toUpperCase()} · {a.training_plan ? `Current: ${a.training_plan}` : "No plan"}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                    <Button loading={tplAssigning} disabled={tplTargets.size === 0} onClick={() => assignTemplate(assigningTpl, Array.from(tplTargets))}>
                      {`Assign to ${tplTargets.size} athlete${tplTargets.size !== 1 ? "s" : ""}`}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAssigningTpl(null)}>Cancel</Button>
                    {tplAssignMsg && <Badge color="green" size="sm">{tplAssignMsg}</Badge>}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Close dropdowns on outside click */}
      {(assignOpen || cohortOpen) && (
        <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => { setAssignOpen(null); setCohortOpen(null); }} />
      )}

      <style>{`
        @media (max-width: 700px) {
          .coach-ops-table-header { display: none !important; }
          .coach-ops-table-row    { display: none !important; }
          .coach-ops-card         { display: block !important; }
          .coach-ops-cohorts      { grid-template-columns: 1fr !important; }
          .coach-ops-broadcast    { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
