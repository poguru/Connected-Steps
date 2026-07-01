"use client";

import { useState, useEffect } from "react";
import { Card, Button, Input, Label, Alert, Badge, Modal, EmptyState, Spinner } from "@/components/ui/ds";

interface Location {
  id: string; name: string; area: string | null; city: string; state: string;
  meeting_point: string | null; maps_url: string | null; status: string;
  display_order: number; member_count: number;
}

const S: Record<string, React.CSSProperties> = {
  input: { width:"100%", padding:"9px 12px", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:6, color:"#fff", fontSize:"0.85rem", outline:"none", fontFamily:"inherit", boxSizing:"border-box" as const },
};

const BLANK = { name:"", area:"", city:"Hyderabad", state:"Telangana", meeting_point:"", maps_url:"", display_order:0 };

function MigrateButton() {
  const [running, setRunning] = useState(false);
  const [result,  setResult]  = useState("");

  async function run() {
    if (!confirm("Auto-assign existing users to training locations based on their text location field? This is safe to run multiple times.")) return;
    setRunning(true); setResult("");
    const res  = await fetch("/api/admin/training-locations/migrate-users", { method:"POST" });
    const data = await res.json();
    setResult(res.ok ? `✅ ${data.message}` : `❌ ${data.error}`);
    setRunning(false);
  }

  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
      {result && <Badge color={result.startsWith("✅") ? "green" : "red"} size="sm">{result}</Badge>}
      <Button size="sm" variant="secondary" loading={running} onClick={run}>⚡ Auto-assign Existing Users</Button>
    </div>
  );
}

