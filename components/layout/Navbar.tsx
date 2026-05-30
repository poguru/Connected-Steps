"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";

interface StoredUser {
  firstName: string;
  lastName:  string;
  photo:     string | null;
}

const navLinks = [
  { label: "Training",      href: "#training" },
  { label: "Coaches",       href: "#coaches" },
  { label: "Community",     href: "#community" },
  { label: "Achievements",  href: "/achievements" },
  { label: "Upcoming Events", href: "/weekend-run", highlight: true },
  { label: "Pricing",       href: "/pricing" },
];

const sessionDropdown = [
  { label: "Recent Sessions",   href: "#recent-sessions",   icon: "📸" },
  { label: "Upcoming Sessions", href: "#upcoming-sessions", icon: "📅" },
];

export default function Navbar() {
  const [scrolled,     setScrolled]     = useState(false);
  const [menuOpen,     setMenuOpen]     = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState<StoredUser | null>(null);
  const dropdownRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });

    const stored = localStorage.getItem("cs_user");
    if (stored) setLoggedInUser(JSON.parse(stored));

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSessionsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("mousedown", handleClickOutside);
    };
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

          {/* Brand */}
          <Link href="/" className="group" style={{ flexShrink: 0 }}>
            <Image src="/logo.png" alt="Connected Steps logo" width={44} height={44}
              className="rounded-full transition-transform duration-300 group-hover:scale-105" />
          </Link>

          {/* Desktop nav */}
          <ul className="cs-home-nav-links" style={{ listStyle: "none", margin: 0, padding: 0 }}>

            {/* Sessions dropdown */}
            <li ref={dropdownRef} style={{ position: "relative" }}>
              <button
                onClick={() => setSessionsOpen((o) => !o)}
                style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", padding: 0, fontFamily: "var(--font-body)", fontSize: "0.8rem", letterSpacing: "0.03em", color: sessionsOpen ? "var(--cs-white)" : "var(--cs-muted)", transition: "color 0.2s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--cs-white)")}
                onMouseLeave={(e) => { if (!sessionsOpen) e.currentTarget.style.color = "var(--cs-muted)"; }}
              >
                Sessions
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transition: "transform 0.2s", transform: sessionsOpen ? "rotate(180deg)" : "none" }}>
                  <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {sessionsOpen && (
                <div style={{
                  position: "absolute", top: "calc(100% + 12px)", left: "50%", transform: "translateX(-50%)",
                  background: "rgba(18,18,18,0.98)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "10px", padding: "6px", minWidth: "200px",
                  backdropFilter: "blur(16px)", boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
                  zIndex: 100,
                }}>
                  {sessionDropdown.map((item) => (
                    <Link key={item.label} href={item.href}
                      onClick={() => setSessionsOpen(false)}
                      style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderRadius: "7px", textDecoration: "none", color: "var(--cs-muted)", fontSize: "0.82rem", transition: "background 0.15s, color 0.15s" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(232,98,10,0.1)"; (e.currentTarget as HTMLAnchorElement).style.color = "var(--cs-white)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; (e.currentTarget as HTMLAnchorElement).style.color = "var(--cs-muted)"; }}
                    >
                      <span style={{ fontSize: "14px" }}>{item.icon}</span>
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </li>

            {navLinks.map((link) => (
              <li key={link.label}>
                {link.highlight ? (
                  <Link href={link.href}
                    style={{ color: "var(--cs-orange)", textDecoration: "none", display: "flex", alignItems: "center", gap: "5px", fontWeight: 600, fontSize: "0.8rem", letterSpacing: "0.03em" }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--cs-orange)", display: "inline-block", animation: "navDot 1.8s ease-in-out infinite" }} />
                    {link.label}
                  </Link>
                ) : (
                  <Link href={link.href}
                    style={{ color: "var(--cs-muted)", textDecoration: "none", fontSize: "0.8rem", letterSpacing: "0.03em" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--cs-white)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--cs-muted)")}>
                    {link.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>

          {/* CTA */}
          <div className="cs-home-nav-cta">
            {loggedInUser ? (
              <>
                <Link href="/dashboard" className="btn-outline" style={{ padding: "9px 18px", fontSize: "12px" }}>
                  Dashboard
                </Link>
                <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}>
                  {loggedInUser.photo ? (
                    <img src={loggedInUser.photo} alt="Profile" style={{ width: "34px", height: "34px", borderRadius: "50%", objectFit: "cover", border: "2px solid var(--cs-orange)" }} />
                  ) : (
                    <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: "var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, color: "var(--cs-white)" }}>
                      {loggedInUser.firstName[0]}{loggedInUser.lastName[0]}
                    </div>
                  )}
                </Link>
              </>
            ) : (
              <>
                <Link href="/auth" className="btn-outline" style={{ padding: "9px 18px", fontSize: "12px" }}>Sign in</Link>
                <Link href="/auth" className="btn-primary" style={{ padding: "9px 18px", fontSize: "12px" }}>Join free</Link>
              </>
            )}
          </div>

          {/* Mobile burger */}
          <button className="cs-home-nav-burger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
            <span style={{ transform: menuOpen ? "rotate(45deg) translate(4px, 4px)" : "none" }} />
            <span style={{ opacity: menuOpen ? 0 : 1 }} />
            <span style={{ transform: menuOpen ? "rotate(-45deg) translate(4px, -4px)" : "none" }} />
          </button>
        </nav>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="cs-home-mobile-menu">
            {/* Sessions group */}
            <div style={{ fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: "4px" }}>Sessions</div>
            {sessionDropdown.map((item) => (
              <Link key={item.label} href={item.href} onClick={() => setMenuOpen(false)}
                style={{ fontSize: "0.95rem", color: "var(--cs-muted)", textDecoration: "none", display: "flex", alignItems: "center", gap: "8px", paddingLeft: "8px" }}>
                <span>{item.icon}</span>{item.label}
              </Link>
            ))}
            <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "8px 0" }} />
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
