"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

interface StoredUser {
  firstName: string;
  lastName:  string;
  photo:     string | null;
}

const beforeSessionLinks = [
  { label: "Training", href: "#training" },
  { label: "Coaches",  href: "#coaches"  },
];

const afterSessionLinks = [
  { label: "Community",       href: "#community"    },
  { label: "Pricing",         href: "/pricing"      },
  { label: "Corporate",       href: "/corporate"    },
  { label: "Upcoming Events", href: "/weekend-run", highlight: true },
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

    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={menuOpen ? {
        bottom: 0,
        background: "rgba(8,28,45,0.99)",
        display: "flex",
        flexDirection: "column",
      } : {
        background: scrolled ? "rgba(8,28,45,0.97)" : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(56,189,248,0.08)" : "none",
      }}>
      <div className="container" style={{ flexShrink: 0 }}>
        <nav className="flex items-center justify-between h-24">

          {/* Brand */}
          <Link href="/" className="group" style={{ flexShrink: 0 }} onClick={() => setMenuOpen(false)}>
            <Image src="/logo.png" alt="Connected Steps logo" width={58} height={58}
              className="rounded-full transition-transform duration-300 group-hover:scale-105" />
          </Link>

          {/* Desktop nav */}
          <ul className="cs-home-nav-links" style={{ listStyle: "none", margin: 0, padding: 0 }}>

            {/* Before-sessions links */}
            {beforeSessionLinks.map((link) => (
              <li key={link.label}>
                <Link href={link.href}
                  style={{ color: "var(--cs-muted)", textDecoration: "none", fontSize: "0.925rem", letterSpacing: "0.02em" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--cs-white)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--cs-muted)")}>
                  {link.label}
                </Link>
              </li>
            ))}

            {/* After-sessions links */}
            {afterSessionLinks.map((link) => (
              <li key={link.label}>
                {link.highlight ? (
                  <Link href={link.href}
                    style={{ color: "var(--cs-orange)", textDecoration: "none", display: "flex", alignItems: "center", gap: "5px", fontWeight: 600, fontSize: "0.925rem", letterSpacing: "0.02em" }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--cs-orange)", display: "inline-block", animation: "navDot 1.8s ease-in-out infinite" }} />
                    {link.label}
                  </Link>
                ) : (
                  <Link href={link.href}
                    style={{ color: "var(--cs-muted)", textDecoration: "none", fontSize: "0.925rem", letterSpacing: "0.02em" }}
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
                <Link href="/dashboard" className="btn-outline" style={{ padding: "10px 22px", fontSize: "13px" }}>
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
                <Link href="/auth" className="btn-outline" style={{ padding: "10px 22px", fontSize: "13px" }}>Sign in</Link>
                <Link href="/auth" className="btn-primary" style={{ padding: "10px 22px", fontSize: "13px" }}>Join free</Link>
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

      </div>

        {/* Mobile menu — outside container so it covers full width */}
        {menuOpen && (
          <div className="cs-home-mobile-menu" style={{ flex: 1, overflowY: "auto" }}>
            {[...beforeSessionLinks, ...afterSessionLinks].map((link) => (
              <Link key={link.label} href={link.href} onClick={() => setMenuOpen(false)}
                style={{ fontSize: "1rem", color: (link as {highlight?: boolean}).highlight ? "var(--cs-orange)" : "var(--cs-muted)", fontWeight: (link as {highlight?: boolean}).highlight ? 600 : undefined, textDecoration: "none", display: "flex", alignItems: "center", gap: "8px", padding: "0.75rem 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                {(link as {highlight?: boolean}).highlight && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--cs-orange)", display: "inline-block" }} />}
                {link.label}
              </Link>
            ))}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem", paddingTop: "1rem" }}>
              {loggedInUser ? (
                <Link href="/dashboard" className="btn-primary" style={{ textAlign: "center", justifyContent: "center", padding: "14px", fontSize: "0.95rem" }} onClick={() => setMenuOpen(false)}>Go to Dashboard</Link>
              ) : (
                <>
                  <Link href="/auth" className="btn-outline" style={{ textAlign: "center", justifyContent: "center", padding: "14px", fontSize: "0.95rem" }} onClick={() => setMenuOpen(false)}>Sign in</Link>
                  <Link href="/auth" className="btn-primary" style={{ textAlign: "center", justifyContent: "center", padding: "14px", fontSize: "0.95rem" }} onClick={() => setMenuOpen(false)}>Join free</Link>
                </>
              )}
            </div>
          </div>
        )}
    </header>
  );
}