export default function AdminTrainingLocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [modal,     setModal]     = useState(false);
  const [editing,   setEditing]   = useState<Location | null>(null);
  const [form,      setForm]      = useState(BLANK);
  const [saving,    setSaving]    = useState(false);
  const [saveErr,   setSaveErr]   = useState("");
  const [membersModal,  setMembersModal]  = useState<Location | null>(null);
  const [members,       setMembers]       = useState<{ user_email:string; name:string; phone:string|null; is_primary:boolean }[]>([]);
  const [assignEmail,   setAssignEmail]   = useState("");
  const [assigning,     setAssigning]     = useState(false);

  async function load() {
    setLoading(true);
    const res  = await fetch("/api/admin/training-locations");
    const data = await res.json();
    if (res.ok) setLocations(data.locations ?? []);
    else setError(data.error ?? "Failed");
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openCreate() { setEditing(null); setForm(BLANK); setSaveErr(""); setModal(true); }
  function openEdit(loc: Location) { setEditing(loc); setForm({ name:loc.name, area:loc.area??"", city:loc.city, state:loc.state, meeting_point:loc.meeting_point??"", maps_url:loc.maps_url??"", display_order:loc.display_order }); setSaveErr(""); setModal(true); }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaveErr(""); setSaving(true);
    const url    = editing ? `/api/admin/training-locations/${editing.id}` : "/api/admin/training-locations";
    const method = editing ? "PATCH" : "POST";
    const res    = await fetch(url, { method, headers: { "Content-Type":"application/json" }, body: JSON.stringify(form) });
    const data   = await res.json();
    if (res.ok) { setModal(false); load(); }
    else setSaveErr(data.error ?? "Failed");
    setSaving(false);
  }

  async function toggleStatus(loc: Location) {
    const newStatus = loc.status === "active" ? "inactive" : "active";
    await fetch(`/api/admin/training-locations/${loc.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ status:newStatus }) });
    load();
  }

  async function deleteLocation(loc: Location) {
    if (!confirm(`Delete "${loc.name}"? Only possible if no members are assigned.`)) return;
    const res  = await fetch(`/api/admin/training-locations/${loc.id}`, { method:"DELETE" });
    const data = await res.json();
    if (!res.ok) alert(data.error);
    else load();
  }

  async function openMembers(loc: Location) {
    setMembersModal(loc); setAssignEmail("");
    const res  = await fetch(`/api/admin/training-locations/${loc.id}/members`);
    const data = await res.json();
    setMembers(data.members ?? []);
  }

  async function assignMember() {
    if (!membersModal || !assignEmail.trim()) return;
    setAssigning(true);
    const res  = await fetch(`/api/admin/training-locations/${membersModal.id}/members`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ user_email:assignEmail.trim() }) });
    const data = await res.json();
    if (res.ok) { setAssignEmail(""); openMembers(membersModal); load(); }
    else alert(data.error);
    setAssigning(false);
  }

  async function removeMember(email: string) {
    if (!membersModal || !confirm(`Remove ${email} from ${membersModal.name}?`)) return;
    await fetch(`/api/admin/training-locations/${membersModal.id}/members`, { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ user_email:email }) });
    openMembers(membersModal); load();
  }

  return (
    <div style={{ minHeight:"100vh", background:"#0a0a0a", color:"#fff" }}>
      <header style={{ position:"sticky", top:0, zIndex:40, background:"rgba(10,10,10,0.97)", borderBottom:"1px solid rgba(255,255,255,0.07)", padding:"0 2rem", height:60, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ fontWeight:700, fontSize:"0.95rem" }}>Training Locations</span>
        <div style={{ display:"flex", gap:8 }}>
          <MigrateButton />
          <Button size="sm" onClick={openCreate}>+ New Location</Button>
        </div>
      </header>

      <div style={{ maxWidth:960, margin:"0 auto", padding:"2rem 1.5rem" }}>
        {error && <Alert variant="error" style={{ marginBottom:"1rem" }}>{error}</Alert>}
        {loading ? (
          <div style={{ textAlign:"center", padding:"4rem" }}><Spinner /></div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:"0.875rem" }}>
            {locations.map(loc => (
              <Card key={loc.id} style={{ opacity: loc.status==="inactive" ? 0.5 : 1 }}>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap" as const, gap:12 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
                      <span style={{ fontSize:15, fontWeight:800, color:"#fff" }}>{loc.name}</span>
                      <Badge color={loc.status==="active" ? "green" : "gray"} size="sm">{loc.status.toUpperCase()}</Badge>
                    </div>
                    {loc.area && <div style={{ fontSize:12, color:"#666" }}>📍 {loc.area}, {loc.city}</div>}
                    {loc.meeting_point && <div style={{ fontSize:12, color:"#888", marginTop:2 }}>🏁 {loc.meeting_point}</div>}
                    <div style={{ fontSize:12, color:"#e8620a", marginTop:4, fontWeight:600 }}>{loc.member_count} members</div>
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" as const, alignItems:"center" }}>
                    <Button size="sm" variant="secondary" onClick={() => openMembers(loc)}>👥 Members</Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(loc)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleStatus(loc)}>{loc.status==="active" ? "Disable" : "Enable"}</Button>
                    {loc.member_count === 0 && <Button size="sm" variant="danger" onClick={() => deleteLocation(loc)}>Delete</Button>}
                  </div>
                </div>
              </Card>
            ))}
            {locations.length === 0 && <EmptyState title="No training locations yet." body="Create one to get started." />}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? "Edit Location" : "New Training Location"} maxWidth={480}
        footer={
          <div style={{ display:"flex", gap:10 }}>
            <Button variant="secondary" fullWidth onClick={() => setModal(false)}>Cancel</Button>
            <Button fullWidth loading={saving} onClick={save as unknown as React.MouseEventHandler}>{editing ? "Save Changes" : "Create"}</Button>
          </div>
        }>
        <form onSubmit={save} style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {[
            { label:"Location Name *", key:"name", placeholder:"e.g. Kondapur" },
            { label:"Area / Neighbourhood", key:"area", placeholder:"e.g. Kondapur, Miyapur" },
            { label:"City", key:"city", placeholder:"Hyderabad" },
            { label:"Meeting Point", key:"meeting_point", placeholder:"e.g. Botanical Garden Gate-1" },
            { label:"Google Maps URL", key:"maps_url", placeholder:"https://maps.google.com/..." },
          ].map(f => (
            <div key={f.key}>
              <Label>{f.label}</Label>
              <input style={S.input} placeholder={f.placeholder} value={(form as Record<string,string|number>)[f.key] as string} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} required={f.key==="name"} />
            </div>
          ))}
          {saveErr && <Alert variant="error">{saveErr}</Alert>}
        </form>
      </Modal>

      {/* Members Modal */}
      <Modal open={!!membersModal} onClose={() => setMembersModal(null)} title={`👥 ${membersModal?.name ?? ""} Members`} maxWidth={520}>
        <div style={{ display:"flex", gap:8, marginBottom:"1rem" }}>
          <input style={{ ...S.input, flex:1 }} placeholder="User email to assign…" value={assignEmail} onChange={e => setAssignEmail(e.target.value)} />
          <Button loading={assigning} disabled={!assignEmail.trim()} onClick={assignMember}>Assign</Button>
        </div>
        <div style={{ maxHeight:"50vh", overflowY:"auto" }}>
          {members.length === 0 ? (
            <EmptyState title="No members assigned yet." />
          ) : members.map(m => (
            <div key={m.user_email} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:"#fff" }}>{m.name}</div>
                <div style={{ fontSize:11, color:"#555" }}>{m.user_email}</div>
              </div>
              <Button size="xs" variant="danger" onClick={() => removeMember(m.user_email)}>Remove</Button>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
