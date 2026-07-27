"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface Org {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  plan: string;
  plan_status: string;
  is_active: boolean;
  is_default: boolean;
  contact_email: string | null;
  website: string | null;
  member_count: number;
  created_at: string;
}

const PLAN_COLORS: Record<string, string> = {
  free:         "#6b7280",
  professional: "#3b82f6",
  enterprise:   "#8b5cf6",
};

const STATUS_COLORS: Record<string, string> = {
  active:    "#4ade80",
  trialing:  "#fb923c",
  past_due:  "#f87171",
  cancelled: "#6b7280",
};

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name,  setName]  = useState("");
  const [email, setEmail] = useState("");
  const [plan,  setPlan]  = useState("free");
  const [saving, setSaving] = useState(false);
  const [err,   setErr]   = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr("");
    try {
      const r = await fetch("/api/admin/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, contact_email: email, plan }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error); }
      onCreated();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 24, width: "100%", maxWidth: 440 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 20 }}>New Organization</div>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 5 }}>Organization Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} required placeholder="Acme Running Club"
              style={{ width: "100%", padding: "9px 12px", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 5 }}>Contact Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="admin@acme.com"
              style={{ width: "100%", padding: "9px 12px", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 5 }}>Plan</label>
            <select value={plan} onChange={e => setPlan(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontFamily: "inherit", fontSize: 13 }}>
              <option value="free">Free (3 events, 2 members)</option>
              <option value="professional">Professional (50 events, 10 members)</option>
              <option value="enterprise">Enterprise (unlimited)</option>
            </select>
          </div>
          {err && <div style={{ fontSize: 12, color: "#f87171" }}>{err}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, padding: "9px", background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#888", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              style={{ flex: 1, padding: "9px", background: "#e8620a", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function OrgsPage() {
  const [orgs,      setOrgs]      = useState<Org[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [q,         setQ]         = useState("");
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/orgs${q ? `?q=${encodeURIComponent(q)}` : ""}`)
      .then(r => r.json())
      .then(d => setOrgs(d.orgs ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [q]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>Organizations</div>
          <div style={{ fontSize: 13, color: "#555", marginTop: 4 }}>{orgs.length} total</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search orgs…"
            style={{ padding: "8px 12px", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#fff", fontFamily: "inherit", fontSize: 12, width: 200 }} />
          <button onClick={() => setShowModal(true)}
            style={{ padding: "8px 16px", background: "#e8620a", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>
            + New Org
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "#555" }}>Loading…</div>
        ) : orgs.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "#555" }}>No organizations found</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["Organization","Plan","Status","Members","Contact","Created"].map(h => (
                  <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orgs.map(org => (
                <tr key={org.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "13px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {org.logo_url ? (
                        <img src={org.logo_url} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: org.primary_color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 12, fontWeight: 700, color: "#fff" }}>
                          {org.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <Link href={`/admin/orgs/${org.id}`} style={{ fontSize: 13, fontWeight: 600, color: "#fff", textDecoration: "none" }}>
                          {org.name}
                          {org.is_default && <span style={{ marginLeft: 6, fontSize: 9, background: "rgba(232,98,10,0.15)", color: "#e8620a", padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>DEFAULT</span>}
                        </Link>
                        <div style={{ fontSize: 10, color: "#555", marginTop: 1 }}>{org.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "13px 16px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: PLAN_COLORS[org.plan] ?? "#888", background: `${PLAN_COLORS[org.plan] ?? "#888"}18`, padding: "2px 8px", borderRadius: 999, textTransform: "capitalize" }}>
                      {org.plan}
                    </span>
                  </td>
                  <td style={{ padding: "13px 16px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLORS[org.plan_status] ?? "#888", textTransform: "capitalize" }}>
                      {org.plan_status}
                    </span>
                  </td>
                  <td style={{ padding: "13px 16px", fontSize: 13, color: "#ccc" }}>{org.member_count}</td>
                  <td style={{ padding: "13px 16px", fontSize: 12, color: "#666", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {org.contact_email ?? "—"}
                  </td>
                  <td style={{ padding: "13px 16px", fontSize: 11, color: "#555" }}>
                    {new Date(org.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && <CreateModal onClose={() => setShowModal(false)} onCreated={load} />}
    </div>
  );
}
