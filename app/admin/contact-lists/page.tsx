"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, Button, Spinner, Alert } from "@/components/ui/ds";

interface ContactList {
  id: string; name: string; description: string | null;
  category: string | null; color: string; is_active: boolean;
  member_count: number; created_at: string;
}

const inp: React.CSSProperties = {
  padding: "7px 11px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6, color: "#fff", fontSize: "0.82rem", outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box",
};

const CATEGORY_LABELS: Record<string, string> = {
  corporate: "Corporate", sponsors: "Sponsors", media: "Media",
  organizers: "Event Organizers", education: "Education", ngo: "NGO",
  vendor: "Vendor", client: "Client",
};

export default function ContactListsPage() {
  const [lists,   setLists]   = useState<ContactList[]>([]);
  const [loading, setLoading] = useState(true);
  const [alert,   setAlert]   = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCat,  setNewCat]  = useState("");
  const [newColor,setNewColor]= useState("#6b7280");
  const [saving,  setSaving]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/contact-lists");
    const d   = await res.json();
    setLists(d.lists ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createList() {
    if (!newName.trim()) return;
    setSaving(true);
    const res  = await fetch("/api/admin/contact-lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName, description: newDesc, category: newCat, color: newColor }) });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setAlert({ type: "error", msg: data.error ?? "Failed" }); return; }
    setShowNew(false); setNewName(""); setNewDesc(""); setNewCat(""); setNewColor("#6b7280");
    setAlert({ type: "success", msg: "List created" });
    load();
  }

  async function deleteList(id: string, name: string) {
    if (!confirm(`Delete list "${name}"? Members will not be deleted.`)) return;
    const res = await fetch(`/api/admin/contact-lists/${id}`, { method: "DELETE" });
    if (!res.ok) { setAlert({ type: "error", msg: "Delete failed" }); return; }
    setAlert({ type: "success", msg: "List deleted" });
    load();
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1000, margin: "0 auto" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#fff" }}>📋 Contact Lists</h1>
          <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#555" }}>Group external contacts into reusable lists for campaigns</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowNew(true)}>+ New List</Button>
      </div>

      {alert && <Alert variant={alert.type === "success" ? "success" : "error"} style={{ marginBottom: 14 }}>{alert.msg}</Alert>}

      {/* New list form */}
      {showNew && (
        <Card style={{ padding: "1.25rem", marginBottom: 16 }}>
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#fff", marginBottom: 12 }}>New Contact List</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.7rem", color: "#555", textTransform: "uppercase", marginBottom: 4 }}>List Name *</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Corporate HR" style={inp} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.7rem", color: "#555", textTransform: "uppercase", marginBottom: 4 }}>Category</label>
              <select value={newCat} onChange={e => setNewCat(e.target.value)} style={inp}>
                <option value="">No category</option>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.7rem", color: "#555", textTransform: "uppercase", marginBottom: 4 }}>Color</label>
              <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} style={{ ...inp, height: 36, padding: 2, cursor: "pointer" }} />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Button variant="ghost" size="sm" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={createList} disabled={!newName.trim() || saving}>
                {saving ? "…" : "Create"}
              </Button>
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <label style={{ display: "block", fontSize: "0.7rem", color: "#555", textTransform: "uppercase", marginBottom: 4 }}>Description</label>
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Optional description" style={inp} />
          </div>
        </Card>
      )}

      {loading ? (
        <div style={{ padding: "3rem", textAlign: "center" }}><Spinner /></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {lists.map(l => (
            <Card key={l.id} style={{ padding: "1rem 1.25rem", borderTop: `3px solid ${l.color}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link href={`/admin/contact-lists/${l.id}`} style={{ fontWeight: 700, fontSize: "0.95rem", color: "#fff", textDecoration: "none", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {l.name}
                  </Link>
                  {l.category && <div style={{ fontSize: "0.68rem", color: "#555", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.07em" }}>{CATEGORY_LABELS[l.category] ?? l.category}</div>}
                  {l.description && <div style={{ fontSize: "0.75rem", color: "#666", marginTop: 4, lineHeight: 1.5 }}>{l.description}</div>}
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0, marginLeft: 8 }}>
                  <Link href={`/admin/contact-lists/${l.id}`}>
                    <Button size="sm" variant="ghost">View</Button>
                  </Link>
                  <button onClick={() => deleteList(l.id, l.name)}
                    style={{ padding: "4px 7px", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 5, color: "#f87171", cursor: "pointer", fontSize: "0.72rem", fontFamily: "inherit" }}>
                    🗑
                  </button>
                </div>
              </div>
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: "1.4rem", fontWeight: 800, color: l.color, fontVariantNumeric: "tabular-nums" }}>{l.member_count}</div>
                <div style={{ fontSize: "0.68rem", color: "#444", textTransform: "uppercase" }}>members</div>
              </div>
            </Card>
          ))}
          {lists.length === 0 && (
            <div style={{ gridColumn: "1/-1", padding: "3rem", textAlign: "center", color: "#333", fontSize: "0.9rem" }}>
              No lists yet. <button onClick={() => setShowNew(true)} style={{ background: "none", border: "none", color: "#e8620a", cursor: "pointer", fontFamily: "inherit", fontSize: "0.9rem" }}>Create one →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
