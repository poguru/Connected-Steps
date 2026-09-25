"use client";

import { useState, useEffect, useCallback } from "react";

const ACCENT = "#e8620a";

type LogEntry = {
  id: string; actor_email: string; actor_role: string;
  action: string; entity_type: string | null; entity_id: string | null;
  detail: Record<string, unknown> | null; ip: string | null; created_at: string;
};

// ── Action metadata ─────────────────────────────────────────────────────────

type ActionMeta = { label: string; color: string; category: string };

const ACTION_META: Record<string, ActionMeta> = {
  // Event
  update_event:               { label: "Update Event",           color: "#6366f1", category: "event" },
  // Category
  update_category:            { label: "Update Category",        color: ACCENT,    category: "category" },
  // Registration
  cancel_registration:        { label: "Cancel Registration",    color: "#ef4444", category: "registration" },
  update_registration:        { label: "Update Registration",    color: "#f59e0b", category: "registration" },
  resend_email:               { label: "Resend Email",           color: "#60a5fa", category: "registration" },
  force_resend_email:         { label: "Force Resend Email",     color: "#f59e0b", category: "registration" },
  // Participant
  edit_participant:           { label: "Edit Participant",       color: "#a78bfa", category: "participant" },
  // Verification
  verification_verified:      { label: "Verified",              color: "#10b981", category: "verification" },
  verification_rejected:      { label: "Rejected",              color: "#ef4444", category: "verification" },
  verification_need_clarification: { label: "Needs Clarification", color: "#f59e0b", category: "verification" },
  // BIB & T-shirt
  bib_collected:              { label: "BIB Collected",         color: "#10b981", category: "race_day" },
  tshirt_issued:              { label: "T-Shirt Issued",        color: "#10b981", category: "race_day" },
  tshirt_override_issued:     { label: "T-Shirt Override",      color: "#ef4444", category: "race_day" },
  checkin:                    { label: "Check In",              color: "#22d3ee", category: "race_day" },
  // Coupons
  create_coupon:              { label: "Create Coupon",         color: "#10b981", category: "coupon" },
  activate_coupon:            { label: "Activate Coupon",       color: "#10b981", category: "coupon" },
  deactivate_coupon:          { label: "Deactivate Coupon",     color: "#ef4444", category: "coupon" },
  // Staff
  create_staff:               { label: "Create Staff",          color: "#10b981", category: "staff" },
  update_staff:               { label: "Update Staff",          color: "#f59e0b", category: "staff" },
  activate_staff:             { label: "Activate Staff",        color: "#10b981", category: "staff" },
  deactivate_staff:           { label: "Deactivate Staff",      color: "#ef4444", category: "staff" },
  reset_staff_password:       { label: "Reset Password",        color: "#f59e0b", category: "staff" },
};

function actionMeta(action: string): ActionMeta {
  return ACTION_META[action] ?? { label: action.replace(/_/g, " "), color: "#888", category: "other" };
}

const ENTITY_TYPES = [
  { value: "",             label: "All entities" },
  { value: "event",        label: "Event" },
  { value: "category",     label: "Category" },
  { value: "registration", label: "Registration" },
  { value: "participant",  label: "Participant" },
  { value: "coupon",       label: "Coupon" },
  { value: "staff",        label: "Staff" },
];

const KNOWN_ACTIONS = Object.keys(ACTION_META).sort();

// Friendly detail summary for the inline preview
function detailSummary(action: string, detail: Record<string, unknown> | null): string | null {
  if (!detail) return null;
  if (action === "update_event" || action === "update_category") {
    const fields = detail.updated_fields;
    if (Array.isArray(fields) && fields.length > 0) {
      return `Changed: ${fields.join(", ")}`;
    }
  }
  if (action === "cancel_registration") {
    return detail.new_values
      ? `Reason: ${(detail.new_values as Record<string, unknown>).cancelled_reason ?? "—"}`
      : null;
  }
  if (action === "edit_participant") {
    const name = detail.participant_name as string | undefined;
    const fields = detail.updated_fields;
    return [name, Array.isArray(fields) ? `Changed: ${fields.join(", ")}` : null].filter(Boolean).join(" · ");
  }
  if (action === "bib_collected" || action === "tshirt_issued" || action === "tshirt_override_issued" || action === "checkin") {
    return [detail.participant_name, detail.bib_number ? `BIB ${detail.bib_number}` : null, detail.tshirt_size ? `Size ${detail.tshirt_size}` : null].filter(Boolean).join(" · ") || null;
  }
  if (action.startsWith("verification_")) {
    return detail.notes ? `Notes: ${detail.notes}` : null;
  }
  if (action === "create_coupon") {
    return `${detail.code} · ${detail.discount_type === "flat" ? `₹${detail.discount_value}` : `${detail.discount_value}%`}`;
  }
  if (action === "create_staff" || action === "update_staff") {
    return detail.role ? `Role: ${String(detail.role).replace(/_/g, " ")}` : null;
  }
  return null;
}

