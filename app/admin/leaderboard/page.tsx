"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";

interface ArchiveEntry {
  id:           number;
  month:        string;
  rank:         number;
  user_email:   string;
  user_name:    string;
  location:     string;
  goal:         string;
  month_points: number;
  total_points: number;
  archived_at:  string;
}

const MONTH_NAMES: Record<string, string> = {
  "01":"January","02":"February","03":"March","04":"April",
  "05":"May","06":"June","07":"July","08":"August",
  "09":"September","10":"October","11":"November","12":"December",
};

function monthLabel(m: string) {
  const [year, mo] = m.split("-");
  return `${MONTH_NAMES[mo] ?? mo} ${year}`;
}

function medal(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px",
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "6px", color: "#fff", fontSize: "0.825rem", outline: "none", boxSizing: "border-box",
};

export default function AdminLeaderboardPage() {
  const [password, setPassword] = useState("");
  const [authed,   setAuthed]   = useState(false);
  const [authErr,  setAuthErr]  = useState("");
  const [authLoad, setAuthLoad] = useState(false);

  const [archives,    setArchives]    = useState<ArchiveEntry[]>([]);
  const [archiving,   setArchiving]   = useState(false);
  const [archiveMsg,  setArchiveMsg]  = useState("");
  const [expanded,    setExpanded]    = useState<string | null>(null);

  const headers = { "Content-Type": "application/json", "x-admin-password": password };

  const login = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setAuthLoad(true); setAuthErr("");
    try {
      const res  = await fetch("/api/admin/leaderboard/archive", { headers: { "x-admin-password": password } });
      const json = await res.json();
      if (res.status === 401) { setAuthErr("Incorrect password."); return; }
      if (!res.ok) { setAuthErr(json.error ?? "Server error."); return; }
      setArchives(json.archives ?? []);
      setAuthed(true);
      if (json.archives?.length > 0) setExpanded(json.archives[0].month);
    } catch {
      setAuthErr("Network error. Try again.");
    } finally {
      setAuthLoad(false);
    }
  };

  const loadArchives = useCallback(async () => {
    const res  = await fetch("/api/admin/leaderboard/archive", { headers });
    const json = await res.json();
    if (json.archives) setArchives(json.archives);
  }, [password]); // eslint-disable-line react-hooks/exhaustive-deps

  const archiveNow = async () => {
    setArchiving(true); setArchiveMsg("");
    const currentMonth = new Date().toISOString().slice(0, 7);
    try {
      const res  = await fetch("/api/admin/leaderboard/archive", {
        method: "POST",
        headers,
        body: JSON.stringify({ month: currentMonth }),
      });
      const json = await res.json();
      if (!res.ok) { setArchiveMsg(`Error: ${json.error}`); return; }
      setArchiveMsg(`Saved ${json.saved} entries for ${monthLabel(json.month)}.`);
      await loadArchives();
      setExpanded(currentMonth);
    } catch {
      setArchiveMsg("Network error. Try again.");
    } finally {
      setArchiving(false);
    }
  };

  // Group archives by month
  const months = [...new Set(archives.map((a) => a.month))];

  /* ── Password gate ── */
  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
        <div style={{ width: "100%", maxWidth: "360px" }}>
          <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none", marginBottom: "2rem" }}>
            <Image src="/logo.png" alt="Connected Steps" width={36} height={36} className="rounded-full" />
            <div>
              <div style={{ fontSize: "1rem", fontWeight: 600, color: "#fff" }}>Connected Steps</div>
              <div style={{ fontSize: "10px", color: "#e8620a", letterSpacing: "0.1em", textTransform: "uppercase" }}>Leaderboard Archive</div>
            </div>
          </Link>
          <form onSubmit={login} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <input type="password" placeholder="Admin password" value={password} onChange={(e) => setPassword(e.target.value)} style={inp} />
            {authErr && <div style={{ fontSize: "12px", color: "#f09595" }}>{authErr}</div>}
            <button type="submit" disabled={authLoad} style={{ padding: "10px", background: "#e8620a", color: "#fff", border: "none", borderRadius: "6px", fontWeight: 700, cursor: authLoad ? "not-allowed" : "pointer", fontSize: "0.875rem" }}>
              {authLoad ? "Checking…" : "Access Dashboard"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* ── Dashboard ── */
  const currentMonth     = new Date().toISOString().slice(0, 7);
  const alreadyArchived  = months.includes(currentMonth);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff" }}>
      <header style={{ background: "#111", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "1rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
          <Image src="/logo.png" alt="Connected Steps" width={32} height={32} className="rounded-full" />
          <div>
            <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#fff" }}>Admin</div>
            <div style={{ fontSize: "10px", color: "#e8620a", textTransform: "uppercase", letterSpacing: "0.08em" }}>Leaderboard Archive</div>
          </div>
        </Link>
      </header>

      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "2rem" }}>

        {/* Archive current month */}
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "1.5rem", marginBottom: "2rem" }}>
          <div style={{ fontSize: "11px", color: "#888", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
            Current Period
          </div>
          <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "#fff", marginBottom: "0.25rem" }}>
            {monthLabel(currentMonth)}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#888", marginBottom: "1.25rem" }}>
            Save a snapshot of this month's top performers before the month ends. You can re-save to update it.
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <button
              onClick={archiveNow}
              disabled={archiving}
              style={{ padding: "10px 24px", background: archiving ? "rgba(232,98,10,0.5)" : "#e8620a", color: "#fff", border: "none", borderRadius: "6px", fontWeight: 700, cursor: archiving ? "not-allowed" : "pointer", fontSize: "0.875rem" }}
            >
              {archiving ? "Saving…" : alreadyArchived ? `Re-save ${monthLabel(currentMonth)}` : `Save ${monthLabel(currentMonth)} Leaderboard`}
            </button>
            {archiveMsg && (
              <div style={{ fontSize: "0.8rem", color: archiveMsg.startsWith("Error") ? "#f09595" : "#4ade80" }}>
                {archiveMsg}
              </div>
            )}
          </div>
        </div>

        {/* Past archives */}
        <div style={{ fontSize: "11px", color: "#888", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "1rem" }}>
          Saved Monthly Results
        </div>

        {months.length === 0 ? (
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", padding: "3rem", textAlign: "center", color: "#555" }}>
            No archived months yet. Save the current month to create the first record.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {months.map((month) => {
              const rows = archives.filter((a) => a.month === month);
              const isOpen = expanded === month;
              return (
                <div key={month} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", overflow: "hidden" }}>
                  {/* Month header */}
                  <button
                    onClick={() => setExpanded(isOpen ? null : month)}
                    style={{ width: "100%", padding: "1rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", color: "#fff", cursor: "pointer", textAlign: "left" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div style={{ fontSize: "1rem", fontWeight: 600 }}>{monthLabel(month)}</div>
                      {rows[0] && (
                        <div style={{ fontSize: "10px", color: "#888" }}>
                          {rows.length} participant{rows.length !== 1 ? "s" : ""}
                        </div>
                      )}
                      {/* Top 3 preview */}
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        {rows.slice(0, 3).map((r) => (
                          <span key={r.rank} style={{ fontSize: "11px", background: "rgba(232,98,10,0.15)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: "4px", padding: "2px 8px", color: "#e8620a" }}>
                            {medal(r.rank)} {r.user_name.split(" ")[0]}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span style={{ color: "#555", fontSize: "1rem" }}>{isOpen ? "▲" : "▼"}</span>
                  </button>

                  {/* Rows */}
                  {isOpen && (
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      {/* Table header */}
                      <div style={{ display: "grid", gridTemplateColumns: "48px 1fr 100px 100px", gap: "0.5rem", padding: "0.6rem 1.5rem", background: "rgba(255,255,255,0.02)" }}>
                        {["Rank","Athlete","Location","Points"].map((h) => (
                          <div key={h} style={{ fontSize: "10px", color: "#555", letterSpacing: "0.08em", textTransform: "uppercase" }}>{h}</div>
                        ))}
                      </div>
                      {rows.map((r) => (
                        <div
                          key={r.id}
                          style={{
                            display: "grid", gridTemplateColumns: "48px 1fr 100px 100px", gap: "0.5rem",
                            padding: "0.75rem 1.5rem", borderTop: "1px solid rgba(255,255,255,0.04)",
                            background: r.rank <= 3 ? "rgba(232,98,10,0.04)" : "transparent",
                          }}
                        >
                          <div style={{ fontSize: r.rank <= 3 ? "1.1rem" : "0.875rem", fontWeight: 700, color: r.rank <= 3 ? "#e8620a" : "#555" }}>
                            {medal(r.rank)}
                          </div>
                          <div>
                            <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#fff" }}>{r.user_name}</div>
                            <div style={{ fontSize: "11px", color: "#555" }}>{r.user_email}</div>
                          </div>
                          <div style={{ fontSize: "0.825rem", color: "#888", alignSelf: "center" }}>📍 {r.location || "—"}</div>
                          <div style={{ fontSize: "1rem", fontWeight: 700, color: "#e8620a", alignSelf: "center" }}>
                            {r.month_points} <span style={{ fontSize: "10px", color: "#555", fontWeight: 400 }}>pts</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
