"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, Button, Input, Alert, Badge, StatCard } from "@/components/ui/ds";

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
  const [authed,      setAuthed]      = useState(true);
  const [pw,          setPw]          = useState("");
  const [authError,   setAuthError]   = useState("");
  const [loading,     setLoading]     = useState(false);
  const [summary,     setSummary]     = useState<Summary | null>(null);
  const [referrals,   setReferrals]   = useState<Referral[]>([]);
  const [topRefs,     setTopRefs]     = useState<TopReferrer[]>([]);
  const [search,      setSearch]      = useState("");

  // Backfill form
  const [bfCode,      setBfCode]      = useState("");
  const [bfEmail,     setBfEmail]     = useState("");
  const [bfLoading,   setBfLoading]   = useState(false);
  const [bfResult,    setBfResult]    = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/auth").then(r => { if (r.ok) setAuthed(true); }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (authed) load(); }, [authed]); // eslint-disable-line

  async function login(password: string) {
    setLoading(true); setAuthError("");
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) { setAuthError("Incorrect password."); return; }
      setAuthed(true);
    } catch { setAuthError("Network error."); }
    finally { setLoading(false); }
  }

  async function backfill() {
    setBfLoading(true); setBfResult(null);
    try {
      const res = await fetch("/api/admin/referrals/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referralCode: bfCode.trim(), referredEmail: bfEmail.trim() }),
      });
      const d = await res.json();
      if (res.ok) {
        setBfResult({ ok: true, msg: d.message });
        setBfCode(""); setBfEmail("");
        load();
      } else {
        setBfResult({ ok: false, msg: d.error ?? "Failed" });
      }
    } catch {
      setBfResult({ ok: false, msg: "Network error" });
    } finally {
      setBfLoading(false);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/referrals");
      if (!res.ok) { setAuthError("Failed to load."); return; }
      const d = await res.json();
      setSummary(d.summary);
      setReferrals(d.referrals ?? []);
      setTopRefs(d.topReferrers ?? []);
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
      <div style={{ width: 320 }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.5rem" }}>
            <Image src="/logo.png" alt="Connected Steps" width={32} height={32} className="rounded-full" />
            <div>
              <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#fff" }}>Connected Steps</div>
              <Badge color="orange" size="sm" style={{ marginTop: 3 }}>Admin · Referrals</Badge>
            </div>
          </div>
          <Input type="password" placeholder="Admin password" value={pw}
            onChange={e => { setPw(e.target.value); setAuthError(""); }}
            onKeyDown={e => e.key === "Enter" && login(pw)}
            style={{ marginBottom: "0.75rem" }} />
          {authError && <Alert variant="error" style={{ marginBottom: "0.75rem" }}>{authError}</Alert>}
          <Button fullWidth loading={loading} onClick={() => login(pw)}>Access Admin</Button>
          <Link href="/admin" style={{ display: "block", textAlign: "center", marginTop: "1rem", fontSize: "0.75rem", color: "#555", textDecoration: "none" }}>← Back to Admin Hub</Link>
        </Card>
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
            <StatCard label="Total Referrals" value={summary.total}         icon="🔗" />
            <StatCard label="Successful"      value={summary.successful}    icon="✅" />
            <StatCard label="Rewards Issued"  value={summary.rewardsIssued} icon="🎁" />
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

        {/* Backfill missed referral */}
        <Card style={{ marginBottom: "2rem" }}>
          <div style={{ fontSize: "0.75rem", color: "#666", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>Retroactive Referral Fix</div>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" as const, alignItems: "flex-end" }}>
            <Input value={bfCode} onChange={e => setBfCode(e.target.value.toUpperCase())} placeholder="e.g. ZMGR2639" style={{ flex: 1, minWidth: 140 }} />
            <Input value={bfEmail} onChange={e => setBfEmail(e.target.value)} placeholder="friend@example.com" style={{ flex: 2, minWidth: 200 }} />
            <Button loading={bfLoading} disabled={!bfCode.trim() || !bfEmail.trim()} onClick={backfill}>Grant Reward</Button>
          </div>
          {bfResult && <Alert variant={bfResult.ok ? "success" : "error"} style={{ marginTop: "0.75rem" }}>{bfResult.msg}</Alert>}
        </Card>

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
                      <Badge size="sm" style={{ background: s.bg, color: s.color }}>{s.label}</Badge>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {r.reward_granted
                        ? <Badge size="sm" color="green">✓ Granted{r.rewarded_at ? ` · ${fmt(r.rewarded_at)}` : ""}</Badge>
                        : <Badge size="sm" color="gray">Pending</Badge>}
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
