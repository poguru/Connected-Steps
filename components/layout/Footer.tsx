import Link from "next/link";
import Image from "next/image";
import { Mail, MapPin } from "lucide-react";

// Correct Instagram URL (matches FloatingContact)
const INSTAGRAM_URL = "https://www.instagram.com/connected_steps/";

const InstagramIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
  </svg>
);

const WhatsAppIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.556 4.122 1.528 5.855L.057 23.882a.5.5 0 00.61.61l6.086-1.461A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.9 0-3.7-.51-5.25-1.4l-.38-.22-3.9.94.97-3.82-.25-.4A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
  </svg>
);

export default function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--border)", background: "var(--surface-elevated)" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "3rem 1.5rem 2rem" }}>
        <div style={{ display: "grid", gap: "2.5rem" }} className="md:grid-cols-2 lg:grid-cols-4">

          {/* Brand */}
          <div className="lg:col-span-1">
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
              <Image src="/logo.png" alt="Connected Steps" width={34} height={34} className="rounded-full" />
              <span style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 600, color: "var(--foreground)" }}>Connected Steps</span>
            </Link>
            <p style={{ marginTop: "1rem", maxWidth: 260, fontSize: "0.82rem", color: "var(--muted-foreground)", lineHeight: 1.7 }}>
              Hyderabad's community-first running club. Real coaches, real plans, real people who show up — together.
            </p>
            <div style={{ marginTop: "1.25rem", display: "flex", gap: 8 }}>
              {[
                { href: INSTAGRAM_URL,                                icon: <InstagramIcon />, label: "Instagram" },
                { href: "mailto:training@connectedsteps.in",         icon: <Mail size={16} />,    label: "Email"     },
                { href: "https://wa.me/9703620570",                  icon: <WhatsAppIcon />, label: "WhatsApp"  },
              ].map(({ href, icon, label }) => (
                <a key={label} href={href} aria-label={label} target="_blank" rel="noopener noreferrer"
                  style={{ width: 38, height: 38, borderRadius: 10, background: "var(--surface)", display: "grid", placeItems: "center", color: "var(--muted-foreground)", textDecoration: "none", transition: "background 0.2s, color 0.2s", border: "1px solid var(--border)" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "oklch(0.72 0.19 49 / 12%)"; (e.currentTarget as HTMLElement).style.color = "var(--cs-orange)"; (e.currentTarget as HTMLElement).style.borderColor = "oklch(0.72 0.19 49 / 30%)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "var(--surface)"; (e.currentTarget as HTMLElement).style.color = "var(--muted-foreground)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}>
                  {icon}
                </a>
              ))}
            </div>
          </div>

          {/* Train */}
          <div>
            <h4 style={{ marginBottom: "0.875rem", fontSize: "0.8rem", fontWeight: 700, color: "var(--foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Train</h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { href: "/running-club-hyderabad", label: "Training programs" },
                { href: "/#upcoming-sessions",    label: "Upcoming events"   },
                { href: "/pricing",               label: "Pricing"           },
                { href: "/quiz",                  label: "Find my plan"      },
                { href: "/blog",                  label: "Blog"              },
              ].map(({ href, label }) => (
                <li key={label}>
                  <Link href={href} style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", textDecoration: "none" }}
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
            <h4 style={{ marginBottom: "0.875rem", fontSize: "0.8rem", fontWeight: 700, color: "var(--foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Community</h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { href: "/community",              label: "Find runners"        },
                { href: "/leaderboard",            label: "Leaderboard"         },
                { href: "/achievements",           label: "Achievements"        },
                { href: "https://wa.me/9703620570",label: "WhatsApp group"      },
              ].map(({ href, label }) => (
                <li key={label}>
                  <Link href={href} style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", textDecoration: "none" }}
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
            <h4 style={{ marginBottom: "0.875rem", fontSize: "0.8rem", fontWeight: 700, color: "var(--foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Get in touch</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: "0.82rem", color: "var(--muted-foreground)" }}>
                <MapPin size={14} style={{ marginTop: 2, flexShrink: 0, color: "var(--accent)" }} /> Hyderabad, India
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: "0.82rem", color: "var(--muted-foreground)" }}>
                <Mail size={14} style={{ marginTop: 2, flexShrink: 0, color: "var(--accent)" }} />
                <a href="mailto:training@connectedsteps.in" style={{ color: "var(--muted-foreground)", textDecoration: "none" }}>
                  training@connectedsteps.in
                </a>
              </div>
            </div>
            <Link href="/auth?tab=register" style={{
              display: "inline-flex", alignItems: "center", marginTop: "1rem",
              borderRadius: 8, background: "var(--gradient-accent)",
              padding: "9px 16px", fontSize: "0.82rem", fontWeight: 600,
              color: "#fff", textDecoration: "none",
              boxShadow: "var(--shadow-orange)",
            }}>
              Join free →
            </Link>
          </div>
        </div>

        {/* Bottom */}
        <div style={{ marginTop: "2.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "1rem", fontSize: "0.72rem", color: "var(--muted-foreground)" }}>
          <div>© {new Date().getFullYear()} Connected Steps · Hyderabad, India</div>
          <div style={{ display: "flex", gap: "1.25rem" }}>
            <Link href="/privacy"        style={{ color: "var(--muted-foreground)", textDecoration: "none" }}>Privacy</Link>
            <Link href="/terms"          style={{ color: "var(--muted-foreground)", textDecoration: "none" }}>Terms</Link>
            <Link href="/refund-policy"  style={{ color: "var(--muted-foreground)", textDecoration: "none" }}>Refunds</Link>
            <Link href="/delete-account" style={{ color: "var(--muted-foreground)", textDecoration: "none" }}>Delete Account</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
