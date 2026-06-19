"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

interface AppUser {
  firstName:     string;
  lastName:      string;
  email:         string;
  phone:         string;
  goal:          string;
  location:      string;
  photo:         string | null;
  phone_verified?: boolean;
}

interface Stats { totalPoints: number; totalSessions: number; rank: number | null; }

const GOAL_LABELS: Record<string, string> = {
  "5k": "First 5K", "10k": "10K", "half": "Half Marathon", "full": "Full Marathon",
  "ultra": "Ultra Marathon", "fitness": "General Fitness", "speed": "Improve Speed",
  "weight": "Weight Loss", "strength": "Strength & Endurance",
};

const GOAL_OPTIONS = [
  { value: "5k",       label: "First 5K"            },
  { value: "10k",      label: "10K"                 },
  { value: "half",     label: "Half Marathon"        },
  { value: "full",     label: "Full Marathon"        },
  { value: "ultra",    label: "Ultra Marathon"       },
  { value: "fitness",  label: "General Fitness"      },
  { value: "speed",    label: "Improve Speed/Pace"   },
  { value: "weight",   label: "Weight Loss"          },
  { value: "strength", label: "Strength & Endurance" },
];

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "10px", color: "#fff",
  fontSize: "0.875rem", outline: "none",
  boxSizing: "border-box", fontFamily: "inherit",
};

