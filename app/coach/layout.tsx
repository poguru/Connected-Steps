"use client";

import { useState, useEffect, createContext, useContext } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

interface CoachProfile {
  id: string;
  name: string;
  email: string;
  specialization: string | null;
  avatar_url: string | null;
  is_admin: boolean;
}

const CoachContext = createContext<CoachProfile | null>(null);
export function useCoach() { return useContext(CoachContext); }

const NAV = [
  { label: "Dashboard",  href: "/coach",          exact: true },
  { label: "Athletes",   href: "/coach/athletes"              },
  { label: "Messages",   href: "/coach/messages"              },
];

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  const pathname  = usePathname();
  const router    = useRouter();
  const [coach,    setCoach]    = useState<CoachProfile | null>(null);
  const [ready,    setReady]    = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const isLoginPage = pathname === "/coach/login";

  useEffect(() => {
    if (isLoginPage) { setReady(true); return; }
    fetch("/api/coach/auth")
      .then(r => r.json())
      .then(d => {
        if (d.ok) { setCoach(d.coach); setReady(true); }
        else       { router.push("/coach/login"); }
      })
      .catch(() => router.push("/coach/login"));
  }, [isLoginPage, pathname]); // eslint-disable-line

  async function logout() {
    await fetch("/api/coach/auth", { method: "DELETE" });
    router.push("/coach/login");
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="cs-spin" style={{ width: 26, height: 26, borderRadius: "50%", border: "2px solid #1a1a1a", borderTopColor: "#e8620a" }} />
        <style>{`@keyframes cs-spin-kf{to{transform:rotate(360deg)}}.cs-spin{animation:cs-spin-kf .7s linear infinite}`}</style>
      </div>
    );
  }

  if (isLoginPage) return <>{children}</>;

  return (
    <CoachContext.Provider value={coach}>
      <style>{`
        @keyframes cs-spin-kf { to { transform: rotate(360deg); } }
        .cs-spin { animation: cs-spin-kf .7s linear infinite; }
        .cs-nav-link:hover { color: #c0510a !important; background: rgba(232,98,10,0.06) !important; }
        @media (min-width: 768px) {
          .cs-coach-sidebar { left: 0 !important; }
          .cs-coach-main    { margin-left: 200px !important; }
          .cs-coach-topbar  { display: none !important; }
        }
      `}</style>

      {menuOpen && (
        <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 40 }} />
      )}

      <aside className="cs-coach-sidebar" style={{ position: "fixed", top: 0, bottom: 0, left: menuOpen ? 0 : -204, width: 200, background: "#0d0d0d", borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", zIndex: 50, transition: "left 0.22s ease", overflowY: "auto" }}>
        <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <Link href="/coach" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }} onClick={() => setMenuOpen(false)}>
            <Image src="/logo.png" alt="" width={26} height={26} style={{ borderRadius: "50%" }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>Connected Steps</div>
              <div style={{ fontSize: 9, color: "#e8620a", letterSpacing: "0.12em", textTransform: "uppercase" }}>Coach Portal</div>
            </div>
          </Link>
        </div>

        {coach && (
          <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", gap: 10 }}>
            {coach.avatar_url ? (
              <img src={coach.avatar_url} alt={coach.name} style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover" }} />
            ) : (
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#e8620a22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#e8620a" }}>
                {coach.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{coach.name}</div>
              <div style={{ fontSize: 10, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{coach.specialization ?? "Coach"}</div>
            </div>
          </div>
        )}

        <nav style={{ flex: 1, paddingTop: 8, paddingBottom: 8 }}>
          {NAV.map(link => {
            const active = isActive(link.href, link.exact);
            return (
              <Link key={link.href} href={link.href} className="cs-nav-link" onClick={() => setMenuOpen(false)}
                style={{ display: "block", padding: "8px 16px", fontSize: 13, color: active ? "#e8620a" : "#5a5a5a", textDecoration: "none", background: active ? "rgba(232,98,10,0.08)" : "transparent", borderLeft: `2px solid ${active ? "#e8620a" : "transparent"}`, fontWeight: active ? 600 : 400 }}>
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ padding: "10px 16px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
          <Link href="/" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#3a3a3a", textDecoration: "none" }}>↗ View site</Link>
          <button onClick={logout} style={{ fontSize: 12, color: "#3a3a3a", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, fontFamily: "inherit" }}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="cs-coach-main" style={{ minHeight: "100vh", background: "#080808", color: "#f0f0f0" }}>
        <div className="cs-coach-topbar" style={{ position: "sticky", top: 0, zIndex: 30, background: "#0d0d0d", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "11px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setMenuOpen(o => !o)} aria-label="Open menu" style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#666", display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
            <span style={{ display: "block", width: 18, height: 2, background: "currentColor", borderRadius: 1 }} />
            <span style={{ display: "block", width: 18, height: 2, background: "currentColor", borderRadius: 1 }} />
            <span style={{ display: "block", width: 18, height: 2, background: "currentColor", borderRadius: 1 }} />
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#888" }}>Coach Portal</span>
        </div>
        {children}
      </div>
    </CoachContext.Provider>
  );
}
