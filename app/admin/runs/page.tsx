"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";

interface Registration {
  id: string;
  created_at: string;
  event_name: string;
  event_date: string;
  event_location: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  blood_group: string;
  distance: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  is_member: boolean;
}

const th: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: "10px",
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#888",
  textAlign: "left",
  whiteSpace: "nowrap",
  borderBottom: "1px solid rgba(255,255,255,0.07)",
};

const td: React.CSSProperties = {
  padding: "11px 14px",
  fontSize: "0.8rem",
  color: "#e0e0e0",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
  whiteSpace: "nowrap",
};

export default function AdminRunsPage() {
  const [password,    setPassword]    = useState("");
  const [authed,      setAuthed]      = useState(false);
  const [authError,   setAuthError]   = useState("");
  const [loading,     setLoading]     = useState(false);
  const [data,        setData]        = useState<Registration[]>([]);
  const [fetchError,  setFetchError]  = useState("");
  const [eventFilter, setEventFilter] = useState("all");

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError("");
    const res = await fetch("/api/admin/runs", {
      headers: { "x-admin-password": password },
    });
    if (res.status === 401) {
      setAuthError("Incorrect password.");
      setLoading(false);
      return;
    }
    const json = await res.json();
    if (!res.ok) {
      setFetchError(json.error ?? "Failed to load data.");
      setLoading(false);
      return;
    }
    setData(json.data ?? []);
    setAuthed(true);
    setLoading(false);
  };

  const eventDates = useMemo(() => {
    const dates = [...new Set(data.map((r) => r.event_date))].sort((a, b) =>
      b.localeCompare(a)
    );
    return dates;
  }, [data]);

  useEffect(() => {
    if (eventDates.length > 0) setEventFilter(eventDates[0]);
  }, [eventDates]);

  const filtered = useMemo(
    () =>
      eventFilter === "all"
        ? data
        : data.filter((r) => r.event_date === eventFilter),
    [data, eventFilter]
  );

  const stats = useMemo(() => {
    const members    = filtered.filter((r) => r.is_member).length;
    const distMap: Record<string, number> = {};
    filtered.forEach((r) => { distMap[r.distance] = (distMap[r.distance] ?? 0) + 1; });
    return { total: filtered.length, members, guests: filtered.length - members, distMap };
  }, [filtered]);

  const downloadCSV = () => {
    const cols = [
      "Registered At", "Event Name", "Event Date", "Location",
      "First Name", "Last Name", "Email", "Phone",
      "Blood Group", "Distance",
      "Emergency Contact", "Emergency Phone",
      "Member",
    ];
    const rows = filtered.map((r) => [
      new Date(r.created_at).toLocaleString("en-IN"),
      r.event_name,
      r.event_date,
      r.event_location,
      r.first_name,
      r.last_name,
      r.email,
      r.phone,
      r.blood_group,
      r.distance,
      r.emergency_contact_name,
      r.emergency_contact_phone,
      r.is_member ? "Yes" : "No",
    ]);

    const escape = (v: string | number | boolean) => {
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const csv = [cols, ...rows].map((r) => r.map(escape).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const label = eventFilter === "all" ? "all-events" : eventFilter;
    a.href     = url;
    a.download = `run-registrations-${label}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
            <h1 style={{ fontSize: "1.4rem", fontWeight: 300, color: "#fff", marginBottom: "1.75rem" }}>Run Registrations</h1>
            <form onSubmit={login}>
              <label style={{ display: "block", fontSize: "11px", color: "#888", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setAuthError(""); }}
                placeholder="Enter admin password"
                autoFocus
                style={{ width: "100%", padding: "11px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#fff", fontSize: "0.875rem", outline: "none", boxSizing: "border-box", marginBottom: "1rem" }}
              />
              {authError && (
                <div style={{ background: "rgba(226,75,74,0.1)", border: "1px solid rgba(226,75,74,0.3)", borderRadius: "6px", padding: "9px 12px", marginBottom: "1rem", fontSize: "0.8rem", color: "#f09595" }}>
                  {authError}
                </div>
              )}
              <button type="submit" disabled={loading} style={{ width: "100%", padding: "12px", background: "#e8620a", color: "#fff", border: "none", borderRadius: "6px", fontSize: "0.9rem", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer" }}>
                {loading ? "Verifying…" : "Access Dashboard"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  /* ── Dashboard ── */
  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff" }}>

      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}>
            <Image src="/logo.png" alt="Connected Steps" width={30} height={30} className="rounded-full" />
          </Link>
          <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "#fff" }}>Admin</span>
          <span style={{ color: "#444", fontSize: "0.8rem" }}>/</span>
          <span style={{ fontSize: "0.85rem", color: "#888" }}>Run Registrations</span>
        </div>
        <button
          onClick={downloadCSV}
          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 18px", background: "#e8620a", color: "#fff", border: "none", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download Excel
        </button>
      </header>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {fetchError && (
          <div style={{ background: "rgba(226,75,74,0.1)", border: "1px solid rgba(226,75,74,0.3)", borderRadius: "6px", padding: "10px 14px", marginBottom: "1.5rem", fontSize: "0.825rem", color: "#f09595" }}>
            {fetchError}
          </div>
        )}

        {/* Event filter */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.75rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "11px", color: "#888", letterSpacing: "0.08em", textTransform: "uppercase" }}>Event</span>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {eventDates.map((d) => (
              <button key={d} onClick={() => setEventFilter(d)}
                style={{ padding: "5px 14px", borderRadius: "20px", border: "1px solid", fontSize: "0.8rem", cursor: "pointer", fontWeight: eventFilter === d ? 700 : 400, background: eventFilter === d ? "#e8620a" : "transparent", borderColor: eventFilter === d ? "#e8620a" : "rgba(255,255,255,0.15)", color: eventFilter === d ? "#fff" : "#aaa" }}>
                {d}
              </button>
            ))}
            {eventDates.length > 1 && (
              <button onClick={() => setEventFilter("all")}
                style={{ padding: "5px 14px", borderRadius: "20px", border: "1px solid", fontSize: "0.8rem", cursor: "pointer", fontWeight: eventFilter === "all" ? 700 : 400, background: eventFilter === "all" ? "#e8620a" : "transparent", borderColor: eventFilter === "all" ? "#e8620a" : "rgba(255,255,255,0.15)", color: eventFilter === "all" ? "#fff" : "#aaa" }}>
                All
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "1rem", marginBottom: "1.75rem" }}>
          {[
            { label: "Total Registered", value: stats.total },
            { label: "Members",          value: stats.members },
            { label: "Guests",           value: stats.guests },
            ...Object.entries(stats.distMap).map(([d, c]) => ({ label: d, value: c })),
          ].map((s) => (
            <div key={s.label} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", padding: "1rem 1.25rem" }}>
              <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "#e8620a" }}>{s.value}</div>
              <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: "2px" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                  <th style={th}>#</th>
                  <th style={th}>Name</th>
                  <th style={th}>Email</th>
                  <th style={th}>Phone</th>
                  <th style={th}>Blood Group</th>
                  <th style={th}>Distance</th>
                  <th style={th}>Emergency Contact</th>
                  <th style={th}>Emergency Phone</th>
                  <th style={th}>Member</th>
                  <th style={th}>Registered</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ ...td, textAlign: "center", padding: "3rem", color: "#555" }}>
                      No registrations yet for this event.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r, i) => (
                    <tr key={r.id} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                      <td style={{ ...td, color: "#555" }}>{i + 1}</td>
                      <td style={{ ...td, fontWeight: 600, color: "#fff" }}>{r.first_name} {r.last_name}</td>
                      <td style={td}>{r.email}</td>
                      <td style={td}>{r.phone}</td>
                      <td style={{ ...td, textAlign: "center" }}>
                        <span style={{ padding: "2px 10px", borderRadius: "12px", background: "rgba(232,98,10,0.12)", color: "#e8620a", fontSize: "0.75rem", fontWeight: 600 }}>{r.blood_group}</span>
                      </td>
                      <td style={{ ...td, textAlign: "center" }}>
                        <span style={{ padding: "2px 10px", borderRadius: "12px", background: "rgba(255,255,255,0.07)", color: "#ccc", fontSize: "0.75rem", fontWeight: 600 }}>{r.distance}</span>
                      </td>
                      <td style={td}>{r.emergency_contact_name}</td>
                      <td style={td}>{r.emergency_contact_phone}</td>
                      <td style={{ ...td, textAlign: "center" }}>
                        {r.is_member
                          ? <span style={{ color: "#4ade80", fontSize: "0.75rem", fontWeight: 600 }}>✓ Member</span>
                          : <span style={{ color: "#666", fontSize: "0.75rem" }}>Guest</span>}
                      </td>
                      <td style={{ ...td, color: "#666", fontSize: "0.75rem" }}>
                        {new Date(r.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p style={{ textAlign: "center", fontSize: "11px", color: "#444", marginTop: "1.5rem" }}>
          {filtered.length} registration{filtered.length !== 1 ? "s" : ""}
          {eventFilter !== "all" ? ` for ${eventFilter}` : " across all events"}
        </p>
      </div>
    </div>
  );
}
