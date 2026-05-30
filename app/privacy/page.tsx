import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "Privacy Policy – Connected Steps",
  description: "How Connected Steps collects, uses, and protects your personal information.",
};

export default function PrivacyPage() {
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
        <h1 style={{ fontSize: "2rem", fontWeight: 300, color: "var(--cs-white)", marginBottom: "0.5rem" }}>Privacy Policy</h1>
        <p style={{ fontSize: "0.8rem", color: "var(--cs-muted)", marginBottom: "3rem" }}>Last updated: {updated}</p>

        <Section title="1. Who We Are">
          <p>Connected Steps ("we", "us", "our") operates the website connectedsteps.in and provides running coaching and community services. Our contact email is connected.steps2106@gmail.com.</p>
        </Section>

        <Section title="2. Information We Collect">
          <p>We collect the following information when you register or use our platform:</p>
          <ul>
            <li><strong>Account data:</strong> first name, last name, email address, phone number, training location, and running goal.</li>
            <li><strong>Training data:</strong> session attendance records logged by your coach.</li>
            <li><strong>Strava data (optional):</strong> if you choose to connect your Strava account, we access the data described in Section 4 below.</li>
          </ul>
        </Section>

        <Section title="3. How We Use Your Information">
          <ul>
            <li>To personalise your training plan and coach recommendations.</li>
            <li>To calculate and display your position on the community leaderboard.</li>
            <li>To send you communications about sessions and events (where you have agreed).</li>
            <li>To improve our platform and services.</li>
          </ul>
          <p>We do not sell your personal data to any third party.</p>
        </Section>

        <Section title="4. Strava Integration">
          <p>Connected Steps integrates with the <strong>Strava API</strong>. Connecting Strava is entirely optional. If you choose to connect, we access the following data from your Strava account:</p>
          <ul>
            <li>Activity name, type (e.g. Run, Walk, Ride), date and time</li>
            <li>Distance (km) and moving time (seconds)</li>
            <li>Average speed (used only to compute estimated pace)</li>
          </ul>
          <p><strong>What we do NOT access or store:</strong></p>
          <ul>
            <li>GPS coordinates, routes, or map data</li>
            <li>Heart rate, power, cadence, or other sensor data</li>
            <li>Photos, segments, kudos, or social interactions</li>
            <li>Any private activities (we only access the scope you grant)</li>
          </ul>
          <p><strong>What we store:</strong> We store only aggregated monthly summaries (total runs, total km, total time, and points score) for leaderboard purposes. Raw activity lists are processed in your browser session and are not persisted on our servers.</p>
          <p><strong>Powered by Strava:</strong> Activity data displayed on Connected Steps is sourced from Strava. We comply with the <a href="https://www.strava.com/legal/api" target="_blank" rel="noopener noreferrer" style={{ color: "var(--cs-orange)" }}>Strava API Agreement</a>.</p>
          <p><strong>Revoking access:</strong> You can disconnect Strava at any time from your dashboard. To fully revoke access you can also visit <a href="https://www.strava.com/settings/apps" target="_blank" rel="noopener noreferrer" style={{ color: "var(--cs-orange)" }}>Strava Settings → My Apps</a> and remove Connected Steps. Upon disconnection we stop fetching your Strava data; existing aggregated summaries are removed from the leaderboard on your next dashboard visit.</p>
        </Section>

        <Section title="5. Data Retention">
          <p>Your account data is retained for as long as your account is active. Aggregated Strava summaries are retained as long as you remain connected to Strava. You may request deletion of all your data by emailing connected.steps2106@gmail.com.</p>
        </Section>

        <Section title="6. Data Security">
          <p>Strava access tokens and refresh tokens are stored only in your browser's local storage and are never sent to or stored on our servers. All communication between your browser and our servers is encrypted via HTTPS.</p>
        </Section>

        <Section title="7. Third-Party Services">
          <p>We use the following third-party services:</p>
          <ul>
            <li><strong>Strava API</strong> – activity data (see Section 4)</li>
            <li><strong>Supabase</strong> – database hosting (data stored in the EU region)</li>
            <li><strong>Vercel</strong> – web hosting</li>
          </ul>
        </Section>

        <Section title="8. Your Rights">
          <p>You have the right to access, correct, or delete your personal data. To exercise any of these rights, email us at connected.steps2106@gmail.com.</p>
        </Section>

        <Section title="9. Changes to This Policy">
          <p>We may update this policy from time to time. The "Last updated" date at the top of this page will reflect any changes. Continued use of Connected Steps after changes constitutes acceptance of the updated policy.</p>
        </Section>

        <Section title="10. Contact">
          <p>For any privacy-related queries, email us at <a href="mailto:connected.steps2106@gmail.com" style={{ color: "var(--cs-orange)" }}>connected.steps2106@gmail.com</a>.</p>
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
