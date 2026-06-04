import Link from "next/link";
import Image from "next/image";
import { Share2, Mail, Phone, MapPin } from "lucide-react";

export default function Footer() {
  return (
    <footer style={{ marginTop: "8rem", borderTop: "1px solid var(--border)", background: "var(--surface-elevated)" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "4rem 1.5rem" }}>
        <div style={{ display: "grid", gap: "3rem" }} className="md:grid-cols-2 lg:grid-cols-4">

          {/* Brand */}
          <div className="lg:col-span-1">
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
              <Image src="/logo.png" alt="Connected Steps" width={36} height={36} className="rounded-full" />
              <span style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 600, color: "var(--foreground)" }}>Connected Steps</span>
            </Link>
            <p style={{ marginTop: "1.25rem", maxWidth: 280, fontSize: "0.875rem", color: "var(--muted-foreground)", lineHeight: 1.7 }}>
              Hyderabad's community-first running club. Real coaches, real plans, real people who show up — together.
            </p>
            <div style={{ marginTop: "1.5rem", display: "flex", gap: 8 }}>
              {[
                { href: "https://www.instagram.com/connectedsteps/", icon: <Share2 size={16} />, label: "Instagram" },
                { href: "mailto:hello@connectedsteps.in",             icon: <Mail    size={16} />, label: "Email"     },
                { href: "https://wa.me/9703620570",                   icon: <Phone   size={16} />, label: "WhatsApp"  },
              ].map(({ href, icon, label }) => (
                <a key={label} href={href} aria-label={label} target="_blank" rel="noopener noreferrer"
                  style={{ width: 40, height: 40, borderRadius: 12, background: "var(--surface)", display: "grid", placeItems: "center", color: "var(--muted-foreground)", textDecoration: "none", transition: "background 0.2s, color 0.2s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--gradient-primary)"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "var(--surface)"; (e.currentTarget as HTMLElement).style.color = "var(--muted-foreground)"; }}>
                  {icon}
                </a>
              ))}
            </div>
          </div>

          {/* Train */}
          <div>
            <h4 style={{ marginBottom: "1rem", fontSize: "0.875rem", fontWeight: 700, color: "var(--foreground)" }}>Train</h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { href: "/running-club-hyderabad", label: "Training programs" },
                { href: "/#upcoming-sessions",    label: "Upcoming events"   },
                { href: "/pricing",               label: "Pricing"           },
                { href: "/quiz",                  label: "Find my plan"      },
              ].map(({ href, label }) => (
                <li key={label}>
                  <Link href={href} style={{ fontSize: "0.875rem", color: "var(--muted-foreground)", textDecoration: "none", transition: "color 0.2s" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--primary)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--muted-foreground)"}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Community */}
          <div>
            <h4 style={{ marginBottom: "1rem", fontSize: "0.875rem", fontWeight: 700, color: "var(--foreground)" }}>Community</h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { href: "/community",             label: "Q&A and stories"    },
                { href: "/leaderboard",            label: "Leaderboard"        },
                { href: "/corporate",              label: "Corporate wellness" },
                { href: "https://wa.me/9703620570",label: "WhatsApp group"     },
              ].map(({ href, label }) => (
                <li key={label}>
                  <Link href={href} style={{ fontSize: "0.875rem", color: "var(--muted-foreground)", textDecoration: "none", transition: "color 0.2s" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--primary)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--muted-foreground)"}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 style={{ marginBottom: "1rem", fontSize: "0.875rem", fontWeight: 700, color: "var(--foreground)" }}>Get in touch</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: "0.875rem", color: "var(--muted-foreground)" }}>
                <MapPin size={16} style={{ marginTop: 2, flexShrink: 0, color: "var(--accent)" }} /> Hyderabad, India
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: "0.875rem", color: "var(--muted-foreground)" }}>
                <Mail size={16} style={{ marginTop: 2, flexShrink: 0, color: "var(--accent)" }} /> hello@connectedsteps.in
              </div>
            </div>
            <Link href="/auth?tab=register" style={{
              display: "inline-flex", alignItems: "center", marginTop: "1.25rem",
              borderRadius: 999, background: "var(--gradient-accent)",
              padding: "10px 16px", fontSize: "0.875rem", fontWeight: 600,
              color: "var(--accent-foreground)", textDecoration: "none",
              boxShadow: "var(--shadow-orange)",
            }}>
              Join free →
            </Link>
          </div>
        </div>

        {/* Bottom */}
        <div style={{ marginTop: "3.5rem", paddingTop: "2rem", borderTop: "1px solid var(--border)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "1rem", fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
          <div>© {new Date().getFullYear()} Connected Steps. Run together. Grow together.</div>
          <div style={{ display: "flex", gap: "1.5rem" }}>
            <Link href="/privacy" style={{ color: "var(--muted-foreground)", textDecoration: "none" }}>Privacy</Link>
            <Link href="/terms"   style={{ color: "var(--muted-foreground)", textDecoration: "none" }}>Terms</Link>
            <Link href="/cookies" style={{ color: "var(--muted-foreground)", textDecoration: "none" }}>Cookies</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
