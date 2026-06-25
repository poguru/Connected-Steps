"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

const NAV = [
  {
    section: null,
    links: [{ label: "Dashboard", href: "/admin", exact: true }],
  },
  {
    section: "Community",
    links: [
      { label: "Members", href: "/admin/users" },
      { label: "Community Feed", href: "/admin/community" },
      { label: "Questions & Answers", href: "/admin/coach-questions" },
      { label: "Runner Stories", href: "/admin/stories" },
    ],
  },
  {
    section: "Events",
    links: [
      { label: "All Events",     href: "/admin/events",               exact: true },
      { label: "Registrations",  href: "/admin/events/registrations"              },
    ],
  },
  {
    section: "Coaching",
    links: [
      { label: "Coaches",         href: "/admin/coaches" },
      { label: "Training Plans",  href: "/admin/training-plans" },
      { label: "Coach Operations",href: "/admin/coach-ops" },
      { label: "Coach Ratings",   href: "/admin/coach-ratings" },
    ],
  },
  {
    section: "Reports",
    links: [
      { label: "Sessions", href: "/admin/sessions" },
      { label: "Leaderboard", href: "/admin/leaderboard" },
      { label: "Memberships", href: "/admin/membership" },
      { label: "Referrals", href: "/admin/referrals" },
    ],
  },
  {
    section: "Settings",
    links: [
      { label: "Notifications", href: "/admin/settings/notifications" },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [authed,   setAuthed]   = useState<boolean | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    if (isLoginPage) { setAuthed(true); return; }
    fetch("/api/admin/auth")
      .then(r => {
        if (r.ok) { setAuthed(true); }
        else { router.push(`/admin/login?redirect=${encodeURIComponent(pathname)}`); }
      })
      .catch(() => router.push("/admin/login"));
  }, [isLoginPage, pathname]); // eslint-disable-line

  async function logout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  if (authed === null) {
    return (
      <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="cs-spin" style={{ width: 26, height: 26, borderRadius: "50%", border: "2px solid #1a1a1a", borderTopColor: "#e8620a" }} />
        <style>{`@keyframes cs-spin-kf{to{transform:rotate(360deg)}}.cs-spin{animation:cs-spin-kf .7s linear infinite}`}</style>
      </div>
    );
  }

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="cs-spin" style={{ width: 26, height: 26, borderRadius: "50%", border: "2px solid #1a1a1a", borderTopColor: "#e8620a" }} />
        <style>{`@keyframes cs-spin-kf{to{transform:rotate(360deg)}}.cs-spin{animation:cs-spin-kf .7s linear infinite}`}</style>
      </div>
    );
  }

  if (isLoginPage) return <>{children}</>;

  const currentLabel = NAV.flatMap(g => g.links).find(l => isActive(l.href, l.exact))?.label ?? "Admin";

  return (
    <>
      <style>{`
        @keyframes cs-spin-kf { to { transform: rotate(360deg); } }
        .cs-spin { animation: cs-spin-kf .7s linear infinite; }
        .cs-nav-link:hover { color: #c0510a !important; background: rgba(232,98,10,0.06) !important; }
        @media (min-width: 768px) {
          .cs-sidebar { left: 0 !important; }
          .cs-main    { margin-left: 220px !important; }
          .cs-topbar  { display: none !important; }
        }
      `}</style>

      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 40 }}
        />
      )}

      <aside
        className="cs-sidebar"
        style={{
          position: "fixed", top: 0, bottom: 0,
          left: menuOpen ? 0 : -224,
          width: 220,
          background: "#0d0d0d",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          display: "flex", flexDirection: "column",
          zIndex: 50, transition: "left 0.22s ease",
          overflowY: "auto",
        }}
      >
        <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }} onClick={() => setMenuOpen(false)}>
            <Image src="/logo.png" alt="" width={26} height={26} style={{ borderRadius: "50%" }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>Connected Steps</div>
              <div style={{ fontSize: 9, color: "#e8620a", letterSpacing: "0.12em", textTransform: "uppercase" }}>Admin</div>
            </div>
          </Link>
        </div>

        <nav style={{ flex: 1, paddingTop: 4, paddingBottom: 4 }}>
          {NAV.map((group, gi) => (
            <div key={gi} style={{ marginBottom: group.section ? 0 : 0 }}>
              {group.section && (
                <div style={{ padding: "10px 16px 2px", fontSize: 10, color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>
                  {group.section}
                </div>
              )}
              {group.links.map(link => {
                const active = isActive(link.href, link.exact);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="cs-nav-link"
                    onClick={() => setMenuOpen(false)}
                    style={{
                      display: "block",
                      padding: "7px 16px",
                      fontSize: 13,
                      color: active ? "#e8620a" : "#5a5a5a",
                      textDecoration: "none",
                      background: active ? "rgba(232,98,10,0.08)" : "transparent",
                      borderLeft: `2px solid ${active ? "#e8620a" : "transparent"}`,
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div style={{ padding: "10px 16px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
          <Link href="/" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#3a3a3a", textDecoration: "none" }}>↗ View site</Link>
          <Link href="/coach" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#3a3a3a", textDecoration: "none" }}>↗ Coach portal</Link>
          <button
            onClick={logout}
            style={{ fontSize: 12, color: "#3a3a3a", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, fontFamily: "inherit" }}
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="cs-main" style={{ minHeight: "100vh", background: "#080808", color: "#f0f0f0" }}>
        <div
          className="cs-topbar"
          style={{
            position: "sticky", top: 0, zIndex: 30,
            background: "#0d0d0d",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            padding: "11px 16px",
            display: "flex", alignItems: "center", gap: 12,
          }}
        >
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Open menu"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#666", display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}
          >
            <span style={{ display: "block", width: 18, height: 2, background: "currentColor", borderRadius: 1 }} />
            <span style={{ display: "block", width: 18, height: 2, background: "currentColor", borderRadius: 1 }} />
            <span style={{ display: "block", width: 18, height: 2, background: "currentColor", borderRadius: 1 }} />
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#888" }}>{currentLabel}</span>
        </div>

        {children}
      </div>
    </>
  );
}
