"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

interface StoredUser {
  firstName: string;
  lastName:  string;
  photo:     string | null;
}

const navLinks = [
  { label: "Training",          href: "#training" },
  { label: "Coaches",           href: "#coaches" },
  { label: "Recent Sessions",   href: "#recent-sessions" },
  { label: "Upcoming Sessions", href: "#upcoming-sessions" },
  { label: "Community",         href: "#community" },
  { label: "Achievements",      href: "/achievements" },
  { label: "Upcoming Events",   href: "/weekend-run", highlight: true },
  { label: "Pricing",           href: "/pricing" },
];

export default function Navbar() {
  const [scrolled,     setScrolled]     = useState(false);
  const [menuOpen,     setMenuOpen]     = useState(false);
  const [loggedInUser, setLoggedInUser] = useState<StoredUser | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });

    const stored = localStorage.getItem("cs_user");
    if (stored) setLoggedInUser(JSON.parse(stored));

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? "rgba(10, 10, 10, 0.95)" : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(255,255,255,0.06)" : "none",
      }}>
      <div className="container">
        <nav className="flex items-center justify-between h-20">
          <Link href="/" className="flex items-center gap-3 group">
            <Image src="/logo.png" alt="Connected Steps logo" width={48} height={48}
              className="rounded-full transition-transform duration-300 group-hover:scale-105" />
            <div>
              <div className="font-display text-lg font-semibold leading-tight" style={{ color: "var(--cs-white)" }}>
                Connected Steps
              </div>
              <div className="text-[10px] tracking-widest uppercase" style={{ color: "var(--cs-orange)" }}>
                Your Goal, Our Plan
              </div>
            </div>
          </Link>

          <ul className="cs-home-nav-links" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {navLinks.map((link) => (
              <li key={link.label}>
                {link.highlight ? (
                  <Link href={link.href} className="text-sm tracking-wide"
                    style={{ color: "var(--cs-orange)", textDecoration: "none", display: "flex", alignItems: "center", gap: "5px", fontWeight: 600 }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--cs-orange)", display: "inline-block", animation: "navDot 1.8s ease-in-out infinite" }} />
                    {link.label}
                  </Link>
                ) : (
                  <Link href={link.href} className="text-sm tracking-wide"
                    style={{ color: "var(--cs-muted)", textDecoration: "none" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--cs-white)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--cs-muted)")}>
                    {link.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>

          <div className="cs-home-nav-cta">
            {loggedInUser ? (
              <>
                <Link href="/dashboard" className="btn-outline" style={{ padding: "10px 22px", fontSize: "12px" }}>
                  Dashboard
                </Link>
                <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}>
                  {loggedInUser.photo ? (
                    <img src={loggedInUser.photo} alt="Profile" style={{ width: "36px", height: "36px", borderRadius: "50%", objectFit: "cover", border: "2px solid var(--cs-orange)" }} />
                  ) : (
                    <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700, color: "var(--cs-white)" }}>
                      {loggedInUser.firstName[0]}{loggedInUser.lastName[0]}
                    </div>
                  )}
                </Link>
              </>
            ) : (
              <>
                <Link href="/auth" className="btn-outline" style={{ padding: "10px 22px", fontSize: "12px" }}>Sign in</Link>
                <Link href="/auth" className="btn-primary" style={{ padding: "10px 22px", fontSize: "12px" }}>Join free</Link>
              </>
            )}
          </div>

          <button className="cs-home-nav-burger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
            <span style={{ transform: menuOpen ? "rotate(45deg) translate(4px, 4px)" : "none" }} />
            <span style={{ opacity: menuOpen ? 0 : 1 }} />
            <span style={{ transform: menuOpen ? "rotate(-45deg) translate(4px, -4px)" : "none" }} />
          </button>
        </nav>

        {menuOpen && (
          <div className="cs-home-mobile-menu">
            {navLinks.map((link) => (
              <Link key={link.label} href={link.href} onClick={() => setMenuOpen(false)}
                style={{ fontSize: "0.95rem", color: link.highlight ? "var(--cs-orange)" : "var(--cs-muted)", fontWeight: link.highlight ? 600 : undefined, textDecoration: "none", display: "flex", alignItems: "center", gap: "6px" }}>
                {link.highlight && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--cs-orange)", display: "inline-block" }} />}
                {link.label}
              </Link>
            ))}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem", paddingTop: "1rem", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              {loggedInUser ? (
                <Link href="/dashboard" className="btn-primary" style={{ textAlign: "center", justifyContent: "center" }} onClick={() => setMenuOpen(false)}>Go to Dashboard</Link>
              ) : (
                <>
                  <Link href="/auth" className="btn-outline" style={{ textAlign: "center", justifyContent: "center" }}>Sign in</Link>
                  <Link href="/auth" className="btn-primary" style={{ textAlign: "center", justifyContent: "center" }}>Join free</Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
