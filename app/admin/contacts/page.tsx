"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, Button, Badge, Spinner, Alert } from "@/components/ui/ds";

interface Contact {
  id: string; full_name: string; company_name: string | null;
  designation: string | null; email: string | null; mobile: string | null;
  city: string | null; state: string | null; tags: string[];
  email_consent: boolean; whatsapp_consent: boolean;
  is_active: boolean; do_not_contact: boolean; created_at: string;
}

interface Stats {
  total: number; active: number; inactive: number; do_not_contact: number;
  email_consent: number; whatsapp_consent: number; with_email: number;
}

const inp: React.CSSProperties = {
  padding: "7px 11px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6, color: "#fff", fontSize: "0.82rem", outline: "none", fontFamily: "inherit",
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stats,    setStats]    = useState<Stats | null>(null);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [alert,    setAlert]    = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const [q,       setQ]       = useState("");
  const [status,  setStatus]  = useState("");
  const [consent, setConsent] = useState("");
  const [offset,  setOffset]  = useState(0);
  const LIMIT = 50;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
    if (q)       params.set("q", q);
    if (status)  params.set("status", status);
    if (consent) params.set("consent", consent);
    const res  = await fetch(`/api/admin/external-contacts?${params}`);
    const data = await res.json();
    setContacts(data.contacts ?? []);
    setStats(data.stats ?? null);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [q, status, consent, offset]);

  useEffect(() => { load(); }, [load]);

  const dashStats = [
    { label: "Total",           value: stats?.total            ?? 0,   color: "#fff" },
    { label: "Active",          value: stats?.active           ?? 0,   color: "#4ade80" },
    { label: "Email Consent",   value: stats?.email_consent    ?? 0,   color: "#60a5fa" },
    { label: "WA Consent",      value: stats?.whatsapp_consent ?? 0,   color: "#34d399" },
    { label: "With Email",      value: stats?.with_email       ?? 0,   color: "#a78bfa" },
    { label: "Do Not Contact",  value: stats?.do_not_contact   ?? 0,   color: "#f87171" },
  ];

  async function deleteContact(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/external-contacts/${id}`, { method: "DELETE" });
    if (!res.ok) { setAlert({ type: "error", msg: "Delete failed" }); return; }
    setAlert({ type: "success", msg: `${name} deleted` });
    load();
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1200, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#fff" }}>👥 External Contacts</h1>
          <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#555" }}>Contacts outside the Connected Steps platform — sponsors, media, corporates, NGOs</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/api/admin/external-contacts/export?format=csv">
            <Button variant="ghost" size="sm">⬇ Export CSV</Button>
          </a>
          <Link href="/admin/contacts/import">
            <Button variant="outline" size="sm">📥 Import</Button>
          </Link>
          <Link href="/admin/contacts/new">
            <Button variant="primary" size="sm">+ Add Contact</Button>
          </Link>
        </div>
      </div>

      {alert && <Alert variant={alert.type === "success" ? "success" : "error"} style={{ marginBottom: 14 }}>{alert.msg}</Alert>}

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10, marginBottom: 20 }}>
        {dashStats.map(s => (
          <Card key={s.label} style={{ padding: "0.85rem", textAlign: "center" }}>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: s.color, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
            <div style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", marginTop: 3, letterSpacing: "0.08em" }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card style={{ padding: "0.875rem 1.25rem", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input value={q} onChange={e => { setQ(e.target.value); setOffset(0); }}
            placeholder="Search by name, company, email, phone…"
            style={{ ...inp, flex: 1, minWidth: 200 }} />
          <select value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }} style={{ ...inp, minWidth: 120 }}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select value={consent} onChange={e => { setConsent(e.target.value); setOffset(0); }} style={{ ...inp, minWidth: 140 }}>
            <option value="">All Consent</option>
            <option value="email">Email Consent</option>
            <option value="whatsapp">WhatsApp Consent</option>
          </select>
          <Button size="sm" variant="ghost" onClick={load}>↻</Button>
        </div>
      </Card>

      {/* Table */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "3rem", textAlign: "center" }}><Spinner /></div>
        ) : contacts.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "0.9rem" }}>
            No contacts found.{" "}
            <Link href="/admin/contacts/new" style={{ color: "#e8620a" }}>Add one</Link>{" or "}
            <Link href="/admin/contacts/import" style={{ color: "#e8620a" }}>import from Excel/CSV →</Link>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {["Name", "Company", "Email", "Mobile", "Tags", "City", "Consent", "Status", "Actions"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.35)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contacts.map(c => (
                  <tr key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding: "10px 12px" }}>
                      <Link href={`/admin/contacts/${c.id}`} style={{ color: "#fff", fontWeight: 600, textDecoration: "none" }}>{c.full_name}</Link>
                      {c.designation && <div style={{ fontSize: "0.7rem", color: "#555", marginTop: 1 }}>{c.designation}</div>}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#888", fontSize: "0.78rem" }}>{c.company_name ?? "—"}</td>
                    <td style={{ padding: "10px 12px", color: "#60a5fa", fontSize: "0.78rem" }}>{c.email ?? "—"}</td>
                    <td style={{ padding: "10px 12px", color: "#888", fontSize: "0.78rem", fontVariantNumeric: "tabular-nums" }}>{c.mobile ?? "—"}</td>
                    <td style={{ padding: "10px 12px", maxWidth: 140 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                        {(c.tags ?? []).slice(0,3).map(t => (
                          <span key={t} style={{ fontSize: "0.65rem", padding: "1px 6px", borderRadius: 100, background: "rgba(255,255,255,0.06)", color: "#888" }}>{t}</span>
                        ))}
                        {(c.tags ?? []).length > 3 && <span style={{ fontSize: "0.65rem", color: "#444" }}>+{c.tags.length - 3}</span>}
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#555", fontSize: "0.75rem" }}>{[c.city, c.state].filter(Boolean).join(", ") || "—"}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        {c.email_consent    && <span title="Email consent"    style={{ fontSize: 14 }}>📧</span>}
                        {c.whatsapp_consent && <span title="WhatsApp consent" style={{ fontSize: 14 }}>💬</span>}
                        {!c.email_consent && !c.whatsapp_consent && <span style={{ fontSize: "0.7rem", color: "#333" }}>None</span>}
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {c.do_not_contact
                        ? <Badge color="red" size="sm">DNC</Badge>
                        : c.is_active
                          ? <Badge color="green" size="sm">Active</Badge>
                          : <Badge color="gray" size="sm">Inactive</Badge>}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <Link href={`/admin/contacts/${c.id}`}><Button size="sm" variant="ghost">View</Button></Link>
                        <button onClick={() => deleteContact(c.id, c.full_name)}
                          style={{ padding: "4px 8px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 5, color: "#f87171", cursor: "pointer", fontSize: "0.72rem", fontFamily: "inherit" }}>
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > LIMIT && (
          <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "0.8rem", color: "#555" }}>
            <span>{offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <Button size="sm" variant="ghost" onClick={() => setOffset(Math.max(0, offset - LIMIT))} disabled={offset === 0}>← Prev</Button>
              <Button size="sm" variant="ghost" onClick={() => setOffset(offset + LIMIT)} disabled={offset + LIMIT >= total}>Next →</Button>
            </div>
          </div>
        )}
      </Card>

      <div style={{ marginTop: 12, display: "flex", gap: 12, fontSize: "0.78rem" }}>
        <Link href="/admin/contact-lists" style={{ color: "#555", textDecoration: "none" }}>📋 Contact Lists</Link>
        <Link href="/admin/contacts/import" style={{ color: "#555", textDecoration: "none" }}>📥 Import History</Link>
      </div>
    </div>
  );
}
