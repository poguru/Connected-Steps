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
              A premium running training community built around expert coaches, personalised plans,
              and runners who show up for each other.
            </p>
            <div className="flex gap-3">
              {["Instagram", "Strava", "YouTube"].map((s) => (
                <a key={s} href="#"
                  className="text-xs tracking-widest uppercase px-3 py-2 border rounded transition-colors duration-200"
                  style={{ color: "var(--cs-muted)", borderColor: "rgba(255,255,255,0.1)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.color = "var(--cs-orange)";
                    (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--cs-orange)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.color = "var(--cs-muted)";
                    (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,0.1)";
                  }}>
                  {s}
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
