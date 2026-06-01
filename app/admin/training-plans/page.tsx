"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const TYPE_PRESETS: Record<string, string> = {
  "Rest":           "😴",
  "Easy Run":       "🏃",
  "Long Run":       "🎯",
  "Tempo Run":      "🔥",
  "Intervals":      "⚡",
  "Cross Train":    "🧘",
  "Strength":       "💪",
  "Medium Run":     "🏃",
  "Hill Run":       "⛰️",
  "Speed Work":     "⚡",
  "Recovery Run":   "🚶",
  "Race / Event":   "🏅",
  "Custom":         "📝",
};

const TYPE_PLACEHOLDERS: Record<string, string> = {
  "Rest":           "Recovery day",
  "Easy Run":       "e.g. 5 km at easy conversational pace",
  "Long Run":       "e.g. 14 km at steady comfortable pace",
  "Tempo Run":      "e.g. 6 km at threshold pace (comfortably hard)",
  "Intervals":      "e.g. 6 × 400m with 90s rest between",
  "Cross Train":    "e.g. 30 min cycling or yoga",
  "Strength":       "e.g. Core + leg strength, 45 min",
  "Medium Run":     "e.g. 8 km at comfortable effort",
  "Hill Run":       "e.g. 6 × 200m hill repeats",
  "Speed Work":     "e.g. 8 × 200m at 5K race pace",
  "Recovery Run":   "e.g. 3 km very easy, heart rate low",
  "Race / Event":   "e.g. 5K race — full effort",
  "Custom":         "Describe the session in detail",
};

interface DayEntry { type: string; detail: string; emoji: string; }
interface User { email: string; first_name: string; last_name: string; goal: string; location: string; }
interface Plan { id: string; user_email: string; title: string; coach_name: string; active: boolean; created_at: string; }

