"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import SessionShareSheet from "@/components/ui/SessionShareSheet";

interface Session { id: string; title: string; date: string; time: string; location: string; venue: string; photo_url?: string | null; }
interface Attendee {
  email: string; name: string; location: string;
  attended: boolean; bonus_points: number; bonus_reason: string; points_synced: boolean;
}

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px",
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "6px", color: "#fff", fontSize: "0.825rem", outline: "none", boxSizing: "border-box",
};
const label: React.CSSProperties = {
  display: "block", fontSize: "10px", color: "#888",
  letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "5px",
};
const btn = (accent = false): React.CSSProperties => ({
  padding: "9px 20px", borderRadius: "6px", border: "none", cursor: "pointer",
  fontSize: "0.8rem", fontWeight: 700,
  background: accent ? "#e8620a" : "rgba(255,255,255,0.08)", color: "#fff",
});

export default function AdminSessionsPage() {
  const [password,   setPassword]   = useState("");
  const [authed,     setAuthed]     = useState(true);
  const [authErr,    setAuthErr]    = useState("");
  const [authLoad,   setAuthLoad]   = useState(false);

  const [sessions,   setSessions]   = useState<Session[]>([]);
  const [selected,   setSelected]   = useState<Session | null>(null);
  const [attendees,  setAttendees]  = useState<Attendee[]>([]);
  const [sessionLoad, setSessionLoad] = useState(false);
  const [attendLoad,  setAttendLoad]  = useState(false);
  const [saveMsg,     setSaveMsg]     = useState("");
  const [saving,      setSaving]      = useState(false);
  const [lastSavedAt,   setLastSavedAt]   = useState<string | null>(null);
  const [photoFile,     setPhotoFile]     = useState<File | null>(null);
  const [photoUploading,setPhotoUploading]= useState(false);
  const [photoMsg,      setPhotoMsg]      = useState("");

  // New session form
  const [newTitle,    setNewTitle]    = useState("");
  const [newDate,     setNewDate]     = useState("");
  const [newTime,     setNewTime]     = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newVenue,    setNewVenue]    = useState("");
  const [creating,    setCreating]    = useState(false);

  // Edit session
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editFields,  setEditFields]  = useState({ title: "", date: "", time: "", location: "", venue: "" });
  const [editSaving,  setEditSaving]  = useState(false);
  const [editMsg,     setEditMsg]     = useState("");

  // Reschedule session
  const [reschedulingId,    setReschedulingId]    = useState<string | null>(null);
  const [rescheduleFields,  setRescheduleFields]  = useState({ date: "", time: "" });
  const [rescheduleSaving,  setRescheduleSaving]  = useState(false);
  const [rescheduleMsg,     setRescheduleMsg]     = useState("");

  // Delete session
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting,        setDeleting]        = useState(false);

  // Add user to session
  const [addEmail,    setAddEmail]    = useState("");
  const [addMsg,      setAddMsg]      = useState("");
  const [adding,      setAdding]      = useState(false);

  const headers = { "Content-Type": "application/json" };

  /* ── Auth ── */
  const login = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setAuthLoad(true); setAuthErr("");
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) { setAuthErr("Incorrect password."); return; }
      setAuthed(true);
    } catch { setAuthErr("Network error."); }
    finally  { setAuthLoad(false); }
  };

  useEffect(() => {
    fetch("/api/admin/auth")
      .then(r => { if (r.ok) setAuthed(true); })
      .catch(() => {});
  }, []); // eslint-disable-line

  useEffect(() => { if (authed) loadSessions(); }, [authed]); // eslint-disable-line

  /* ── Load sessions ── */
  const loadSessions = useCallback(async () => {
    const res  = await fetch("/api/admin/sessions", { headers });
    const json = await res.json();
    setSessions(json.data ?? []);
  }, []);

  /* ── Create session ── */
  const createSession = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setCreating(true);
    const res  = await fetch("/api/admin/sessions", { method: "POST", headers, body: JSON.stringify({ title: newTitle, date: newDate, time: newTime, location: newLocation, venue: newVenue }) });
    const json = await res.json();
    if (res.ok) {
      setNewTitle(""); setNewDate(""); setNewTime(""); setNewLocation(""); setNewVenue("");
      await loadSessions();
    } else {
      alert(json.error);
    }
    setCreating(false);
  };

  /* ── Edit session ── */
  const startEdit = (s: Session) => {
    setEditingId(s.id);
    setEditFields({ title: s.title, date: s.date, time: s.time ?? "", location: s.location, venue: s.venue ?? "" });
    setEditMsg("");
  };

  const saveEdit = async (id: string) => {
    setEditSaving(true); setEditMsg("");
    const res  = await fetch(`/api/admin/sessions/${id}`, {
      method: "PATCH", headers,
      body: JSON.stringify(editFields),
    });
    const json = await res.json();
    if (res.ok) {
      setEditMsg("Saved!");
      await loadSessions();
      if (selected?.id === id) setSelected((prev) => prev ? { ...prev, ...editFields } : prev);
      setTimeout(() => { setEditingId(null); setEditMsg(""); }, 800);
    } else {
      setEditMsg(json.error ?? "Save failed.");
    }
    setEditSaving(false);
  };

  /* ── Reschedule session ── */
  const startReschedule = (s: Session) => {
    setReschedulingId(s.id);
    setRescheduleFields({ date: s.date, time: s.time ?? "" });
    setRescheduleMsg("");
    setEditingId(null);
    setDeleteConfirmId(null);
  };

  const saveReschedule = async (s: Session) => {
    setRescheduleSaving(true); setRescheduleMsg("");
    const res  = await fetch(`/api/admin/sessions/${s.id}`, {
      method: "PATCH", headers,
      body: JSON.stringify({ title: s.title, date: rescheduleFields.date, time: rescheduleFields.time, location: s.location, venue: s.venue }),
    });
    const json = await res.json();
    if (res.ok) {
      setRescheduleMsg("Rescheduled!");
      await loadSessions();
      if (selected?.id === s.id) setSelected((prev) => prev ? { ...prev, ...rescheduleFields } : prev);
      setTimeout(() => { setReschedulingId(null); setRescheduleMsg(""); }, 800);
    } else {
      setRescheduleMsg(json.error ?? "Failed.");
    }
    setRescheduleSaving(false);
  };

  /* ── Delete session ── */
  const deleteSession = async (id: string) => {
    setDeleting(true);
    const res = await fetch(`/api/admin/sessions/${id}`, { method: "DELETE", headers });
    if (res.ok) {
      if (selected?.id === id) { setSelected(null); setAttendees([]); }
      await loadSessions();
      setDeleteConfirmId(null);
    } else {
      const json = await res.json();
      alert(json.error ?? "Delete failed.");
    }
    setDeleting(false);
  };

  /* ── Add user manually to session ── */
  const addUser = async () => {
    if (!selected || !addEmail.trim()) return;
    setAdding(true); setAddMsg("");
    const res  = await fetch(`/api/admin/sessions/${selected.id}/attendance`, {
      method: "PUT", headers,
      body: JSON.stringify({ email: addEmail.trim().toLowerCase() }),
    });
    const json = await res.json();
    if (res.ok) {
      setAddMsg(`✓ ${json.name} added`);
      setAddEmail("");
      await openSession(selected);
    } else {
      setAddMsg(json.error ?? "Failed to add user.");
    }
    setAdding(false);
  };

  /* ── Select session → load users ── */
  const openSession = async (s: Session) => {
    setSelected(s); setAttendees([]); setSaveMsg(""); setLastSavedAt(null);
    setSessionLoad(true);
    const res  = await fetch(`/api/admin/sessions/${s.id}/attendance`, { headers });
    const json = await res.json();
    setAttendees(json.users ?? []);
    setSessionLoad(false);
  };

  /* ── Toggle attendance ── */
  const toggleAttend = (email: string) =>
    setAttendees((prev) => prev.map((a) => a.email === email ? { ...a, attended: !a.attended } : a));

  const markAllPresent = () =>
    setAttendees((prev) => prev.map((a) => a.points_synced ? a : { ...a, attended: true }));

  const markAllAbsent = () =>
    setAttendees((prev) => prev.map((a) => a.points_synced ? a : { ...a, attended: false }));

  const setBonus = (email: string, pts: number) =>
    setAttendees((prev) => prev.map((a) => a.email === email ? { ...a, bonus_points: pts } : a));

  const setReason = (email: string, reason: string) =>
    setAttendees((prev) => prev.map((a) => a.email === email ? { ...a, bonus_reason: reason } : a));

  /* ── Save attendance + auto-update leaderboard ── */
  const saveAttendance = async () => {
    if (!selected) return;
    setSaving(true); setSaveMsg("");

    // Step 1: save attendance records
    const saveRes  = await fetch(`/api/admin/sessions/${selected.id}/attendance`, {
      method: "POST", headers,
      body: JSON.stringify({ users: attendees.map((a) => ({ email: a.email, name: a.name, attended: a.attended, bonus_points: a.bonus_points, bonus_reason: a.bonus_reason })) }),
    });
    const saveJson = await saveRes.json();

    if (!saveRes.ok) {
      setSaveMsg(`Error saving attendance: ${saveJson.error}`);
      setSaving(false);
      return;
    }

    // Step 2: recalculate leaderboard for this session's month
    const month = selected.date.slice(0, 7); // "YYYY-MM"
    const calcRes  = await fetch("/api/admin/leaderboard/recalculate", {
      method: "POST", headers,
      body: JSON.stringify({ month }),
    });
    const calcJson = await calcRes.json();

    const parts: string[] = [];
    if (saveJson.saved   > 0) parts.push(`${saveJson.saved} row${saveJson.saved !== 1 ? "s" : ""} saved`);
    if (saveJson.skipped > 0) parts.push(`${saveJson.skipped} skipped (already synced)`);
    if (calcRes.ok) parts.push(`leaderboard updated (${calcJson.updated ?? 0} users)`);
    else            parts.push(`leaderboard update failed: ${calcJson.error}`);

    setSaveMsg(parts.join(" · "));
    setLastSavedAt(new Date().toLocaleTimeString());

    // Reload attendance to reflect new synced status
    await openSession(selected);
    setSaving(false);
  };

  const uploadPhoto = async () => {
    if (!selected || !photoFile) return;
    setPhotoUploading(true); setPhotoMsg("");
    const form = new FormData();
    form.append("photo", photoFile);
    const res  = await fetch(`/api/admin/sessions/${selected.id}/photo`, { method: "POST", body: form });
    const json = await res.json();
    if (res.ok) {
      setPhotoMsg("Photo uploaded!");
      setPhotoFile(null);
      setSelected((prev) => prev ? { ...prev, photo_url: json.photo_url } : prev);
      await loadSessions();
    } else {
      setPhotoMsg(`Error: ${json.error}`);
    }
    setPhotoUploading(false);
  };

  // View More / Show Less state — no API calls, pure client-side slice
  const INITIAL_VISIBLE = 5;
  const PAGE_SIZE       = 5;
  const [visibleCount,  setVisibleCount]  = useState(INITIAL_VISIBLE);

  const [copiedId,    setCopiedId]    = useState<string | null>(null);
  const [shareSession, setShareSession] = useState<Session | null>(null);

  // QR modal state
  interface QRData { token: string; expires_at: string; data_url: string; scan_url: string; }
  const [qrSession,  setQrSession]  = useState<Session | null>(null);
  const [qrData,     setQrData]     = useState<QRData | null>(null);
  const [qrLoading,  setQrLoading]  = useState(false);
  const [qrMsg,      setQrMsg]      = useState("");

  const openQRModal = async (s: Session) => {
    setQrSession(s); setQrData(null); setQrMsg(""); setQrLoading(true);
    const res  = await fetch(`/api/admin/sessions/${s.id}/qr`, { headers });
    const json = await res.json();
    setQrData(json.qr ?? null);
    setQrLoading(false);
  };

  const generateQR = async () => {
    if (!qrSession) return;
    setQrLoading(true); setQrMsg("");
    const res  = await fetch(`/api/admin/sessions/${qrSession.id}/qr`, { method: "POST", headers });
    const json = await res.json();
    if (res.ok) { setQrData(json.qr); setQrMsg("New QR generated!"); }
    else         { setQrMsg(json.error ?? "Failed to generate QR"); }
    setQrLoading(false);
  };

  function copyJoinLink(sessionId: string) {
    const url = `${window.location.origin}/join/${sessionId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(sessionId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }


  const attendCount = attendees.filter((a) => a.attended).length;
  const syncedCount = attendees.filter((a) => a.points_synced).length;

  /* ── Password gate ── */
  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
        <div style={{ width: "100%", maxWidth: "380px" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none", marginBottom: "2.5rem", justifyContent: "center" }}>
            <Image src="/logo.png" alt="Connected Steps" width={36} height={36} className="rounded-full" />
            <span style={{ fontSize: "1.1rem", fontWeight: 600, color: "#fff" }}>Connected Steps</span>
          </Link>
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "2rem" }}>
            <div style={{ fontSize: "10px", color: "#e8620a", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem", fontWeight: 600 }}>Admin Access</div>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 300, color: "#fff", marginBottom: "1.75rem" }}>Training Sessions</h1>
            <form onSubmit={login}>
              <label style={label}>Password</label>
              <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setAuthErr(""); }}
                placeholder="Enter admin password" autoFocus style={{ ...inp, marginBottom: "1rem" }} />
              {authErr && <div style={{ background: "rgba(226,75,74,0.1)", border: "1px solid rgba(226,75,74,0.3)", borderRadius: "6px", padding: "9px 12px", marginBottom: "1rem", fontSize: "0.8rem", color: "#f09595" }}>{authErr}</div>}
              <button type="submit" disabled={authLoad} style={{ ...btn(true), width: "100%", padding: "12px" }}>
                {authLoad ? "Verifying…" : "Access Dashboard"}
              </button>
            </form>
          </div>
          <p style={{ textAlign: "center", marginTop: "1rem" }}>
            <Link href="/admin/runs" style={{ fontSize: "0.8rem", color: "#888", textDecoration: "none" }}>→ Run Registrations admin</Link>
          </p>
        </div>
      </div>
    );
  }

  /* ── Dashboard ── */
  return (
    <>
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 1.5rem", height: "56px", display: "flex", alignItems: "center", gap: "1rem" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}>
          <Image src="/logo.png" alt="" width={28} height={28} className="rounded-full" />
        </Link>
        <span style={{ color: "#444", fontSize: "0.8rem" }}>/</span>
        <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Training Sessions</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: "0.75rem" }}>
          <Link href="/admin/runs" style={{ fontSize: "0.75rem", color: "#888", textDecoration: "none", padding: "6px 14px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px" }}>Run Registrations</Link>
        </div>
      </header>

      <div className="admin-sessions-wrap">

        {/* Left — sessions list */}
        <div className="admin-sessions-left">

          {/* Create new session */}
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", padding: "1.25rem" }}>
            <div style={{ fontSize: "10px", color: "#e8620a", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: "1rem" }}>New Session</div>
            <form onSubmit={createSession} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div>
                <label style={label}>Title</label>
                <input style={inp} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Morning Run" required />
              </div>
              <div>
                <label style={label}>Date</label>
                <input style={inp} type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} required />
              </div>
              <div>
                <label style={label}>Time</label>
                <input style={inp} type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} required />
              </div>
              <div>
                <label style={label}>Location (area — used to filter users)</label>
                <input style={inp} value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="e.g. Kondapur" required />
              </div>
              <div>
                <label style={label}>Venue / Meeting Point (shown in alert)</label>
                <input style={inp} value={newVenue} onChange={(e) => setNewVenue(e.target.value)} placeholder="e.g. Botanical Garden, Kondapur" required />
              </div>
              <button type="submit" disabled={creating} style={{ ...btn(true), width: "100%" }}>
                {creating ? "Creating…" : "Create Session"}
              </button>
            </form>
          </div>

          {/* Sessions list — sorted: upcoming (nearest first) then completed (most recent first) */}
          {(() => {
            const today = new Date().toISOString().slice(0, 10);
            const upcoming  = sessions.filter(s => s.date >= today).sort((a, b) => a.date.localeCompare(b.date));
            const completed = sessions.filter(s => s.date <  today).sort((a, b) => b.date.localeCompare(a.date));
            const sortedSessions = [...upcoming, ...completed];
            const visibleSessions = sortedSessions.slice(0, visibleCount);
            const hasMore  = visibleCount < sortedSessions.length;
            const isExpanded = visibleCount > INITIAL_VISIBLE;

            return (
          <div>
            <div style={{ fontSize: "10px", color: "#888", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
              Sessions ({sessions.length})
              {upcoming.length > 0 && <span style={{ color: "#4ade80", marginLeft: 6 }}>· {upcoming.length} upcoming</span>}
            </div>
            {sessions.length === 0 ? (
              <div style={{ fontSize: "0.8rem", color: "#555" }}>No sessions yet.</div>
            ) : (
              <>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {visibleSessions.map((s) => (
                  <div key={s.id} style={{ borderRadius: "6px", border: "1px solid", borderColor: selected?.id === s.id ? "rgba(232,98,10,0.4)" : "rgba(255,255,255,0.07)", overflow: "hidden" }}>

                    {/* Session row */}
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <button onClick={() => { if (editingId !== s.id && reschedulingId !== s.id) openSession(s); }}
                        style={{ flex: 1, textAlign: "left", padding: "10px 12px", border: "none", cursor: "pointer", background: selected?.id === s.id ? "rgba(232,98,10,0.1)" : "transparent" }}>
                        <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#fff", marginBottom: "2px" }}>{s.title}</div>
                        <div style={{ fontSize: "0.72rem", color: "#888" }}>{s.date}{s.time ? ` ${s.time}` : ""} · {s.location}</div>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); editingId === s.id ? setEditingId(null) : startEdit(s); setReschedulingId(null); setDeleteConfirmId(null); }}
                        title="Edit" style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 5px", color: editingId === s.id ? "#e8620a" : "#555", fontSize: "0.8rem", flexShrink: 0 }}>✏️</button>
                      <button onClick={(e) => { e.stopPropagation(); reschedulingId === s.id ? setReschedulingId(null) : startReschedule(s); }}
                        title="Reschedule" style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 5px", color: reschedulingId === s.id ? "#e8620a" : "#555", fontSize: "0.8rem", flexShrink: 0 }}>📅</button>
                      <button onClick={(e) => { e.stopPropagation(); setShareSession(s); }}
                        title="Share session" style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 5px", color: "#e8620a", fontSize: "0.8rem", flexShrink: 0 }}>
                        ↗
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); openQRModal(s); }}
                        title="Attendance QR" style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 5px", color: "#60a5fa", fontSize: "0.8rem", flexShrink: 0 }}>
                        📱
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(deleteConfirmId === s.id ? null : s.id); setEditingId(null); setReschedulingId(null); }}
                        title="Delete" style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 6px", color: deleteConfirmId === s.id ? "#f09595" : "#555", fontSize: "0.8rem", flexShrink: 0 }}>🗑️</button>
                    </div>

                    {/* Inline edit form */}
                    {editingId === s.id && (
                      <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)", display: "flex", flexDirection: "column", gap: "6px" }}>
                        <input style={inp} value={editFields.title} onChange={(e) => setEditFields((p) => ({ ...p, title: e.target.value }))} placeholder="Title" />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                          <input style={inp} type="date" value={editFields.date} onChange={(e) => setEditFields((p) => ({ ...p, date: e.target.value }))} />
                          <input style={inp} type="time" value={editFields.time} onChange={(e) => setEditFields((p) => ({ ...p, time: e.target.value }))} />
                        </div>
                        <input style={inp} value={editFields.location} onChange={(e) => setEditFields((p) => ({ ...p, location: e.target.value }))} placeholder="Location" />
                        <input style={inp} value={editFields.venue} onChange={(e) => setEditFields((p) => ({ ...p, venue: e.target.value }))} placeholder="Venue" />
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <button onClick={() => saveEdit(s.id)} disabled={editSaving} style={{ ...btn(true), padding: "6px 16px", fontSize: "0.75rem" }}>
                            {editSaving ? "Saving…" : "Save"}
                          </button>
                          <button onClick={() => setEditingId(null)} style={{ ...btn(false), padding: "6px 12px", fontSize: "0.75rem" }}>Cancel</button>
                          {editMsg && <span style={{ fontSize: "0.72rem", color: editMsg === "Saved!" ? "#4ade80" : "#f09595" }}>{editMsg}</span>}
                        </div>
                      </div>
                    )}

                    {/* Inline reschedule form */}
                    {reschedulingId === s.id && (
                      <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)", display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ fontSize: "10px", color: "#888", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "2px" }}>Reschedule</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                          <input style={inp} type="date" value={rescheduleFields.date} onChange={(e) => setRescheduleFields((p) => ({ ...p, date: e.target.value }))} />
                          <input style={inp} type="time" value={rescheduleFields.time} onChange={(e) => setRescheduleFields((p) => ({ ...p, time: e.target.value }))} />
                        </div>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <button onClick={() => saveReschedule(s)} disabled={rescheduleSaving} style={{ ...btn(true), padding: "6px 16px", fontSize: "0.75rem" }}>
                            {rescheduleSaving ? "Saving…" : "Save"}
                          </button>
                          <button onClick={() => setReschedulingId(null)} style={{ ...btn(false), padding: "6px 12px", fontSize: "0.75rem" }}>Cancel</button>
                          {rescheduleMsg && <span style={{ fontSize: "0.72rem", color: rescheduleMsg === "Rescheduled!" ? "#4ade80" : "#f09595" }}>{rescheduleMsg}</span>}
                        </div>
                      </div>
                    )}

                    {/* Delete confirm */}
                    {deleteConfirmId === s.id && (
                      <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(226,75,74,0.2)", background: "rgba(226,75,74,0.05)", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.75rem", color: "#f09595", flex: 1 }}>Delete this session and all its attendance records?</span>
                        <button onClick={() => deleteSession(s.id)} disabled={deleting}
                          style={{ ...btn(false), padding: "5px 14px", fontSize: "0.75rem", background: "rgba(226,75,74,0.2)", color: "#f09595", flexShrink: 0 }}>
                          {deleting ? "Deleting…" : "Yes, delete"}
                        </button>
                        <button onClick={() => setDeleteConfirmId(null)} style={{ ...btn(false), padding: "5px 10px", fontSize: "0.75rem", flexShrink: 0 }}>Cancel</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* View More / Show Less button */}
              {(hasMore || isExpanded) && (
                <div style={{ marginTop: "0.75rem", textAlign: "center" }}>
                  {hasMore ? (
                    <button
                      onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                      style={{
                        background: "none",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "6px",
                        color: "#888",
                        cursor: "pointer",
                        fontSize: "0.78rem",
                        fontFamily: "inherit",
                        padding: "7px 20px",
                        transition: "border-color 0.15s, color 0.15s",
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(232,98,10,0.4)"; (e.currentTarget as HTMLButtonElement).style.color = "#e8620a"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.12)"; (e.currentTarget as HTMLButtonElement).style.color = "#888"; }}
                    >
                      View More Sessions ({sortedSessions.length - visibleCount} remaining)
                    </button>
                  ) : (
                    <button
                      onClick={() => setVisibleCount(INITIAL_VISIBLE)}
                      style={{
                        background: "none",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "6px",
                        color: "#555",
                        cursor: "pointer",
                        fontSize: "0.78rem",
                        fontFamily: "inherit",
                        padding: "7px 20px",
                        transition: "border-color 0.15s, color 0.15s",
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.25)"; (e.currentTarget as HTMLButtonElement).style.color = "#aaa"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.12)"; (e.currentTarget as HTMLButtonElement).style.color = "#555"; }}
                    >
                      Show Less
                    </button>
                  )}
                </div>
              )}
              </>
            )}
          </div>
            );
          })()}
        </div>

        {/* Right — session detail */}
        <div className="admin-sessions-right">
          {!selected ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#444", fontSize: "0.9rem" }}>
              ← Select or create a session
            </div>
          ) : sessionLoad ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#666" }}>Loading…</div>
          ) : (
            <>
              {/* Session header */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}>
                <div>
                  <h2 style={{ fontSize: "1.3rem", fontWeight: 300, color: "#fff", marginBottom: "4px" }}>{selected.title}</h2>
                  <div style={{ fontSize: "0.8rem", color: "#888" }}>{selected.date}{selected.time ? ` at ${selected.time}` : ""} · 📍 {selected.venue || selected.location}</div>
                </div>
                {/* Photo upload */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", minWidth: "200px" }}>
                  {selected.photo_url && (
                    <img src={selected.photo_url} alt="Session photo" style={{ width: "120px", height: "80px", objectFit: "cover", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.1)" }} />
                  )}
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ padding: "7px 14px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", fontSize: "0.78rem", color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }}>
                      {photoFile ? photoFile.name.slice(0, 18) + "…" : "📷 Choose photo"}
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { setPhotoFile(e.target.files?.[0] ?? null); setPhotoMsg(""); }} />
                    </label>
                    {photoFile && (
                      <button onClick={uploadPhoto} disabled={photoUploading} style={{ ...btn(true), padding: "7px 14px", fontSize: "0.78rem" }}>
                        {photoUploading ? "Uploading…" : "Upload"}
                      </button>
                    )}
                  </div>
                  {photoMsg && <div style={{ fontSize: "0.75rem", color: photoMsg.startsWith("Error") ? "#f09595" : "#4ade80" }}>{photoMsg}</div>}
                </div>

                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    onClick={() => setShareSession(selected)}
                    style={{ ...btn(false), display: "flex", alignItems: "center", gap: "6px" }}>
                    ↗ Share Session
                  </button>
                  <button onClick={saveAttendance} disabled={saving} style={btn(true)}>
                    {saving ? "Saving & updating leaderboard…" : "Save Attendance"}
                  </button>
                </div>
              </div>

              {/* Messages */}
              {saveMsg && (
                <div style={{ background: saveMsg.includes("failed") ? "rgba(226,75,74,0.08)" : "rgba(74,222,128,0.08)", border: `1px solid ${saveMsg.includes("failed") ? "rgba(226,75,74,0.3)" : "rgba(74,222,128,0.25)"}`, borderRadius: "6px", padding: "9px 14px", marginBottom: "1rem", fontSize: "0.8rem", color: saveMsg.includes("failed") ? "#f09595" : "#4ade80", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{saveMsg}</span>
                  {lastSavedAt && <span style={{ fontSize: "10px", color: "#666", flexShrink: 0, marginLeft: "1rem" }}>at {lastSavedAt}</span>}
                </div>
              )}

              {/* Add user manually */}
              <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", padding: "0.75rem 1rem", marginBottom: "1rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>Add member manually</span>
                <input
                  value={addEmail}
                  onChange={(e) => { setAddEmail(e.target.value); setAddMsg(""); }}
                  onKeyDown={(e) => e.key === "Enter" && addUser()}
                  placeholder="Email address"
                  style={{ ...inp, flex: 1, minWidth: "180px", padding: "6px 10px" }}
                />
                <button onClick={addUser} disabled={adding || !addEmail.trim()} style={{ ...btn(true), padding: "6px 16px", fontSize: "0.78rem", flexShrink: 0 }}>
                  {adding ? "Adding…" : "Add"}
                </button>
                {addMsg && <span style={{ fontSize: "0.75rem", color: addMsg.startsWith("✓") ? "#4ade80" : "#f09595" }}>{addMsg}</span>}
              </div>

              {/* Stats row */}
              <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
                {[
                  { label: "Registered users at location", value: attendees.length },
                  { label: "Attended",   value: attendCount },
                  { label: "Points synced", value: syncedCount },
                ].map((s) => (
                  <div key={s.label} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", padding: "0.75rem 1.25rem", minWidth: "130px" }}>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#e8620a" }}>{s.value}</div>
                    <div style={{ fontSize: "10px", color: "#666", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Bulk actions */}
              {attendees.length > 0 && (
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "10px", color: "#666", textTransform: "uppercase", letterSpacing: "0.08em", marginRight: "4px" }}>Bulk:</span>
                  <button onClick={markAllPresent} style={{ ...btn(true), padding: "6px 16px", fontSize: "0.78rem" }}>✓ Mark all present</button>
                  <button onClick={markAllAbsent}  style={{ ...btn(false), padding: "6px 16px", fontSize: "0.78rem" }}>✗ Mark all absent</button>
                </div>
              )}

              {/* Attendance table */}
              {attendees.length === 0 ? (
                <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", padding: "3rem", textAlign: "center", color: "#555", fontSize: "0.875rem" }}>
                  No registered users found at <strong style={{ color: "#888" }}>{selected.location}</strong>.<br />
                  <span style={{ fontSize: "0.75rem" }}>Make sure the session location matches the location users registered with.</span>
                </div>
              ) : (
                <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                        <th style={{ padding: "10px 16px", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>Attended</th>
                        <th style={{ padding: "10px 16px", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>Name</th>
                        <th style={{ padding: "10px 16px", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>Email</th>
                        <th style={{ padding: "10px 16px", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>Pts (attend)</th>
                        <th style={{ padding: "10px 16px", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>Bonus pts</th>
                        <th style={{ padding: "10px 16px", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>Bonus reason</th>
                        <th style={{ padding: "10px 16px", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendees.map((a, i) => (
                        <tr key={a.email} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>

                          {/* Attendance checkbox */}
                          <td style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", textAlign: "center" }}>
                            <input type="checkbox" checked={a.attended} onChange={() => toggleAttend(a.email)}
                              disabled={a.points_synced}
                              style={{ width: "18px", height: "18px", cursor: a.points_synced ? "not-allowed" : "pointer", accentColor: "#e8620a" }} />
                          </td>

                          {/* Name */}
                          <td style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: "0.82rem", fontWeight: 600, color: "#fff", whiteSpace: "nowrap" }}>{a.name}</td>

                          {/* Email */}
                          <td style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: "0.78rem", color: "#888" }}>{a.email}</td>

                          {/* Attendance points */}
                          <td style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", textAlign: "center" }}>
                            <span style={{ fontSize: "0.82rem", color: a.attended ? "#4ade80" : "#444", fontWeight: 600 }}>{a.attended ? "+5" : "—"}</span>
                          </td>

                          {/* Bonus points input */}
                          <td style={{ padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", textAlign: "center" }}>
                            <input type="number" min={0} value={a.bonus_points || ""} placeholder="0"
                              disabled={a.points_synced}
                              onChange={(e) => setBonus(a.email, parseInt(e.target.value) || 0)}
                              style={{ ...inp, width: "70px", textAlign: "center", padding: "5px 8px", opacity: a.points_synced ? 0.4 : 1 }} />
                          </td>

                          {/* Bonus reason */}
                          <td style={{ padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                            <input value={a.bonus_reason} placeholder="e.g. 1st place sprint"
                              disabled={a.points_synced}
                              onChange={(e) => setReason(a.email, e.target.value)}
                              style={{ ...inp, width: "100%", minWidth: "160px", padding: "5px 8px", opacity: a.points_synced ? 0.4 : 1 }} />
                          </td>

                          {/* Sync status */}
                          <td style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", textAlign: "center" }}>
                            {a.points_synced
                              ? <span style={{ fontSize: "0.72rem", color: "#4ade80", fontWeight: 600 }}>✓ Synced</span>
                              : <span style={{ fontSize: "0.72rem", color: "#555" }}>Pending</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p style={{ fontSize: "11px", color: "#444", marginTop: "1rem" }}>
                Attendance = 5 pts per person. Click <strong style={{ color: "#888" }}>Save Attendance</strong> — leaderboard updates automatically. Already-synced rows are locked.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
    {shareSession && (
      <SessionShareSheet
        session={{ id: shareSession.id, title: shareSession.title, date: shareSession.date, time: shareSession.time, venue: shareSession.venue || shareSession.location }}
        onClose={() => setShareSession(null)}
      />
    )}

    {/* QR Modal */}
    {qrSession && (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "14px", padding: "2rem", width: "100%", maxWidth: "420px", position: "relative" }}>
          <button onClick={() => { setQrSession(null); setQrData(null); setQrMsg(""); }}
            style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: "1.2rem", lineHeight: 1 }}>✕</button>

          <div style={{ fontSize: "10px", color: "#60a5fa", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: "0.4rem" }}>Attendance QR Code</div>
          <div style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: "1.5rem" }}>{qrSession.title}</div>

          {qrLoading ? (
            <div style={{ textAlign: "center", padding: "3rem 0", color: "#666" }}>Loading…</div>
          ) : qrData ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
              <div style={{ background: "#fff", borderRadius: "12px", padding: "12px", display: "inline-block" }}>
                <img src={qrData.data_url} alt="QR Code" style={{ width: 240, height: 240, display: "block" }} />
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "0.78rem", color: "#888", marginBottom: "4px" }}>Expires</div>
                <div style={{ fontSize: "0.9rem", color: new Date(qrData.expires_at) < new Date() ? "#f09595" : "#4ade80", fontWeight: 600 }}>
                  {new Date(qrData.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {new Date(qrData.expires_at).toLocaleDateString()}
                </div>
                {new Date(qrData.expires_at) < new Date() && (
                  <div style={{ fontSize: "0.75rem", color: "#f09595", marginTop: "4px" }}>This QR has expired — generate a new one</div>
                )}
              </div>
              <div style={{ width: "100%", background: "rgba(255,255,255,0.04)", borderRadius: "8px", padding: "8px 12px", display: "flex", alignItems: "center", gap: "8px", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.7rem", color: "#666", wordBreak: "break-all" }}>{qrData.scan_url}</span>
                <button onClick={() => navigator.clipboard.writeText(qrData.scan_url)}
                  style={{ background: "none", border: "none", color: "#60a5fa", cursor: "pointer", fontSize: "0.75rem", flexShrink: 0 }}>Copy</button>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "2rem 0" }}>
              <div style={{ fontSize: "0.85rem", color: "#888", marginBottom: "1.5rem" }}>No QR generated yet for this session.</div>
            </div>
          )}

          {qrMsg && (
            <div style={{ marginTop: "1rem", fontSize: "0.8rem", color: qrMsg.includes("failed") || qrMsg.includes("Failed") ? "#f09595" : "#4ade80", textAlign: "center" }}>{qrMsg}</div>
          )}

          <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem" }}>
            <button onClick={generateQR} disabled={qrLoading}
              style={{ ...btn(true), flex: 1, padding: "10px" }}>
              {qrLoading ? "Generating…" : qrData ? "Regenerate QR" : "Generate QR"}
            </button>
          </div>
          <div style={{ marginTop: "0.75rem", fontSize: "10px", color: "#555", textAlign: "center" }}>
            QR is valid for 90 minutes. Members scan with their phone camera to auto-record attendance.
          </div>
        </div>
      </div>
    )}
    </>
  );
}
