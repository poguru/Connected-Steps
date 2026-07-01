"use client";

import { useState, useEffect } from "react";
import { Card, Button, Input, Label, Alert, Badge, Avatar, Modal, EmptyState, Spinner } from "@/components/ui/ds";

interface Coach {
  id:             string;
  name:           string;
  email:          string;
  specialization: string | null;
  is_active:      boolean;
  is_admin:       boolean;
  has_login:      boolean;
  created_at:     string;
}

export default function AdminCoachesPage() {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const [modal,   setModal]   = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [saveOk,  setSaveOk]  = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", password: "", specialization: "", phone: "",
  });

  async function load() {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/admin/coaches");
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Failed to load"); return; }
      setCoaches(d.coaches ?? []);
    } catch { setError("Network error."); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function openModal() {
    setForm({ name: "", email: "", password: "", specialization: "", phone: "" });
    setSaveErr(""); setSaveOk(false);
    setModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveErr(""); setSaveOk(false); setSaving(true);
    try {
      const r = await fetch("/api/admin/coaches", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) { setSaveErr(d.error ?? "Failed"); return; }
      setSaveOk(true);
      await load();
      setTimeout(() => setModal(false), 1200);
    } catch { setSaveErr("Network error."); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ padding: "2rem 1.5rem", maxWidth: 900, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#fff", margin: 0 }}>Coaches</h1>
          <p style={{ fontSize: 12, color: "#555", margin: "4px 0 0" }}>Manage coach portal logins and profiles</p>
        </div>
        <Button onClick={openModal}>+ Create Coach Login</Button>
      </div>

      {error && <Alert variant="error" style={{ marginBottom: "1rem" }}>{error}</Alert>}

      {/* List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem" }}><Spinner /></div>
      ) : coaches.length === 0 ? (
        <EmptyState title="No coaches yet." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {coaches.map(c => (
            <Card key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" as const }}>
              <Avatar name={c.name} size={36} />
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#f0f0f0" }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "#555" }}>{c.email}</div>
                {c.specialization && <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>{c.specialization}</div>}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                {c.is_admin   && <Badge color="orange" size="sm">ADMIN</Badge>}
                {c.is_active
                  ? <Badge color="green" size="sm">ACTIVE</Badge>
                  : <Badge color="red"   size="sm">INACTIVE</Badge>
                }
                {c.has_login
                  ? <Badge color="blue" size="sm">HAS LOGIN</Badge>
                  : <Badge color="gray" size="sm">NO LOGIN</Badge>
                }
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Coach Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="Create Coach Login" maxWidth={440}
        footer={
          <div style={{ display: "flex", gap: 10 }}>
            <Button variant="secondary" fullWidth onClick={() => setModal(false)}>Cancel</Button>
            <Button fullWidth loading={saving} onClick={(e) => handleSave(e as unknown as React.FormEvent)}>Create Login</Button>
          </div>
        }>
        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div><Label>Full Name *</Label><Input required placeholder="e.g. Ashokan K" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div><Label>Email *</Label><Input required type="email" placeholder="coach@connectedsteps.in" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div><Label>Password * <span style={{ color: "#444", fontWeight: 400 }}>(min 8 chars)</span></Label><Input required type="password" placeholder="Set their login password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
          <div><Label>Specialization</Label><Input placeholder="e.g. Marathon Coach" value={form.specialization} onChange={e => setForm(f => ({ ...f, specialization: e.target.value }))} /></div>
          <div><Label>Phone</Label><Input placeholder="10-digit mobile number" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>

          {saveErr && <Alert variant="error">{saveErr}</Alert>}
          {saveOk  && <Alert variant="success">Coach login created! They can now sign in at /coach/login</Alert>}

          <p style={{ fontSize: 11, color: "#444", margin: 0, textAlign: "center" }}>
            Coach can log in at <strong style={{ color: "#666" }}>/coach/login</strong>
          </p>
        </form>
      </Modal>
    </div>
  );
}
