"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open(): void };
  }
}

const plans = [
  { id: "monthly",   label: "Monthly",   months: 1,  amount: 1200  },
  { id: "quarterly", label: "3 Months",  months: 3,  amount: 3000  },
  { id: "biannual",  label: "6 Months",  months: 6,  amount: 6000  },
  { id: "annual",    label: "12 Months", months: 12, amount: 10800 },
];

interface Membership {
  plan:       string;
  status:     string;
  started_at: string;
  expires_at: string;
  isActive:   boolean;
}

interface Props {
  email: string;
  name:  string;
}

function daysLeft(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function progressPct(startedAt: string, expiresAt: string) {
  const total   = new Date(expiresAt).getTime() - new Date(startedAt).getTime();
  const elapsed = Date.now() - new Date(startedAt).getTime();
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

export default function MembershipCard({ email, name }: Props) {
  const [membership, setMembership] = useState<Membership | null | undefined>(undefined);
  const [selected,   setSelected]   = useState("biannual");
  const [paying,     setPaying]     = useState(false);
  const [renewing,   setRenewing]   = useState(false);
  const [success,    setSuccess]    = useState("");
  const [error,      setError]      = useState("");

  useEffect(() => {
    if (!email) return;
    const token = (typeof localStorage !== "undefined" ? localStorage.getItem("cs_user_token") : null) ?? "";
    fetch(`/api/membership?email=${encodeURIComponent(email)}`, { headers: { "x-user-token": token } })
      .then((r) => r.json())
      .then((d) => setMembership(d.membership ?? null))
      .catch(() => setMembership(null));

    if (!document.getElementById("razorpay-script")) {
      const s = document.createElement("script");
      s.id  = "razorpay-script";
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      document.body.appendChild(s);
    }
  }, [email]);

  async function handlePay(planId: string) {
    setError("");
    setPaying(true);
    try {
      const orderRes = await fetch("/api/payment/create-order", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ plan: planId, email }),
      });
      const order = await orderRes.json();
      if (!orderRes.ok) throw new Error(order.error ?? "Order creation failed");

      const plan = plans.find((p) => p.id === planId)!;

      const rzp = new window.Razorpay({
        key:         process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount:      order.amount,
        currency:    "INR",
        name:        "Connected Steps",
        description: `${plan.label} Membership`,
        order_id:    order.orderId,
        prefill:     { email, name },
        theme:       { color: "#e8620a" },
        modal:       { ondismiss: () => { setPaying(false); setRenewing(false); } },
        handler: async (response: {
          razorpay_order_id:   string;
          razorpay_payment_id: string;
          razorpay_signature:  string;
        }) => {
          const verifyRes = await fetch("/api/payment/verify", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ ...response, plan: planId, email, name, amount: order.amount }),
          });
          const result = await verifyRes.json();
          if (!verifyRes.ok) throw new Error(result.error ?? "Verification failed");

          setMembership({ plan: planId, status: "active", started_at: new Date().toISOString(), expires_at: result.expiresAt, isActive: true });
          setSuccess("Membership renewed successfully!");
          setPaying(false);
          setRenewing(false);
        },
      });

      rzp.open();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Payment failed. Try again.");
      setPaying(false);
      setRenewing(false);
    }
  }

  // ── Loading skeleton ──
  if (membership === undefined) {
    return (
      <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.25rem", marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <div style={{ width: "80px", height: "10px", background: "rgba(255,255,255,0.06)", borderRadius: "4px" }} />
          <div style={{ width: "50px", height: "18px", background: "rgba(255,255,255,0.06)", borderRadius: "20px" }} />
        </div>
        <div style={{ width: "140px", height: "14px", background: "rgba(255,255,255,0.06)", borderRadius: "4px", marginBottom: "8px" }} />
        <div style={{ width: "100%", height: "6px", background: "rgba(255,255,255,0.06)", borderRadius: "4px" }} />
      </div>
    );
  }

  // ── Active membership ──
  if (membership?.isActive && !renewing) {
    const days       = daysLeft(membership.expires_at);
    const pct        = progressPct(membership.started_at, membership.expires_at);
    const planLabel  = plans.find((p) => p.id === membership.plan)?.label ?? membership.plan;
    const expiry     = new Date(membership.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const expiringSoon = days <= 30;
    const barColor   = days <= 7 ? "#f09595" : days <= 30 ? "#fbbf24" : "#4ade80";

    return (
      <div style={{ background: "var(--cs-dark)", border: `1px solid ${expiringSoon ? "rgba(251,191,36,0.25)" : "rgba(74,222,128,0.2)"}`, borderRadius: "8px", padding: "1.25rem", marginBottom: "1rem" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Membership</div>
          <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 10px", borderRadius: "20px", background: expiringSoon ? "rgba(251,191,36,0.12)" : "rgba(74,222,128,0.12)", color: expiringSoon ? "#fbbf24" : "#4ade80" }}>
            {expiringSoon ? "EXPIRING SOON" : "ACTIVE"}
          </span>
        </div>

        {/* Plan name */}
        <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--cs-white)", marginBottom: "4px" }}>{planLabel} Plan</div>

        {/* Days remaining */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.6rem" }}>
          <div style={{ fontSize: "0.78rem", color: "var(--cs-muted)" }}>Expires {expiry}</div>
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: barColor }}>{days}d left</div>
        </div>

        {/* Progress bar */}
        <div style={{ width: "100%", height: "5px", background: "rgba(255,255,255,0.06)", borderRadius: "4px", overflow: "hidden", marginBottom: "0.6rem" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: "4px", transition: "width 0.4s" }} />
        </div>

        <a href="/payments" style={{ fontSize: "11px", color: "var(--cs-muted)", textDecoration: "none", display: "inline-block", marginBottom: expiringSoon ? "0.5rem" : "0" }}>
          View payment history →
        </a>

        {/* Renew CTA for expiring soon */}
        {expiringSoon && (
          <>
            {success && <div style={{ fontSize: "0.78rem", color: "#4ade80", marginBottom: "0.5rem" }}>✅ {success}</div>}
            {!success && (
              <button
                onClick={() => setRenewing(true)}
                style={{ width: "100%", padding: "8px", background: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}
              >
                Renew now
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  // ── No membership / Renewing — show plan picker ──
  return (
    <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: "8px", padding: "1.25rem", marginBottom: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {renewing ? "Renew Membership" : "Subscribe"}
        </div>
        {renewing && (
          <button onClick={() => setRenewing(false)} style={{ fontSize: "11px", color: "var(--cs-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)" }}>← Back</button>
        )}
      </div>

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
                  padding: "8px 6px", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 600,
                  cursor: "pointer", fontFamily: "var(--font-body)", textAlign: "center",
                  background: selected === p.id ? "rgba(232,98,10,0.15)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${selected === p.id ? "var(--cs-orange)" : "rgba(255,255,255,0.08)"}`,
                  color: selected === p.id ? "var(--cs-orange)" : "var(--cs-muted)",
                  transition: "all 0.15s",
                }}
              >
                <div>{p.label}</div>
                <div style={{ fontSize: "10px", marginTop: "2px", opacity: 0.8 }}>₹{p.amount.toLocaleString("en-IN")}</div>
              </button>
            ))}
          </div>

          {error && <div style={{ fontSize: "0.75rem", color: "#f09595", marginBottom: "0.5rem" }}>{error}</div>}

          <button
            onClick={() => handlePay(selected)}
            disabled={paying}
            style={{ width: "100%", padding: "10px", background: paying ? "rgba(232,98,10,0.5)" : "var(--cs-orange)", color: "#fff", border: "none", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 700, cursor: paying ? "not-allowed" : "pointer", fontFamily: "var(--font-body)" }}
          >
            {paying ? "Opening checkout…" : renewing ? "Renew now" : "Subscribe now"}
          </button>
          <div style={{ fontSize: "10px", color: "var(--cs-muted)", textAlign: "center", marginTop: "6px" }}>Secure payment via Razorpay · All prices incl. GST</div>
        </>
      )}
    </div>
  );
}
