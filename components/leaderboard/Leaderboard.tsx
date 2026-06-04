"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Crown, Trophy, Medal, Flame, TrendingUp } from "lucide-react";
import UserMenu, { MenuUser } from "@/components/ui/UserMenu";

interface User       { firstName: string; lastName: string; email: string; phone: string; photo: string | null; goal: string; location: string; }
interface LeaderboardEntry { id: string; user_email: string; user_name: string; location: string; month_points: number; total_points: number; photo: string | null; }

function initials(name: string) { return name.split(" ").map(n => n[0] ?? "").join("").slice(0, 2).toUpperCase(); }

const podiumCfg = [
  { ring: "from-amber-300 via-yellow-400 to-amber-600", badge: "linear-gradient(135deg,#fcd34d,#d97706)", icon: Crown,  heights: ["h-40 sm:h-48", "h-56 sm:h-72", "h-32 sm:h-40"] },
  { ring: "from-zinc-200 via-zinc-400 to-zinc-500",    badge: "linear-gradient(135deg,#e4e4e7,#a1a1aa)", icon: Trophy, heights: ["h-40 sm:h-48", "h-56 sm:h-72", "h-32 sm:h-40"] },
  { ring: "from-orange-400 via-amber-600 to-amber-800", badge: "linear-gradient(135deg,#fb923c,#92400e)", icon: Medal,  heights: ["h-40 sm:h-48", "h-56 sm:h-72", "h-32 sm:h-40"] },
];

