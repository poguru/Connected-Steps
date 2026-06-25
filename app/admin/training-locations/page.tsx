"use client";

import { useState, useEffect } from "react";

interface Location {
  id: string; name: string; area: string | null; city: string; state: string;
  meeting_point: string | null; maps_url: string | null; status: string;
  display_order: number; member_count: number;
}

const S: Record<string, React.CSSProperties> = {
  card:  { background:"#111", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:"1.25rem" },
  input: { width:"100%", padding:"9px 12px", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:6, color:"#fff", fontSize:"0.85rem", outline:"none", fontFamily:"inherit", boxSizing:"border-box" as const },
};

function btnStyle(primary = true): React.CSSProperties {
  return { padding:"9px 18px", background:primary?"#e8620a":"rgba(255,255,255,0.06)", border:"none", borderRadius:6, color:primary?"#fff":"#aaa", fontWeight:600, fontSize:"0.82rem", cursor:"pointer", fontFamily:"inherit" };
}

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
      {result && <span style={{ fontSize:"0.72rem", color: result.startsWith("✅") ? "#4ade80" : "#f87171" }}>{result}</span>}
      <button onClick={run} disabled={running} style={{ ...btnStyle(false), fontSize:"0.78rem" }}>
        {running ? "Migrating…" : "⚡ Auto-assign Existing Users"}
      </button>
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
          <button onClick={openCreate} style={btnStyle()}>+ New Location</button>
        </div>
      </header>

      <div style={{ maxWidth:960, margin:"0 auto", padding:"2rem 1.5rem" }}>
        {error && <div style={{ color:"#f87171", marginBottom:"1rem" }}>{error}</div>}
        {loading ? (
          <div style={{ textAlign:"center", padding:"4rem", color:"#555" }}>Loading…</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:"0.875rem" }}>
            {locations.map(loc => (
              <div key={loc.id} style={{ ...S.card, opacity: loc.status==="inactive" ? 0.5 : 1 }}>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
                      <span style={{ fontSize:15, fontWeight:800, color:"#fff" }}>{loc.name}</span>
                      <span style={{ fontSize:10, fontWeight:700, color:loc.status==="active"?"#4ade80":"#888", background:loc.status==="active"?"rgba(74,222,128,0.1)":"rgba(255,255,255,0.05)", padding:"2px 8px", borderRadius:999 }}>
                        {loc.status.toUpperCase()}
                      </span>
                    </div>
                    {loc.area && <div style={{ fontSize:12, color:"#666" }}>📍 {loc.area}, {loc.city}</div>}
                    {loc.meeting_point && <div style={{ fontSize:12, color:"#888", marginTop:2 }}>🏁 {loc.meeting_point}</div>}
                    <div style={{ fontSize:12, color:"#e8620a", marginTop:4, fontWeight:600 }}>{loc.member_count} members</div>
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                    <button onClick={() => openMembers(loc)} style={{ ...btnStyle(false), fontSize:"0.75rem" }}>👥 Members</button>
                    <button onClick={() => openEdit(loc)}   style={{ ...btnStyle(false), fontSize:"0.75rem" }}>Edit</button>
                    <button onClick={() => toggleStatus(loc)} style={{ ...btnStyle(false), fontSize:"0.75rem" }}>
                      {loc.status==="active" ? "Disable" : "Enable"}
                    </button>
                    {loc.member_count === 0 && (
                      <button onClick={() => deleteLocation(loc)} style={{ padding:"7px 12px", background:"transparent", border:"1px solid rgba(239,68,68,0.3)", borderRadius:6, color:"#f87171", cursor:"pointer", fontSize:"0.75rem", fontFamily:"inherit" }}>Delete</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {locations.length === 0 && <div style={{ textAlign:"center", padding:"4rem", color:"#555" }}>No training locations yet. Create one to get started.</div>}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:"1rem" }}>
          <div style={{ background:"#111", border:"1px solid rgba(255,255,255,0.1)", borderRadius:14, padding:"2rem", width:"100%", maxWidth:480 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"1.25rem" }}>
              <div style={{ fontSize:16, fontWeight:700 }}>{editing ? "Edit Location" : "New Training Location"}</div>
              <button onClick={() => setModal(false)} style={{ background:"none", border:"none", color:"#555", fontSize:20, cursor:"pointer" }}>×</button>
            </div>
            <form onSubmit={save} style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {[
                { label:"Location Name *", key:"name", placeholder:"e.g. Kondapur" },
                { label:"Area / Neighbourhood", key:"area", placeholder:"e.g. Kondapur, Miyapur" },
                { label:"City", key:"city", placeholder:"Hyderabad" },
                { label:"Meeting Point", key:"meeting_point", placeholder:"e.g. Botanical Garden Gate-1" },
                { label:"Google Maps URL", key:"maps_url", placeholder:"https://maps.google.com/..." },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ display:"block", fontSize:11, color:"#555", marginBottom:5, textTransform:"uppercase", letterSpacing:".06em" }}>{f.label}</label>
                  <input style={S.input} placeholder={f.placeholder} value={(form as Record<string,string|number>)[f.key] as string} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} required={f.key==="name"} />
                </div>
              ))}
              {saveErr && <div style={{ color:"#f87171", fontSize:13 }}>{saveErr}</div>}
              <div style={{ display:"flex", gap:10, marginTop:4 }}>
                <button type="button" onClick={() => setModal(false)} style={{ ...btnStyle(false), flex:1 }}>Cancel</button>
                <button type="submit" disabled={saving} style={{ ...btnStyle(), flex:1 }}>{saving ? "Saving…" : editing ? "Save Changes" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Members Modal */}
      {membersModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:"1rem" }}>
          <div style={{ background:"#111", border:"1px solid rgba(255,255,255,0.1)", borderRadius:14, padding:"2rem", width:"100%", maxWidth:520, maxHeight:"85vh", display:"flex", flexDirection:"column" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"1rem" }}>
              <div style={{ fontSize:16, fontWeight:700 }}>👥 {membersModal.name} Members</div>
              <button onClick={() => setMembersModal(null)} style={{ background:"none", border:"none", color:"#555", fontSize:20, cursor:"pointer" }}>×</button>
            </div>
            <div style={{ display:"flex", gap:8, marginBottom:"1rem" }}>
              <input style={{ ...S.input, flex:1 }} placeholder="User email to assign…" value={assignEmail} onChange={e => setAssignEmail(e.target.value)} />
              <button onClick={assignMember} disabled={assigning || !assignEmail.trim()} style={btnStyle()}>{assigning ? "…" : "Assign"}</button>
            </div>
            <div style={{ flex:1, overflowY:"auto" }}>
              {members.length === 0 ? (
                <div style={{ textAlign:"center", padding:"2rem", color:"#555" }}>No members assigned yet.</div>
              ) : members.map(m => (
                <div key={m.user_email} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:"#fff" }}>{m.name}</div>
                    <div style={{ fontSize:11, color:"#555" }}>{m.user_email}</div>
                  </div>
                  <button onClick={() => removeMember(m.user_email)} style={{ background:"none", border:"1px solid rgba(239,68,68,0.3)", borderRadius:5, color:"#f87171", cursor:"pointer", fontSize:"0.72rem", padding:"3px 10px", fontFamily:"inherit" }}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
