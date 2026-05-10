"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

export interface MenuUser {
  firstName: string;
  lastName:  string;
  email:     string;
  phone:     string;
  goal:      string;
  location:  string;
  photo:     string | null;
}

const goalLabel: Record<string, string> = {
  "5k":  "First 5K",
  "10k": "10K",
  "half":"Half Marathon",
  "full":"Full Marathon",
};

interface Props {
  user: MenuUser;
  onUserUpdate?: (u: MenuUser) => void;
}

export default function UserMenu({ user, onUserUpdate }: Props) {
  const router  = useRouter();
  const ref         = useRef<HTMLDivElement>(null);
  const triggerRef  = useRef<HTMLButtonElement>(null);
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [dropPos, setDropPos] = useState({ top: 0, right: 0 });
  const [form,    setForm]    = useState({
    firstName: user.firstName,
    lastName:  user.lastName,
    phone:     user.phone     ?? "",
    location:  user.location  ?? "",
    goal:      user.goal      ?? "5k",
  });

  // close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setEditing(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // sync form when user prop changes
  useEffect(() => {
    setForm({
      firstName: user.firstName,
      lastName:  user.lastName,
      phone:     user.phone    ?? "",
      location:  user.location ?? "",
      goal:      user.goal     ?? "5k",
    });
  }, [user]);

  const logout = () => {
    localStorage.removeItem("cs_user");
    localStorage.removeItem("cs_strava");
    router.push("/auth");
  };

  const save = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res  = await fetch("/api/user/update", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: user.email, ...form }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to save."); return; }
      const updated: MenuUser = { ...user, ...form };
      localStorage.setItem("cs_user", JSON.stringify(updated));
      onUserUpdate?.(updated);
      setEditing(false);
      setOpen(false);
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  const fullName = `${user.firstName} ${user.lastName}`;
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();

  return (
    <div ref={ref} style={{ position: "relative" }}>

      {/* ── Trigger ── */}
      <button
        ref={triggerRef}
        onClick={() => {
          if (!open && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setDropPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
          }
          setOpen(!open);
          setEditing(false);
        }}
        style={{ display: "flex", alignItems: "center", gap: "0.6rem", background: "none", border: "none", cursor: "pointer", padding: "4px 6px", borderRadius: "6px" }}
      >
        {user.photo ? (
          <img src={user.photo} alt={fullName} style={{ width: "36px", height: "36px", borderRadius: "50%", objectFit: "cover", border: "2px solid var(--cs-orange)" }} />
        ) : (
          <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700, color: "var(--cs-white)", flexShrink: 0 }}>
            {initials}
          </div>
        )}
        <span style={{ fontSize: "0.875rem", color: "var(--cs-white)" }}>{fullName}</span>
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ color: "var(--cs-muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* ── Dropdown (fixed so it always escapes navbar stacking context) ── */}
      {open && (
        <div style={{ position: "fixed", top: dropPos.top, right: dropPos.right, background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", width: "290px", zIndex: 9999, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>

          {!editing ? (
            <>
              {/* Profile snapshot */}
              <div style={{ padding: "1.25rem", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
                  {user.photo ? (
                    <img src={user.photo} alt={fullName} style={{ width: "52px", height: "52px", borderRadius: "50%", objectFit: "cover", border: "2px solid var(--cs-orange)", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", fontWeight: 700, color: "var(--cs-white)", flexShrink: 0 }}>
                      {initials}
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "2px" }}>{fullName}</div>
                    <div style={{ fontSize: "11px", color: "var(--cs-orange)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{goalLabel[user.goal] ?? user.goal}</div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--cs-muted)" }}>✉️&nbsp; {user.email}</div>
                  {user.phone   && <div style={{ fontSize: "0.8rem", color: "var(--cs-muted)" }}>📱&nbsp; {user.phone}</div>}
                  {user.location && <div style={{ fontSize: "0.8rem", color: "var(--cs-muted)" }}>📍&nbsp; {user.location}</div>}
                </div>
              </div>

              {/* Actions */}
              <div style={{ padding: "0.5rem" }}>
                <button
                  onClick={() => setEditing(true)}
                  style={{ width: "100%", padding: "0.65rem 1rem", display: "flex", alignItems: "center", gap: "0.6rem", background: "none", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.875rem", color: "var(--cs-white)", fontFamily: "var(--font-body)", textAlign: "left" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  ✏️&nbsp; Edit Profile
                </button>
                <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "0.2rem 0.5rem" }} />
                <button
                  onClick={logout}
                  style={{ width: "100%", padding: "0.65rem 1rem", display: "flex", alignItems: "center", gap: "0.6rem", background: "none", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.875rem", color: "#f09595", fontFamily: "var(--font-body)", textAlign: "left" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(226,75,74,0.08)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  ↩️&nbsp; Log out
                </button>
              </div>
            </>
          ) : (
            /* ── Edit form ── */
            <div style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--cs-white)" }}>Edit Profile</div>
                <button onClick={() => setEditing(false)} style={{ background: "none", border: "none", color: "var(--cs-muted)", cursor: "pointer", fontSize: "1.1rem", lineHeight: 1 }}>✕</button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                  <input
                    value={form.firstName}
                    onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
                    placeholder="First name"
                    className="auth-input"
                    style={{ fontSize: "13px", padding: "8px 10px" }}
                  />
                  <input
                    value={form.lastName}
                    onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
                    placeholder="Last name"
                    className="auth-input"
                    style={{ fontSize: "13px", padding: "8px 10px" }}
                  />
                </div>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="Phone number"
                  className="auth-input"
                  style={{ fontSize: "13px", padding: "8px 10px" }}
                />
                <input
                  value={form.location}
                  onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                  placeholder="Training location (e.g. Kondapur)"
                  className="auth-input"
                  style={{ fontSize: "13px", padding: "8px 10px" }}
                />
                <select
                  value={form.goal}
                  onChange={(e) => setForm((p) => ({ ...p, goal: e.target.value }))}
                  className="auth-input"
                  style={{ fontSize: "13px", padding: "8px 10px", colorScheme: "dark" }}
                >
                  <option value="5k">First 5K</option>
                  <option value="10k">10K</option>
                  <option value="half">Half Marathon</option>
                  <option value="full">Full Marathon</option>
                </select>

                {error && <div style={{ fontSize: "12px", color: "#f09595" }}>{error}</div>}

                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
                  <button
                    onClick={save}
                    disabled={saving}
                    style={{ flex: 1, padding: "9px", background: saving ? "rgba(232,98,10,0.6)" : "var(--cs-orange)", color: "var(--cs-white)", border: "none", borderRadius: "4px", cursor: saving ? "not-allowed" : "pointer", fontSize: "13px", fontWeight: 600, fontFamily: "var(--font-body)" }}
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    style={{ flex: 1, padding: "9px", background: "transparent", color: "var(--cs-muted)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "4px", cursor: "pointer", fontSize: "13px", fontFamily: "var(--font-body)" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
