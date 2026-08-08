"use client";

import { use, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Badge, Spinner, Alert } from "@/components/ui/ds";

interface Contact {
  id: string; full_name: string; company_name: string | null;
  designation: string | null; client_department?: string | null;
  email: string | null; mobile: string | null; whatsapp_number: string | null;
  city: string | null; state: string | null; country: string;
  tags: string[]; notes: string | null; source: string | null;
  email_consent: boolean; whatsapp_consent: boolean; sms_consent: boolean;
  consent_date: string | null; consent_source: string | null;
  is_active: boolean; do_not_contact: boolean;
  unsubscribed_at: string | null; last_contacted: string | null;
  last_opened_email: string | null; last_replied: string | null;
  created_at: string; updated_at: string;
}

interface ActivityEntry {
  id: string; activity_type: string; subject: string | null; details: Record<string, unknown> | null; created_at: string;
}

const inp: React.CSSProperties = {
  padding: "7px 11px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6, color: "#fff", fontSize: "0.82rem", outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "0.72rem", fontWeight: 600, color: "rgba(255,255,255,0.4)",
  textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={labelStyle}>{label}</label>{children}</div>;
}

export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }   = use(params);
  const isNew    = id === "new";
  const router   = useRouter();

  const [contact,   setContact]   = useState<Contact | null>(null);
  const [activity,  setActivity]  = useState<ActivityEntry[]>([]);
  const [lists,     setLists]     = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [loading,   setLoading]   = useState(!isNew);
  const [saving,    setSaving]    = useState(false);
  const [editing,   setEditing]   = useState(isNew);
  const [alert,     setAlert]     = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [showEmail, setShowEmail] = useState(false);

  // Form state
  const [form, setForm] = useState({
    full_name: "", company_name: "", designation: "", email: "", mobile: "",
    whatsapp_number: "", city: "", state: "", country: "India", tags: "",
    notes: "", source: "manual",
    email_consent: false, whatsapp_consent: false, sms_consent: false,
    is_active: true, do_not_contact: false,
  });

  const load = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    const res = await fetch(`/api/admin/external-contacts/${id}`);
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    setContact(data.contact);
    setActivity(data.activity ?? []);
    setLists(data.lists ?? []);
    setForm({
      full_name:        data.contact.full_name        ?? "",
      company_name:     data.contact.company_name     ?? "",
      designation:      data.contact.designation      ?? "",
      email:            data.contact.email            ?? "",
      mobile:           data.contact.mobile           ?? "",
      whatsapp_number:  data.contact.whatsapp_number  ?? "",
      city:             data.contact.city             ?? "",
      state:            data.contact.state            ?? "",
      country:          data.contact.country          ?? "India",
      tags:             (data.contact.tags ?? []).join(", "),
      notes:            data.contact.notes            ?? "",
      source:           data.contact.source           ?? "manual",
      email_consent:    data.contact.email_consent    ?? false,
      whatsapp_consent: data.contact.whatsapp_consent ?? false,
      sms_consent:      data.contact.sms_consent      ?? false,
      is_active:        data.contact.is_active        ?? true,
      do_not_contact:   data.contact.do_not_contact   ?? false,
    });
    setLoading(false);
  }, [id, isNew]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!form.full_name.trim()) { setAlert({ type: "error", msg: "Name is required" }); return; }
    setSaving(true); setAlert(null);

    const payload = {
      ...form,
      full_name:   form.full_name.trim(),
      tags:        form.tags.split(",").map(t => t.trim()).filter(Boolean),
      company_name:    form.company_name    || null,
      designation:     form.designation     || null,
      email:           form.email           || null,
      mobile:          form.mobile          || null,
      whatsapp_number: form.whatsapp_number || null,
      city:            form.city            || null,
      state:           form.state           || null,
      notes:           form.notes           || null,
    };

    const res = isNew
      ? await fetch("/api/admin/external-contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : await fetch(`/api/admin/external-contacts/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setAlert({ type: "error", msg: data.error ?? "Save failed" }); return; }

    if (isNew) {
      router.push(`/admin/contacts/${data.contact.id}`);
    } else {
      setAlert({ type: "success", msg: "Saved" });
      setEditing(false);
      load();
    }
  }

  async function handleDelete() {
    if (!contact) return;
    if (!confirm(`Delete "${contact.full_name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/external-contacts/${id}`, { method: "DELETE" });
    if (!res.ok) { setAlert({ type: "error", msg: "Delete failed" }); return; }
    router.push("/admin/contacts");
  }

  if (loading) return <div style={{ padding: "3rem", textAlign: "center" }}><Spinner /></div>;

  return (
    <div style={{ padding: "1.5rem", maxWidth: 900, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: "0.72rem", color: "#555", marginBottom: 4 }}>
            <Link href="/admin/contacts" style={{ color: "#555", textDecoration: "none" }}>Contacts</Link> /
          </div>
          <h1 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "#fff" }}>
            {isNew ? "Add Contact" : (contact?.full_name ?? "Contact")}
          </h1>
          {contact?.company_name && <div style={{ margin: "3px 0 0", fontSize: "0.82rem", color: "#888" }}>{contact.company_name}{contact.designation ? ` · ${contact.designation}` : ""}</div>}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {!isNew && !editing && <Button variant="outline" size="sm" onClick={() => setEditing(true)}>✎ Edit</Button>}
          {!isNew && <button onClick={handleDelete} style={{ padding: "5px 10px", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 6, color: "#f87171", cursor: "pointer", fontSize: "0.78rem", fontFamily: "inherit" }}>🗑 Delete</button>}
        </div>
      </div>

      {alert && <Alert variant={alert.type === "success" ? "success" : "error"} style={{ marginBottom: 14 }}>{alert.msg}</Alert>}

      <div style={{ display: "grid", gridTemplateColumns: editing ? "1fr" : "1fr 280px", gap: 16, alignItems: "start" }}>

        {/* Main form/view */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Details */}
          <Card style={{ padding: "1.25rem" }}>
            <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Contact Details</div>
            {editing ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                <Field label="Full Name *">
                  <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} style={inp} />
                </Field>
                <Field label="Company">
                  <input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} style={inp} />
                </Field>
                <Field label="Designation">
                  <input value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} style={inp} />
                </Field>
                <Field label="Email">
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inp} />
                </Field>
                <Field label="Mobile">
                  <input value={form.mobile} onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))} placeholder="+91 98765 43210" style={inp} />
                </Field>
                <Field label="WhatsApp">
                  <input value={form.whatsapp_number} onChange={e => setForm(f => ({ ...f, whatsapp_number: e.target.value }))} style={inp} />
                </Field>
                <Field label="City">
                  <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} style={inp} />
                </Field>
                <Field label="State">
                  <input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} style={inp} />
                </Field>
                <Field label="Country">
                  <input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} style={inp} />
                </Field>
                <Field label="Source">
                  <input value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} placeholder="manual, referral, event…" style={inp} />
                </Field>
                <div style={{ gridColumn: "1/-1" }}>
                  <Field label="Tags (comma-separated)">
                    <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="Corporate, HR, Sponsor" style={inp} />
                  </Field>
                </div>
                <div style={{ gridColumn: "1/-1" }}>
                  <Field label="Notes">
                    <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} />
                  </Field>
                </div>
              </div>
            ) : contact ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                {[
                  ["Email",       contact.email],
                  ["Mobile",      contact.mobile],
                  ["WhatsApp",    contact.whatsapp_number],
                  ["City",        contact.city],
                  ["State",       contact.state],
                  ["Country",     contact.country],
                  ["Source",      contact.source],
                  ["Last Contacted", contact.last_contacted ? new Date(contact.last_contacted).toLocaleDateString("en-IN") : null],
                ].filter(([,v]) => v).map(([k, v]) => (
                  <div key={String(k)}>
                    <div style={{ fontSize: "0.68rem", color: "#444", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>{k}</div>
                    <div style={{ fontSize: "0.85rem", color: "#fff" }}>{v}</div>
                  </div>
                ))}
                {contact.notes && (
                  <div style={{ gridColumn: "1/-1" }}>
                    <div style={{ fontSize: "0.68rem", color: "#444", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>Notes</div>
                    <div style={{ fontSize: "0.82rem", color: "#888", whiteSpace: "pre-wrap" }}>{contact.notes}</div>
                  </div>
                )}
                {(contact.tags ?? []).length > 0 && (
                  <div style={{ gridColumn: "1/-1", display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {contact.tags.map(t => <span key={t} style={{ fontSize: "0.72rem", padding: "2px 8px", borderRadius: 100, background: "rgba(255,255,255,0.06)", color: "#888" }}>{t}</span>)}
                  </div>
                )}
              </div>
            ) : null}
          </Card>

          {/* Consent */}
          <Card style={{ padding: "1.25rem" }}>
            <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Consent & Status</div>
            {editing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { key: "email_consent",    label: "Email consent granted" },
                  { key: "whatsapp_consent", label: "WhatsApp consent granted" },
                  { key: "sms_consent",      label: "SMS consent granted" },
                  { key: "is_active",        label: "Active contact" },
                  { key: "do_not_contact",   label: "Do Not Contact (blocks all outreach)" },
                ].map(({ key, label }) => (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.82rem", color: key === "do_not_contact" ? "#f87171" : "#888" }}>
                    <input type="checkbox" checked={Boolean(form[key as keyof typeof form])} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} />
                    {label}
                  </label>
                ))}
              </div>
            ) : contact ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {contact.email_consent    && <Badge color="blue"   size="sm">📧 Email Consent</Badge>}
                {contact.whatsapp_consent && <Badge color="green"  size="sm">💬 WhatsApp Consent</Badge>}
                {contact.sms_consent      && <Badge color="purple" size="sm">📱 SMS Consent</Badge>}
                {contact.do_not_contact   && <Badge color="red"    size="sm">🚫 Do Not Contact</Badge>}
                {!contact.is_active       && <Badge color="gray"   size="sm">Inactive</Badge>}
                {contact.unsubscribed_at  && <Badge color="red"    size="sm">Unsubscribed</Badge>}
                {contact.is_active && !contact.do_not_contact && !contact.email_consent && !contact.whatsapp_consent && (
                  <span style={{ fontSize: "0.78rem", color: "#555" }}>No consent on file</span>
                )}
              </div>
            ) : null}
          </Card>

          {editing && (
            <div style={{ display: "flex", gap: 8 }}>
              {!isNew && <Button variant="ghost" size="sm" onClick={() => { setEditing(false); load(); }}>Cancel</Button>}
              <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : isNew ? "Create Contact" : "Save Changes"}
              </Button>
            </div>
          )}

          {/* Activity */}
          {!isNew && activity.length > 0 && (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: "0.78rem", fontWeight: 700, color: "#fff" }}>Activity</div>
              {activity.map(a => (
                <div key={a.id} style={{ padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
                  <div>
                    <span style={{ color: "#fff", fontWeight: 600 }}>{a.activity_type.replace(/_/g, " ")}</span>
                    {a.subject && <span style={{ color: "#555", marginLeft: 8 }}>{a.subject}</span>}
                  </div>
                  <span style={{ color: "#333" }}>{new Date(a.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                </div>
              ))}
            </Card>
          )}
        </div>

        {/* Sidebar (view mode) */}
        {!editing && contact && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Send Email */}
            {contact.email && !contact.do_not_contact && (
              <Card style={{ padding: "1rem" }}>
                <Button variant="primary" size="sm" style={{ width: "100%" }} onClick={() => setShowEmail(true)}>
                  📧 Send Email
                </Button>
                {!contact.email_consent && (
                  <div style={{ fontSize: "0.68rem", color: "#f59e0b", marginTop: 6, lineHeight: 1.4 }}>
                    ⚠ No email consent on file
                  </div>
                )}
              </Card>
            )}

            <Card style={{ padding: "1rem" }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Lists</div>
              {lists.length === 0
                ? <div style={{ fontSize: "0.78rem", color: "#333" }}>Not in any list</div>
                : lists.map((l: { id: string; name: string; color: string }) => (
                    <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: l.color ?? "#6b7280", flexShrink: 0 }} />
                      <Link href={`/admin/contact-lists/${l.id}`} style={{ fontSize: "0.78rem", color: "#888", textDecoration: "none" }}>{l.name}</Link>
                    </div>
                  ))
              }
              <Link href="/admin/contact-lists" style={{ fontSize: "0.7rem", color: "#444", textDecoration: "none", display: "block", marginTop: 8 }}>Manage lists →</Link>
            </Card>

            <Card style={{ padding: "1rem" }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Meta</div>
              {[
                ["Created",      new Date(contact.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })],
                ["Last Updated", new Date(contact.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })],
                ["Consent Date", contact.consent_date ? new Date(contact.consent_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={String(k)} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "0.72rem", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ color: "#444" }}>{k}</span>
                  <span style={{ color: "#666" }}>{v}</span>
                </div>
              ))}
            </Card>
          </div>
        )}
      </div>
    </div>

    {showEmail && contact && (
      <SendEmailModal
        contactId={contact.id}
        contactName={contact.full_name}
        email={contact.email!}
        onClose={() => setShowEmail(false)}
        onSent={() => { setShowEmail(false); setAlert({ type: "success", msg: "Email sent!" }); load(); }}
      />
    )}
  );
}

// ── Send Email Modal ───────────────────────────────────────────────────────────

function SendEmailModal({
  contactId, contactName, email, onClose, onSent,
}: { contactId: string; contactName: string; email: string; onClose: () => void; onSent: () => void }) {
  const [subject, setSubject] = useState("");
  const [body,    setBody]    = useState("");
  const [sending, setSending] = useState(false);
  const [error,   setError]   = useState("");

  async function send() {
    if (!subject.trim()) { setError("Subject is required"); return; }
    if (!body.trim())    { setError("Message is required"); return; }
    setSending(true); setError("");
    const res = await fetch(`/api/admin/external-contacts/${contactId}/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body }),
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) { setError(data.error ?? "Send failed"); return; }
    onSent();
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 520, background: "#111", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 24 }}>
        <div style={{ fontWeight: 800, fontSize: "1rem", color: "#fff", marginBottom: 4 }}>📧 Send Email</div>
        <div style={{ fontSize: "0.78rem", color: "#555", marginBottom: 16 }}>To: {contactName} &lt;{email}&gt;</div>

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
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={send} disabled={sending}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
