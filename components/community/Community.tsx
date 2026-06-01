"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import UserMenu, { MenuUser } from "@/components/ui/UserMenu";

interface User {
  firstName: string;
  lastName:  string;
  email:     string;
  phone:     string;
  goal:      string;
  location:  string;
  photo:     string | null;
}

interface Runner {
  user_email:   string;
  user_name:    string;
  location:     string;
  goal:         string;
  total_points: number;
  month_points: number;
}

const goalLabel: Record<string, string> = {
  "5k":  "First 5K",
  "10k": "10K",
  "half":"Half Marathon",
  "full":"Full Marathon",
};

export default function Community() {
  const router = useRouter();
  const [user,          setUser]          = useState<User | null>(null);
  const [query,         setQuery]         = useState("");
  const [runners,       setRunners]       = useState<Runner[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("cs_user");
    if (!stored) { router.push("/auth"); return; }
    const u: User = JSON.parse(stored);
    setUser(u);

    // Load all runners initially
    search("");
  }, [router]);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.users) setRunners(data.users);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  if (!user) return null;

  const fullName = `${user.firstName} ${user.lastName}`;

  return (
    <div style={{ minHeight: "100vh", background: "var(--cs-black)", color: "var(--cs-white)" }}>

      {/* Navbar */}
      <header className="cs-app-nav">
        <div className="cs-app-nav-inner">
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
            <Image src="/logo.png" alt="Connected Steps" width={36} height={36} className="rounded-full" />
            <span className="font-display" style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--cs-white)" }}>Connected Steps</span>
          </Link>

          <nav className="cs-app-nav-links">
            {[
              { label: "Dashboard",    href: "/dashboard" },
              { label: "Weekend Run",  href: "/weekend-run" },
              { label: "Leaderboard", href: "/leaderboard" },
              { label: "Community",   href: "/community" },
              { label: "Achievements",href: "/achievements" },
              { label: "Pricing",     href: "/pricing" },
            ].map((item) => (
              <Link key={item.label} href={item.href} style={{ fontSize: "0.875rem", color: item.label === "Community" ? "var(--cs-orange)" : "var(--cs-muted)", textDecoration: "none" }}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="cs-app-nav-user">
            <UserMenu user={user as MenuUser} onUserUpdate={(u) => { setUser(u as User); localStorage.setItem("cs_user", JSON.stringify(u)); }} />
            <button className="cs-mobile-nav-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle menu">
              <span /><span /><span />
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="cs-mobile-menu">
            {[
              { label: "Dashboard",    href: "/dashboard" },
              { label: "Weekend Run",  href: "/weekend-run" },
              { label: "Leaderboard", href: "/leaderboard" },
              { label: "Community",   href: "/community" },
              { label: "Achievements",href: "/achievements" },
              { label: "Pricing",     href: "/pricing" },
            ].map((item) => (
              <Link key={item.label} href={item.href} onClick={() => setMobileMenuOpen(false)} style={{ fontSize: "0.95rem", color: item.label === "Community" ? "var(--cs-orange)" : "var(--cs-muted)", textDecoration: "none" }}>
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* Body */}
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "5rem 2rem 3rem" }}>

        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem" }}>Connected Steps</div>
          <h1 className="font-display" style={{ fontSize: "2rem", fontWeight: 300, color: "var(--cs-white)", marginBottom: "0.5rem" }}>Find Runners</h1>
          <p style={{ fontSize: "0.875rem", color: "var(--cs-muted)" }}>Search by name or training location to find and follow fellow runners.</p>
        </div>

        {/* Search bar */}
        <div style={{ position: "relative", marginBottom: "2rem" }}>
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--cs-muted)" }}
          >
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5"/>
            <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search by name or location (e.g. Kondapur, Kalyan...)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "14px 14px 14px 42px",
              background: "var(--cs-dark)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              color: "var(--cs-white)",
              fontSize: "0.9rem",
              fontFamily: "var(--font-body)",
              outline: "none",
              boxSizing: "border-box",
            }}
            onFocus={(e) => e.target.style.borderColor = "var(--cs-orange)"}
            onBlur={(e)  => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--cs-muted)", cursor: "pointer", fontSize: "1rem" }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Stats bar */}
        <div style={{ fontSize: "11px", color: "var(--cs-muted)", marginBottom: "1rem", letterSpacing: "0.05em" }}>
          {loading ? "Searching..." : `${runners.filter(r => r.user_email !== user.email).length} runner${runners.length !== 1 ? "s" : ""} found`}
        </div>

        {/* Results */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {!loading && runners.filter(r => r.user_email !== user.email).length === 0 && (
            <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "3rem", textAlign: "center" }}>
              <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>🔍</div>
              <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "0.5rem" }}>No runners found</div>
              <div style={{ fontSize: "0.875rem", color: "var(--cs-muted)" }}>Try searching by a different name or location.</div>
            </div>
          )}

          {runners
            .filter((r) => r.user_email !== user.email)
            .map((runner) => {
              const initials = runner.user_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
              return (
                <div
                  key={runner.user_email}
                  style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.25rem", display: "flex", alignItems: "center", gap: "1rem" }}
                >
                  <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", fontWeight: 700, color: "var(--cs-white)", flexShrink: 0 }}>
                    {initials}
                  </div>
                  <div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "2px" }}>{runner.user_name}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--cs-muted)", marginBottom: "6px" }}>📍 {runner.location}</div>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "20px", background: "rgba(255,255,255,0.05)", color: "var(--cs-muted)" }}>
                        🎯 {goalLabel[runner.goal] ?? runner.goal}
                      </span>
                      <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "20px", background: "rgba(232,98,10,0.1)", color: "var(--cs-orange)" }}>
                        {runner.total_points ?? 0} pts
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
