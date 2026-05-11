"use client";

import Link from "next/link";
import Image from "next/image";

const footerLinks = {
  Training: [
    { label: "Training plans", href: "/dashboard" },
    { label: "Coaching",       href: "#coaches" },
    { label: "Achievements",   href: "/achievements" },
    { label: "Community",      href: "#community" },
  ],
  Company: [
    { label: "About us", href: "#about" },
    { label: "Pricing",  href: "/pricing" },
    { label: "Blog",     href: "/blog" },
    { label: "Contact",  href: "/contact" },
  ],
  Legal: [
    { label: "Privacy policy", href: "/privacy" },
    { label: "Terms of use",   href: "/terms" },
    { label: "Cookie policy",  href: "/cookies" },
  ],
};

export default function Footer() {
  return (
    <footer style={{ background: "var(--cs-dark)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="container py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12">
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-3 mb-5">
              <Image src="/logo.png" alt="Connected Steps" width={44} height={44} className="rounded-full" />
              <div>
                <div className="font-display text-base font-semibold" style={{ color: "var(--cs-white)" }}>Connected Steps</div>
                <div className="text-[10px] tracking-widest uppercase" style={{ color: "var(--cs-orange)" }}>Your Goal, Our Plan</div>
              </div>
            </Link>
            <p className="text-sm leading-relaxed mb-6 max-w-xs" style={{ color: "var(--cs-muted)" }}>
              A running community built around expert coaches, personalised plans,
              and runners who show up for each other.
            </p>
            <div className="flex gap-3">
              {[
                {
                  label: "Instagram",
                  href: "https://www.instagram.com/connected_steps/",
                  icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                      <circle cx="12" cy="12" r="4"/>
                      <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none"/>
                    </svg>
                  ),
                },
                {
                  label: "Strava",
                  href: "https://www.strava.com/clubs/1693553",
                  icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/>
                    </svg>
                  ),
                },
                {
                  label: "YouTube",
                  href: "https://www.youtube.com/@ConnectedSteps",
                  icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                  ),
                },
              ].map((s) => (
                <a key={s.label} href={s.href}
                  target="_blank" rel="noopener noreferrer"
                  title={s.label}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: "38px", height: "38px",
                    border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px",
                    color: "var(--cs-muted)", textDecoration: "none",
                    transition: "color 0.2s, border-color 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.color = "var(--cs-orange)";
                    (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--cs-orange)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.color = "var(--cs-muted)";
                    (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,0.1)";
                  }}>
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {Object.entries(footerLinks).map(([group, links]) => (
            <div key={group}>
              <div className="text-xs font-medium tracking-widest uppercase mb-5" style={{ color: "var(--cs-orange)" }}>{group}</div>
              <ul className="flex flex-col gap-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm transition-colors duration-200" style={{ color: "var(--cs-muted)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--cs-white)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--cs-muted)")}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)", color: "var(--cs-muted)" }}>
          <span>© {new Date().getFullYear()} Connected Steps. All rights reserved.</span>
          <span style={{ color: "rgba(136,136,136,0.5)" }}>Built with precision. Run with purpose.</span>
        </div>
      </div>
    </footer>
  );
}
