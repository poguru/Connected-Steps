import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "Contact – Connected Steps",
  description: "Get in touch with the Connected Steps team — coaching enquiries, support, and general questions.",
};

export default function ContactPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--cs-black)", color: "var(--cs-white)" }}>
      {/* Nav */}
      <header style={{ background: "var(--cs-dark)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "1rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
          <Image src="/logo.png" alt="Connected Steps" width={36} height={36} className="rounded-full" />
          <span style={{ fontSize: "1rem", fontWeight: 600, color: "var(--cs-white)" }}>Connected Steps</span>
        </Link>
        <Link href="/" style={{ fontSize: "0.8rem", color: "var(--cs-muted)", textDecoration: "none" }}>← Back to home</Link>
      </header>

      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "4rem 2rem 5rem" }}>
        {/* Header */}
        <div style={{ marginBottom: "3rem" }}>
          <p style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem" }}>Get in touch</p>
          <h1 style={{ fontSize: "2.2rem", fontWeight: 300, color: "var(--cs-white)", marginBottom: "0.75rem" }}>Contact Us</h1>
          <p style={{ fontSize: "0.9rem", color: "var(--cs-muted)", lineHeight: 1.7, maxWidth: "480px" }}>
            Questions about coaching, membership, or the platform? We typically respond within a few hours.
          </p>
        </div>

        {/* Contact cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))", gap: "1rem", marginBottom: "3rem" }}>

          {/* WhatsApp */}
          <a href="https://wa.me/919703620570" target="_blank" rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "flex-start", gap: "1rem", background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", padding: "1.5rem", textDecoration: "none", transition: "border-color 0.2s" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(37,211,102,0.4)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)")}>
            <div style={{ width: "40px", height: "40px", background: "rgba(37,211,102,0.1)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#25d366">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--cs-white)", marginBottom: "4px" }}>WhatsApp</div>
              <div style={{ fontSize: "0.82rem", color: "var(--cs-muted)", marginBottom: "8px" }}>Fastest way to reach us — for coaching questions and support.</div>
              <div style={{ fontSize: "0.8rem", color: "#25d366", fontWeight: 600 }}>+91 97036 20570</div>
            </div>
          </a>

          {/* Email */}
          <a href="mailto:connected.steps2106@gmail.com"
            style={{ display: "flex", alignItems: "flex-start", gap: "1rem", background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", padding: "1.5rem", textDecoration: "none", transition: "border-color 0.2s" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(232,98,10,0.4)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)")}>
            <div style={{ width: "40px", height: "40px", background: "rgba(232,98,10,0.1)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--cs-orange)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--cs-white)", marginBottom: "4px" }}>Email</div>
              <div style={{ fontSize: "0.82rem", color: "var(--cs-muted)", marginBottom: "8px" }}>For general enquiries, billing questions, or feedback.</div>
              <div style={{ fontSize: "0.8rem", color: "var(--cs-orange)", fontWeight: 600 }}>connected.steps2106@gmail.com</div>
            </div>
          </a>

          {/* Instagram */}
          <a href="https://www.instagram.com/connected_steps/" target="_blank" rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "flex-start", gap: "1rem", background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", padding: "1.5rem", textDecoration: "none", transition: "border-color 0.2s" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(225,48,108,0.4)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)")}>
            <div style={{ width: "40px", height: "40px", background: "rgba(225,48,108,0.1)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e1306c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                <circle cx="12" cy="12" r="4"/>
                <circle cx="17.5" cy="6.5" r="0.8" fill="#e1306c" stroke="none"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--cs-white)", marginBottom: "4px" }}>Instagram</div>
              <div style={{ fontSize: "0.82rem", color: "var(--cs-muted)", marginBottom: "8px" }}>Training content, community updates, and run highlights.</div>
              <div style={{ fontSize: "0.8rem", color: "#e1306c", fontWeight: 600 }}>@connected_steps</div>
            </div>
          </a>

          {/* YouTube */}
          <a href="https://www.youtube.com/@ConnectedSteps" target="_blank" rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "flex-start", gap: "1rem", background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", padding: "1.5rem", textDecoration: "none", transition: "border-color 0.2s" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(255,0,0,0.4)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)")}>
            <div style={{ width: "40px", height: "40px", background: "rgba(255,0,0,0.08)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#ff0000">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--cs-white)", marginBottom: "4px" }}>YouTube</div>
              <div style={{ fontSize: "0.82rem", color: "var(--cs-muted)", marginBottom: "8px" }}>Coaching sessions, run recaps, and training tips on video.</div>
              <div style={{ fontSize: "0.8rem", color: "#ff4444", fontWeight: 600 }}>@ConnectedSteps</div>
            </div>
          </a>
        </div>

        {/* FAQ */}
        <div style={{ marginBottom: "3rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--cs-white)", marginBottom: "1.25rem" }}>Common Questions</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
            {[
              { q: "How do I join Connected Steps?", a: "Create a free account at connectedsteps.in and your coach will reach out to schedule your first session." },
              { q: "Can I try before subscribing?", a: "Yes — your first session is free. After that, choose a membership plan that fits your commitment level." },
              { q: "How do I cancel or change my plan?", a: "Email us at connected.steps2106@gmail.com and we'll sort it out within 24 hours." },
              { q: "Where are sessions held?", a: "We run sessions across multiple locations in Hyderabad. Your coach will share exact meeting points after you sign up." },
              { q: "I found a bug or have a feature request.", a: "Email us or message on WhatsApp — we read everything and regularly ship improvements based on community feedback." },
            ].map((item, i) => (
              <div key={i} style={{ background: "var(--cs-dark)", padding: "1.25rem 1.5rem", borderRadius: i === 0 ? "8px 8px 0 0" : i === 4 ? "0 0 8px 8px" : "0", borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.05)" : "none", border: "1px solid rgba(255,255,255,0.06)", borderTop: i > 0 ? "none" : undefined }}>
                <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--cs-white)", marginBottom: "0.4rem" }}>{item.q}</div>
                <div style={{ fontSize: "0.82rem", color: "var(--cs-muted)", lineHeight: 1.7 }}>{item.a}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Response time note */}
        <div style={{ background: "rgba(232,98,10,0.06)", border: "1px solid rgba(232,98,10,0.15)", borderRadius: "8px", padding: "1rem 1.25rem", fontSize: "0.82rem", color: "var(--cs-muted)", lineHeight: 1.7 }}>
          <span style={{ color: "var(--cs-orange)", fontWeight: 600 }}>Response times:</span> WhatsApp within a few hours · Email within 1 business day. We're a small team — we appreciate your patience.
        </div>
      </div>
    </div>
  );
}