// ── Input component ──────────────────────────────────────────────────────────

function Inp({ value, onChange, placeholder, type = "text" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ padding: "9px 13px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%" }} />
  );
}

function Sel({ value, onChange, children }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ padding: "9px 13px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: value ? "#fff" : "#888", fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%" }}>
      {children}
    </select>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function AuditLogsPage() {
  const [logs,       setLogs]       = useState<LogEntry[]>([]);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [expanded,   setExpanded]   = useState<string | null>(null);

  // Filters
  const [actor,      setActor]      = useState("");
  const [action,     setAction]     = useState("");
  const [entityType, setEntityType] = useState("");
  const [entityId,   setEntityId]   = useState("");
  const [dateFrom,   setDateFrom]   = useState("");
  const [dateTo,     setDateTo]     = useState("");
  const [offset,     setOffset]     = useState(0);
  const LIMIT = 50;

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
    if (actor)      params.set("actor",       actor);
    if (action)     params.set("action",      action);
    if (entityType) params.set("entity_type", entityType);
    if (entityId)   params.set("entity_id",   entityId);
    if (dateFrom)   params.set("date_from",   dateFrom);
    if (dateTo)     params.set("date_to",     dateTo);
    fetch(`/api/it-run/admin/audit-logs?${params}`)
      .then(r => r.json())
      .then(d => { setLogs(d.logs ?? []); setTotal(d.total ?? 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [actor, action, entityType, entityId, dateFrom, dateTo, offset]);

  useEffect(() => { load(); }, [load]);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
  }

  function clearFilters() {
    setActor(""); setAction(""); setEntityType(""); setEntityId("");
    setDateFrom(""); setDateTo(""); setOffset(0);
  }

  const hasFilters = actor || action || entityType || entityId || dateFrom || dateTo;

  function fmtTime(ts: string) {
    return new Date(ts).toLocaleString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  const ROLE_COLOR: Record<string, string> = {
    super_admin: "#ef4444", event_admin: ACCENT, verification_team: "#6366f1",
    bib_collection: "#f59e0b", checkin_team: "#10b981", support_desk: "#60a5fa",
  };

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: "clamp(20px,3vw,26px)", fontWeight: 800, color: "#fff", margin: 0 }}>Audit Logs</h1>
        <p style={{ color: "#666", fontSize: 13, margin: "6px 0 0" }}>
          Immutable record of all admin actions.{total ? ` ${total.toLocaleString()} entries.` : ""}
        </p>
      </div>

      {/* Filters */}
      <form onSubmit={applyFilters} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 10, marginBottom: 10 }}>
          <Inp value={actor}      onChange={setActor}      placeholder="Actor email…" />
          <div>
            <Sel value={action} onChange={v => { setAction(v); setOffset(0); }}>
              <option value="" style={{ background: "#1a1a1a" }}>All actions</option>
              {KNOWN_ACTIONS.map(a => (
                <option key={a} value={a} style={{ background: "#1a1a1a" }}>{actionMeta(a).label}</option>
              ))}
            </Sel>
          </div>
          <div>
            <Sel value={entityType} onChange={v => { setEntityType(v); setOffset(0); }}>
              {ENTITY_TYPES.map(e => <option key={e.value} value={e.value} style={{ background: "#1a1a1a" }}>{e.label}</option>)}
            </Sel>
          </div>
          <Inp value={entityId}  onChange={setEntityId}  placeholder="Entity ID or code…" />
          <Inp value={dateFrom}  onChange={setDateFrom}  type="date" />
          <Inp value={dateTo}    onChange={setDateTo}    type="date" />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit"
            style={{ padding: "8px 18px", background: ACCENT, border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            Apply Filters
          </button>
          {hasFilters && (
            <button type="button" onClick={clearFilters}
              style={{ padding: "8px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#888", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Clear
            </button>
          )}
        </div>
      </form>

      {/* Table */}
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["When","Actor","Role","Action","Entity","Summary","IP"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#555", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#555" }}>Loading…</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#555" }}>No entries match</td></tr>
              ) : logs.map((l, i) => {
                const meta = actionMeta(l.action);
                const summary = detailSummary(l.action, l.detail);
                const rc = ROLE_COLOR[l.actor_role] ?? "#888";
                const isOpen = expanded === l.id;
                return (
                  <>
                    <tr key={l.id}
                      onClick={() => setExpanded(isOpen ? null : l.id)}
                      style={{
                        borderBottom: i < logs.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                        cursor: l.detail ? "pointer" : "default",
                        background: isOpen ? "rgba(255,255,255,0.03)" : "transparent",
                      }}>
                      <td style={{ padding: "9px 14px", color: "#666", whiteSpace: "nowrap", fontSize: 12 }}>{fmtTime(l.created_at)}</td>
                      <td style={{ padding: "9px 14px", color: "#ccc", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>{l.actor_email}</td>
                      <td style={{ padding: "9px 14px", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: 10, color: rc, background: `${rc}15`, padding: "2px 7px", borderRadius: 5, border: `1px solid ${rc}25` }}>
                          {l.actor_role.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td style={{ padding: "9px 14px", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, background: `${meta.color}18`, padding: "3px 8px", borderRadius: 6, border: `1px solid ${meta.color}25` }}>
                          {meta.label}
                        </span>
                      </td>
                      <td style={{ padding: "9px 14px", fontSize: 11, whiteSpace: "nowrap" }}>
                        {l.entity_type && <span style={{ color: "#666" }}>{l.entity_type}</span>}
                        {l.entity_id && <span style={{ color: "#444" }}> · {l.entity_id.length > 24 ? l.entity_id.slice(0, 12) + "…" : l.entity_id}</span>}
                      </td>
                      <td style={{ padding: "9px 14px", fontSize: 12, color: "#666", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {summary ?? (l.detail ? <span style={{ color: "#444", fontStyle: "italic" }}>click to expand</span> : null)}
                      </td>
                      <td style={{ padding: "9px 14px", fontSize: 11, color: "#444", whiteSpace: "nowrap" }}>
                        {l.ip && l.ip !== "unknown" ? l.ip : <span style={{ color: "#333" }}>—</span>}
                      </td>
                    </tr>
                    {isOpen && l.detail && (
                      <tr key={`${l.id}-detail`} style={{ background: "rgba(255,255,255,0.02)" }}>
                        <td colSpan={7} style={{ padding: "0 14px 14px 14px" }}>
                          <DiffView action={l.action} detail={l.detail} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {total > LIMIT && (
        <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "center", alignItems: "center" }}>
          <button disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - LIMIT))}
            style={{ padding: "7px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: offset === 0 ? "#333" : "#888", cursor: offset === 0 ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            ← Prev
          </button>
          <span style={{ fontSize: 13, color: "#555" }}>{offset + 1}–{Math.min(offset + LIMIT, total)} of {total.toLocaleString()}</span>
          <button disabled={offset + LIMIT >= total} onClick={() => setOffset(o => o + LIMIT)}
            style={{ padding: "7px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: offset + LIMIT >= total ? "#333" : "#888", cursor: offset + LIMIT >= total ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ── DiffView: renders old/new diffs or raw detail ────────────────────────────

function DiffView({ action, detail }: { action: string; detail: Record<string, unknown> }) {
  const hasDiff = detail.updated_fields && detail.old_values && detail.new_values;

  if (hasDiff) {
    const fields = detail.updated_fields as string[];
    const oldVals = detail.old_values as Record<string, unknown>;
    const newVals = detail.new_values as Record<string, unknown>;
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
        {fields.map(f => {
          const o = oldVals[f]; const n = newVals[f];
          const changed = JSON.stringify(o) !== JSON.stringify(n);
          return (
            <div key={f} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "8px 12px", minWidth: 160 }}>
              <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{f.replace(/_/g, " ")}</div>
              {changed ? (
                <>
                  <div style={{ fontSize: 12, color: "#ef4444", textDecoration: "line-through", marginBottom: 2, wordBreak: "break-all" }}>{fmt(o)}</div>
                  <div style={{ fontSize: 12, color: "#10b981", wordBreak: "break-all" }}>{fmt(n)}</div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: "#555" }}>{fmt(n)} (unchanged)</div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Fall back to raw JSON
  return (
    <pre style={{ fontSize: 11, color: "#666", background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "10px 14px", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: "4px 0 0" }}>
      {JSON.stringify(detail, null, 2)}
    </pre>
  );
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
