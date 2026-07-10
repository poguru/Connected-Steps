"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import SessionShareSheet from "@/components/ui/SessionShareSheet";
import { Card, Button, Input, Label, Alert, Badge, Modal, EmptyState, StatCard } from "@/components/ui/ds";
import dynamic from "next/dynamic";
const MediaManager = dynamic(() => import("@/components/ui/MediaManager"), { ssr: false });

interface Session { id: string; title: string; date: string; time: string; location: string; venue: string; photo_url?: string | null; }
interface Attendee {
  email: string; name: string; location: string;
  attended: boolean; bonus_points: number; bonus_reason: string; points_synced: boolean;
}
interface Challenge {
  id: string; user_email: string; challenge_type: string;
  challenge_name: string; points: number; created_at: string;
}

const CHALLENGE_TYPES = [
  { value: "fastest_runner",   label: "Fastest Runner"         },
  { value: "longest_distance", label: "Longest Distance"       },
  { value: "best_improvement", label: "Best Improvement"       },
  { value: "best_attendance",  label: "Best Attendance Streak" },
  { value: "coach_choice",     label: "Coach's Choice"         },
  { value: "custom",           label: "Custom"                 },
];

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px",
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "6px", color: "#fff", fontSize: "0.825rem", outline: "none", boxSizing: "border-box",
};

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

  // Session challenges
  const [challenges,        setChallenges]        = useState<Challenge[]>([]);
  const [challengeType,     setChallengeType]     = useState("fastest_runner");
  const [challengeName,     setChallengeName]     = useState("Fastest Runner");
  const [challengeEmail,    setChallengeEmail]    = useState("");
  const [challengePoints,   setChallengePoints]   = useState(10);
  const [challengeSaving,   setChallengeSaving]   = useState(false);
  const [challengeMsg,      setChallengeMsg]      = useState("");
  const [challengeRemoving, setChallengeRemoving] = useState<string | null>(null);

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

  /* ── Select session → load users + challenges ── */
  const openSession = async (s: Session) => {
    setSelected(s); setAttendees([]); setChallenges([]); setSaveMsg(""); setLastSavedAt(null);
    setChallengeMsg(""); setChallengeEmail("");
    setSessionLoad(true);
    const [attRes, chalRes] = await Promise.all([
      fetch(`/api/admin/sessions/${s.id}/attendance`, { headers }),
      fetch(`/api/admin/sessions/${s.id}/challenges`, { headers }),
    ]);
    const attJson  = await attRes.json();
    const chalJson = await chalRes.json();
    setAttendees(attJson.users      ?? []);
    setChallenges(chalJson.challenges ?? []);
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

  /* ── Award a session challenge ── */
  const awardChallenge = async () => {
    if (!selected || !challengeEmail || !challengeName.trim()) return;
    setChallengeSaving(true); setChallengeMsg("");
    const res  = await fetch(`/api/admin/sessions/${selected.id}/challenges`, {
      method: "POST", headers,
      body: JSON.stringify({ user_email: challengeEmail, challenge_type: challengeType, challenge_name: challengeName.trim(), points: challengePoints }),
    });
    const json = await res.json();
    if (res.ok) {
      setChallengeMsg(`+${challengePoints} pts awarded! Leaderboard updated.`);
      setChallengeEmail("");
      const chalRes  = await fetch(`/api/admin/sessions/${selected.id}/challenges`, { headers });
      const chalJson = await chalRes.json();
      setChallenges(chalJson.challenges ?? []);
    } else {
      setChallengeMsg(json.error ?? "Failed to award challenge.");
    }
    setChallengeSaving(false);
  };

  /* ── Remove a session challenge award ── */
  const removeChallenge = async (challengeId: string) => {
    if (!selected) return;
    setChallengeRemoving(challengeId);
    await fetch(`/api/admin/sessions/${selected.id}/challenges`, {
      method: "DELETE", headers,
      body: JSON.stringify({ challengeId }),
    });
    const chalRes  = await fetch(`/api/admin/sessions/${selected.id}/challenges`, { headers });
    const chalJson = await chalRes.json();
    setChallenges(chalJson.challenges ?? []);
    setChallengeRemoving(null);
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
          <Card>
            <Badge color="orange" style={{ marginBottom: "0.5rem" }}>Admin Access</Badge>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 300, color: "#fff", marginBottom: "1.75rem" }}>Training Sessions</h1>
            <form onSubmit={login} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <Label>Password</Label>
              <Input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setAuthErr(""); }}
                placeholder="Enter admin password" autoFocus />
              {authErr && <Alert variant="error">{authErr}</Alert>}
              <Button type="submit" loading={authLoad} fullWidth>Access Dashboard</Button>
            </form>
          </Card>
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
          <Card>
            <Badge color="orange" style={{ marginBottom: "1rem" }}>New Session</Badge>
            <form onSubmit={createSession} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div><Label>Title</Label><Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Morning Run" required /></div>
              <div><Label>Date</Label><Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} required /></div>
              <div><Label>Time</Label><Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} required /></div>
              <div><Label>Location (area — used to filter users)</Label><Input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="e.g. Kondapur" required /></div>
              <div><Label>Venue / Meeting Point (shown in alert)</Label><Input value={newVenue} onChange={(e) => setNewVenue(e.target.value)} placeholder="e.g. Botanical Garden, Kondapur" required /></div>
              <Button type="submit" loading={creating} fullWidth>Create Session</Button>
            </form>
          </Card>

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
                        <Input value={editFields.title} onChange={(e) => setEditFields((p) => ({ ...p, title: e.target.value }))} placeholder="Title" />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                          <Input type="date" value={editFields.date} onChange={(e) => setEditFields((p) => ({ ...p, date: e.target.value }))} />
                          <Input type="time" value={editFields.time} onChange={(e) => setEditFields((p) => ({ ...p, time: e.target.value }))} />
                        </div>
                        <Input value={editFields.location} onChange={(e) => setEditFields((p) => ({ ...p, location: e.target.value }))} placeholder="Location" />
                        <Input value={editFields.venue} onChange={(e) => setEditFields((p) => ({ ...p, venue: e.target.value }))} placeholder="Venue" />
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <Button size="sm" loading={editSaving} onClick={() => saveEdit(s.id)}>Save</Button>
                          <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>Cancel</Button>
                          {editMsg && <Badge color={editMsg === "Saved!" ? "green" : "red"}>{editMsg}</Badge>}
                        </div>
                      </div>
                    )}

                    {/* Inline reschedule form */}
                    {reschedulingId === s.id && (
                      <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)", display: "flex", flexDirection: "column", gap: "6px" }}>
                        <Badge color="blue" style={{ marginBottom: "2px" }}>Reschedule</Badge>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                          <Input type="date" value={rescheduleFields.date} onChange={(e) => setRescheduleFields((p) => ({ ...p, date: e.target.value }))} />
                          <Input type="time" value={rescheduleFields.time} onChange={(e) => setRescheduleFields((p) => ({ ...p, time: e.target.value }))} />
                        </div>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <Button size="sm" loading={rescheduleSaving} onClick={() => saveReschedule(s)}>Save</Button>
                          <Button size="sm" variant="secondary" onClick={() => setReschedulingId(null)}>Cancel</Button>
                          {rescheduleMsg && <Badge color={rescheduleMsg === "Rescheduled!" ? "green" : "red"}>{rescheduleMsg}</Badge>}
                        </div>
                      </div>
                    )}

                    {/* Delete confirm */}
                    {deleteConfirmId === s.id && (
                      <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(226,75,74,0.2)", background: "rgba(226,75,74,0.05)", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" as const }}>
                        <span style={{ fontSize: "0.75rem", color: "#f09595", flex: 1 }}>Delete this session and all its attendance records?</span>
                        <Button size="sm" variant="danger" loading={deleting} onClick={() => deleteSession(s.id)}>Yes, delete</Button>
                        <Button size="sm" variant="secondary" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* View More / Show Less button */}
              {(hasMore || isExpanded) && (
                <div style={{ marginTop: "0.75rem", textAlign: "center" }}>
                  {hasMore
                    ? <Button variant="ghost" size="sm" onClick={() => setVisibleCount(c => c + PAGE_SIZE)}>View More Sessions ({sortedSessions.length - visibleCount} remaining)</Button>
                    : <Button variant="ghost" size="sm" onClick={() => setVisibleCount(INITIAL_VISIBLE)}>Show Less</Button>
                  }
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
                      <Button size="sm" loading={photoUploading} onClick={uploadPhoto}>Upload</Button>
                    )}
                  </div>
                  {photoMsg && <Alert variant={photoMsg.startsWith("Error") ? "error" : "success"}>{photoMsg}</Alert>}
                </div>

                {/* ── Media Manager (photos + videos) ── */}
                <details style={{ marginTop: "0.5rem" }}>
                  <summary style={{
                    cursor: "pointer", userSelect: "none" as const,
                    fontSize: "0.78rem", fontWeight: 700, color: "var(--cs-orange)",
                    padding: "6px 0", listStyle: "none",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    🎬 Media Manager (photos &amp; videos)
                  </summary>
                  <div style={{ marginTop: "0.75rem" }}>
                    <MediaManager
                      sessionId={selected.id}
                      uploaderEmail="admin@connectedsteps.in"
                      onChange={() => {/* media changed — could reload session */}}
                    />
                  </div>
                </details>

                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" as const, alignItems: "center" }}>
                  <Button variant="secondary" onClick={() => setShareSession(selected)}>↗ Share Session</Button>
                  <Button loading={saving} onClick={saveAttendance}>Save Attendance</Button>
                </div>
              </div>

              {/* Messages */}
              {saveMsg && (
                <Alert variant={saveMsg.includes("failed") ? "error" : "success"} style={{ marginBottom: "1rem" }}>
                  <span>{saveMsg}</span>
                  {lastSavedAt && <span style={{ fontSize: "10px", color: "#666", marginLeft: "1rem" }}>at {lastSavedAt}</span>}
                </Alert>
              )}

              {/* Add user manually */}
              <Card style={{ marginBottom: "1rem" }}>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" as const }}>
                  <Label style={{ flexShrink: 0 }}>Add member manually</Label>
                  <Input value={addEmail} onChange={(e) => { setAddEmail(e.target.value); setAddMsg(""); }}
                    onKeyDown={(e) => e.key === "Enter" && addUser()}
                    placeholder="Email address" style={{ flex: 1, minWidth: "180px" }} />
                  <Button size="sm" loading={adding} disabled={!addEmail.trim()} onClick={addUser}>Add</Button>
                  {addMsg && <Badge color={addMsg.startsWith("✓") ? "green" : "red"}>{addMsg}</Badge>}
                </div>
              </Card>

              {/* Stats row */}
              <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" as const }}>
                <StatCard label="Registered at location" value={attendees.length} />
                <StatCard label="Attended" value={attendCount} />
                <StatCard label="Points synced" value={syncedCount} />
              </div>

              {/* Bulk actions */}
              {attendees.length > 0 && (
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap" as const }}>
                  <Label>Bulk:</Label>
                  <Button size="sm" onClick={markAllPresent}>✓ Mark all present</Button>
                  <Button size="sm" variant="secondary" onClick={markAllAbsent}>✗ Mark all absent</Button>
                </div>
              )}

              {/* Attendance table */}
              {attendees.length === 0 ? (
                <EmptyState title={`No registered users at ${selected.location}`}
                  body="Make sure the session location matches the location users registered with." />
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
                              ? <Badge color="green" size="sm">✓ Synced</Badge>
                              : <Badge color="gray" size="sm">Pending</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Session Challenges ─────────────────────────────────────── */}
              <div style={{ marginTop: "2rem", borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: "1.5rem" }}>
                <div style={{ fontSize: "10px", color: "#e8620a", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, marginBottom: "1rem" }}>
                  Session Challenges
                </div>

                {/* Award form */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", padding: "1rem", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.07)", marginBottom: "1rem" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem" }}>
                    <div>
                      <Label>Challenge</Label>
                      <select
                        value={challengeType}
                        onChange={(e) => {
                          const t = e.target.value;
                          setChallengeType(t);
                          if (t !== "custom") setChallengeName(CHALLENGE_TYPES.find(c => c.value === t)?.label ?? "");
                        }}
                        style={{ ...inp }}
                      >
                        {CHALLENGE_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                    {challengeType === "custom" && (
                      <div>
                        <Label>Challenge name</Label>
                        <Input value={challengeName} onChange={(e) => setChallengeName(e.target.value)} placeholder="e.g. Most Consistent" />
                      </div>
                    )}
                    <div>
                      <Label>Winner (attended)</Label>
                      <select value={challengeEmail} onChange={(e) => setChallengeEmail(e.target.value)} style={{ ...inp }}>
                        <option value="">Select attendee…</option>
                        {attendees.filter(a => a.attended).map(a => (
                          <option key={a.email} value={a.email}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>Points</Label>
                      <Input type="number" min={1} max={100} value={challengePoints}
                        onChange={(e) => setChallengePoints(Math.max(1, parseInt(e.target.value) || 1))} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" as const }}>
                    <Button size="sm" loading={challengeSaving} disabled={!challengeEmail || !challengeName.trim()} onClick={awardChallenge}>
                      Award Points
                    </Button>
                    {challengeMsg && (
                      <Badge color={challengeMsg.includes("pts") ? "green" : "red"}>{challengeMsg}</Badge>
                    )}
                  </div>
                </div>

                {/* Awarded challenges list */}
                {challenges.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {challenges.map(c => {
                      const winner = attendees.find(a => a.email === c.user_email);
                      return (
                        <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", padding: "10px 14px", background: "rgba(232,98,10,0.05)", border: "1px solid rgba(232,98,10,0.15)", borderRadius: "7px" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#e8620a" }}>{c.challenge_name}</div>
                            <div style={{ fontSize: "0.75rem", color: "#888", marginTop: "2px" }}>
                              {winner?.name ?? c.user_email}
                              {" · "}
                              <span style={{ color: "#4ade80" }}>+{c.points} pts</span>
                            </div>
                          </div>
                          <button
                            onClick={() => removeChallenge(c.id)}
                            disabled={challengeRemoving === c.id}
                            aria-label="Remove challenge award"
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: "4px 8px", fontSize: "0.8rem", flexShrink: 0, opacity: challengeRemoving === c.id ? 0.4 : 1 }}
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: "0.78rem", color: "#444", textAlign: "center", padding: "0.75rem" }}>
                    No challenges awarded yet for this session.
                  </div>
                )}
              </div>

              <p style={{ fontSize: "11px", color: "#444", marginTop: "1.5rem" }}>
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
      <Modal open onClose={() => { setQrSession(null); setQrData(null); setQrMsg(""); }}
        title={qrSession.title} maxWidth={420}
        footer={
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <Button fullWidth loading={qrLoading} onClick={generateQR}>
              {qrData ? "Regenerate QR" : "Generate QR"}
            </Button>
            <p style={{ fontSize: "10px", color: "#555", textAlign: "center", margin: 0 }}>
              QR is valid for 90 minutes. Members scan with their phone camera to auto-record attendance.
            </p>
          </div>
        }>
        <Badge color="blue" style={{ marginBottom: "1rem" }}>Attendance QR Code</Badge>
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
                <Alert variant="error" style={{ marginTop: "4px" }}>This QR has expired — generate a new one</Alert>
              )}
            </div>
            <div style={{ width: "100%", background: "rgba(255,255,255,0.04)", borderRadius: "8px", padding: "8px 12px", display: "flex", alignItems: "center", gap: "8px", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.7rem", color: "#666", wordBreak: "break-all" as const }}>{qrData.scan_url}</span>
              <Button size="xs" variant="ghost" onClick={() => navigator.clipboard.writeText(qrData!.scan_url)}>Copy</Button>
            </div>
          </div>
        ) : (
          <EmptyState title="No QR generated yet" body="Generate a QR code for this session." />
        )}
        {qrMsg && (
          <Alert variant={qrMsg.includes("failed") || qrMsg.includes("Failed") ? "error" : "success"} style={{ marginTop: "1rem" }}>{qrMsg}</Alert>
        )}
      </Modal>
    )}
    </>
  );
}
