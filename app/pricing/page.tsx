"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import RoiCalculator from "@/components/pricing/RoiCalculator";
import CoachCarouselSection from "@/components/coaches/CoachCarouselSection";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open(): void };
  }
}

const MONTHLY_RATE = 1200;

const plans = [
  { id: "monthly",   label: "Monthly",   months: 1,  payFor: 1,   badge: null,          popular: false },
  { id: "quarterly", label: "3 Months",  months: 3,  payFor: 2.5, badge: "Save ₹600",   popular: false },
  { id: "biannual",  label: "6 Months",  months: 6,  payFor: 5,   badge: "Most Popular", popular: true  },
  { id: "annual",    label: "12 Months", months: 12, payFor: 9,   badge: "Best Value",  popular: false },
];

// What's FREE vs PREMIUM
const comparisonRows = [
  { feature: "Community & leaderboard",       free: true,  premium: true,  note: "" },
  { feature: "Session discovery",              free: true,  premium: true,  note: "" },
  { feature: "Attendance points & badges",     free: true,  premium: true,  note: "" },
  { feature: "Activity feed",                  free: true,  premium: true,  note: "" },
  { feature: "Group weekend runs",             free: "Pay per run", premium: "Free entry", note: "" },
  { feature: "Personalised training plan",     free: false, premium: true,  note: "Updated weekly by your coach" },
  { feature: "Weekly coach check-in",          free: false, premium: true,  note: "WhatsApp, every week" },
  { feature: "Direct coach access",            free: false, premium: true,  note: "Ask anything, anytime" },
  { feature: "Full analytics dashboard",       free: false, premium: true,  note: "" },
  { feature: "Priority support",               free: false, premium: true,  note: "" },
];

const testimonials = [
  { name: "Priya M.",   goal: "Ran her first 10K",     quote: "I'd never run a race in my life. 8 weeks with Connected Steps and I finished my first 10K.", rating: 5 },
  { name: "Karthik R.", goal: "Sub-4 marathon finisher",quote: "The personalised plan and weekly check-ins made all the difference. Best ₹40/day I've ever spent.", rating: 5 },
  { name: "Ananya S.",  goal: "Lost 8kg, gained pace",  quote: "More than a running club — it's a full transformation programme. The coaches actually care.", rating: 5 },
];

