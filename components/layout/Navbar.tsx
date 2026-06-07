"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

const nav = [
  { href: "/running-club-hyderabad", label: "Programs"    },
  { href: "/#upcoming-sessions",     label: "Events"      },
  { href: "/leaderboard",            label: "Leaderboard" },
  { href: "/community",              label: "Community"   },
  { href: "/pricing",                label: "Pricing"     },
];

export default function Navbar() {
  const [open,     setOpen]     = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [authed,   setAuthed]   = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const stored = localStorage.getItem("cs_user");
    setAuthed(!!stored);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 50,
      transition: "all 0.3s",
      ...(scrolled
        ? { background: "oklch(0.18 0.015 270 / 70%)", backdropFilter: "blur(18px) saturate(140%)", borderBottom: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }
        : { background: "transparent", borderBottom: "1px solid transparent" }),
    }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64, padding: "0 1.5rem" }}>

        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none", flexShrink: 0 }}>
          <Image src="/logo.png" alt="Connected Steps" width={36} height={36} className="rounded-full" />
          <span style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)" }}>Connected Steps</span>
        </Link>

        {/* Desktop nav */}
        <nav style={{ alignItems: "center", gap: 4 }} className="hidden lg:flex">
          {nav.map((n) => {
            const active = pathname === n.href;
            return (
              <Link key={n.href} href={n.href} style={{
                padding: "8px 16px", borderRadius: 999,
                fontSize: "0.875rem", fontWeight: 500, textDecoration: "none",
                transition: "background 0.2s, color 0.2s",
                color: active ? "var(--primary)" : "var(--muted-foreground)",
                background: active ? "oklch(0.72 0.19 49 / 8%)" : "transparent",
              }}
                onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "var(--surface-elevated)"; (e.currentTarget as HTMLElement).style.color = "var(--foreground)"; }}}
                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--muted-foreground)"; }}}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        {/* Desktop CTA */}
        <div style={{ alignItems: "center", gap: 8 }} className="hidden lg:flex">
          {authed ? (
            <Link href="/dashboard" style={{
              padding: "10px 20px", borderRadius: 999,
              background: "var(--gradient-primary)",
              color: "var(--primary-foreground)",
              fontSize: "0.875rem", fontWeight: 600,
              textDecoration: "none", boxShadow: "var(--shadow-md)",
            }}>
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/auth" style={{
                padding: "10px 16px", borderRadius: 999,
                fontSize: "0.875rem", fontWeight: 500,
                color: "var(--foreground)", textDecoration: "none",
              }}>
                Sign in
              </Link>
              <Link href="/auth?tab=register" style={{
                padding: "10px 20px", borderRadius: 999,
                background: "var(--gradient-accent)",
                color: "var(--accent-foreground)",
                fontSize: "0.875rem", fontWeight: 600,
                textDecoration: "none", boxShadow: "var(--shadow-orange)",
                transition: "transform 0.2s",
              }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = "scale(1.02)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = ""}
              >
                Join Community
              </Link>
            </>
          )}
        </div>

        {/* Mobile burger */}
        <button aria-label="Menu" onClick={() => setOpen(v => !v)} className="lg:hidden"
          style={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", padding: 8, cursor: "pointer", color: "var(--foreground)" }}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div style={{ borderTop: "1px solid var(--border)", background: "var(--background)" }} className="lg:hidden">
          <div style={{ padding: "1rem 1.5rem", display: "flex", flexDirection: "column", gap: 4 }}>
            {nav.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} style={{
                padding: "12px 16px", borderRadius: 12, fontSize: "0.875rem",
                fontWeight: 500, textDecoration: "none", color: "var(--foreground)",
              }}>
                {n.label}
              </Link>
            ))}
            <Link href={authed ? "/dashboard" : "/auth?tab=register"} onClick={() => setOpen(false)} style={{
              marginTop: 12, padding: "12px 16px", borderRadius: 999,
              background: "var(--gradient-accent)", color: "var(--accent-foreground)",
              fontSize: "0.875rem", fontWeight: 600, textDecoration: "none", textAlign: "center",
              boxShadow: "var(--shadow-orange)",
            }}>
              {authed ? "Open Dashboard" : "Join Community"}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
