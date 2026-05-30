"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open(): void };
  }
}

const MONTHLY_RATE = 1200;

const plans = [
  { id: "monthly",   label: "Monthly",   months: 1,  payFor: 1,   badge: null,        popular: false },
  { id: "quarterly", label: "3 Months",  months: 3,  payFor: 2.5, badge: "Save ₹600", popular: false },
  { id: "biannual",  label: "6 Months",  months: 6,  payFor: 5,   badge: "Save ₹1,200", popular: true },
  { id: "annual",    label: "12 Months", months: 12, payFor: 9,   badge: "Best Value", popular: false },
];

const features = [
  "Personalised training plan",
  "Weekly coach check-in",
  "Real-time analytics dashboard",
  "Session attendance tracking",
  "Community & group challenges",
  "Weekend special run access",
  "WhatsApp coach support",
];

export default function PricingPage() {
  const router = useRouter();
  const [hovered,   setHovered]   = useState<string | null>(null);
  const [paying,    setPaying]    = useState<string | null>(null);
  const [success,   setSuccess]   = useState<string | null>(null);
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName,  setUserName]  = useState<string>("");

  useEffect(() => {
    const stored = localStorage.getItem("cs_user");
    if (stored) {
      const u = JSON.parse(stored);
      setUserEmail(u.email);
      setUserName(`${u.firstName} ${u.lastName}`.trim());
    }

    // Load Razorpay checkout script
    if (!document.getElementById("razorpay-script")) {
      const script = document.createElement("script");
      script.id  = "razorpay-script";
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      document.body.appendChild(script);
    }
  }, []);

  async function handleBuy(planId: string) {
    setErrorMsg(null);

    if (!userEmail) {
      router.push(`/auth?redirect=/pricing`);
      return;
    }

    setPaying(planId);
    try {
      const orderRes = await fetch("/api/payment/create-order", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ plan: planId, email: userEmail }),
      });
      const order = await orderRes.json();
      if (!orderRes.ok) throw new Error(order.error ?? "Order creation failed");

      const rzp = new window.Razorpay({
        key:         process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount:      order.amount,
        currency:    "INR",
        name:        "Connected Steps",
        description: `${plans.find((p) => p.id === planId)?.label} Membership`,
        order_id:    order.orderId,
        prefill:     { email: userEmail, name: userName },
        theme:       { color: "#e8620a" },
        modal:       { ondismiss: () => setPaying(null) },
        handler: async (response: {
          razorpay_order_id:   string;
          razorpay_payment_id: string;
          razorpay_signature:  string;
        }) => {
          const verifyRes = await fetch("/api/payment/verify", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
              ...response,
              plan:   planId,
              email:  userEmail,
              name:   userName,
              amount: order.amount,
            }),
          });
          const result = await verifyRes.json();
          if (!verifyRes.ok) throw new Error(result.error ?? "Verification failed");

          const expiry = new Date(result.expiresAt).toLocaleDateString("en-IN", {
            day: "numeric", month: "long", year: "numeric",
          });
          setSuccess(`Payment successful! Your membership is active until ${expiry}. A confirmation email has been sent to ${userEmail}.`);
          setPaying(null);
        },
      });

      rzp.open();
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setPaying(null);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--cs-black)", color: "var(--cs-white)" }}>

      {/* Navbar */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, background: "rgba(10,10,10,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 2rem", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
          <Image src="/logo.png" alt="Connected Steps" width={36} height={36} className="rounded-full" />
          <span style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--cs-white)", fontFamily: "var(--font-display)" }}>Connected Steps</span>
        </Link>
        <Link href="/" style={{ fontSize: "0.8rem", color: "var(--cs-muted)", textDecoration: "none" }}>← Back to home</Link>
      </header>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "7rem 1.5rem 5rem" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "4rem" }}>
          <div style={{ fontSize: "10px", color: "var(--cs-orange)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1rem", fontWeight: 600 }}>Pricing</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2.4rem, 5vw, 4rem)", fontWeight: 300, color: "var(--cs-white)", marginBottom: "1rem", lineHeight: 1.1 }}>
            Simple, honest pricing.<br />
            <em style={{ color: "var(--cs-orange)", fontStyle: "normal" }}>Longer you commit, more you save.</em>
          </h1>
          <p style={{ fontSize: "1rem", color: "var(--cs-muted)", maxWidth: "480px", margin: "0 auto", lineHeight: 1.7 }}>
            All plans include every feature — no tiers, no hidden fees.<br />
            All prices inclusive of GST.
          </p>
        </div>

        {/* Success / Error banners */}
        {success && (
          <div style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: "8px", padding: "1rem 1.25rem", marginBottom: "2rem", fontSize: "0.875rem", color: "#4ade80", lineHeight: 1.6 }}>
            ✅ {success}
            <div style={{ marginTop: "0.75rem" }}>
              <Link href="/dashboard" style={{ color: "#4ade80", fontWeight: 700, textDecoration: "underline" }}>Go to Dashboard →</Link>
            </div>
          </div>
        )}
        {errorMsg && (
          <div style={{ background: "rgba(226,75,74,0.08)", border: "1px solid rgba(226,75,74,0.3)", borderRadius: "8px", padding: "1rem 1.25rem", marginBottom: "2rem", fontSize: "0.875rem", color: "#f09595" }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Pricing cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))", gap: "1.25rem", alignItems: "start" }}>
          {plans.map((plan) => {
            const total     = Math.round(plan.payFor * MONTHLY_RATE);
            const perMonth  = Math.round(total / plan.months);
            const saving    = Math.round((plan.months - plan.payFor) * MONTHLY_RATE);
            const isHovered = hovered === plan.id;
            const isPopular = plan.popular;
            const isBuying  = paying === plan.id;

            return (
              <div
                key={plan.id}
                onMouseEnter={() => setHovered(plan.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  position:   "relative",
                  background: isPopular ? "rgba(232,98,10,0.07)" : "var(--cs-dark)",
                  border:     `1px solid ${isPopular || isHovered ? "rgba(232,98,10,0.5)" : "rgba(255,255,255,0.07)"}`,
                  borderRadius: "12px",
                  padding:    "2rem 1.75rem",
                  transition: "border-color 0.2s, transform 0.2s",
                  transform:  isPopular ? "scale(1.03)" : isHovered ? "translateY(-4px)" : "none",
                }}
              >
                {/* Badge */}
                {plan.badge && (
                  <div style={{ position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)", background: "var(--cs-orange)", color: "#fff", fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "4px 14px", borderRadius: "20px", whiteSpace: "nowrap" }}>
                    {plan.badge}
                  </div>
                )}

                <div style={{ fontSize: "11px", color: isPopular ? "var(--cs-orange)" : "var(--cs-muted)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: "1.25rem" }}>
                  {plan.label}
                </div>

                <div style={{ marginBottom: "0.5rem" }}>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: "2.8rem", fontWeight: 300, color: "var(--cs-white)", lineHeight: 1 }}>
                    ₹{perMonth.toLocaleString("en-IN")}
                  </span>
                  <span style={{ fontSize: "0.8rem", color: "var(--cs-muted)", marginLeft: "4px" }}>/mo</span>
                </div>

                <div style={{ fontSize: "0.8rem", color: "var(--cs-muted)", marginBottom: saving > 0 ? "0.4rem" : "1.75rem" }}>
                  ₹{total.toLocaleString("en-IN")} billed {plan.months === 1 ? "monthly" : `every ${plan.months} months`}
                </div>

                {saving > 0 && (
                  <div style={{ fontSize: "0.78rem", color: "#4ade80", fontWeight: 600, marginBottom: "1.75rem" }}>
                    You save ₹{saving.toLocaleString("en-IN")} ({plan.months - plan.payFor} {plan.months - plan.payFor === 1 ? "month" : "months"} free)
                  </div>
                )}

                <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", marginBottom: "1.5rem" }} />

                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2rem", display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                  {features.map((f) => (
                    <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "0.8rem", color: "var(--cs-muted)", lineHeight: 1.4 }}>
                      <svg style={{ flexShrink: 0, marginTop: "1px", color: "var(--cs-orange)" }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <button
                  onClick={() => handleBuy(plan.id)}
                  disabled={!!paying || !!success}
                  style={{
                    display:    "block",
                    width:      "100%",
                    textAlign:  "center",
                    padding:    "12px",
                    borderRadius: "6px",
                    fontSize:   "0.85rem",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    cursor:     paying || success ? "not-allowed" : "pointer",
                    opacity:    paying && !isBuying ? 0.5 : 1,
                    background: isPopular ? "var(--cs-orange)" : "transparent",
                    color:      isPopular ? "#fff" : "var(--cs-white)",
                    border:     isPopular ? "none" : "1px solid rgba(255,255,255,0.2)",
                    fontFamily: "var(--font-body)",
                    transition: "background 0.2s, opacity 0.2s",
                  }}
                >
                  {isBuying ? "Opening checkout…" : success ? "Purchased" : userEmail ? "Get started" : "Sign in to buy"}
                </button>
              </div>
            );
          })}
        </div>

        <p style={{ textAlign: "center", fontSize: "12px", color: "var(--cs-muted)", marginTop: "3rem", lineHeight: 1.7 }}>
          Not sure which plan to pick?{" "}
          <Link href="https://wa.me/9703620570" target="_blank" style={{ color: "var(--cs-orange)", textDecoration: "none" }}>
            Chat with us on WhatsApp
          </Link>{" "}
          — we'll help you choose.
        </p>
      </div>
    </div>
  );
}