export default function Leaderboard() {
  const router = useRouter();
  const [user,       setUser]       = useState<User | null>(null);
  const [entries,    setEntries]    = useState<LeaderboardEntry[]>([]);
  const [tab,        setTab]        = useState<"month" | "total">("month");
  const [loading,    setLoading]    = useState(true);
  const [locFilter,  setLocFilter]  = useState("All");

  useEffect(() => {
    const stored = localStorage.getItem("cs_user");
    if (!stored) { router.push("/auth"); return; }
    setUser(JSON.parse(stored));
  }, [router]);

  useEffect(() => {
    setLoading(true);
    fetch("/api/leaderboard")
      .then(r => r.json())
      .then(d => {
        if (d.entries) {
          const pointsKey = tab === "month" ? "month_points" : "total_points";
          const sorted = [...d.entries].sort((a: LeaderboardEntry, b: LeaderboardEntry) => (b[pointsKey] ?? 0) - (a[pointsKey] ?? 0));
          setEntries(sorted);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tab]);

  if (!user) return null;

  const pointsKey = tab === "month" ? "month_points" : "total_points";
  const locations = ["All", ...Array.from(new Set(entries.map(e => e.location).filter(l => l && !l.includes("@")))).sort()];
  const filtered  = locFilter === "All" ? entries : entries.filter(e => e.location === locFilter);

  const ranks: number[] = [];
  for (let i = 0; i < filtered.length; i++) {
    if (i === 0) { ranks.push(1); continue; }
    ranks.push((filtered[i][pointsKey] ?? 0) === (filtered[i-1][pointsKey] ?? 0) ? ranks[i-1] : ranks[i-1] + 1);
  }

  const myIndex = filtered.findIndex(e => e.user_email === user.email);
  const myRank  = myIndex >= 0 ? ranks[myIndex] : null;
  const podium  = filtered.slice(0, 3);
  const rest    = filtered.slice(3);

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>

      {/* Navbar */}
      <header className="cs-app-nav" style={{ background: "oklch(0.18 0.015 270 / 70%)", backdropFilter: "blur(18px)", borderBottom: "1px solid var(--border)" }}>
        <div className="cs-app-nav-inner">
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
            <Image src="/logo.png" alt="Connected Steps" width={36} height={36} className="rounded-full" />
            <span className="font-display" style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)" }}>Connected Steps</span>
          </Link>
          <nav className="cs-app-nav-links">
            {[{ label: "Dashboard", href: "/dashboard" }, { label: "Weekend Run", href: "/weekend-run" }, { label: "Leaderboard", href: "/leaderboard" }, { label: "Community", href: "/community" }, { label: "Achievements", href: "/achievements" }, { label: "Pricing", href: "/pricing" }].map(item => (
              <Link key={item.label} href={item.href} style={{ fontSize: "0.875rem", color: item.label === "Leaderboard" ? "var(--primary)" : "var(--muted-foreground)", textDecoration: "none" }}>{item.label}</Link>
            ))}
          </nav>
          <div className="cs-app-nav-user">
            <UserMenu user={user as MenuUser} onUserUpdate={u => { setUser(u as User); localStorage.setItem("cs_user", JSON.stringify(u)); }} />
          </div>
        </div>
      </header>

      {/* Hero */}
      <section style={{ position: "relative", overflow: "hidden" }}>
        <div className="absolute -top-32 left-1/2 h-96 rounded-full blur-3xl pointer-events-none"
          style={{ width: "60rem", transform: "translateX(-50%)", background: "oklch(0.74 0.2 50 / 20%)" }} />
        <div className="dot-bg absolute inset-0" style={{ opacity: 0.4 }} />
        <div style={{ position: "relative", maxWidth: 1280, margin: "0 auto", padding: "4rem 1.5rem 3rem", textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, border: "1px solid var(--border)", background: "oklch(0.19 0.015 270 / 60%)", padding: "6px 14px", fontSize: 12, fontWeight: 500, color: "var(--muted-foreground)", backdropFilter: "blur(8px)", marginBottom: "1.25rem" }}>
            <Flame size={14} style={{ color: "var(--accent)" }} /> Updated live · Hyderabad chapter
          </div>

          <h1 className="font-display" style={{ fontSize: "clamp(2.5rem, 7vw, 5rem)", fontWeight: 700, lineHeight: 1.02, letterSpacing: "-0.015em" }}>
            The <span className="text-italic-serif">Leaderboard</span>.
          </h1>
          <p style={{ margin: "1rem auto 0", maxWidth: 480, fontSize: "1rem", color: "var(--muted-foreground)" }}>
            Friendly competition. Real accountability. The runners showing up for every kilometre.
          </p>

          {/* Tabs + filter */}
          <div style={{ marginTop: "2rem", display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "inline-flex", borderRadius: 999, border: "1px solid var(--border)", background: "oklch(0.19 0.015 270 / 70%)", padding: 4, backdropFilter: "blur(8px)" }}>
              {(["month", "total"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  borderRadius: 999, padding: "8px 20px", fontSize: "0.875rem", fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "var(--font-body)", transition: "all 0.2s",
                  background: tab === t ? "var(--gradient-accent)" : "transparent",
                  color: tab === t ? "var(--accent-foreground)" : "var(--muted-foreground)",
                  boxShadow: tab === t ? "var(--shadow-orange)" : "none",
                }}>
                  {t === "month" ? "This month" : "All time"}
                </button>
              ))}
            </div>
            <select value={locFilter} onChange={e => setLocFilter(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: 999, border: "1px solid var(--border)", background: "oklch(0.19 0.015 270 / 70%)", color: "var(--foreground)", fontSize: "0.8rem", fontFamily: "var(--font-body)", outline: "none", cursor: "pointer", colorScheme: "dark", backdropFilter: "blur(8px)" }}>
              {locations.map(l => <option key={l} value={l} style={{ background: "#1a1a1a" }}>{l === "All" ? "All locations" : l}</option>)}
            </select>
          </div>

          {/* My rank pill */}
          {myRank && (
            <div style={{ marginTop: "1.25rem", display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, background: "oklch(0.72 0.19 49 / 10%)", border: "1px solid oklch(0.72 0.19 49 / 25%)", padding: "6px 16px", fontSize: "0.875rem" }}>
              <span style={{ color: "var(--muted-foreground)" }}>Your rank:</span>
              <span style={{ fontWeight: 700, color: "var(--primary)" }}>#{myRank}</span>
            </div>
          )}

          {/* Podium */}
          {!loading && podium.length >= 3 && (
            <div style={{ maxWidth: 640, margin: "3rem auto 0", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", alignItems: "flex-end", gap: 12 }}>
              {[1, 0, 2].map((idx, i) => {
                const r   = podium[idx];
                const cfg = podiumCfg[idx];
                const Icon = cfg.icon;
                const heightMap = ["10rem", "14rem", "8rem"];
                return (
                  <motion.div key={r.user_email} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ position: "relative", marginBottom: 12, borderRadius: "50%", padding: 3, background: `linear-gradient(135deg, ${cfg.ring.includes("amber") ? "#fcd34d,#d97706" : cfg.ring.includes("zinc") ? "#e4e4e7,#a1a1aa" : "#fb923c,#92400e"})` }}>
                      <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center", fontFamily: "var(--font-display)", fontSize: "1.1rem", fontWeight: 700, color: "var(--foreground)" }}>
                        {initials(r.user_name)}
                      </div>
                      <div style={{ position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)", width: 24, height: 24, borderRadius: "50%", background: cfg.badge, display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, color: "#000", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
                        {idx + 1}
                      </div>
                    </div>
                    <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--foreground)", textAlign: "center" }}>{r.user_name.split(" ")[0]}</div>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 16 }}>📍 {r.location}</div>
                    <div style={{ width: "100%", height: heightMap[i], position: "relative", overflow: "hidden", borderRadius: "12px 12px 0 0", border: "1px solid var(--border)", background: "var(--surface)", padding: 12, textAlign: "center" }}>
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, ${cfg.ring.includes("amber") ? "#fcd34d,#d97706" : cfg.ring.includes("zinc") ? "#e4e4e7,#a1a1aa" : "#fb923c,#92400e"})` }} />
                      <Icon size={20} style={{ margin: "8px auto 4px", display: "block", color: "var(--accent)" }} />
                      <div className="font-display" style={{ fontSize: "1.5rem", fontWeight: 700 }}>{r[pointsKey] ?? 0}</div>
                      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)" }}>pts</div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Full table */}
      {!loading && rest.length > 0 && (
        <section style={{ maxWidth: 960, margin: "0 auto", padding: "0 1.5rem 6rem" }}>
          <div style={{ overflow: "hidden", borderRadius: 24, border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 100px", gap: 16, borderBottom: "1px solid var(--border)", background: "var(--surface-elevated)", padding: "12px 24px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)" }}>
              <div>Rank</div><div>Runner</div><div style={{ textAlign: "right" }}>Points</div>
            </div>
            {rest.map((r, i) => {
              const isMe = r.user_email === user.email;
              return (
                <motion.div key={r.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                  style={{ display: "grid", gridTemplateColumns: "60px 1fr 100px", gap: 16, alignItems: "center", borderBottom: "1px solid oklch(1 0 0 / 4%)", padding: "14px 24px", background: isMe ? "oklch(0.72 0.19 49 / 5%)" : "transparent", transition: "background 0.2s" }}
                  onMouseEnter={e => { if (!isMe) (e.currentTarget as HTMLElement).style.background = "var(--surface-elevated)"; }}
                  onMouseLeave={e => { if (!isMe) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                  <div style={{ fontFamily: "monospace", fontSize: "0.875rem", fontWeight: 700, color: "var(--muted-foreground)" }}>#{ranks[i + 3]}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: "50%", background: "var(--gradient-primary)", display: "grid", placeItems: "center", fontFamily: "var(--font-display)", fontSize: "0.875rem", fontWeight: 600, color: "#fff" }}>
                      {initials(r.user_name)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "0.875rem", fontWeight: 600, color: isMe ? "var(--primary)" : "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.user_name}{isMe ? " (you)" : ""}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 1 }}>📍 {r.location}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 700, color: "var(--primary)" }}>
                    {r[pointsKey] ?? 0} <span style={{ fontSize: 10, fontWeight: 400, color: "var(--muted-foreground)" }}>pts</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
          <div style={{ marginTop: "2rem", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
            <TrendingUp size={16} style={{ color: "var(--accent)" }} />
            Want to climb the ranks? Attend a session and start logging.
          </div>
        </section>
      )}

      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: "4rem", color: "var(--muted-foreground)", fontSize: "0.875rem" }}>Loading leaderboard…</div>
      )}
    </div>
  );
}
