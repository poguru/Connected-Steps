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
  { id: "monthly",   label: "Monthly",   months: 1,  payFor: 1,   badge: null,          popular: false },
  { id: "quarterly", label: "3 Months",  months: 3,  payFor: 2.5, badge: "Save ₹600",   popular: false },
  { id: "biannual",  label: "6 Months",  months: 6,  payFor: 5,   badge: "Save ₹1,200", popular: true  },
  { id: "annual",    label: "12 Months", months: 12, payFor: 9,   badge: "Best Value",  popular: false },
];

const features = [
  { icon: "📋", label: "Personalised training plan",    desc: "Built for your goal, updated every week by your coach." },
  { icon: "👨‍🏫", label: "Weekly coach check-in",        desc: "Direct access to NIS-certified coaches via WhatsApp." },
  { icon: "📊", label: "Real-time analytics dashboard", desc: "Track pace, distance, sessions and rankings." },
  { icon: "🏅", label: "Attendance & achievement badges",desc: "Auto-tracked sessions with point rewards." },
  { icon: "👥", label: "Community group runs",          desc: "Weekend runs at KBR, Necklace Road and Gachibowli." },
  { icon: "💬", label: "WhatsApp coach support",        desc: "Ask anything, anytime — your coach will respond." },
];

const testimonials = [
  { name: "Priya M.",   goal: "Ran her first 10K",     quote: "I'd never run a race in my life. 8 weeks with Connected Steps and I finished my first 10K.", rating: 5 },
  { name: "Karthik R.", goal: "Sub-4 marathon finisher",quote: "The personalised plan and weekly check-ins made all the difference. Best ₹40/day I've ever spent.", rating: 5 },
  { name: "Ananya S.",  goal: "Lost 8kg, gained pace",  quote: "More than a running club — it's a full transformation programme. The coaches actually care.", rating: 5 },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ width: "100%", padding: "0.875rem 1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", textAlign: "left", gap: "1rem" }}>
        <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--foreground)" }}>{q}</span>
        <span style={{ fontSize: "1rem", color: "var(--cs-orange)", flexShrink: 0, transition: "transform 0.2s", display: "inline-block", transform: open ? "rotate(45deg)" : "none" }}>+</span>
      </button>
      {open && (
        <div style={{ padding: "0 1.25rem 0.875rem", fontSize: "0.825rem", color: "var(--muted-foreground)", lineHeight: 1.7 }}>{a}</div>
      )}
    </div>
  );
}

