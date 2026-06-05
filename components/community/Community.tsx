"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { MenuUser } from "@/components/ui/UserMenu";
import AppNav from "@/components/layout/AppNav";

interface User   { firstName: string; lastName: string; email: string; phone: string; goal: string; location: string; photo: string | null; }
interface Runner { user_email: string; user_name: string; location: string; goal: string; total_points: number; month_points: number; }

const goalLabel: Record<string, string> = {
  "5k": "First 5K", "10k": "10K", "half": "Half Marathon", "full": "Full Marathon",
  "ultra": "Ultra", "fitness": "General Fitness", "speed": "Speed", "weight": "Weight Loss", "strength": "Strength",
};

function initials(name: string) { return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase(); }


export default function Community() {
  const router = useRouter();
  const [user,    setUser]    = useState<User | null>(null);
  const [query,   setQuery]   = useState("");
  const [runners, setRunners] = useState<Runner[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("cs_user");
    if (!stored) { router.push("/auth"); return; }
    setUser(JSON.parse(stored));
    search("");
  }, [router]);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.users) setRunners(data.users);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 300);
    return () => clearTimeout(t);
  }, [query, search]);

  if (!user) return null;

  const others = runners.filter(r => r.user_email !== user.email);

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>
      <AppNav
        user={user as MenuUser}
        onUserUpdate={u => { setUser(u as User); localStorage.setItem("cs_user", JSON.stringify(u)); }}
        activeLabel="Community"
      />

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "5rem 1.5rem 3rem" }}>
        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontSize: 11, color: "var(--primary)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.5rem", fontWeight: 600 }}>Connected Steps</div>
          <h1 className="font-display" style={{ fontSize: "2.2rem", fontWeight: 700, letterSpacing: "-0.015em", marginBottom: "0.5rem" }}>Find Runners</h1>
          <p style={{ fontSize: "0.875rem", color: "var(--muted-foreground)" }}>Search by name or training location to connect with fellow runners.</p>
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: "1.5rem" }}>
          <Search size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)" }} />
          <input type="text" placeholder="Search by name or location (e.g. Kondapur, Kalyan...)"
            value={query} onChange={e => setQuery(e.target.value)}
            style={{ width: "100%", padding: "13px 40px 13px 42px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)", fontSize: "0.9rem", fontFamily: "var(--font-body)", outline: "none", boxSizing: "border-box", boxShadow: "var(--shadow-md)" }}
            onFocus={e => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px oklch(0.72 0.19 49 / 15%)"; }}
            onBlur={e  => { e.currentTarget.style.borderColor = "var(--border)";  e.currentTarget.style.boxShadow = "var(--shadow-md)"; }} />
          {query && (
            <button onClick={() => setQuery("")} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--muted-foreground)", cursor: "pointer", display: "flex" }}>
              <X size={16} />
            </button>
          )}
        </div>

        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: "1rem", letterSpacing: "0.05em" }}>
          {loading ? "Searching…" : `${others.length} runner${others.length !== 1 ? "s" : ""} found`}
        </div>

        {/* Results */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {!loading && others.length === 0 && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "3rem", textAlign: "center", boxShadow: "var(--shadow-md)" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🔍</div>
              <div style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.5rem" }}>No runners found</div>
              <div style={{ fontSize: "0.875rem", color: "var(--muted-foreground)" }}>Try searching by a different name or location.</div>
            </div>
          )}

          {others.map(runner => (
            <div key={runner.user_email} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "1.25rem", display: "flex", alignItems: "center", gap: "1rem", boxShadow: "var(--shadow-md)", transition: "border-color 0.2s, box-shadow 0.2s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "oklch(0.72 0.19 49 / 30%)"; (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-lg)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-md)"; }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--gradient-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                {initials(runner.user_name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{runner.user_name}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginBottom: 6 }}>📍 {runner.location}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "var(--surface-elevated)", color: "var(--muted-foreground)" }}>
                    🎯 {goalLabel[runner.goal] ?? runner.goal}
                  </span>
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "oklch(0.72 0.19 49 / 10%)", color: "var(--primary)", fontWeight: 600 }}>
                    {runner.total_points ?? 0} pts
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