const afterJoin = [
  { day: "Within 24h", icon: "💬", title: "Coach reaches out",    desc: "Your NIS-certified coach texts you on WhatsApp, learns your goal and current fitness level." },
  { day: "Day 3",      icon: "📋", title: "Your plan is ready",   desc: "A personalised 7-day training schedule built for your exact goal lands on your dashboard." },
  { day: "Week 1",     icon: "🏃", title: "First group run",      desc: "Join your first weekend run with the community. Coach is on-ground at every session." },
  { day: "Week 4",     icon: "📊", title: "Progress review",      desc: "Coach reviews your data, adjusts intensity, and sets targets for the next month." },
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

function CheckIcon({ color = "var(--cs-orange)" }: { color?: string }) {
  return <span style={{ color, fontWeight: 700, fontSize: "0.9rem" }}>✓</span>;
}
function CrossIcon() {
  return <span style={{ color: "var(--muted-foreground)", fontSize: "0.85rem" }}>—</span>;
}

export default function PricingPage() {
  const router = useRouter();
  const [paying,       setPaying]       = useState<string | null>(null);
  const [success,      setSuccess]      = useState<string | null>(null);
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null);
  const [userEmail,    setUserEmail]    = useState<string | null>(null);
  const [userName,     setUserName]     = useState<string>("");
  const [isMember,     setIsMember]     = useState(false);
  const [couponCode,   setCouponCode]   = useState("");
  const [couponData,   setCouponData]   = useState<{ coupon_id: string; discount_type: string; discount_value: number; description: string } | null>(null);
  const [couponErr,    setCouponErr]    = useState("");
  const [couponLoading, setCouponLoading] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("cs_user");
    if (stored) {
      const u = JSON.parse(stored);
      setUserEmail(u.email);
      setUserName(`${u.firstName} ${u.lastName}`.trim());
      fetch(`/api/membership?email=${encodeURIComponent(u.email)}`)
        .then(r => r.json())
        .then(d => { if (d.membership?.isActive) setIsMember(true); })
        .catch(() => {});
    }
    if (!document.getElementById("razorpay-script")) {
      const script = document.createElement("script");
      script.id  = "razorpay-script";
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      document.body.appendChild(script);
    }
  }, []);

  async function validateCoupon() {
    if (!couponCode.trim()) return;
    setCouponLoading(true); setCouponErr(""); setCouponData(null);
    try {
      const res  = await fetch("/api/coupons/validate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponCode.trim(), email: userEmail }),
      });
      const data = await res.json();
      if (!res.ok) { setCouponErr(data.error ?? "Invalid coupon."); return; }
      setCouponData({ coupon_id: data.coupon_id, discount_type: data.discount_type, discount_value: data.discount_value, description: data.description });
    } catch { setCouponErr("Could not validate coupon. Please try again."); }
    finally { setCouponLoading(false); }
  }

  function discountedAmount(baseAmountPaise: number): number {
    if (!couponData) return baseAmountPaise;
    if (couponData.discount_type === "percent") return Math.max(100, Math.round(baseAmountPaise * (1 - couponData.discount_value / 100)));
    if (couponData.discount_type === "fixed")   return Math.max(100, baseAmountPaise - couponData.discount_value * 100);
    return baseAmountPaise;
  }

  async function handleBuy(planId: string) {
    setErrorMsg(null);
    if (!userEmail) { router.push(`/auth?redirect=/pricing`); return; }
    setPaying(planId);
    try {
      const orderRes = await fetch("/api/payment/create-order", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId, email: userEmail, coupon_id: couponData?.coupon_id ?? null }),
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
            body: JSON.stringify({ ...response, plan: planId, email: userEmail, name: userName, amount: order.amount, coupon_id: couponData?.coupon_id ?? null }),
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
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          {userEmail
            ? <Link href="/dashboard" style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", textDecoration: "none" }}>Dashboard →</Link>
            : <Link href="/auth?tab=signup" style={{ fontSize: "0.8rem", padding: "6px 14px", background: "var(--gradient-accent)", color: "#fff", borderRadius: 6, textDecoration: "none", fontWeight: 600 }}>Join free</Link>
          }
        </div>
      </header>

      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "2.5rem 1.5rem 4rem" }}>

        {/* ── 1. HERO ── */}
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 20, background: "oklch(0.72 0.19 49 / 10%)", border: "1px solid oklch(0.72 0.19 49 / 25%)", padding: "4px 12px", fontSize: 11, color: "var(--cs-orange)", fontWeight: 600, letterSpacing: "0.06em", marginBottom: "1rem" }}>
            From ₹40/day
          </div>
          <h1 className="font-display" style={{ fontSize: "clamp(1.9rem, 5vw, 3rem)", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.015em", marginBottom: "0.875rem" }}>
            Runners who train alone plateau.<br />
            <span className="text-gradient-accent">Runners with coaches improve.</span>
          </h1>
          <p style={{ fontSize: "1rem", color: "var(--muted-foreground)", maxWidth: "520px", margin: "0 auto 1.5rem", lineHeight: 1.7 }}>
            Join free. Explore the community, leaderboard, and sessions at no cost.
            Upgrade when you&apos;re ready for a personal coach.
          </p>
          {!userEmail && (
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/auth?tab=signup" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", background: "var(--gradient-accent)", color: "#fff", borderRadius: 8, textDecoration: "none", fontSize: "0.9rem", fontWeight: 700, boxShadow: "var(--shadow-orange)" }}>
                Join free →
              </Link>
              <a href="#pricing" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", background: "transparent", color: "var(--foreground)", borderRadius: 8, textDecoration: "none", fontSize: "0.9rem", fontWeight: 600, border: "1px solid var(--border)" }}>
                See premium plans
              </a>
            </div>
          )}
          {isMember && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 8, fontSize: "0.875rem", color: "#4ade80", fontWeight: 600 }}>
              ✓ You&apos;re a Premium member
            </div>
          )}
        </div>

        {/* ── 2. FREE vs PREMIUM COMPARISON ── */}
        <div style={{ marginBottom: "3rem" }}>
          <div style={{ fontSize: 10, color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, textAlign: "center", marginBottom: "1.25rem" }}>
            Free vs Premium
          </div>

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
            {/* Header row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 140px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ padding: "0.75rem 1.25rem", fontSize: "11px", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Feature</div>
              <div style={{ padding: "0.75rem 0", textAlign: "center", fontSize: "12px", fontWeight: 700, color: "var(--muted-foreground)", borderLeft: "1px solid var(--border)" }}>Free</div>
              <div style={{ padding: "0.75rem 0", textAlign: "center", fontSize: "12px", fontWeight: 700, color: "var(--cs-orange)", borderLeft: "1px solid var(--border)", background: "oklch(0.72 0.19 49 / 5%)" }}>
                Premium ✦
              </div>
            </div>

            {comparisonRows.map((row, i) => (
              <div key={row.feature} style={{ display: "grid", gridTemplateColumns: "1fr 120px 140px", borderBottom: i < comparisonRows.length - 1 ? "1px solid var(--border)" : "none" }}>
                <div style={{ padding: "0.7rem 1.25rem" }}>
                  <div style={{ fontSize: "0.82rem", color: "var(--foreground)", fontWeight: 500 }}>{row.feature}</div>
                  {row.note && <div style={{ fontSize: "10px", color: "var(--muted-foreground)", marginTop: 1 }}>{row.note}</div>}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", borderLeft: "1px solid var(--border)" }}>
                  {row.free === true
                    ? <CheckIcon color="#4ade80" />
                    : row.free === false
                    ? <CrossIcon />
                    : <span style={{ fontSize: "10px", color: "var(--muted-foreground)", textAlign: "center", padding: "0 4px" }}>{row.free}</span>
                  }
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", borderLeft: "1px solid var(--border)", background: "oklch(0.72 0.19 49 / 3%)" }}>
                  {row.premium === true
                    ? <CheckIcon />
                    : row.premium === false
                    ? <CrossIcon />
                    : <span style={{ fontSize: "10px", color: "var(--cs-orange)", fontWeight: 600, textAlign: "center", padding: "0 4px" }}>{row.premium}</span>
                  }
                </div>
              </div>
            ))}

            {/* Bottom CTA row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 140px", borderTop: "1px solid var(--border)" }}>
              <div style={{ padding: "1rem 1.25rem" }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", borderLeft: "1px solid var(--border)", padding: "0.875rem 0.5rem" }}>
                {userEmail
                  ? <span style={{ fontSize: "11px", color: "#4ade80", fontWeight: 600 }}>You&apos;re in ✓</span>
                  : <Link href="/auth?tab=signup" style={{ fontSize: "11px", color: "var(--cs-orange)", fontWeight: 700, textDecoration: "none" }}>Join free →</Link>
                }
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", borderLeft: "1px solid var(--border)", padding: "0.875rem 0.5rem", background: "oklch(0.72 0.19 49 / 3%)" }}>
                {isMember
                  ? <span style={{ fontSize: "11px", color: "#4ade80", fontWeight: 600 }}>Active ✓</span>
                  : <a href="#pricing" style={{ fontSize: "11px", color: "#fff", fontWeight: 700, textDecoration: "none", padding: "5px 12px", background: "var(--gradient-accent)", borderRadius: 6, boxShadow: "var(--shadow-orange)", whiteSpace: "nowrap" }}>See plans →</a>
                }
              </div>
            </div>
          </div>
        </div>

        {/* ── 3. TESTIMONIALS (before pricing) ── */}
        <div style={{ marginBottom: "3rem" }}>
          <div style={{ fontSize: 10, color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, textAlign: "center", marginBottom: "1rem" }}>
            What members say
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: "0.75rem" }}>
            {testimonials.map(t => (
              <div key={t.name} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1rem 1.125rem", borderTop: "2px solid var(--cs-orange)" }}>
                <div style={{ display: "flex", gap: 2, marginBottom: 8 }}>
                  {"★★★★★".split("").map((s, i) => <span key={i} style={{ fontSize: 13, color: "var(--cs-orange)" }}>{s}</span>)}
                </div>
                <p style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", lineHeight: 1.65, margin: "0 0 0.75rem", fontStyle: "italic" }}>"{t.quote}"</p>
                <div>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700 }}>{t.name}</div>
                  <div style={{ fontSize: 10, color: "var(--cs-orange)", fontWeight: 600 }}>{t.goal}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 4. PRICING CARDS ── */}
        <div id="pricing" style={{ marginBottom: "2rem" }}>
          <div style={{ fontSize: 10, color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, textAlign: "center", marginBottom: "0.5rem" }}>
            Premium plans
          </div>
          <p style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--muted-foreground)", margin: "0 auto 1.5rem", maxWidth: 400 }}>
            All plans include every Premium feature. Choose a billing period.
          </p>

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
              const total       = Math.round(plan.payFor * MONTHLY_RATE);
              const totalPaise  = total * 100;
              const finalPaise  = discountedAmount(totalPaise);
              const finalTotal  = Math.round(finalPaise / 100);
              const perMonth    = Math.round(finalTotal / plan.months);
              const saving      = Math.round((plan.months - plan.payFor) * MONTHLY_RATE);
              const isBuying    = paying === plan.id;
              const hasDiscount = couponData && finalTotal < total;

              return (
                <div key={plan.id} style={{ position: "relative", background: plan.popular ? "oklch(0.19 0.03 40)" : "var(--surface)", border: `1px solid ${plan.popular ? "oklch(0.72 0.19 49 / 50%)" : "var(--border)"}`, borderRadius: 12, padding: plan.badge ? "1.5rem 1.25rem 1.25rem" : "1.25rem", boxShadow: plan.popular ? "var(--shadow-glow)" : "var(--shadow-md)" }}>
                  {plan.badge && (
                    <div style={{ position: "absolute", top: "-11px", left: "50%", transform: "translateX(-50%)", background: "var(--cs-orange)", color: "#fff", fontSize: "10px", fontWeight: 700, padding: "3px 12px", borderRadius: 20, whiteSpace: "nowrap" }}>
                      {plan.badge}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: plan.popular ? "var(--cs-orange)" : "var(--muted-foreground)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.75rem" }}>
                    {plan.label}
                  </div>
                  <div style={{ marginBottom: "0.35rem" }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: "2.2rem", fontWeight: 300, color: "var(--foreground)", lineHeight: 1 }}>₹{perMonth.toLocaleString("en-IN")}</span>
                    <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginLeft: 4 }}>/mo</span>
                  </div>
                  {hasDiscount
                    ? (
                      <div style={{ fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                        <span style={{ color: "var(--muted-foreground)", textDecoration: "line-through", marginRight: 6 }}>₹{total.toLocaleString("en-IN")}</span>
                        <span style={{ color: "#4ade80", fontWeight: 700 }}>₹{finalTotal.toLocaleString("en-IN")}</span>
                      </div>
                    )
                    : (
                      <div style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginBottom: saving > 0 ? "0.25rem" : "1rem" }}>
                        ₹{total.toLocaleString("en-IN")} billed {plan.months === 1 ? "monthly" : `every ${plan.months} months`}
                      </div>
                    )
                  }
                  {saving > 0 && (
                    <div style={{ fontSize: "0.72rem", color: "#4ade80", fontWeight: 600, marginBottom: "1rem" }}>
                      Save ₹{saving.toLocaleString("en-IN")}{hasDiscount ? " + coupon" : ""}
                    </div>
                  )}
                  <button
                    onClick={() => handleBuy(plan.id)}
                    disabled={!!paying || !!success || isMember}
                    style={{ display: "block", width: "100%", textAlign: "center", padding: "11px", borderRadius: 8, fontSize: "0.82rem", fontWeight: 700, cursor: paying || success || isMember ? "not-allowed" : "pointer", opacity: paying && !isBuying ? 0.5 : 1, background: plan.popular ? "var(--gradient-accent)" : "transparent", color: plan.popular ? "#fff" : "var(--foreground)", border: plan.popular ? "none" : "1px solid var(--border)", boxShadow: plan.popular ? "var(--shadow-orange)" : "none", fontFamily: "var(--font-body)" }}>
                    {isBuying ? "Opening checkout…" : success || isMember ? "Active ✓" : userEmail ? "Get started" : "Create free account"}
                  </button>
                </div>
              );
            })}
          </div>

          {/* ── Coupon code ── */}
          <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
            {couponData ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 8, padding: "8px 14px", fontSize: "0.8rem" }}>
                <span style={{ color: "#4ade80", fontWeight: 700 }}>✓ {couponData.description || "Coupon applied"}</span>
                <button onClick={() => { setCouponData(null); setCouponCode(""); }} style={{ background: "none", border: "none", color: "var(--muted-foreground)", cursor: "pointer", fontSize: "0.75rem", padding: 0 }}>Remove</button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: "0.5rem", width: "100%", maxWidth: 360 }}>
                <input
                  value={couponCode} onChange={e => { setCouponCode(e.target.value); setCouponErr(""); }}
                  onKeyDown={e => e.key === "Enter" && validateCoupon()}
                  placeholder="Have a coupon code?"
                  style={{ flex: 1, padding: "9px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)", fontSize: "0.82rem", fontFamily: "var(--font-body)", outline: "none" }}
                />
                <button onClick={validateCoupon} disabled={couponLoading || !couponCode.trim()} style={{ padding: "9px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", opacity: couponLoading || !couponCode.trim() ? 0.5 : 1 }}>
                  {couponLoading ? "…" : "Apply"}
                </button>
              </div>
            )}
            {couponErr && <div style={{ fontSize: "0.78rem", color: "#f09595" }}>{couponErr}</div>}
          </div>

          <p style={{ textAlign: "center", fontSize: 11, color: "var(--muted-foreground)", marginTop: "1rem" }}>
            All prices include GST. Not sure?{" "}
            <Link href="https://wa.me/9703620570" target="_blank" rel="noopener noreferrer" style={{ color: "var(--cs-orange)", textDecoration: "none" }}>Chat with us →</Link>
          </p>
        </div>

        {/* ── 5. WHAT HAPPENS AFTER YOU JOIN ── */}
        <div style={{ marginBottom: "3rem" }}>
          <div style={{ fontSize: 10, color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, textAlign: "center", marginBottom: "1.25rem" }}>
            What happens after you join
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: "0.75rem" }}>
            {afterJoin.map((step, i) => (
              <div key={i} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1rem 1.125rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "0.6rem" }}>
                  <span style={{ fontSize: "1.4rem" }}>{step.icon}</span>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{step.day}</div>
                </div>
                <div style={{ fontSize: "0.82rem", fontWeight: 700, marginBottom: 4 }}>{step.title}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", lineHeight: 1.6 }}>{step.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 6. MEET YOUR COACHES ── */}
        <div style={{ marginBottom: "3rem" }}>
          <CoachCarouselSection
            sectionLabel="YOUR COACHING TEAM"
            title="Train with the best"
            subtitle="National-level athletes and NIS-certified coaches. Every premium member trains with one of these coaches directly."
            ctaLabel="Start Your Training"
            ctaHref="/auth?tab=register"
          />
        </div>

        {/* ── 7. ROI CALCULATOR ── */}
        <div style={{ marginBottom: "3rem" }}>
          <RoiCalculator />
        </div>

        {/* ── 9. GUARANTEE ── */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", padding: "1rem 1.25rem", background: "rgba(74,222,128,0.05)", border: "1px solid rgba(74,222,128,0.18)", borderRadius: 12, marginBottom: "2.5rem", maxWidth: 480, margin: "0 auto 2.5rem" }}>
          <span style={{ fontSize: "1.5rem", flexShrink: 0 }}>🛡️</span>
          <div>
            <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#4ade80", marginBottom: 2 }}>30-Day Money-Back Guarantee</div>
            <div style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", lineHeight: 1.5 }}>Not happy in your first month? Full refund, no questions asked.</div>
          </div>
        </div>

        {/* ── 10. FAQ ── */}
        <div style={{ maxWidth: "640px", margin: "0 auto" }}>
          <div style={{ fontSize: 10, color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, textAlign: "center", marginBottom: "1rem" }}>FAQ</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {[
              { q: "Is there really a free tier?",        a: "Yes. You can join the community, view the leaderboard, discover sessions, and register for weekend runs (at the standard walk-up price). No credit card needed." },
              { q: "What do I get that's different with Premium?", a: "A personalised training plan written for your goal, updated every week. Direct WhatsApp access to your coach. Weekly check-ins. Free entry to all weekend runs." },
              { q: "Can I cancel anytime?",               a: "Yes — cancel before your next billing date with no charges. No lock-ins, no cancellation fees." },
              { q: "What happens after I sign up?",       a: "Within 24 hours your coach will reach out on WhatsApp, learn your goal, and send a personalised training plan. First session typically within a week." },
              { q: "Do I need to be a runner already?",  a: "Not at all. Our 5K plan is built for complete beginners. Many members had never run before — and finished their first race within 8 weeks." },
              { q: "Are sessions in-person or online?",  a: "Connected Steps runs in-person sessions across multiple locations in Hyderabad. Your plan, check-ins, and analytics are online." },
              { q: "Corporate / group rates?",            a: "We offer group and corporate programmes. Message us on WhatsApp for group pricing." },
            ].map((item, i) => <FaqItem key={i} q={item.q} a={item.a} />)}
          </div>
        </div>

      </div>
    </div>
  );
}
