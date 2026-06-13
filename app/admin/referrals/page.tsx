"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

interface Referral {
  id:             string;
  referral_code:  string;
  referrer_email: string;
  referrer_name:  string;
  referred_email: string;
  referred_name:  string;
  status:         string;
  reward_granted: boolean;
  created_at:     string;
  rewarded_at:    string | null;
}

interface TopReferrer {
  email: string;
  name:  string;
  count: number;
}

interface Summary {
  total:         number;
  successful:    number;
  rewardsIssued: number;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  reward_issued: { bg: "rgba(74,222,128,0.1)",  color: "#4ade80", label: "Reward Issued" },
  completed:     { bg: "rgba(250,204,21,0.1)",  color: "#facc15", label: "Completed"     },
  pending:       { bg: "rgba(148,163,184,0.1)", color: "#94a3b8", label: "Pending"       },
};

export default function AdminReferralsPage() {
  const [authed,      setAuthed]      = useState(false);
  const [pw,          setPw]          = useState("");
  const [authError,   setAuthError]   = useState("");
  const [loading,     setLoading]     = useState(false);
  const [summary,     setSummary]     = useState<Summary | null>(null);
  const [referrals,   setReferrals]   = useState<Referral[]>([]);
  const [topRefs,     setTopRefs]     = useState<TopReferrer[]>([]);
  const [search,      setSearch]      = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("cs_admin_pw");
    if (stored) load(stored);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(password: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/referrals", { headers: { "x-admin-password": password } });
      if (!res.ok) { setAuthError("Incorrect password."); return; }
      const d = await res.json();
      setSummary(d.summary);
      setReferrals(d.referrals ?? []);
      setTopRefs(d.topReferrers ?? []);
      setAuthed(true);
    } catch { setAuthError("Failed to load data."); }
    finally { setLoading(false); }
  }

  const filtered = referrals.filter(r =>
    !search ||
    r.referrer_name.toLowerCase().includes(search.toLowerCase()) ||
    r.referred_name.toLowerCase().includes(search.toLowerCase()) ||
    r.referral_code.toLowerCase().includes(search.toLowerCase())
  );

  if (!authed) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "2rem", width: 320 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.5rem" }}>
          <Image src="/logo.png" alt="Connected Steps" width={32} height={32} className="rounded-full" />
          <div>
            <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#fff" }}>Connected Steps</div>
            <div style={{ fontSize: "10px", color: "#e8620a", letterSpacing: "0.1em", textTransform: "uppercase" }}>Admin · Referrals</div>
          </div>
        </div>
        <input type="password" placeholder="Admin password" value={pw}
          onChange={e => { setPw(e.target.value); setAuthError(""); }}
          onKeyDown={e => e.key === "Enter" && load(pw)}
          style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", fontSize: "0.875rem", outline: "none", boxSizing: "border-box", marginBottom: "0.75rem", fontFamily: "inherit" }}
        />
        {authError && <div style={{ fontSize: "0.8rem", color: "#f09595", marginBottom: "0.75rem" }}>{authError}</div>}
        <button onClick={() => load(pw)} disabled={loading}
          style={{ width: "100%", padding: 10, background: "#e8620a", color: "#fff", border: "none", borderRadius: 6, fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          {loading ? "Loading…" : "Access Admin"}
        </button>
        <Link href="/admin" style={{ display: "block", textAlign: "center", marginTop: "1rem", fontSize: "0.75rem", color: "#555", textDecoration: "none" }}>← Back to Admin Hub</Link>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff" }}>

      {/* Header */}
      <div style={{ padding: "1.25rem 2rem", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", gap: "1rem" }}>
        <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}>
          <Image src="/logo.png" alt="Connected Steps" width={28} height={28} className="rounded-full" />
          <span style={{ fontSize: "0.9rem", color: "#aaa" }}>Admin</span>
        </Link>
        <span style={{ color: "#444" }}>/</span>
        <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#fff" }}>Referrals</span>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Summary cards */}
        {summary && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "2.5rem" }}>
            {[
              { label: "Total Referrals",   value: summary.total,         icon: "🔗" },
              { label: "Successful",        value: summary.successful,    icon: "✅" },
              { label: "Rewards Issued",    value: summary.rewardsIssued, icon: "🎁" },
            ].map(c => (
              <div key={c.label} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "1.25rem" }}>
                <div style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>{c.icon}</div>
                <div style={{ fontSize: "2rem", fontWeight: 700, color: "#e8620a", lineHeight: 1 }}>{c.value}</div>
                <div style={{ fontSize: "0.75rem", color: "#666", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{c.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Top referrers */}
        {topRefs.length > 0 && (
          <div style={{ marginBottom: "2.5rem" }}>
            <div style={{ fontSize: "0.75rem", color: "#666", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>Top Referrers</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.625rem" }}>
              {topRefs.map((t, i) => (
                <div key={t.email} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "0.5rem 0.875rem", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: "0.7rem", color: "#e8620a", fontWeight: 700 }}>#{i + 1}</span>
                  <span style={{ fontSize: "0.8rem", color: "#fff", fontWeight: 500 }}>{t.name}</span>
                  <span style={{ fontSize: "0.7rem", color: "#666" }}>{t.count} invite{t.count !== 1 ? "s" : ""}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div style={{ marginBottom: "1rem" }}>
          <input
            type="search"
            placeholder="Search by name or code…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: "9px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: "0.875rem", outline: "none", width: "100%", maxWidth: 340, boxSizing: "border-box", fontFamily: "inherit" }}
          />
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["Code", "Referrer", "Referred User", "Date", "Status", "Reward"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "#666", fontWeight: 600, textTransform: "uppercase", fontSize: "10px", letterSpacing: "0.08em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "3rem", color: "#444" }}>
                    {search ? "No referrals match your search." : "No referrals yet."}
                  </td>
                </tr>
              )}
              {filtered.map(r => {
                const s = STATUS_STYLES[r.status] ?? STATUS_STYLES.pending;
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "10px 12px" }}>
                      <code style={{ color: "#e8620a", fontWeight: 700, letterSpacing: "0.1em" }}>{r.referral_code}</code>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ fontWeight: 500, color: "#fff" }}>{r.referrer_name}</div>
                      <div style={{ fontSize: "10px", color: "#555" }}>{r.referrer_email}</div>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ fontWeight: 500, color: "#fff" }}>{r.referred_name}</div>
                      <div style={{ fontSize: "10px", color: "#555" }}>{r.referred_email}</div>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#888" }}>{fmt(r.created_at)}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ padding: "3px 8px", borderRadius: 999, background: s.bg, color: s.color, fontSize: "10px", fontWeight: 600 }}>
                        {s.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {r.reward_granted
                        ? <span style={{ color: "#4ade80", fontSize: "10px", fontWeight: 600 }}>✓ Granted{r.rewarded_at ? ` · ${fmt(r.rewarded_at)}` : ""}</span>
                        : <span style={{ color: "#555", fontSize: "10px" }}>Pending</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
