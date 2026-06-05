"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import ConnectedApps from "@/components/settings/ConnectedApps";

interface AppUser {
  firstName: string;
  lastName:  string;
  email:     string;
  phone:     string;
  goal:      string;
  location:  string;
  photo:     string | null;
}

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
  width: "100%", padding: "10px 12px",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "6px", color: "#fff",
  fontSize: "0.875rem", outline: "none",
  boxSizing: "border-box", fontFamily: "inherit",
};

export default function ProfilePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [user,      setUser]      = useState<AppUser | null>(null);
  const [photo,      setPhoto]      = useState<string | null>(null);
  const [photoFile,  setPhotoFile]  = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");

  // info form
  const [info,      setInfo]      = useState({ firstName: "", lastName: "", phone: "", location: "", goal: "5k" });
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoMsg,    setInfoMsg]    = useState("");
  const [infoError,  setInfoError]  = useState("");

  // password form
  const [pw,      setPw]      = useState({ current: "", next: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg,    setPwMsg]    = useState("");
  const [pwError,  setPwError]  = useState("");

  useEffect(() => {
    const raw = localStorage.getItem("cs_user");
    if (!raw) { router.replace("/auth"); return; }
    const u: AppUser = JSON.parse(raw);
    setUser(u);
    setPhoto(u.photo ?? null);
    setInfo({ firstName: u.firstName, lastName: u.lastName, phone: u.phone ?? "", location: u.location ?? "", goal: u.goal ?? "5k" });
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
    // Persist to DB so photo survives logout
    await fetch("/api/user/update", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email: user.email, photo: photoFile }),
    }).catch(() => {});
  }

  async function saveInfo() {
    if (!user) return;
    if (!info.firstName.trim() || !info.lastName.trim()) { setInfoError("Name is required."); return; }
    setInfoSaving(true); setInfoError(""); setInfoMsg("");
    try {
      const res  = await fetch("/api/user/update", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, ...info }),
      });
      const data = await res.json();
      if (!res.ok) { setInfoError(data.error || "Failed to save."); return; }
      const updated = { ...user, ...info };
      localStorage.setItem("cs_user", JSON.stringify(updated));
      setUser(updated);
      setInfoMsg("Profile updated.");
    } catch { setInfoError("Something went wrong."); }
    finally { setInfoSaving(false); }
  }

  async function savePassword() {
    if (!user) return;
    if (!pw.current || !pw.next || !pw.confirm) { setPwError("All fields are required."); return; }
    if (pw.next !== pw.confirm) { setPwError("New passwords don't match."); return; }
    if (pw.next.length < 6) { setPwError("New password must be at least 6 characters."); return; }
    setPwSaving(true); setPwError(""); setPwMsg("");
    try {
      const res  = await fetch("/api/user/change-password", {
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

  if (!user) return null;

  const ini = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();
  const displayPhoto = photoFile ?? photo;

  const sectionStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "1.5rem", boxShadow: "var(--shadow-md)" };
  const labelStyle:   React.CSSProperties = { display: "block", fontSize: 11, color: "var(--muted-foreground)", marginBottom: 5, letterSpacing: "0.04em" };
  const newInputStyle: React.CSSProperties = { ...inputStyle, background: "var(--surface-elevated)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)" };

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>

      <header style={{ background: "oklch(0.18 0.015 270 / 80%)", backdropFilter: "blur(18px)", borderBottom: "1px solid var(--border)", padding: "0 1.5rem", height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Link href="/dashboard">
            <Image src="/logo.png" alt="" width={28} height={28} className="rounded-full" />
          </Link>
          <span className="font-display" style={{ fontSize: "1rem", fontWeight: 600, color: "var(--foreground)" }}>Edit Profile</span>
        </div>
        <Link href="/dashboard" style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", textDecoration: "none" }}>← Dashboard</Link>
      </header>

      <div style={{ maxWidth: "560px", margin: "0 auto", padding: "2rem 1.25rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>

        {/* Photo */}
        <section style={sectionStyle}>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1.25rem", fontWeight: 600 }}>Profile Photo</div>
          <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
            {displayPhoto ? (
              <img src={displayPhoto} alt="avatar" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--primary)", flexShrink: 0 }} />
            ) : (
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--gradient-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                {ini}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <button onClick={() => fileRef.current?.click()}
                style={{ padding: "8px 16px", background: "var(--surface-elevated)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)", fontSize: "0.82rem", cursor: "pointer", fontFamily: "inherit" }}>
                Choose photo
              </button>
              {photoFile && (
                <button onClick={savePhoto}
                  style={{ padding: "8px 16px", background: "var(--gradient-accent)", border: "none", borderRadius: 8, color: "var(--accent-foreground)", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", boxShadow: "var(--shadow-orange)" }}>
                  Save photo
                </button>
              )}
              <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>JPG or PNG · Max 2 MB</div>
              {photoError && <div style={{ fontSize: 11, color: "#f09595" }}>{photoError}</div>}
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: "none" }} />
        </section>

        {/* Personal Info */}
        <section style={sectionStyle}>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1.25rem", fontWeight: 600 }}>Personal Info</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div><label style={labelStyle}>First name</label><input value={info.firstName} onChange={e => setInfo(p => ({ ...p, firstName: e.target.value }))} style={newInputStyle} /></div>
              <div><label style={labelStyle}>Last name</label><input value={info.lastName} onChange={e => setInfo(p => ({ ...p, lastName: e.target.value }))} style={newInputStyle} /></div>
            </div>
            <div><label style={labelStyle}>Email</label><input value={user.email} readOnly style={{ ...newInputStyle, color: "var(--muted-foreground)", cursor: "not-allowed" }} /></div>
            <div><label style={labelStyle}>Phone</label><input value={info.phone} onChange={e => setInfo(p => ({ ...p, phone: e.target.value }))} placeholder="+91 00000 00000" style={newInputStyle} /></div>
            <div><label style={labelStyle}>Training location</label><input value={info.location} onChange={e => setInfo(p => ({ ...p, location: e.target.value }))} placeholder="e.g. Kondapur" style={newInputStyle} /></div>
            <div>
              <label style={labelStyle}>Goal</label>
              <select value={info.goal} onChange={e => setInfo(p => ({ ...p, goal: e.target.value }))} style={{ ...newInputStyle, cursor: "pointer", colorScheme: "dark" }}>
                {GOAL_OPTIONS.map(g => <option key={g.value} value={g.value} style={{ background: "#1a1a1a" }}>{g.label}</option>)}
              </select>
            </div>
            {infoError && <div style={{ fontSize: "0.8rem", color: "#f09595" }}>{infoError}</div>}
            {infoMsg   && <div style={{ fontSize: "0.8rem", color: "var(--cs-success)" }}>{infoMsg}</div>}
            <button onClick={saveInfo} disabled={infoSaving} style={{ padding: "12px", background: infoSaving ? "oklch(0.72 0.19 49 / 60%)" : "var(--gradient-accent)", color: "var(--accent-foreground)", border: "none", borderRadius: 999, fontSize: "0.875rem", fontWeight: 700, cursor: infoSaving ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: infoSaving ? "none" : "var(--shadow-orange)" }}>
              {infoSaving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </section>

        {/* Change Password */}
        <section style={sectionStyle}>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1.25rem", fontWeight: 600 }}>Change Password</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div><label style={labelStyle}>Current password</label><input type="password" value={pw.current} onChange={e => setPw(p => ({ ...p, current: e.target.value }))} style={newInputStyle} /></div>
            <div><label style={labelStyle}>New password</label><input type="password" value={pw.next} onChange={e => setPw(p => ({ ...p, next: e.target.value }))} style={newInputStyle} /></div>
            <div><label style={labelStyle}>Confirm new password</label><input type="password" value={pw.confirm} onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} style={newInputStyle} /></div>
            {pwError && <div style={{ fontSize: "0.8rem", color: "#f09595" }}>{pwError}</div>}
            {pwMsg   && <div style={{ fontSize: "0.8rem", color: "var(--cs-success)" }}>{pwMsg}</div>}
            <button onClick={savePassword} disabled={pwSaving} style={{ padding: "12px", background: pwSaving ? "var(--surface-elevated)" : "var(--surface-elevated)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 999, fontSize: "0.875rem", fontWeight: 700, cursor: pwSaving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              {pwSaving ? "Changing…" : "Change password"}
            </button>
          </div>
        </section>

        {/* Connected Apps */}
        <section style={sectionStyle}>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1.25rem", fontWeight: 600 }}>Connected Apps</div>
          <ConnectedApps userEmail={user.email} />
        </section>

      </div>
    </div>
  );
}
