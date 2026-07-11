import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "Terms of Use – Connected Steps",
  description: "Terms and conditions for using the Connected Steps platform.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
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
        <h1 style={{ fontSize: "2rem", fontWeight: 300, color: "var(--cs-white)", marginBottom: "0.5rem" }}>Terms of Use</h1>
        <p style={{ fontSize: "0.8rem", color: "var(--cs-muted)", marginBottom: "3rem" }}>Last updated: {updated}</p>

        <Section title="1. Acceptance of Terms">
          <p>By registering for or using Connected Steps ("the platform"), you agree to be bound by these Terms of Use. If you do not agree, please do not use the platform.</p>
        </Section>

        <Section title="2. The Service">
          <p>Connected Steps provides running coaching, personalised training plans, community leaderboards, and session management tools. Features may change over time at our discretion.</p>
        </Section>

        <Section title="3. Your Account">
          <ul>
            <li>You are responsible for keeping your login credentials secure.</li>
            <li>You must provide accurate information when registering.</li>
            <li>You must be at least 13 years old to use the platform.</li>
            <li>One account per person; do not share accounts.</li>
          </ul>
        </Section>

        <Section title="4. Strava Integration">
          <p>Connected Steps integrates with Strava to provide activity-based leaderboard features. By connecting your Strava account you additionally agree to:</p>
          <ul>
            <li>The <a href="https://www.strava.com/legal/api" target="_blank" rel="noopener noreferrer" style={{ color: "var(--cs-orange)" }}>Strava API Agreement</a></li>
            <li>The <a href="https://www.strava.com/legal" target="_blank" rel="noopener noreferrer" style={{ color: "var(--cs-orange)" }}>Strava Terms of Service</a></li>
          </ul>
          <p>Strava connection is optional. You can disconnect at any time from your dashboard, or via <a href="https://www.strava.com/settings/apps" target="_blank" rel="noopener noreferrer" style={{ color: "var(--cs-orange)" }}>Strava Settings → My Apps</a>.</p>
          <p>Activity data sourced from Strava is used solely to calculate leaderboard points. We do not store GPS data or share your Strava data with third parties.</p>
        </Section>

        <Section title="5. Acceptable Use">
          <p>You agree not to:</p>
          <ul>
            <li>Use the platform for any unlawful purpose.</li>
            <li>Attempt to gain unauthorised access to other accounts or our systems.</li>
            <li>Falsify or manipulate activity data or attendance records.</li>
            <li>Harass or abuse other community members.</li>
          </ul>
        </Section>

        <Section title="6. Payments and Subscriptions">
          <p>Certain features require a paid subscription. Prices are displayed on the <Link href="/pricing" style={{ color: "var(--cs-orange)" }}>Pricing page</Link>. For our cancellation and refund terms, see the <Link href="/refund-policy" style={{ color: "var(--cs-orange)" }}>Refund Policy</Link>. We reserve the right to change pricing with reasonable notice.</p>
        </Section>

        <Section title="7. Intellectual Property">
          <p>All content on Connected Steps — including training plans, coaching material, logos, and design — is owned by Connected Steps and may not be reproduced without permission.</p>
        </Section>

        <Section title="8. Limitation of Liability">
          <p>Connected Steps is not liable for any injury, illness, or health event arising from following training plans or attending sessions. Always consult a doctor before beginning a new exercise programme. The platform is provided "as is" without warranties of any kind.</p>
        </Section>

        <Section title="9. Termination">
          <p>We reserve the right to suspend or delete accounts that violate these terms. You may delete your account at any time by contacting info@connectedsteps.in.</p>
        </Section>

        <Section title="10. Governing Law">
          <p>These terms are governed by the laws of India. Any disputes shall be resolved in the courts of Hyderabad, Telangana.</p>
        </Section>

        <Section title="11. Contact">
          <p>Questions about these terms? Email us at <a href="mailto:info@connectedsteps.in" style={{ color: "var(--cs-orange)" }}>info@connectedsteps.in</a>.</p>
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