export default function ProfilePage() {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [user,      setUser]      = useState<AppUser | null>(null);
  const [photo,      setPhoto]      = useState<string | null>(null);
  const [photoFile,  setPhotoFile]  = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [stats,      setStats]      = useState<Stats | null>(null);
  const [showEdit,   setShowEdit]   = useState(false);

  const [info,      setInfo]      = useState({ firstName: "", lastName: "", location: "", goal: "5k" });
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoMsg,    setInfoMsg]    = useState("");
  const [infoError,  setInfoError]  = useState("");

  type PhoneStep = "idle" | "edit" | "otp_sent";
  const [phoneVerified,  setPhoneVerified]  = useState(false);
  const [currentPhone,   setCurrentPhone]   = useState("");
  const [phoneStep,      setPhoneStep]      = useState<PhoneStep>("idle");
  const [newPhone,       setNewPhone]       = useState("");
  const [phoneOtp,       setPhoneOtp]       = useState("");
  const [phoneBusy,      setPhoneBusy]      = useState(false);
  const [phoneError,     setPhoneError]     = useState("");
  const [phoneSuccess,   setPhoneSuccess]   = useState("");

  type EmailStep = "idle" | "editing" | "otp_sent";
  const [emailStep,    setEmailStep]    = useState<EmailStep>("idle");
  const [newEmail,     setNewEmail]     = useState("");
  const [emailOtp,     setEmailOtp]     = useState("");
  const [emailBusy,    setEmailBusy]    = useState(false);
  const [emailError,   setEmailError]   = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");

  const [pw,      setPw]      = useState({ current: "", next: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg,    setPwMsg]    = useState("");
  const [pwError,  setPwError]  = useState("");

  useEffect(() => {
    const raw = localStorage.getItem("cs_user");
    if (!raw) { router.replace("/auth"); return; }
    let u: AppUser;
    try { u = JSON.parse(raw); } catch { localStorage.removeItem("cs_user"); router.replace("/auth"); return; }
    setUser(u);
    setPhoto(u.photo ?? null);
    setInfo({ firstName: u.firstName, lastName: u.lastName, location: u.location ?? "", goal: u.goal ?? "5k" });
    setPhoneVerified(u.phone_verified ?? false);
    setCurrentPhone(u.phone ?? "");

    // Fetch stats — rank comes directly from /api/leaderboard/user (no full leaderboard fetch)
    const tok = localStorage.getItem("cs_user_token") ?? "";
    const authH = { "x-user-token": tok };
    Promise.all([
      fetch("/api/leaderboard/user", { headers: authH }).then(r => r.json()).catch(() => ({})),
      fetch("/api/user/sessions",    { headers: authH }).then(r => r.json()).catch(() => ({})),
    ]).then(([lb, sess]) => {
      const totalPoints   = lb.total_points   ?? 0;
      const totalSessions = (sess.sessions ?? []).filter((s: { attended: boolean }) => s.attended).length;
      setStats({ totalPoints, totalSessions, rank: lb.rank ?? null });
    });
  }, [router]);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError("");
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError("Photo must be under 2 MB. Please choose a smaller image.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhotoFile(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function savePhoto() {
    if (!photoFile || !user) return;
    const updated = { ...user, photo: photoFile };
    localStorage.setItem("cs_user", JSON.stringify(updated));
    setUser(updated);
    setPhoto(photoFile);
    setPhotoFile(null);
    const tok = localStorage.getItem("cs_user_token") ?? "";
    await fetch("/api/user/update", {
      method: "POST", headers: { "Content-Type": "application/json", "x-user-token": tok },
      body: JSON.stringify({ photo: photoFile }),
    }).catch(() => {});
  }

  async function saveInfo() {
    if (!user) return;
    if (!info.firstName.trim() || !info.lastName.trim()) { setInfoError("Name is required."); return; }
    setInfoSaving(true); setInfoError(""); setInfoMsg("");
    try {
      const tok  = localStorage.getItem("cs_user_token") ?? "";
      const res  = await fetch("/api/user/update", {
        method: "POST", headers: { "Content-Type": "application/json", "x-user-token": tok },
        body: JSON.stringify({ firstName: info.firstName, lastName: info.lastName, location: info.location, goal: info.goal }),
      });
      const data = await res.json();
      if (!res.ok) { setInfoError(data.error || "Failed to save."); return; }
      const updated = { ...user, firstName: info.firstName, lastName: info.lastName, location: info.location, goal: info.goal };
      localStorage.setItem("cs_user", JSON.stringify(updated));
      setUser(updated);
      setInfoMsg("Profile updated.");
    } catch { setInfoError("Something went wrong."); }
    finally { setInfoSaving(false); }
  }

  async function sendPhoneOtp() {
    const trimmed = newPhone.trim();
    if (!trimmed) { setPhoneError("Please enter a mobile number."); return; }
    if (trimmed === currentPhone && phoneVerified) { setPhoneError("This is already your verified number."); return; }
    setPhoneBusy(true); setPhoneError("");
    try {
      const purpose = trimmed !== currentPhone ? "change_phone" : "verify_phone";
      const res = await fetch("/api/auth/send-otp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "phone", value: trimmed, purpose }),
      });
      const data = await res.json();
      if (!res.ok) { setPhoneError(data.error || "Failed to send code."); return; }
      setPhoneStep("otp_sent");
    } catch { setPhoneError("Something went wrong."); }
    finally { setPhoneBusy(false); }
  }

  async function verifyAndSavePhone() {
    if (!phoneOtp.trim() || !user) { setPhoneError("Enter the 6-digit code."); return; }
    setPhoneBusy(true); setPhoneError("");
    try {
      const trimmed  = newPhone.trim();
      const purpose  = trimmed !== currentPhone ? "change_phone" : "verify_phone";
      const userToken = localStorage.getItem("cs_user_token") ?? "";
      const res = await fetch("/api/auth/verify-phone", {
        method: "POST", headers: { "Content-Type": "application/json", "x-user-token": userToken },
        body: JSON.stringify({ email: user.email, phone: trimmed, code: phoneOtp.trim(), purpose }),
      });
      const data = await res.json();
      if (!res.ok) { setPhoneError(data.error || "Verification failed."); return; }
      const updated = { ...user, phone: trimmed, phone_verified: true };
      localStorage.setItem("cs_user", JSON.stringify(updated));
      setUser(updated);
      setPhoneVerified(true);
      setCurrentPhone(trimmed);
      setPhoneStep("idle"); setNewPhone(""); setPhoneOtp("");
      setPhoneSuccess("Mobile number verified successfully. ✓");
    } catch { setPhoneError("Something went wrong."); }
    finally { setPhoneBusy(false); }
  }

  async function sendEmailOtp() {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) { setEmailError("Enter a valid email address."); return; }
    if (trimmed === user?.email.toLowerCase()) { setEmailError("This is already your current email."); return; }
    setEmailBusy(true); setEmailError("");
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "email", value: trimmed, name: user?.firstName, purpose: "change_email" }),
      });
      const data = await res.json();
      if (!res.ok) { setEmailError(data.error || "Failed to send code."); return; }
      setEmailStep("otp_sent");
    } catch { setEmailError("Something went wrong."); }
    finally { setEmailBusy(false); }
  }

  async function verifyAndChangeEmail() {
    if (!emailOtp.trim()) { setEmailError("Enter the verification code."); return; }
    setEmailBusy(true); setEmailError("");
    try {
      const res = await fetch("/api/user/change-email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentEmail: user?.email, newEmail: newEmail.trim().toLowerCase(), otp: emailOtp.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setEmailError(data.error || "Verification failed."); return; }
      const updated = { ...user!, email: data.email };
      localStorage.setItem("cs_user", JSON.stringify(updated));
      setUser(updated);
      setEmailStep("idle"); setNewEmail(""); setEmailOtp("");
      setEmailSuccess("Email updated successfully.");
    } catch { setEmailError("Something went wrong."); }
    finally { setEmailBusy(false); }
  }

  async function savePassword() {
    if (!user) return;
    if (!pw.current || !pw.next || !pw.confirm) { setPwError("All fields are required."); return; }
    if (pw.next !== pw.confirm) { setPwError("New passwords don't match."); return; }
    if (pw.next.length < 6) { setPwError("New password must be at least 6 characters."); return; }
    setPwSaving(true); setPwError(""); setPwMsg("");
    try {
      const res = await fetch("/api/user/change-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, currentPassword: pw.current, newPassword: pw.next }),
      });
      const data = await res.json();
      if (!res.ok) { setPwError(data.error || "Failed."); return; }
      setPwMsg("Password changed successfully.");
      setPw({ current: "", next: "", confirm: "" });
    } catch { setPwError("Something went wrong."); }
    finally { setPwSaving(false); }
  }

  function logout() {
    localStorage.removeItem("cs_user");
    localStorage.removeItem("cs_user_token");
    localStorage.removeItem("cs_strava");
    document.cookie = "cs_auth=; path=/; max-age=0; SameSite=Lax";
    router.replace("/auth");
  }

  if (!user) return null;

  const _f  = user.firstName ?? "";
  const _l  = user.lastName  ?? "";
  const ini = `${_f[0] ?? ""}${_l[0] ?? ""}`.toUpperCase() || "?";
  const displayPhoto = photoFile ?? photo;
  const fullName = `${_f} ${_l}`.trim();
  const goalLabel = GOAL_LABELS[user.goal] ?? user.goal;

  const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, color: "var(--muted-foreground)", marginBottom: 5, letterSpacing: "0.04em" };

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>

      {/* ── Header bar ── */}
      <header style={{ background: "var(--bg-glass)", backdropFilter: "blur(18px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "env(safe-area-inset-top) 1.5rem 0", minHeight: "calc(56px + env(safe-area-inset-top))", height: "calc(56px + env(safe-area-inset-top))", display: "flex", alignItems: "flex-end", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10, paddingBottom: "0.5rem" }}>
        <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}>
          <Image src="/logo.png" alt="" width={26} height={26} className="rounded-full" />
        </Link>
        <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--foreground)" }}>Profile</span>
        <button
          onClick={() => setShowEdit(e => !e)}
          style={{ fontSize: "0.78rem", color: "var(--cs-orange)", fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "4px 8px" }}>
          {showEdit ? "Done" : "Edit"}
        </button>
      </header>

      <div style={{ maxWidth: "520px", margin: "0 auto", padding: "1.5rem 1.25rem 6rem", display: "flex", flexDirection: "column", gap: "1rem" }}>

        {/* ── Profile header ── */}
        <div style={{ textAlign: "center", paddingBottom: "0.5rem" }}>
          {/* Avatar */}
          <div style={{ position: "relative", display: "inline-block", marginBottom: "1rem" }}>
            {displayPhoto ? (
              <img src={displayPhoto} alt={fullName}
                style={{ width: 88, height: 88, borderRadius: "50%", objectFit: "cover", border: "3px solid var(--cs-orange)", display: "block" }} />
            ) : (
              <div style={{ width: 88, height: 88, borderRadius: "50%", background: "oklch(0.72 0.19 49 / 15%)", border: "3px solid var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem", fontWeight: 800, color: "var(--cs-orange)" }}>
                {ini}
              </div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              style={{ position: "absolute", bottom: 0, right: 0, width: 28, height: 28, borderRadius: "50%", background: "var(--cs-orange)", border: "2px solid var(--background)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: "none" }} />

          {/* Save photo prompt */}
          {photoFile && (
            <div style={{ marginBottom: "0.75rem" }}>
              <button onClick={savePhoto}
                style={{ padding: "8px 20px", background: "var(--gradient-accent)", border: "none", borderRadius: 20, color: "#fff", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "var(--shadow-orange)" }}>
                Save photo
              </button>
            </div>
          )}
          {photoError && <div style={{ fontSize: 11, color: "#f09595", marginBottom: 8 }}>{photoError}</div>}

          {/* Name + goal */}
          <h2 style={{ fontSize: "1.5rem", fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.02em" }}>{fullName}</h2>
          <div style={{ fontSize: "0.82rem", color: "var(--muted-foreground)" }}>
            {goalLabel}{user.location ? ` · ${user.location}` : ""}
          </div>
        </div>

        {/* ── Stats strip ── */}
        <div className="cs-stats-strip">
          <div className="cs-stats-col">
            <div className="cs-stats-val">{stats?.totalPoints ?? "—"}</div>
            <div className="cs-stats-lbl">Points</div>
          </div>
          <div className="cs-stats-col">
            <div className="cs-stats-val">{stats?.totalSessions ?? "—"}</div>
            <div className="cs-stats-lbl">Sessions</div>
          </div>
          <div className="cs-stats-col">
            <div className="cs-stats-val">{stats?.rank ? `#${stats.rank}` : "—"}</div>
            <div className="cs-stats-lbl">Monthly Rank</div>
          </div>
        </div>

        {/* ── Quick links ── */}
        <div className="cs-menu-card">
          {([
            { label: "Notifications",     href: "/notifications", icon: (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            )},
            { label: "My Registrations", href: "/events",         icon: (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            )},
            { label: "Membership",        href: "/membership",   icon: (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>
              </svg>
            )},
            { label: "Referral Rewards",  href: "/referrals",    icon: (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
              </svg>
            )},
            { label: "Coach Q&A",         href: "/my-questions", icon: (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            )},
          ] as { label: string; href: string; icon: React.ReactNode }[]).map(item => (
            <Link key={item.href} href={item.href} className="cs-menu-row">
              <span style={{ width: 24, textAlign: "center", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)" }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              <span style={{ color: "var(--muted-foreground)", fontSize: "0.8rem" }}>›</span>
            </Link>
          ))}
        </div>

        {/* ── Edit sections (toggle via header button) ── */}
        {showEdit && (
          <>
            {/* Personal Info */}
            <section style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "1.25rem" }}>
              <div className="cs-label" style={{ marginBottom: "1rem" }}>Personal Info</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div><label style={labelStyle}>First name</label><input value={info.firstName} onChange={e => setInfo(p => ({ ...p, firstName: e.target.value }))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Last name</label><input value={info.lastName} onChange={e => setInfo(p => ({ ...p, lastName: e.target.value }))} style={inputStyle} /></div>
                </div>

                {/* Email */}
                <div>
                  <label style={labelStyle}>Email</label>
                  {emailStep === "idle" && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input value={user.email} readOnly style={{ ...inputStyle, flex: 1, color: "var(--muted-foreground)", cursor: "not-allowed" }} />
                      <button onClick={() => { setEmailStep("editing"); setEmailError(""); setEmailSuccess(""); }}
                        style={{ padding: "11px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "var(--foreground)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                        Edit
                      </button>
                    </div>
                  )}
                  {emailStep === "editing" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input value={newEmail} onChange={e => { setNewEmail(e.target.value); setEmailError(""); }} placeholder="New email address" type="email" autoFocus style={{ ...inputStyle, flex: 1 }} />
                        <button onClick={() => { setEmailStep("idle"); setNewEmail(""); setEmailError(""); }}
                          style={{ padding: "11px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                      </div>
                      <button onClick={sendEmailOtp} disabled={emailBusy || !newEmail.trim()}
                        style={{ padding: "11px 16px", borderRadius: 10, border: "none", background: emailBusy ? "oklch(0.72 0.19 49 / 50%)" : "var(--gradient-accent)", color: "#fff", fontSize: "0.82rem", fontWeight: 700, cursor: emailBusy ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: emailBusy ? "none" : "var(--shadow-orange)" }}>
                        {emailBusy ? "Sending…" : "Send verification code"}
                      </button>
                    </div>
                  )}
                  {emailStep === "otp_sent" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontSize: "0.78rem", color: "var(--muted-foreground)" }}>Code sent to <strong style={{ color: "var(--foreground)" }}>{newEmail}</strong></div>
                      <input value={emailOtp} onChange={e => { setEmailOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setEmailError(""); }} placeholder="6-digit code" inputMode="numeric" autoFocus style={{ ...inputStyle, letterSpacing: "0.2em", fontSize: "1.1rem", textAlign: "center" }} />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={verifyAndChangeEmail} disabled={emailBusy || emailOtp.length < 6}
                          style={{ flex: 1, padding: "11px 16px", borderRadius: 10, border: "none", background: emailBusy || emailOtp.length < 6 ? "oklch(0.72 0.19 49 / 50%)" : "var(--gradient-accent)", color: "#fff", fontSize: "0.82rem", fontWeight: 700, cursor: emailBusy || emailOtp.length < 6 ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                          {emailBusy ? "Verifying…" : "Verify & update"}
                        </button>
                        <button onClick={() => { setEmailStep("editing"); setEmailOtp(""); setEmailError(""); }}
                          style={{ padding: "11px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
                      </div>
                    </div>
                  )}
                  {emailError   && <div style={{ fontSize: "0.78rem", color: "#f09595", marginTop: 4 }}>{emailError}</div>}
                  {emailSuccess && <div style={{ fontSize: "0.78rem", color: "#4ade80", marginTop: 4 }}>{emailSuccess}</div>}
                </div>

                {/* Phone */}
                <div>
                  <label style={labelStyle}>
                    Mobile number{" "}
                    {phoneVerified
                      ? <span style={{ color: "#4ade80", fontWeight: 600 }}>✓ Verified</span>
                      : <span style={{ color: "#fca5a5", fontWeight: 600 }}>⚠ Not verified</span>}
                  </label>
                  {phoneStep === "idle" && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <input value={currentPhone || "No number added"} readOnly style={{ ...inputStyle, flex: 1, color: "var(--muted-foreground)", cursor: "not-allowed" }} />
                      <button onClick={() => { setPhoneStep("edit"); setNewPhone(currentPhone); setPhoneError(""); setPhoneSuccess(""); }}
                        style={{ padding: "11px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "var(--foreground)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                        {phoneVerified ? "Change" : (currentPhone ? "Verify" : "Add & Verify")}
                      </button>
                    </div>
                  )}
                  {phoneStep === "edit" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input value={newPhone} onChange={e => { setNewPhone(e.target.value); setPhoneError(""); }} placeholder="e.g. 9876543210" type="tel" autoFocus style={{ ...inputStyle, flex: 1 }} />
                        <button onClick={() => { setPhoneStep("idle"); setNewPhone(""); setPhoneError(""); }}
                          style={{ padding: "11px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                      </div>
                      <button onClick={sendPhoneOtp} disabled={phoneBusy || !newPhone.trim()}
                        style={{ padding: "11px 16px", borderRadius: 10, border: "none", background: phoneBusy ? "oklch(0.72 0.19 49 / 50%)" : "var(--gradient-accent)", color: "#fff", fontSize: "0.82rem", fontWeight: 700, cursor: phoneBusy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                        {phoneBusy ? "Sending…" : "Send OTP via WhatsApp"}
                      </button>
                    </div>
                  )}
                  {phoneStep === "otp_sent" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontSize: "0.78rem", color: "var(--muted-foreground)" }}>OTP sent to <strong style={{ color: "var(--foreground)" }}>{newPhone}</strong> via WhatsApp.</div>
                      <input value={phoneOtp} onChange={e => { setPhoneOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setPhoneError(""); }} placeholder="6-digit code" inputMode="numeric" autoFocus style={{ ...inputStyle, letterSpacing: "0.2em", fontSize: "1.1rem", textAlign: "center" }} />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={verifyAndSavePhone} disabled={phoneBusy || phoneOtp.length < 6}
                          style={{ flex: 1, padding: "11px 16px", borderRadius: 10, border: "none", background: phoneBusy || phoneOtp.length < 6 ? "oklch(0.72 0.19 49 / 50%)" : "var(--gradient-accent)", color: "#fff", fontSize: "0.82rem", fontWeight: 700, cursor: phoneBusy || phoneOtp.length < 6 ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                          {phoneBusy ? "Verifying…" : "Verify & Save"}
                        </button>
                        <button onClick={() => { setPhoneStep("edit"); setPhoneOtp(""); setPhoneError(""); }}
                          style={{ padding: "11px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
                      </div>
                    </div>
                  )}
                  {phoneError   && <div style={{ fontSize: "0.78rem", color: "#f09595", marginTop: 4 }}>{phoneError}</div>}
                  {phoneSuccess && <div style={{ fontSize: "0.78rem", color: "#4ade80", marginTop: 4 }}>{phoneSuccess}</div>}
                </div>

                <div><label style={labelStyle}>Training location</label><input value={info.location} onChange={e => setInfo(p => ({ ...p, location: e.target.value }))} placeholder="e.g. Kondapur" style={inputStyle} /></div>
                <div>
                  <label style={labelStyle}>Goal</label>
                  <select value={info.goal} onChange={e => setInfo(p => ({ ...p, goal: e.target.value }))} style={{ ...inputStyle, cursor: "pointer", colorScheme: "dark" }}>
                    {GOAL_OPTIONS.map(g => <option key={g.value} value={g.value} style={{ background: "#1a1a1a" }}>{g.label}</option>)}
                  </select>
                </div>

                {infoError && <div style={{ fontSize: "0.8rem", color: "#f09595" }}>{infoError}</div>}
                {infoMsg   && <div style={{ fontSize: "0.8rem", color: "#4ade80" }}>{infoMsg}</div>}

                <button onClick={saveInfo} disabled={infoSaving}
                  style={{ padding: "13px", background: infoSaving ? "oklch(0.72 0.19 49 / 60%)" : "var(--gradient-accent)", color: "#fff", border: "none", borderRadius: 12, fontSize: "0.9rem", fontWeight: 700, cursor: infoSaving ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: infoSaving ? "none" : "var(--shadow-orange)" }}>
                  {infoSaving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </section>

            {/* Change Password */}
            <section style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "1.25rem" }}>
              <div className="cs-label" style={{ marginBottom: "1rem" }}>Change Password</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div><label style={labelStyle}>Current password</label><input type="password" value={pw.current} onChange={e => setPw(p => ({ ...p, current: e.target.value }))} style={inputStyle} /></div>
                <div><label style={labelStyle}>New password</label><input type="password" value={pw.next} onChange={e => setPw(p => ({ ...p, next: e.target.value }))} style={inputStyle} /></div>
                <div><label style={labelStyle}>Confirm new password</label><input type="password" value={pw.confirm} onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} style={inputStyle} /></div>
                {pwError && <div style={{ fontSize: "0.8rem", color: "#f09595" }}>{pwError}</div>}
                {pwMsg   && <div style={{ fontSize: "0.8rem", color: "#4ade80" }}>{pwMsg}</div>}
                <button onClick={savePassword} disabled={pwSaving}
                  style={{ padding: "13px", background: "rgba(255,255,255,0.05)", color: "var(--foreground)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: "0.9rem", fontWeight: 600, cursor: pwSaving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                  {pwSaving ? "Changing…" : "Change password"}
                </button>
              </div>
            </section>

          </>
        )}

        {/* ── Log out ── */}
        <button
          onClick={logout}
          style={{ width: "100%", padding: "14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)", borderRadius: 14, color: "#f87171", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.02em" }}>
          Log out
        </button>

        <div style={{ height: "env(safe-area-inset-bottom)" }} />
      </div>
    </div>
  );
}