function getMonday(offset = 0): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 1 : 1 - day; // next Mon if Sun, else current Mon
  d.setDate(d.getDate() + diff + offset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekRange(monday: Date): string {
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return `${fmt(monday)} – ${fmt(sunday)}, ${monday.getFullYear()}`;
}

function weekTitle(monday: Date): string {
  const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  return `Week of ${fmt(monday)} – ${fmt(sunday)}`;
}

const emptyPlan = (): DayEntry[] => DAYS.map(() => ({ type: "Rest", detail: "Recovery day", emoji: "😴" }));

const inp: React.CSSProperties  = { width: "100%", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", padding: "8px 12px", color: "#fff", fontSize: "0.82rem", fontFamily: "inherit", outline: "none" };
const sel: React.CSSProperties  = { ...inp, cursor: "pointer" };

export default function TrainingPlansAdmin() {
  const [password,      setPassword]     = useState("");
  const [authed,        setAuthed]       = useState(false);
  const [authErr,       setAuthErr]      = useState("");

  const [users,         setUsers]        = useState<User[]>([]);
  const [search,        setSearch]       = useState("");
  const [selectedUser,  setSelectedUser] = useState<User | null>(null);
  const [plans,         setPlans]        = useState<Plan[]>([]);

  const [weekOffset,    setWeekOffset]   = useState(new Date().getDay() === 0 ? 1 : 0); // default next week on Sundays
  const [coachName,     setCoachName]    = useState("");
  const [days,          setDays]         = useState<DayEntry[]>(emptyPlan());
  const [saving,        setSaving]       = useState(false);
  const [saveMsg,       setSaveMsg]      = useState("");
  const [errors,        setErrors]       = useState<boolean[]>(Array(7).fill(false));

  const headers = { "x-admin-password": password, "Content-Type": "application/json" };

  const monday    = getMonday(weekOffset);
  const weekRange = formatWeekRange(monday);

  const login = () => {
    if (!password) return;
    fetch("/api/admin/training-plans", { headers: { "x-admin-password": password } })
      .then((r) => { if (r.ok) { setAuthed(true); setAuthErr(""); } else setAuthErr("Wrong password."); })
      .catch(() => setAuthErr("Network error."));
  };

  const loadUsers = useCallback(() => {
    fetch("/api/admin/users", { headers }).then((r) => r.json()).then((d) => setUsers(d.users ?? [])).catch(() => {});
  }, [password]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPlans = useCallback(() => {
    fetch("/api/admin/training-plans", { headers: { "x-admin-password": password } })
      .then((r) => r.json()).then((d) => setPlans(d.plans ?? [])).catch(() => {});
  }, [password]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (authed) { loadUsers(); loadPlans(); } }, [authed]); // eslint-disable-line react-hooks/exhaustive-deps

  // When user is selected, load their existing active plan (if any)
  const selectUser = (u: User) => {
    setSelectedUser(u);
    setSaveMsg("");
    setErrors(Array(7).fill(false));
    fetch(`/api/user/training-plan?email=${encodeURIComponent(u.email)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.plan) {
          setDays(d.plan.days);
          setCoachName(d.plan.coach_name || "");
        } else {
          setDays(emptyPlan());
          setCoachName("");
        }
      })
      .catch(() => { setDays(emptyPlan()); setCoachName(""); });
  };

  const updateDay = (i: number, field: keyof DayEntry, value: string) => {
    setDays((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === "type") {
        next[i].emoji  = TYPE_PRESETS[value] ?? "📝";
        // Auto-fill Rest detail; clear detail for all other types so admin must write specifics
        next[i].detail = value === "Rest" ? "Recovery day" : "";
      }
      return next;
    });
    // Clear error for this row when admin edits it
    if (field === "detail" || field === "type") {
      setErrors((prev) => { const e = [...prev]; e[i] = false; return e; });
    }
  };

  const savePlan = async () => {
    if (!selectedUser) return;

    // Validate: all non-Rest days must have a detail description
    const newErrors = days.map((d) => d.type !== "Rest" && !d.detail.trim());
    if (newErrors.some(Boolean)) {
      setErrors(newErrors);
      setSaveMsg("Fill in the session details for all highlighted days before saving.");
      return;
    }
    setErrors(Array(7).fill(false));
    setSaving(true); setSaveMsg("");
    const title = weekTitle(monday);
    try {
      const res  = await fetch("/api/admin/training-plans", { method: "POST", headers, body: JSON.stringify({ user_email: selectedUser.email, title, coach_name: coachName, days }) });
      const json = await res.json();
      if (!res.ok) { setSaveMsg(`Error: ${json.error}`); return; }
      setSaveMsg(`✓ Plan saved for ${selectedUser.first_name} ${selectedUser.last_name}`);
      loadPlans();
    } catch { setSaveMsg("Network error."); }
    finally { setSaving(false); }
  };

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return !q || u.email.includes(q) || u.first_name.toLowerCase().includes(q) || u.last_name.toLowerCase().includes(q);
  });

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "2.5rem", width: "320px" }}>
          <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
            <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>📋</div>
            <div style={{ color: "#fff", fontWeight: 600 }}>Training Plans</div>
            <div style={{ fontSize: "0.8rem", color: "#555", marginTop: "4px" }}>Admin access required</div>
          </div>
          <input type="password" placeholder="Admin password" value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            style={{ ...inp, marginBottom: "0.75rem" }} />
          {authErr && <div style={{ fontSize: "0.8rem", color: "#f09595", marginBottom: "0.5rem" }}>{authErr}</div>}
          <button onClick={login} style={{ width: "100%", background: "#e8620a", border: "none", borderRadius: "6px", padding: "10px", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: "0.9rem" }}>
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 1.5rem", height: "56px", display: "flex", alignItems: "center", gap: "1rem" }}>
        <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}>
          <Image src="/logo.png" alt="" width={28} height={28} className="rounded-full" />
        </Link>
        <span style={{ color: "#444", fontSize: "0.8rem" }}>/</span>
        <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Training Plans</span>
        <div style={{ marginLeft: "auto", fontSize: "0.75rem", color: "#555" }}>
          {plans.filter((p) => p.active).length} active plan{plans.filter((p) => p.active).length !== 1 ? "s" : ""}
        </div>
      </header>

      {/* Body */}
      <div className="admin-sessions-wrap" style={{ flex: 1 }}>

        {/* Left — user list */}
        <div className="admin-sessions-left">
          <div>
            <div style={{ fontSize: "10px", color: "#e8620a", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: "0.75rem" }}>Select Member</div>
            <input placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inp, marginBottom: "0.75rem" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxHeight: "60vh", overflowY: "auto" }}>
              {filtered.map((u) => {
                const hasPlan = plans.some((p) => p.user_email === u.email && p.active);
                const isSelected = selectedUser?.email === u.email;
                return (
                  <button key={u.email} onClick={() => selectUser(u)}
                    style={{ textAlign: "left", padding: "10px 12px", borderRadius: "6px", border: "1px solid", cursor: "pointer", background: isSelected ? "rgba(232,98,10,0.1)" : "transparent", borderColor: isSelected ? "rgba(232,98,10,0.4)" : "rgba(255,255,255,0.07)", transition: "all 0.15s", width: "100%" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#fff" }}>{u.first_name} {u.last_name}</div>
                      {hasPlan && <span style={{ fontSize: "9px", background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)", borderRadius: "20px", padding: "1px 6px" }}>Plan ✓</span>}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "#555", marginTop: "2px" }}>{u.email}</div>
                    <div style={{ fontSize: "0.72rem", color: "#444", marginTop: "1px" }}>{u.goal?.toUpperCase()} · {u.location}</div>
                  </button>
                );
              })}
              {filtered.length === 0 && <div style={{ fontSize: "0.8rem", color: "#444", padding: "1rem 0" }}>No members found.</div>}
            </div>
          </div>
        </div>

        {/* Right — plan editor */}
        <div className="admin-sessions-right">
          {!selectedUser ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#444", fontSize: "0.9rem" }}>
              ← Select a member to write their plan
            </div>
          ) : (
            <div style={{ maxWidth: "680px" }}>

              {/* User header */}
              <div style={{ marginBottom: "1.5rem" }}>
                <div style={{ fontSize: "10px", color: "#e8620a", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: "4px" }}>Writing plan for</div>
                <div style={{ fontSize: "1.2rem", fontWeight: 600, color: "#fff" }}>{selectedUser.first_name} {selectedUser.last_name}</div>
                <div style={{ fontSize: "0.8rem", color: "#555" }}>{selectedUser.email} · {selectedUser.goal?.toUpperCase()}</div>
              </div>

              {/* Week selector */}
              <div style={{ marginBottom: "1.25rem" }}>
                <div style={{ fontSize: "10px", color: "#888", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.5rem" }}>Week</div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {[
                    { label: "This week",  offset: 0 },
                    { label: "Next week",  offset: 1 },
                    { label: "Week after", offset: 2 },
                  ].map((w) => (
                    <button key={w.offset} onClick={() => setWeekOffset(w.offset)}
                      style={{ padding: "6px 14px", borderRadius: "6px", border: "1px solid", cursor: "pointer", fontSize: "0.8rem", fontFamily: "inherit", background: weekOffset === w.offset ? "rgba(232,98,10,0.15)" : "transparent", borderColor: weekOffset === w.offset ? "rgba(232,98,10,0.5)" : "rgba(255,255,255,0.1)", color: weekOffset === w.offset ? "#e8620a" : "#888", transition: "all 0.15s" }}>
                      {w.label}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: "0.78rem", color: "#555", marginTop: "0.5rem" }}>📅 {weekRange}</div>
              </div>

              {/* Coach name */}
              <div style={{ marginBottom: "1.25rem" }}>
                <label style={{ fontSize: "10px", color: "#888", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: "0.4rem" }}>Coach name</label>
                <input value={coachName} onChange={(e) => setCoachName(e.target.value)} placeholder="e.g. Coach Ashokan" style={{ ...inp, maxWidth: "280px" }} />
              </div>

              {/* 7-day editor */}
              <div style={{ marginBottom: "1.5rem" }}>
                <div style={{ fontSize: "10px", color: "#888", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.75rem" }}>Daily schedule (Mon → Sun)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {DAYS.map((day, i) => {
                    const hasError = errors[i];
                    return (
                      <div key={day} style={{ display: "grid", gridTemplateColumns: "40px 160px 60px 1fr", gap: "0.5rem", alignItems: "center" }}>
                        <div style={{ fontSize: "11px", color: hasError ? "#f09595" : "#e8620a", fontWeight: 700, letterSpacing: "0.06em" }}>{day}</div>

                        <select value={days[i].type} onChange={(e) => updateDay(i, "type", e.target.value)} style={sel}>
                          {Object.keys(TYPE_PRESETS).map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>

                        <input value={days[i].emoji} onChange={(e) => updateDay(i, "emoji", e.target.value)}
                          style={{ ...inp, textAlign: "center", fontSize: "1.1rem" }} maxLength={4} />

                        <input
                          value={days[i].detail}
                          onChange={(e) => updateDay(i, "detail", e.target.value)}
                          placeholder={TYPE_PLACEHOLDERS[days[i].type] ?? "Describe the session"}
                          disabled={days[i].type === "Rest"}
                          style={{
                            ...inp,
                            borderColor: hasError ? "rgba(240,149,149,0.6)" : "rgba(255,255,255,0.1)",
                            background:  days[i].type === "Rest" ? "rgba(255,255,255,0.03)" : "#1a1a1a",
                            color:       days[i].type === "Rest" ? "#555" : "#fff",
                            cursor:      days[i].type === "Rest" ? "not-allowed" : "text",
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: "10px", color: "#444", marginTop: "0.5rem" }}>Columns: Day · Type · Emoji · Detail</div>
              </div>

              {/* Save */}
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                <button onClick={savePlan} disabled={saving}
                  style={{ padding: "10px 28px", background: "#e8620a", border: "none", borderRadius: "6px", color: "#fff", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", fontSize: "0.9rem", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>
                  {saving ? "Saving…" : "Save Plan"}
                </button>
                {saveMsg && (
                  <span style={{ fontSize: "0.82rem", color: saveMsg.startsWith("✓") ? "#4ade80" : "#f09595" }}>{saveMsg}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
