"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open(): void };
  }
}

const plans = [
  { id: "monthly",   label: "Monthly",   months: 1,  amount: 1200 },
  { id: "quarterly", label: "3 Months",  months: 3,  amount: 3000 },
  { id: "biannual",  label: "6 Months",  months: 6,  amount: 6000 },
  { id: "annual",    label: "12 Months", months: 12, amount: 10800 },
];

interface Membership {
  plan:       string;
  status:     string;
  expires_at: string;
  isActive:   boolean;
}

interface Props {
  email: string;
  name:  string;
}

export default function MembershipCard({ email, name }: Props) {
  const [membership,  setMembership]  = useState<Membership | null>(null);
  const [selected,    setSelected]    = useState("biannual");
  const [paying,      setPaying]      = useState(false);
  const [success,     setSuccess]     = useState("");
  const [error,       setError]       = useState("");

  useEffect(() => {
    if (!email) return;
    fetch(`/api/membership?email=${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((d) => setMembership(d.membership))
      .catch(() => setMembership(null));

    // Load Razorpay script
    if (!document.getElementById("razorpay-script")) {
      const s = document.createElement("script");
      s.id  = "razorpay-script";
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      document.body.appendChild(s);
    }
  }, [email]);

  async function handlePay() {
    setError("");
    setPaying(true);
    try {
      const orderRes = await fetch("/api/payment/create-order", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ plan: selected, email }),
      });
      const order = await orderRes.json();
      if (!orderRes.ok) throw new Error(order.error ?? "Order creation failed");

      const plan = plans.find((p) => p.id === selected)!;

      const rzp = new window.Razorpay({
        key:         process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount:      order.amount,
        currency:    "INR",
        name:        "Connected Steps",
        description: `${plan.label} Membership`,
        order_id:    order.orderId,
        prefill:     { email, name },
        theme:       { color: "#e8620a" },
        modal:       { ondismiss: () => setPaying(false) },
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
              plan:   selected,
              email,
              name,
              amount: order.amount,
            }),
          });
          const result = await verifyRes.json();
          if (!verifyRes.ok) throw new Error(result.error ?? "Verification failed");

          const expiry = new Date(result.expiresAt).toLocaleDateString("en-IN", {
            day: "numeric", month: "long", year: "numeric",
          });
          setSuccess(`Membership active until ${expiry}!`);
          setMembership({ plan: selected, status: "active", expires_at: result.expiresAt, isActive: true });
          setPaying(false);
        },
      });

      rzp.open();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Payment failed. Try again.");
      setPaying(false);
    }
  }

  // Active member
  if (membership?.isActive) {
    const expiry = new Date(membership.expires_at).toLocaleDateString("en-IN", {
      day: "numeric", month: "long", year: "numeric",
    });
    const planLabel = plans.find((p) => p.id === membership.plan)?.label ?? membership.plan;
    return (
      <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: "8px", padding: "1.25rem", marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
          <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Membership</div>
          <span style={{ fontSize: "10px", background: "rgba(74,222,128,0.15)", color: "#4ade80", borderRadius: "20px", padding: "2px 10px", fontWeight: 700 }}>ACTIVE</span>
        </div>
        <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--cs-white)" }}>{planLabel} Plan</div>
        <div style={{ fontSize: "0.78rem", color: "var(--cs-muted)", marginTop: "4px" }}>Valid until {expiry}</div>
      </div>
    );
  }

  // No active membership — show plan picker
  return (
    <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: "8px", padding: "1.25rem", marginBottom: "1rem" }}>
      <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.75rem" }}>Subscribe</div>

      {success ? (
        <div style={{ fontSize: "0.8rem", color: "#4ade80", lineHeight: 1.6 }}>✅ {success}<br />A confirmation email has been sent.</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "0.75rem" }}>
            {plans.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                style={{
                  padding:      "8px 6px",
                  borderRadius: "6px",
                  fontSize:     "0.75rem",
                  fontWeight:   600,
                  cursor:       "pointer",
                  fontFamily:   "var(--font-body)",
                  textAlign:    "center",
                  background:   selected === p.id ? "rgba(232,98,10,0.15)" : "rgba(255,255,255,0.04)",
                  border:       `1px solid ${selected === p.id ? "var(--cs-orange)" : "rgba(255,255,255,0.08)"}`,
                  color:        selected === p.id ? "var(--cs-orange)" : "var(--cs-muted)",
                  transition:   "all 0.15s",
                }}
              >
                <div>{p.label}</div>
                <div style={{ fontSize: "10px", marginTop: "2px", opacity: 0.8 }}>₹{p.amount.toLocaleString("en-IN")}</div>
              </button>
            ))}
          </div>

          {error && <div style={{ fontSize: "0.75rem", color: "#f09595", marginBottom: "0.5rem" }}>{error}</div>}

          <button
            onClick={handlePay}
            disabled={paying}
            style={{
              width:      "100%",
              padding:    "10px",
              background: paying ? "rgba(232,98,10,0.5)" : "var(--cs-orange)",
              color:      "#fff",
              border:     "none",
              borderRadius: "6px",
              fontSize:   "0.85rem",
              fontWeight: 700,
              cursor:     paying ? "not-allowed" : "pointer",
              fontFamily: "var(--font-body)",
            }}
          >
            {paying ? "Opening checkout…" : "Subscribe now"}
          </button>
          <div style={{ fontSize: "10px", color: "var(--cs-muted)", textAlign: "center", marginTop: "6px" }}>Secure payment via Razorpay · All prices incl. GST</div>
        </>
      )}
    </div>
  );
}
