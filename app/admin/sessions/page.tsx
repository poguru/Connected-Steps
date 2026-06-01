"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

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
  const [authed,     setAuthed]     = useState(false);
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

  const headers = { "Content-Type": "application/json", "x-admin-password": password };

  /* ── Auth ── */
  const login = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setAuthLoad(true); setAuthErr("");
    try {
      const res  = await fetch("/api/admin/sessions", { headers: { "x-admin-password": password } });
      const json = await res.json();
      if (res.status === 401) { setAuthErr("Incorrect password."); return; }
      if (!res.ok)            { setAuthErr(json.error ?? "Server error."); return; }
      setSessions(json.data ?? []);
      localStorage.setItem("cs_admin_pw", password);
      setAuthed(true);
    } catch { setAuthErr("Network error."); }
    finally  { setAuthLoad(false); }
  };

  useEffect(() => {
    const s = localStorage.getItem("cs_admin_pw");
    if (!s) return;
    setPassword(s);
    fetch("/api/admin/sessions", { headers: { "x-admin-password": s } })
      .then((r) => r.json())
      .then((j) => { if (j.data) { setSessions(j.data); setAuthed(true); } else localStorage.removeItem("cs_admin_pw"); })
      .catch(() => localStorage.removeItem("cs_admin_pw"));
  }, []); // eslint-disable-line

  /* ── Load sessions ── */
  const loadSessions = useCallback(async () => {
    const res  = await fetch("/api/admin/sessions", { headers: { "x-admin-password": password } });
    const json = await res.json();
    setSessions(json.data ?? []);
  }, [password]);

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

  /* ── Select session → load users ── */
  const openSession = async (s: Session) => {
    setSelected(s); setAttendees([]); setSaveMsg(""); setLastSavedAt(null);
    setSessionLoad(true);
    const res  = await fetch(`/api/admin/sessions/${s.id}/attendance`, { headers: { "x-admin-password": password } });
    const json = await res.json();
    setAttendees(json.users ?? []);
    setSessionLoad(false);
  };

  /* ── Toggle attendance ── */
  const toggleAttend = (email: string) =>
    setAttendees((prev) => prev.map((a) => a.email === email ? { ...a, attended: !a.attended } : a));

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
    const res  = await fetch(`/api/admin/sessions/${selected.id}/photo`, { method: "POST", headers: { "x-admin-password": password }, body: form });
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

  const [copiedId, setCopiedId] = useState<string | null>(null);

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

          {/* Sessions list */}
          <div>
            <div style={{ fontSize: "10px", color: "#888", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.75rem" }}>Sessions ({sessions.length})</div>
            {sessions.length === 0 ? (
              <div style={{ fontSize: "0.8rem", color: "#555" }}>No sessions yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {sessions.map((s) => (
                  <div key={s.id} style={{ position: "relative" }}>
                    <button onClick={() => openSession(s)}
                      style={{ width: "100%", textAlign: "left", padding: "10px 12px", paddingRight: "44px", borderRadius: "6px", border: "1px solid", cursor: "pointer", background: selected?.id === s.id ? "rgba(232,98,10,0.1)" : "transparent", borderColor: selected?.id === s.id ? "rgba(232,98,10,0.4)" : "rgba(255,255,255,0.07)", transition: "all 0.15s" }}>
                      <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#fff", marginBottom: "2px" }}>{s.title}</div>
                      <div style={{ fontSize: "0.72rem", color: "#888" }}>{s.date}{s.time ? ` ${s.time}` : ""} · {s.location}</div>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); copyJoinLink(s.id); }}
                      title="Copy join link"
                      style={{ position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: "4px 6px", color: copiedId === s.id ? "#4ade80" : "#555", fontSize: "0.75rem", fontWeight: 600, fontFamily: "inherit", transition: "color 0.15s" }}>
                      {copiedId === s.id ? "✓" : "🔗"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
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
                    onClick={() => copyJoinLink(selected.id)}
                    style={{ ...btn(false), display: "flex", alignItems: "center", gap: "6px", color: copiedId === selected.id ? "#4ade80" : "#fff", borderColor: copiedId === selected.id ? "rgba(74,222,128,0.4)" : undefined }}>
                    {copiedId === selected.id ? "✓ Copied!" : "🔗 Copy join link"}
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
  );
}