export default function PricingPage() {
  const router = useRouter();
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
    if (!document.getElementById("razorpay-script")) {
      const script = document.createElement("script");
      script.id  = "razorpay-script";
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      document.body.appendChild(script);
    }
  }, []);

  async function handleBuy(planId: string) {
    setErrorMsg(null);
    if (!userEmail) { router.push(`/auth?redirect=/pricing`); return; }
    setPaying(planId);
    try {
      const orderRes = await fetch("/api/payment/create-order", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId, email: userEmail }),
      });
      const order = await orderRes.json();
      if (!orderRes.ok) throw new Error(order.error ?? "Order creation failed");

      const rzp = new window.Razorpay({
        key:         process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount:      order.amount,
        currency:    "INR",
        name:        "Connected Steps",
        description: `${plans.find(p => p.id === planId)?.label} Membership`,
        order_id:    order.orderId,
        prefill:     { email: userEmail, name: userName },
        theme:       { color: "#e8620a" },
        modal:       { ondismiss: () => setPaying(null) },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const verifyRes = await fetch("/api/payment/verify", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...response, plan: planId, email: userEmail, name: userName, amount: order.amount }),
          });
          const result = await verifyRes.json();
          if (!verifyRes.ok) throw new Error(result.error ?? "Verification failed");
          const expiry = new Date(result.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
          setSuccess(`Membership active until ${expiry}. Confirmation sent to ${userEmail}.`);
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
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>

      {/* ── Sticky nav ── */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "oklch(0.18 0.015 270 / 80%)", backdropFilter: "blur(18px)", borderBottom: "1px solid var(--border)", padding: "0 1.5rem", height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
          <Image src="/logo.png" alt="Connected Steps" width={32} height={32} className="rounded-full" />
          <span style={{ fontSize: "1rem", fontWeight: 600, color: "var(--foreground)", fontFamily: "var(--font-display)" }}>Connected Steps</span>
        </Link>
        <Link href="/" style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", textDecoration: "none" }}>← Back</Link>
      </header>

      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "2.5rem 1.5rem 4rem" }}>

        {/* ── 1. VALUE HEADLINE — above fold ── */}
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 20, background: "oklch(0.72 0.19 49 / 10%)", border: "1px solid oklch(0.72 0.19 49 / 25%)", padding: "4px 12px", fontSize: 11, color: "var(--cs-orange)", fontWeight: 600, letterSpacing: "0.06em", marginBottom: "1rem" }}>
            From ₹40/day
          </div>
          <h1 className="font-display" style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)", fontWeight: 700, lineHeight: 1.08, letterSpacing: "-0.015em", marginBottom: "0.75rem" }}>
            Train like an elite athlete.<br />
            <span className="text-gradient-accent">For less than a chai.</span>
          </h1>
          <p style={{ fontSize: "1rem", color: "var(--muted-foreground)", maxWidth: "500px", margin: "0 auto 1.5rem", lineHeight: 1.7 }}>
            Personal coach. Weekend group runs. Analytics. Community. All plans include everything — no tiers, no upsells.
          </p>
          {!userEmail && (
            <Link href="/auth?tab=signup" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", background: "var(--gradient-accent)", color: "#fff", borderRadius: 8, textDecoration: "none", fontSize: "0.9rem", fontWeight: 600, boxShadow: "var(--shadow-orange)" }}>
              Start for free →
            </Link>
          )}
        </div>

        {/* ── 2. WHAT YOU GET ── */}
        <div style={{ marginBottom: "2.5rem" }}>
          <div style={{ fontSize: 10, color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, textAlign: "center", marginBottom: "1rem" }}>
            Everything included
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: "0.65rem" }}>
            {features.map(f => (
              <div key={f.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "0.875rem 1rem", display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                <span style={{ fontSize: "1.25rem", flexShrink: 0, marginTop: 1 }}>{f.icon}</span>
                <div>
                  <div style={{ fontSize: "0.82rem", fontWeight: 600, marginBottom: 2 }}>{f.label}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", lineHeight: 1.5 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 3. SOCIAL PROOF / TESTIMONIALS ── */}
        <div style={{ marginBottom: "2.5rem" }}>
          <div style={{ fontSize: 10, color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, textAlign: "center", marginBottom: "1rem" }}>
            What members say
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: "0.65rem" }}>
            {testimonials.map(t => (
              <div key={t.name} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1rem", borderTop: "2px solid var(--cs-orange)" }}>
                <div style={{ display: "flex", gap: 2, marginBottom: 8 }}>
                  {"★★★★★".split("").map((s, i) => (
                    <span key={i} style={{ fontSize: 13, color: "var(--cs-orange)" }}>{s}</span>
                  ))}
                </div>
                <p style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", lineHeight: 1.65, margin: "0 0 0.75rem", fontStyle: "italic" }}>
                  "{t.quote}"
                </p>
                <div>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--foreground)" }}>{t.name}</div>
                  <div style={{ fontSize: 10, color: "var(--cs-orange)", fontWeight: 600 }}>{t.goal}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 4. PRICING CARDS ── */}
        <div id="pricing" style={{ marginBottom: "2rem" }}>
          <div style={{ fontSize: 10, color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, textAlign: "center", marginBottom: "1rem" }}>
            Choose your plan
          </div>

          {/* Success / Error */}
          {success && (
            <div style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 10, padding: "0.875rem 1.25rem", marginBottom: "1.25rem", fontSize: "0.875rem", color: "#4ade80", lineHeight: 1.6 }}>
              ✅ {success}
              <Link href="/dashboard" style={{ display: "block", marginTop: 8, color: "#4ade80", fontWeight: 700, textDecoration: "underline" }}>Go to Dashboard →</Link>
            </div>
          )}
          {errorMsg && (
            <div style={{ background: "rgba(226,75,74,0.08)", border: "1px solid rgba(226,75,74,0.3)", borderRadius: 10, padding: "0.875rem 1.25rem", marginBottom: "1.25rem", fontSize: "0.875rem", color: "#f09595" }}>
              ⚠️ {errorMsg}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: "0.75rem", alignItems: "start" }}>
            {plans.map(plan => {
              const total    = Math.round(plan.payFor * MONTHLY_RATE);
              const perMonth = Math.round(total / plan.months);
              const saving   = Math.round((plan.months - plan.payFor) * MONTHLY_RATE);
              const isBuying = paying === plan.id;

              return (
                <div key={plan.id} style={{
                  position: "relative",
                  background: plan.popular ? "oklch(0.19 0.03 40)" : "var(--surface)",
                  border: `1px solid ${plan.popular ? "oklch(0.72 0.19 49 / 50%)" : "var(--border)"}`,
                  borderRadius: 12,
                  padding: plan.badge ? "1.5rem 1.25rem 1.25rem" : "1.25rem",
                  boxShadow: plan.popular ? "var(--shadow-glow)" : "var(--shadow-md)",
                }}>
                  {plan.badge && (
                    <div style={{ position: "absolute", top: "-11px", left: "50%", transform: "translateX(-50%)", background: "var(--cs-orange)", color: "#fff", fontSize: "10px", fontWeight: 700, padding: "3px 12px", borderRadius: 20, whiteSpace: "nowrap" }}>
                      {plan.badge}
                    </div>
                  )}

                  <div style={{ fontSize: 10, color: plan.popular ? "var(--cs-orange)" : "var(--muted-foreground)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.75rem" }}>
                    {plan.label}
                  </div>

                  <div style={{ marginBottom: "0.35rem" }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: "2.2rem", fontWeight: 300, color: "var(--foreground)", lineHeight: 1 }}>
                      ₹{perMonth.toLocaleString("en-IN")}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginLeft: 4 }}>/mo</span>
                  </div>

                  <div style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginBottom: saving > 0 ? "0.25rem" : "1rem" }}>
                    ₹{total.toLocaleString("en-IN")} total
                  </div>
                  {saving > 0 && (
                    <div style={{ fontSize: "0.72rem", color: "#4ade80", fontWeight: 600, marginBottom: "1rem" }}>
                      Save ₹{saving.toLocaleString("en-IN")}
                    </div>
                  )}

                  <button
                    onClick={() => handleBuy(plan.id)}
                    disabled={!!paying || !!success}
                    style={{
                      display: "block", width: "100%", textAlign: "center",
                      padding: "11px", borderRadius: 8, fontSize: "0.82rem", fontWeight: 700,
                      cursor: paying || success ? "not-allowed" : "pointer",
                      opacity: paying && !isBuying ? 0.5 : 1,
                      background: plan.popular ? "var(--gradient-accent)" : "transparent",
                      color:      plan.popular ? "#fff" : "var(--foreground)",
                      border:     plan.popular ? "none" : "1px solid var(--border)",
                      boxShadow:  plan.popular ? "var(--shadow-orange)" : "none",
                      fontFamily: "var(--font-body)",
                    }}>
                    {isBuying
                      ? "Opening checkout…"
                      : success
                      ? "Purchased ✓"
                      : userEmail
                      ? "Get started"
                      : "Create free account"}
                  </button>
                </div>
              );
            })}
          </div>

          <p style={{ textAlign: "center", fontSize: 11, color: "var(--muted-foreground)", marginTop: "1rem" }}>
            All prices include GST. Not sure?{" "}
            <Link href="https://wa.me/9703620570" target="_blank" rel="noopener noreferrer" style={{ color: "var(--cs-orange)", textDecoration: "none" }}>Chat with us →</Link>
          </p>
        </div>

        {/* ── 5. GUARANTEE ── */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", padding: "1rem 1.25rem", background: "rgba(74,222,128,0.05)", border: "1px solid rgba(74,222,128,0.18)", borderRadius: 12, marginBottom: "2.5rem", maxWidth: 480, margin: "0 auto 2.5rem" }}>
          <span style={{ fontSize: "1.5rem", flexShrink: 0 }}>🛡️</span>
          <div>
            <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#4ade80", marginBottom: 2 }}>30-Day Money-Back Guarantee</div>
            <div style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", lineHeight: 1.5 }}>Not happy in your first month? Full refund, no questions asked.</div>
          </div>
        </div>

        {/* ── 6. FAQ ── */}
        <div style={{ maxWidth: "640px", margin: "0 auto" }}>
          <div style={{ fontSize: 10, color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, textAlign: "center", marginBottom: "1rem" }}>FAQ</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {[
              { q: "Can I cancel anytime?",            a: "Yes — cancel before your next billing date with no charges. No lock-ins, no cancellation fees." },
              { q: "What happens after I sign up?",    a: "Within 24 hours your coach will reach out on WhatsApp, learn your goal, and send a personalised training plan. First session typically within a week." },
              { q: "Do I need to be a runner already?",a: "Not at all. Our 5K plan is built for complete beginners. Many members had never run before — and finished their first race within 8 weeks." },
              { q: "Are sessions in-person or online?",a: "Connected Steps runs in-person sessions across multiple locations in Hyderabad. Your plan, check-ins, and analytics are online." },
              { q: "Can I switch plans?",              a: "Yes. Message us on WhatsApp and we'll upgrade your plan to match your new goal." },
              { q: "Corporate / group rates?",         a: "We offer group and corporate programmes. Message us on WhatsApp for group pricing." },
            ].map((item, i) => <FaqItem key={i} q={item.q} a={item.a} />)}
          </div>
        </div>

      </div>
    </div>
  );
}
