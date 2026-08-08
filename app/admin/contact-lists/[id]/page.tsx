"use client";

import { use, useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Card, Button, Spinner, Alert } from "@/components/ui/ds";

interface Member {
  id: string; full_name: string; company_name: string | null;
  email: string | null; mobile: string | null;
  city: string | null; state: string | null;
  email_consent: boolean; whatsapp_consent: boolean;
  is_active: boolean; added_at: string;
}

interface ContactList {
  id: string; name: string; description: string | null;
  category: string | null; color: string; is_active: boolean;
  member_count: number; created_at: string;
}

const inp: React.CSSProperties = {
  padding: "7px 11px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6, color: "#fff", fontSize: "0.82rem", outline: "none", fontFamily: "inherit",
};

export default function ContactListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [list,      setList]      = useState<ContactList | null>(null);
  const [members,   setMembers]   = useState<Member[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [alert,     setAlert]     = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [total,     setTotal]     = useState(0);
  const [offset,    setOffset]    = useState(0);
  const [showEmail, setShowEmail] = useState(false);

  const eligibleCount = useMemo(
    () => members.filter(m => m.email && m.email_consent && m.is_active).length,
    [members],
  );
  const LIMIT = 100;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/contact-lists/${id}?limit=${LIMIT}&offset=${offset}`);
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    setList(data.list);
    setMembers(data.members ?? []);
    setTotal(data.list?.member_count ?? 0);
    setLoading(false);
  }, [id, offset]);

  useEffect(() => { load(); }, [load]);

  async function removeMembers(contactIds: string[]) {
    const res = await fetch(`/api/admin/contact-lists/${id}/members`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_ids: contactIds }),
    });
    if (!res.ok) { setAlert({ type: "error", msg: "Remove failed" }); return; }
    setAlert({ type: "success", msg: "Removed" });
    load();
  }

  if (loading && !list) return <div style={{ padding: "3rem", textAlign: "center" }}><Spinner /></div>;
  if (!list)            return <div style={{ padding: "3rem", color: "#f87171", textAlign: "center" }}>List not found.</div>;

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1000, margin: "0 auto" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: "0.72rem", color: "#555", marginBottom: 4 }}>
            <Link href="/admin/contact-lists" style={{ color: "#555", textDecoration: "none" }}>Contact Lists</Link> /
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: list.color, flexShrink: 0 }} />
            <h1 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "#fff" }}>{list.name}</h1>
          </div>
          {list.description && <div style={{ margin: "4px 0 0 22px", fontSize: "0.8rem", color: "#555" }}>{list.description}</div>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href={`/api/admin/external-contacts/export?list_id=${id}`}>
            <Button variant="ghost" size="sm">⬇ Export CSV</Button>
          </a>
          <Link href={`/admin/contacts?list_id=${id}`}>
            <Button variant="outline" size="sm">+ Add Contacts</Button>
          </Link>
          <Button variant="primary" size="sm" onClick={() => setShowEmail(true)} disabled={eligibleCount === 0}>
            📧 Send Email {eligibleCount > 0 ? `(${eligibleCount})` : ""}
          </Button>
        </div>
      </div>

      {alert && <Alert variant={alert.type === "success" ? "success" : "error"} style={{ marginBottom: 14 }}>{alert.msg}</Alert>}

      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <Card style={{ padding: "0.85rem 1.25rem", display: "flex", gap: 16 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: list.color }}>{total}</div>
            <div style={{ fontSize: "0.65rem", color: "#444", textTransform: "uppercase" }}>Members</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#60a5fa" }}>{members.filter(m => m.email_consent).length}</div>
            <div style={{ fontSize: "0.65rem", color: "#444", textTransform: "uppercase" }}>Email Consent</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#34d399" }}>{members.filter(m => m.whatsapp_consent).length}</div>
            <div style={{ fontSize: "0.65rem", color: "#444", textTransform: "uppercase" }}>WA Consent</div>
          </div>
        </Card>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "3rem", textAlign: "center" }}><Spinner /></div>
        ) : members.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "#333", fontSize: "0.9rem" }}>
            No members yet.{" "}
            <Link href="/admin/contacts/import" style={{ color: "#e8620a" }}>Import contacts</Link>{" or "}
            <Link href="/admin/contacts" style={{ color: "#e8620a" }}>browse all contacts</Link>{" "}to add.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {["Name","Company","Email","Mobile","City","Consent","Added",""].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.35)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding: "10px 12px" }}>
                      <Link href={`/admin/contacts/${m.id}`} style={{ color: "#fff", fontWeight: 600, textDecoration: "none" }}>{m.full_name}</Link>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#888", fontSize: "0.78rem" }}>{m.company_name ?? "—"}</td>
                    <td style={{ padding: "10px 12px", color: "#60a5fa", fontSize: "0.78rem" }}>{m.email ?? "—"}</td>
                    <td style={{ padding: "10px 12px", color: "#888", fontSize: "0.78rem", fontVariantNumeric: "tabular-nums" }}>{m.mobile ?? "—"}</td>
                    <td style={{ padding: "10px 12px", color: "#555", fontSize: "0.75rem" }}>{[m.city, m.state].filter(Boolean).join(", ") || "—"}</td>
                    <td style={{ padding: "10px 12px" }}>
                      {m.email_consent    && <span title="Email"    style={{ fontSize: 14, marginRight: 2 }}>📧</span>}
                      {m.whatsapp_consent && <span title="WhatsApp" style={{ fontSize: 14 }}>💬</span>}
                      {!m.email_consent && !m.whatsapp_consent && <span style={{ fontSize: "0.7rem", color: "#333" }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#444", fontSize: "0.72rem" }}>
                      {new Date(m.added_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <button onClick={() => removeMembers([m.id])}
                        style={{ padding: "3px 8px", background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 5, color: "#f87171", cursor: "pointer", fontSize: "0.7rem", fontFamily: "inherit" }}>
                        Remove
                      </button>
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

    {showEmail && list && (
      <ListSendEmailModal
        listId={id}
        listName={list.name}
        eligibleCount={eligibleCount}
        onClose={() => setShowEmail(false)}
        onSent={(result) => {
          setShowEmail(false);
          setAlert({ type: "success", msg: `Sent to ${result.sent} of ${result.total} contacts${result.skipped > 0 ? ` (${result.skipped} skipped — no email/consent)` : ""}` });
        }}
      />
    )}
    </div>
  );
}

// ── Send Email Modal ───────────────────────────────────────────────────────────

function ListSendEmailModal({
  listId, listName, eligibleCount, onClose, onSent,
}: {
  listId: string; listName: string; eligibleCount: number;
  onClose: () => void; onSent: (result: { sent: number; total: number; skipped: number }) => void;
}) {
  const [subject, setSubject] = useState("");
  const [body,    setBody]    = useState("");
  const [sending, setSending] = useState(false);
  const [error,   setError]   = useState("");

  async function send() {
    if (!subject.trim()) { setError("Subject is required"); return; }
    if (!body.trim())    { setError("Message is required"); return; }
    setSending(true); setError("");
    const res = await fetch(`/api/admin/contact-lists/${listId}/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body }),
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) { setError(data.error ?? "Send failed"); return; }
    onSent(data);
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 520, background: "#111", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 24 }}>
        <div style={{ fontWeight: 800, fontSize: "1rem", color: "#fff", marginBottom: 4 }}>📧 Send Email to List</div>
        <div style={{ fontSize: "0.78rem", color: "#555", marginBottom: 16 }}>
          List: <strong style={{ color: "#888" }}>{listName}</strong> &nbsp;·&nbsp;
          <span style={{ color: "#60a5fa" }}>{eligibleCount} eligible recipients</span>
          <div style={{ fontSize: "0.7rem", color: "#444", marginTop: 2 }}>Only contacts with email + consent will receive this.</div>
        </div>

        {error && <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid #f87171", borderRadius: 6, padding: "8px 12px", fontSize: "0.8rem", color: "#f87171", marginBottom: 12 }}>{error}</div>}

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 600, color: "#555", textTransform: "uppercase", marginBottom: 4 }}>Subject *</label>
          <input value={subject} onChange={e => setSubject(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" as const }} placeholder="Subject line" />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 600, color: "#555", textTransform: "uppercase", marginBottom: 4 }}>Message *</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={8} style={{ ...inp, width: "100%", boxSizing: "border-box" as const, resize: "vertical" }} placeholder="Type your message here…" />
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary" onClick={send} disabled={sending}>
            {sending ? `Sending to ${eligibleCount}…` : `Send to ${eligibleCount} contacts`}
          </Button>
        </div>
      </div>
    </div>
  );
}
