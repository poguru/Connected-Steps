import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Delete Account — Connected Steps",
  description: "Request deletion of your Connected Steps account and personal data.",
};

export default function DeleteAccountPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#f0f0f0", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* Header */}
      <header style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "16px 24px", display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <Image src="/logo.png" alt="Connected Steps" width={32} height={32} style={{ borderRadius: "50%" }} />
          <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Connected Steps</span>
        </Link>
      </header>

      <main style={{ maxWidth: 680, margin: "0 auto", padding: "3rem 24px 5rem" }}>

        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#fff", marginBottom: "0.5rem" }}>
          Delete Your Account
        </h1>
        <p style={{ fontSize: 15, color: "#666", marginBottom: "2.5rem", lineHeight: 1.6 }}>
          You can request permanent deletion of your Connected Steps account and all associated data by following the steps below.
        </p>

        {/* Steps */}
        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ fontSize: "0.8rem", fontWeight: 700, color: "#e8620a", marginBottom: "1.25rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            How to request account deletion
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              {
                step: "1",
                title: "Option A — Delete from the app",
                desc: "Open the Connected Steps app → tap your profile icon → Settings → Delete Account. Confirm when prompted. Your account will be queued for deletion immediately.",
              },
              {
                step: "2",
                title: "Option B — Email us",
                desc: "Send an email to info@connectedsteps.in with the subject line \"Account Deletion Request\". Include the email address registered to your account. We will process your request within 7 business days and send a confirmation.",
              },
            ].map(item => (
              <div key={item.step} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.25rem 1.5rem", display: "flex", gap: 16 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#e8620a22", border: "1px solid #e8620a44", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#e8620a", flexShrink: 0 }}>
                  {item.step}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 6 }}>{item.title}</div>
                  <div style={{ fontSize: 13, color: "#777", lineHeight: 1.6 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* What gets deleted */}
        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ fontSize: "0.8rem", fontWeight: 700, color: "#e8620a", marginBottom: "1.25rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Data that will be permanently deleted
          </h2>
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.25rem 1.5rem" }}>
            <ul style={{ margin: 0, padding: "0 0 0 1.25rem", display: "flex", flexDirection: "column", gap: 8, color: "#888", fontSize: 13, lineHeight: 1.6 }}>
              <li>Account credentials (email, password, phone number)</li>
              <li>Profile information (name, date of birth, location, goal, profile photo)</li>
              <li>Fitness activity data (session attendance, run records, leaderboard scores)</li>
              <li>Community content (posts, comments, reactions, stories)</li>
              <li>Coach messages and conversation history</li>
              <li>Training plans assigned to your account</li>
              <li>Referral history and reward credits</li>
              <li>Push notification tokens and device data</li>
            </ul>
          </div>
        </section>

        {/* What is retained */}
        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ fontSize: "0.8rem", fontWeight: 700, color: "#e8620a", marginBottom: "1.25rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Data that may be retained
          </h2>
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.25rem 1.5rem" }}>
            <ul style={{ margin: 0, padding: "0 0 0 1.25rem", display: "flex", flexDirection: "column", gap: 8, color: "#888", fontSize: 13, lineHeight: 1.6 }}>
              <li><strong style={{ color: "#aaa" }}>Payment records</strong> — Transaction records processed through Razorpay are retained for up to <strong style={{ color: "#aaa" }}>7 years</strong> as required by Indian financial regulations (GST compliance).</li>
              <li><strong style={{ color: "#aaa" }}>Anonymised aggregates</strong> — Session attendance counts and leaderboard totals may be retained in anonymised, non-identifiable form for statistical purposes.</li>
              <li><strong style={{ color: "#aaa" }}>Audit logs</strong> — Security and access logs are retained for up to <strong style={{ color: "#aaa" }}>90 days</strong> to comply with platform security requirements.</li>
            </ul>
          </div>
        </section>

        {/* Timeline */}
        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ fontSize: "0.8rem", fontWeight: 700, color: "#e8620a", marginBottom: "1.25rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Deletion timeline
          </h2>
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.25rem 1.5rem", fontSize: 13, color: "#777", lineHeight: 1.7 }}>
            Account deletion requests are processed within <strong style={{ color: "#aaa" }}>7 business days</strong>. You will receive a confirmation email once your data has been permanently removed. During this period you will not be able to log in to your account.
          </div>
        </section>

        {/* Contact */}
        <section>
          <h2 style={{ fontSize: "0.8rem", fontWeight: 700, color: "#e8620a", marginBottom: "1.25rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Contact us
          </h2>
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.25rem 1.5rem", fontSize: 13, color: "#777", lineHeight: 1.7 }}>
            If you have any questions about data deletion, contact us at{" "}
            <a href="mailto:info@connectedsteps.in" style={{ color: "#e8620a", textDecoration: "none" }}>
              info@connectedsteps.in
            </a>
            . We typically respond within 2 business days.
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "1.5rem 24px", textAlign: "center", fontSize: 12, color: "#333" }}>
        <Link href="/privacy" style={{ color: "#444", textDecoration: "none", marginRight: 16 }}>Privacy Policy</Link>
        <Link href="/terms" style={{ color: "#444", textDecoration: "none" }}>Terms of Service</Link>
        <div style={{ marginTop: 8 }}>© {new Date().getFullYear()} Connected Steps. All rights reserved.</div>
      </footer>
    </div>
  );
}
