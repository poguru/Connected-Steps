"use client";

import { useState, useEffect } from "react";

interface Staff {
  id: string;
  full_name: string;
  email: string;
  mobile: string | null;
  staff_code: string;
  role: string;
  status: string;
  last_login_at: string | null;
  created_at: string;
}

const ROLES = ["bib_staff", "checkin_staff", "breakfast_staff", "goodies_staff", "tshirt_staff", "medal_staff", "event_admin"];
const ACCENT = "#e8620a";

export default function StaffOpsPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    mobile: "",
    staffCode: "",
    password: "",
    role: "bib_staff",
  });

  useEffect(() => {
    loadStaff();
  }, []);

  async function loadStaff() {
    setLoading(true);
    try {
      const res = await fetch("/api/it-run/admin/staff");
      if (res.ok) {
        const data = (await res.json()) as { data: Staff[] };
        setStaff(data.data || []);
      }
    } catch {
      console.error("Failed to load staff");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!form.fullName || !form.email || !form.staffCode || !form.password || !form.role) {
      alert("All fields required");
      return;
    }

    try {
      const res = await fetch("/api/it-run/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email,
          mobile: form.mobile || null,
          staffCode: form.staffCode,
          password: form.password,
          role: form.role,
        }),
      });

      if (res.ok) {
        setForm({ fullName: "", email: "", mobile: "", staffCode: "", password: "", role: "bib_staff" });
        setOpenCreate(false);
        loadStaff();
      } else {
        alert("Failed to create staff");
      }
    } catch {
      alert("Network error");
    }
  }

  async function updateStatus(id: string, status: string) {
    try {
      const res = await fetch("/api/it-run/admin/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });

      if (res.ok) {
        loadStaff();
      }
    } catch {
      console.error("Failed to update staff");
    }
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#fff", margin: 0 }}>Race-Day Staff</h1>
        <button
          onClick={() => setOpenCreate(!openCreate)}
          style={{
            padding: "10px 16px",
            background: ACCENT,
            border: "none",
            borderRadius: 8,
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {openCreate ? "Cancel" : "+ Add Staff"}
        </button>
      </div>

      {openCreate && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h3 style={{ color: "#fff", marginTop: 0 }}>Create New Staff</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <input
              placeholder="Full Name"
              value={form.fullName}
              onChange={e => setForm({ ...form, fullName: e.target.value })}
              style={{ padding: "10px 12px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontFamily: "inherit" }}
            />
            <input
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              style={{ padding: "10px 12px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontFamily: "inherit" }}
            />
            <input
              placeholder="Mobile"
              value={form.mobile}
              onChange={e => setForm({ ...form, mobile: e.target.value })}
              style={{ padding: "10px 12px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontFamily: "inherit" }}
            />
            <input
              placeholder="Staff Code"
              value={form.staffCode}
              onChange={e => setForm({ ...form, staffCode: e.target.value })}
              style={{ padding: "10px 12px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontFamily: "inherit" }}
            />
            <input
              placeholder="Password"
              type="password"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              style={{ padding: "10px 12px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontFamily: "inherit" }}
            />
            <select
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value })}
              style={{ padding: "10px 12px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontFamily: "inherit" }}
            >
              {ROLES.map(r => (
                <option key={r} value={r}>
                  {r.replace("_", " ").toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleCreate}
            style={{ padding: "10px 16px", background: ACCENT, border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
          >
            Create Staff
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ color: "#888", textAlign: "center", padding: 40 }}>Loading…</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {staff.map(s => (
            <div key={s.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{s.full_name}</div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                    {s.email} · {s.staff_code}
                  </div>
                  <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                    {s.role.replace("_", " ").toUpperCase()} · {s.status === "active" ? "🟢 Active" : "🔴 " + s.status}
                    {s.last_login_at && ` · Last: ${new Date(s.last_login_at).toLocaleDateString()}`}
                  </div>
                </div>
                <select
                  value={s.status}
                  onChange={e => updateStatus(s.id, e.target.value)}
                  style={{ padding: "6px 10px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "#fff", fontFamily: "inherit" }}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
