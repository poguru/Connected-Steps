"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, Button, Input, Label, Alert, Badge, StatCard } from "@/components/ui/ds";

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
  const [authed,      setAuthed]      = useState(true);
  const [authError,   setAuthError]   = useState("");
  const [loading,     setLoading]     = useState(false);
  const [data,        setData]        = useState<Registration[]>([]);
  const [eventFilter, setEventFilter] = useState("all");

  const login = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setLoading(true); setAuthError("");
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) { setAuthError("Incorrect password."); return; }
      setAuthed(true);
    } catch {
      setAuthError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch("/api/admin/auth").then(r => { if (r.ok) setAuthed(true); }).catch(() => {});
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!authed) return;
    fetch("/api/admin/runs")
      .then(r => r.json())
      .then(j => { if (j.data) setData(j.data); })
      .catch(() => {});
  }, [authed]); // eslint-disable-line

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
      r.created_at ? new Date(r.created_at).toLocaleString("en-IN") : "",
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
          <Card>
            <Badge color="orange" style={{ marginBottom: "0.5rem" }}>Admin Access</Badge>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 300, color: "#fff", marginBottom: "1.75rem" }}>Run Registrations</h1>
            <form onSubmit={login} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <Label>Password</Label>
              <Input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setAuthError(""); }} placeholder="Enter admin password" autoFocus />
              {authError && <Alert variant="error">{authError}</Alert>}
              <Button type="submit" loading={loading} fullWidth>Access Dashboard</Button>
            </form>
          </Card>
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
        <Button size="sm" onClick={downloadCSV}>↓ Download Excel</Button>
      </header>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem 1.5rem" }}>

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
            <StatCard key={s.label} label={s.label} value={s.value} />
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
                        <Badge color="orange" size="sm">{r.blood_group}</Badge>
                      </td>
                      <td style={{ ...td, textAlign: "center" }}>
                        <Badge color="gray" size="sm">{r.distance}</Badge>
                      </td>
                      <td style={td}>{r.emergency_contact_name}</td>
                      <td style={td}>{r.emergency_contact_phone}</td>
                      <td style={{ ...td, textAlign: "center" }}>
                        {r.is_member
                          ? <Badge color="green" size="sm">✓ Member</Badge>
                          : <Badge color="gray" size="sm">Guest</Badge>}
                      </td>
                      <td style={{ ...td, color: "#666", fontSize: "0.75rem" }}>
                        {r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
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
