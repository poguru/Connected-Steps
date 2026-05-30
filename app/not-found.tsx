"use client";

import Link from "next/link";
import Image from "next/image";

export default function NotFound() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--cs-black)", color: "var(--cs-white)", display: "flex", flexDirection: "column" }}>

      {/* Nav */}
      <header style={{ background: "var(--cs-dark)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "1rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
          <Image src="/logo.png" alt="Connected Steps" width={36} height={36} className="rounded-full" />
          <span style={{ fontSize: "1rem", fontWeight: 600, color: "var(--cs-white)" }}>Connected Steps</span>
        </Link>
      </header>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3rem 2rem", textAlign: "center" }}>

        <div style={{ fontSize: "6rem", fontWeight: 300, color: "rgba(232,98,10,0.15)", fontFamily: "var(--font-display)", lineHeight: 1, marginBottom: "1rem", letterSpacing: "-0.04em" }}>
          404
        </div>

        <h1 style={{ fontSize: "1.6rem", fontWeight: 300, color: "var(--cs-white)", marginBottom: "0.75rem", fontFamily: "var(--font-display)" }}>
          This page doesn&apos;t exist
        </h1>

        <p style={{ fontSize: "0.9rem", color: "var(--cs-muted)", maxWidth: "380px", lineHeight: 1.7, marginBottom: "2.5rem" }}>
          The link may have moved or the URL might be wrong. Here are some useful places to go instead.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", justifyContent: "center", marginBottom: "3rem" }}>
          {[
            { label: "Home",         href: "/" },
            { label: "Dashboard",    href: "/dashboard" },
            { label: "Leaderboard",  href: "/leaderboard" },
            { label: "Achievements", href: "/achievements" },
            { label: "Pricing",      href: "/pricing" },
            { label: "Contact",      href: "/contact" },
          ].map((link) => (
            <Link key={link.href} href={link.href} style={{
              padding:      "9px 20px",
              borderRadius: "6px",
              fontSize:     "0.82rem",
              fontWeight:   600,
              textDecoration: "none",
              border:       "1px solid rgba(255,255,255,0.1)",
              color:        "var(--cs-muted)",
              transition:   "color 0.15s, border-color 0.15s",
            }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = "var(--cs-white)";
                (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,0.3)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = "var(--cs-muted)";
                (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,0.1)";
              }}>
              {link.label}
            </Link>
          ))}
        </div>

        <Link href="/" style={{
          display:      "inline-flex",
          alignItems:   "center",
          gap:          "0.5rem",
          padding:      "12px 28px",
          background:   "var(--cs-orange)",
          color:        "#fff",
          borderRadius: "6px",
          fontSize:     "0.875rem",
          fontWeight:   700,
          textDecoration: "none",
        }}>
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
