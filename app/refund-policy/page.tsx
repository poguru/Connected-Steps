import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "Refund Policy – Connected Steps",
  description: "Cancellation and refund policy for Connected Steps memberships and event registrations.",
  alternates: { canonical: "/refund-policy" },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "2.5rem" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--cs-white)", marginBottom: "0.75rem" }}>{title}</h2>
      <div style={{ fontSize: "0.875rem", color: "var(--cs-muted)", lineHeight: 1.8 }}>{children}</div>
    </div>
  );
}

export default function RefundPolicyPage() {
  const updated = "11 July 2026";

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
        <h1 style={{ fontSize: "2rem", fontWeight: 300, color: "var(--cs-white)", marginBottom: "0.5rem" }}>Refund &amp; Cancellation Policy</h1>
        <p style={{ fontSize: "0.8rem", color: "var(--cs-muted)", marginBottom: "3rem" }}>Last updated: {updated}</p>

        <Section title="1. Overview">
          <p>
            Connected Steps offers running coaching memberships and paid event registrations. This policy explains when refunds
            are available and how to request them. All payments are processed securely through Razorpay.
          </p>
        </Section>

        <Section title="2. Membership Plans">
          <p style={{ marginBottom: "0.75rem" }}>
            <strong style={{ color: "var(--cs-white)" }}>Monthly memberships:</strong> You may cancel your membership at any
            time. Cancellation takes effect at the end of the current billing cycle — you retain access until then. We do not
            issue prorated refunds for unused days within a paid cycle.
          </p>
          <p>
            <strong style={{ color: "var(--cs-white)" }}>Advance / annual plans:</strong> Requests for a refund within
            7 days of purchase will be honoured in full if fewer than 2 sessions have been attended. After 7 days or after
            2 or more sessions have been attended, no refund is issued for the remaining term.
          </p>
        </Section>

        <Section title="3. Event Registrations">
          <p style={{ marginBottom: "0.75rem" }}>
            <strong style={{ color: "var(--cs-white)" }}>More than 7 days before the event:</strong> Full refund, less any
            payment-gateway processing fee (typically ₹0–30 depending on payment method).
          </p>
          <p style={{ marginBottom: "0.75rem" }}>
            <strong style={{ color: "var(--cs-white)" }}>3–7 days before the event:</strong> 50% refund.
          </p>
          <p style={{ marginBottom: "0.75rem" }}>
            <strong style={{ color: "var(--cs-white)" }}>Fewer than 3 days before the event:</strong> No refund. You may
            transfer your registration to another participant by contacting us at least 48 hours before the event.
          </p>
          <p>
            <strong style={{ color: "var(--cs-white)" }}>Free events:</strong> No payment, no refund applicable.
          </p>
        </Section>

        <Section title="4. Event Cancellation by Connected Steps">
          <p>
            If Connected Steps cancels an event for any reason, all registered participants will receive a full refund to
            their original payment method within 7 business days. We will notify you by WhatsApp and email as soon as a
            cancellation decision is made.
          </p>
        </Section>

        <Section title="5. Duplicate or Erroneous Charges">
          <p>
            If you believe you have been charged incorrectly or more than once, contact us immediately at{" "}
            <a href="mailto:info@connectedsteps.in" style={{ color: "var(--cs-orange)" }}>info@connectedsteps.in</a> with
            your order or payment reference. We will investigate and resolve genuine duplicate charges within 5 business days.
          </p>
        </Section>

        <Section title="6. How to Request a Refund">
          <p>
            Email <a href="mailto:info@connectedsteps.in" style={{ color: "var(--cs-orange)" }}>info@connectedsteps.in</a>{" "}
            with the subject line <em>"Refund Request"</em> and include your registered name, phone number, and a brief
            description of the reason. You may also reach us on WhatsApp at{" "}
            <a href="https://wa.me/919703620570" style={{ color: "#25d366" }} target="_blank" rel="noopener noreferrer">+91 97036 20570</a>.
            We typically respond within 1 business day.
          </p>
        </Section>

        <Section title="7. Processing Time">
          <p>
            Approved refunds are processed within 5–10 business days and credited to the original payment instrument
            (card, UPI, net banking, or wallet). The exact timeline depends on your bank or payment provider.
          </p>
        </Section>

        <Section title="8. Contact Us">
          <p>
            For any questions about this policy, write to us at{" "}
            <a href="mailto:info@connectedsteps.in" style={{ color: "var(--cs-orange)" }}>info@connectedsteps.in</a> or
            visit our <Link href="/contact" style={{ color: "var(--cs-orange)" }}>Contact page</Link>.
          </p>
        </Section>
      </div>
    </div>
  );
}
