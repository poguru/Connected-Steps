import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "Cookie Policy – Connected Steps",
  description: "How Connected Steps uses cookies and similar technologies on its platform.",
  alternates: { canonical: "/cookies" },
};

export default function CookiesPage() {
  const updated = "11 May 2026";

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

      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "4rem 2rem" }}>
        <p style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem" }}>Legal</p>
        <h1 style={{ fontSize: "2rem", fontWeight: 300, color: "var(--cs-white)", marginBottom: "0.5rem" }}>Cookie Policy</h1>
        <p style={{ fontSize: "0.8rem", color: "var(--cs-muted)", marginBottom: "3rem" }}>Last updated: {updated}</p>

        <Section title="1. What Are Cookies">
          <p>Cookies are small text files placed on your device by a website when you visit it. They help websites remember information about your visit — for example, that you are logged in — so you do not have to re-enter it every time.</p>
          <p>We also use similar storage technologies, specifically browser <strong>localStorage</strong>, which functions like a cookie but is stored differently and is never automatically sent to our servers.</p>
        </Section>

        <Section title="2. How We Use Storage Technologies">
          <p>Connected Steps uses storage technologies for the following purposes only:</p>
          <ul>
            <li><strong>Session management:</strong> When you sign in, we store your account details (name, email, goal, location, and profile photo) in localStorage so the app can personalise your dashboard without requiring a server round-trip on every page.</li>
            <li><strong>Strava tokens (optional):</strong> If you choose to connect your Strava account, the access token and refresh token are stored in localStorage. These are never sent to or stored on our servers — all Strava API calls are made directly from your browser.</li>
            <li><strong>Preference persistence:</strong> Minor UI preferences (such as open/closed state of menus) may be stored temporarily in localStorage.</li>
          </ul>
        </Section>

        <Section title="3. Cookies We Do NOT Use">
          <p>We do not use:</p>
          <ul>
            <li>Third-party advertising or tracking cookies</li>
            <li>Analytics cookies (e.g. Google Analytics) that track your behaviour across websites</li>
            <li>Social media tracking pixels</li>
            <li>Fingerprinting or cross-site tracking technologies</li>
          </ul>
        </Section>

        <Section title="4. Third-Party Services">
          <p>Our hosting and infrastructure providers may set their own cookies as part of delivering the service (for example, to manage network load balancing). These are strictly functional and do not track personal behaviour. Relevant providers include:</p>
          <ul>
            <li><strong>Vercel</strong> — web hosting (may set a session cookie for routing purposes)</li>
            <li><strong>Supabase</strong> — database infrastructure (server-side only, no client cookies)</li>
            <li><strong>Razorpay</strong> — payment processing (sets functional cookies during checkout only)</li>
          </ul>
        </Section>

        <Section title="5. Managing Your Storage Data">
          <p>Because we rely on localStorage rather than traditional cookies, standard browser cookie controls (such as "Clear cookies") may not remove all stored data. To clear data stored by Connected Steps:</p>
          <ul>
            <li><strong>Sign out</strong> from your dashboard — this clears your session data from localStorage.</li>
            <li>Open your browser's developer tools (F12 → Application → Local Storage → connectedsteps.in) and delete the entries manually.</li>
            <li>Use your browser's "Clear site data" option, which removes both cookies and localStorage for a specific site.</li>
          </ul>
          <p>Clearing your session data will sign you out and disconnect any linked Strava account from your browser session. Your account data on our servers is not affected.</p>
        </Section>

        <Section title="6. Changes to This Policy">
          <p>We may update this policy as our platform evolves. The "Last updated" date at the top will reflect any changes. Continued use of Connected Steps after changes constitutes acceptance of the updated policy.</p>
        </Section>

        <Section title="7. Contact">
          <p>Questions about cookies or data storage? Email us at <a href="mailto:info@connectedsteps.in" style={{ color: "var(--cs-orange)" }}>info@connectedsteps.in</a>.</p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "2.5rem" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--cs-white)", marginBottom: "0.75rem" }}>{title}</h2>
      <div style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.7)", lineHeight: 1.8, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {children}
      </div>
    </div>
  );
}
