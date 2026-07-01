"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type { MembershipPlan } from "@/app/api/membership-plans/route";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open(): void };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(plan: MembershipPlan): string {
  if (plan.is_contact_only || plan.price === null || plan.price === undefined) return "Contact Us";
  return `₹${Number(plan.price).toLocaleString("en-IN")}`;
}

const WHY_ITEMS = [
  { icon: "🏃", title: "Structured Training",      desc: "Personalised plans built for your goal — 5K, half, or full marathon — updated as you progress." },
  { icon: "🎖️", title: "NIS-Certified Coaches",   desc: "National-level athletes and certified coaches who have competed and won at the highest levels." },
  { icon: "👥", title: "Active Community",          desc: "Run with 150+ members every weekend. Real accountability. Real friendships." },
  { icon: "📊", title: "Leaderboards & Badges",   desc: "Track your sessions, earn points, climb the leaderboard, and celebrate milestones." },
  { icon: "📍", title: "Weekly Sessions",          desc: "Group runs across multiple locations in Hyderabad — every weekend, rain or shine." },
  { icon: "💬", title: "Supportive Environment",  desc: "A WhatsApp community that shows up for each other. Ask anything, celebrate everything." },
];

const TESTIMONIALS = [
  { name: "Priya M.",   goal: "First 10K finisher",       quote: "I went from zero running experience to finishing a 10K in 8 weeks. The community made all the difference." },
  { name: "Karthik R.", goal: "Sub-4 marathon",            quote: "Weekly check-ins and a coach who actually listens. Shaved 14 minutes off my PB." },
  { name: "Ananya S.",  goal: "Lost 8 kg, gained pace",    quote: "More than a running club — it's a full life change. The coaches genuinely care about you." },
];

const FAQS = [
  { q: "Do I need to be an experienced runner to join?",
    a: "Not at all. Our Community Membership welcomes complete beginners. If you can walk, you can start with us. We have structured 5K beginner plans." },
  { q: "How are the weekly sessions structured?",
    a: "Sessions happen every weekend morning across Hyderabad. A warm-up, structured run, cool-down, and coach feedback. Mid-week virtual support is included for coaching members." },
  { q: "How is pricing determined?",
    a: "Community Membership pricing is displayed on the cards. For Personal Coaching and Corporate Wellness, pricing depends on your goals and team size — contact us for a personalised quote." },
  { q: "Is there a free trial?",
    a: "You can browse upcoming sessions, explore the leaderboard, and join community discussions without paying. Your first session as a guest is free to experience the community." },
  { q: "How does the Corporate Wellness programme work?",
    a: "We design a custom programme around your team's needs — from weekly sessions to marathon challenges. Reach out and we'll put together a proposal within 48 hours." },
  { q: "Can I cancel or pause my membership?",
    a: "Yes. Cancel before your next billing date at any time. No cancellation fees, no lock-in periods." },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ width: "100%", padding: "1.1rem 0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", textAlign: "left", gap: "1rem" }}>
        <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--foreground)", lineHeight: 1.4 }}>{q}</span>
        <span style={{ fontSize: "1.2rem", color: "var(--cs-orange)", flexShrink: 0, transition: "transform 0.25s", display: "inline-block", transform: open ? "rotate(45deg)" : "none" }}>+</span>
      </button>
      {open && (
        <div style={{ paddingBottom: "1rem", fontSize: "0.875rem", color: "var(--muted-foreground)", lineHeight: 1.75 }}>{a}</div>
      )}
    </div>
  );
}

// ── Plan card accent colours ──────────────────────────────────────────────────

const ACCENT: Record<string, { border: string; glow: string; badge: string; cta: string; ctaText: string }> = {
  orange: {
    border:   "rgba(232,98,10,0.5)",
    glow:     "rgba(232,98,10,0.12)",
    badge:    "var(--cs-orange)",
    cta:      "var(--gradient-accent)",
    ctaText:  "#fff",
  },
  blue: {
    border:   "rgba(96,165,250,0.45)",
    glow:     "rgba(96,165,250,0.08)",
    badge:    "#60a5fa",
    cta:      "transparent",
    ctaText:  "var(--foreground)",
  },
  green: {
    border:   "rgba(74,222,128,0.45)",
    glow:     "rgba(74,222,128,0.08)",
    badge:    "#4ade80",
    cta:      "transparent",
    ctaText:  "var(--foreground)",
  },
};

function accent(plan: MembershipPlan) {
  return ACCENT[plan.color_accent] ?? ACCENT.orange;
}

// ── Page component ────────────────────────────────────────────────────────────

export default function PricingPage() {
  const router = useRouter();

  const [plans,        setPlans]        = useState<MembershipPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [userEmail,    setUserEmail]    = useState<string | null>(null);
  const [userName,     setUserName]     = useState<string>("");
  const [isMember,     setIsMember]     = useState(false);
  const [paying,       setPaying]       = useState<string | null>(null);
  const [success,      setSuccess]      = useState<string | null>(null);
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null);
  const [couponCode,   setCouponCode]   = useState("");
  const [couponData,   setCouponData]   = useState<{ coupon_id: string; discount_type: string; discount_value: number; description: string } | null>(null);
  const [couponErr,    setCouponErr]    = useState("");
  const [couponLoading,setCouponLoading]= useState(false);

  // Load plans + user state
  useEffect(() => {
    fetch("/api/membership-plans")
      .then(r => r.json())
      .then(d => setPlans(d.plans ?? []))
      .catch(() => {})
      .finally(() => setPlansLoading(false));

    const stored = localStorage.getItem("cs_user");
    if (stored) {
      const u = JSON.parse(stored);
      setUserEmail(u.email);
      setUserName(`${u.firstName ?? ""} ${u.lastName ?? ""}`.trim());
      const tok = localStorage.getItem("cs_user_token") ?? "";
      fetch(`/api/membership?email=${encodeURIComponent(u.email)}`, { headers: { "x-user-token": tok } })
        .then(r => r.json())
        .then(d => { if (d.membership?.isActive) setIsMember(true); })
        .catch(() => {});
    }

    // Preload Razorpay
    if (!document.getElementById("razorpay-script")) {
      const s = document.createElement("script");
      s.id  = "razorpay-script";
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      document.body.appendChild(s);
    }
  }, []);

  // Coupon validation
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
      setCouponData(data);
    } catch { setCouponErr("Could not validate coupon."); }
    finally { setCouponLoading(false); }
  }

  function discountedAmount(paise: number): number {
    if (!couponData) return paise;
    if (couponData.discount_type === "percent") return Math.max(100, Math.round(paise * (1 - couponData.discount_value / 100)));
    if (couponData.discount_type === "fixed")   return Math.max(100, paise - couponData.discount_value * 100);
    return paise;
  }

  // Razorpay payment flow
  async function handleBuy(plan: MembershipPlan) {
    setErrorMsg(null);
    if (!userEmail) { router.push("/auth?redirect=/pricing"); return; }
    if (!plan.razorpay_plan) {
      // No Razorpay plan → open mailto or WhatsApp
      window.open(`mailto:info@connectedsteps.in?subject=Enquiry: ${plan.name}`, "_blank");
      return;
    }
    setPaying(plan.slug);
    try {
      const tok = localStorage.getItem("cs_user_token") ?? "";
      const orderRes = await fetch("/api/payment/create-order", {
        method: "POST", headers: { "Content-Type": "application/json", "x-user-token": tok },
        body: JSON.stringify({ plan: plan.razorpay_plan, coupon_id: couponData?.coupon_id ?? null }),
      });
      const order = await orderRes.json();
      if (!orderRes.ok) throw new Error(order.error ?? "Order creation failed");

      const rzp = new window.Razorpay({
        key:         process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount:      order.amount,
        currency:    "INR",
        name:        "Connected Steps",
        description: `${plan.name} Membership`,
        order_id:    order.orderId,
        prefill:     { email: userEmail, name: userName },
        theme:       { color: "#e8620a" },
        modal:       { ondismiss: () => setPaying(null) },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const finalPaise = discountedAmount(order.amount);
          const verifyRes  = await fetch("/api/payment/verify", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...response, plan: plan.razorpay_plan, email: userEmail, name: userName, amount: finalPaise, coupon_id: couponData?.coupon_id ?? null }),
          });
          const result = await verifyRes.json();
          if (!verifyRes.ok) throw new Error(result.error ?? "Verification failed");
          const expiry = new Date(result.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
          setSuccess(`Membership active until ${expiry}. Confirmation sent to ${userEmail}.`);
          setIsMember(true);
          setPaying(null);
        },
      });
      rzp.open();
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setPaying(null);
    }
  }

  // Stagger animation
  const container = { hidden: {}, show: { transition: { staggerChildren: 0.1 } } };
  const item = { hidden: { opacity: 0, y: 28 }, show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" as const } } };

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>

      {/* ── Navigation ── */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "oklch(0.18 0.015 270 / 80%)", backdropFilter: "blur(18px)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 1.5rem", height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
          <Image src="/logo.png" alt="Connected Steps" width={32} height={32} className="rounded-full" />
          <span style={{ fontSize: "1rem", fontWeight: 600, color: "var(--foreground)", fontFamily: "var(--font-display)" }}>Connected Steps</span>
        </Link>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          {userEmail
            ? <Link href="/dashboard" style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", textDecoration: "none" }}>Dashboard →</Link>
            : <Link href="/auth?tab=signup" style={{ fontSize: "0.8rem", padding: "6px 16px", background: "var(--gradient-accent)", color: "#fff", borderRadius: 6, textDecoration: "none", fontWeight: 600 }}>Join free</Link>
          }
        </div>
      </header>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "3rem 1.5rem 5rem" }}>

        {/* ── HERO ── */}
        <div style={{ textAlign: "center", marginBottom: "4rem" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 20, background: "oklch(0.72 0.19 49 / 10%)", border: "1px solid oklch(0.72 0.19 49 / 25%)", padding: "5px 14px", fontSize: 11, color: "var(--cs-orange)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "1.5rem" }}>
            Membership Plans
          </div>
          <h1 className="font-display" style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", fontWeight: 300, lineHeight: 1.05, letterSpacing: "-0.02em", marginBottom: "1rem" }}>
            Invest in your{" "}
            <em style={{ fontStyle: "normal", background: "linear-gradient(135deg, oklch(0.78 0.18 55), oklch(0.68 0.22 30))", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
              running.
            </em>
          </h1>
          <p style={{ fontSize: "1.05rem", color: "var(--muted-foreground)", maxWidth: "480px", margin: "0 auto 2rem", lineHeight: 1.7 }}>
            Start free. Upgrade when you&apos;re ready. Cancel anytime.
          </p>
          {isMember && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 8, fontSize: "0.875rem", color: "#4ade80", fontWeight: 600 }}>
              ✓ You&apos;re already a member
            </div>
          )}
        </div>

        {/* ── SUCCESS / ERROR ── */}
        {success && (
          <div style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: "2rem", fontSize: "0.875rem", color: "#4ade80", lineHeight: 1.6 }}>
            ✅ {success}
            <Link href="/dashboard" style={{ display: "block", marginTop: 8, color: "#4ade80", fontWeight: 700 }}>Go to Dashboard →</Link>
          </div>
        )}
        {errorMsg && (
          <div style={{ background: "rgba(226,75,74,0.08)", border: "1px solid rgba(226,75,74,0.3)", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: "2rem", fontSize: "0.875rem", color: "#f09595" }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {/* ── PLAN CARDS ── */}
        {plansLoading ? (
          // Skeleton
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: "1.25rem", marginBottom: "4rem" }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ borderRadius: 20, border: "1px solid rgba(255,255,255,0.07)", background: "var(--surface)", height: 420, animation: "cs-shimmer 1.4s infinite", backgroundSize: "200% 100%", backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)" }} />
            ))}
          </div>
        ) : plans.length === 0 ? (
          // Fallback when DB not set up
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--muted-foreground)", fontSize: "0.875rem" }}>
            <p>Membership plans are being configured. Please{" "}
              <a href="mailto:info@connectedsteps.in" style={{ color: "var(--cs-orange)" }}>contact us</a>{" "}
              for pricing details.
            </p>
          </div>
        ) : (
          <motion.div
            variants={container} initial="hidden" animate="show"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: "1.25rem", alignItems: "stretch", marginBottom: "2rem" }}
          >
            {plans.map(plan => {
              const ac       = accent(plan);
              const isBuying = paying === plan.slug;
              const priceStr = fmtPrice(plan);
              const isContact = plan.is_contact_only || plan.price === null || plan.price === undefined;

              return (
                <motion.div key={plan.id} variants={item}
                  style={{
                    position: "relative",
                    borderRadius: 20,
                    border: `1px solid ${plan.is_featured ? ac.border : "rgba(255,255,255,0.07)"}`,
                    background: plan.is_featured ? `linear-gradient(160deg, oklch(0.20 0.025 40) 0%, var(--surface) 60%)` : "var(--surface)",
                    padding: "2rem 1.75rem",
                    display: "flex", flexDirection: "column",
                    boxShadow: plan.is_featured ? `0 0 0 1px ${ac.border}, 0 20px 50px ${ac.glow}` : "none",
                    transition: "box-shadow 0.3s ease, transform 0.25s ease",
                  }}
                  whileHover={{ y: -5, boxShadow: `0 0 0 1px ${ac.border}, 0 28px 60px ${ac.glow}` }}
                >
                  {/* Badge */}
                  {plan.badge_label && (
                    <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: ac.badge, color: plan.color_accent === "blue" ? "#fff" : "#fff", fontSize: 10, fontWeight: 800, padding: "4px 14px", borderRadius: 20, whiteSpace: "nowrap", letterSpacing: "0.06em", textTransform: "uppercase", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}>
                      {plan.badge_label}
                    </div>
                  )}

                  {/* Plan name + tagline */}
                  <div style={{ marginBottom: "1.25rem" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: plan.is_featured ? "var(--cs-orange)" : "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>
                      {plan.name}
                    </div>
                    {plan.tagline && (
                      <div style={{ fontSize: "0.875rem", color: "var(--muted-foreground)", lineHeight: 1.4 }}>{plan.tagline}</div>
                    )}
                  </div>

                  {/* Price */}
                  <div style={{ marginBottom: "0.5rem" }}>
                    {isContact ? (
                      <div style={{ fontSize: "clamp(1.6rem, 3vw, 2rem)", fontWeight: 700, color: "var(--foreground)", lineHeight: 1, fontFamily: "var(--font-body)" }}>
                        Contact Us
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                        <span style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)", fontWeight: 300, color: "var(--foreground)", lineHeight: 1 }}>{priceStr}</span>
                        {plan.billing_label && (
                          <span style={{ fontSize: "0.78rem", color: "var(--muted-foreground)" }}>/{plan.billing_label.replace("per ", "")}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  {plan.description && (
                    <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", lineHeight: 1.65, marginBottom: "1.5rem" }}>{plan.description}</p>
                  )}

                  {/* Features */}
                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.75rem", display: "flex", flexDirection: "column", gap: "0.6rem", flex: 1 }}>
                    {(plan.features ?? []).map((f, i) => (
                      <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: "0.82rem", color: "var(--foreground)" }}>
                        <svg width="14" height="14" viewBox="0 0 14 14" style={{ flexShrink: 0, marginTop: 2 }}>
                          <circle cx="7" cy="7" r="6.25" fill={`${ac.badge}22`} stroke={`${ac.badge}50`} strokeWidth="0.75" />
                          <polyline points="3.5,7 6,9.5 10.5,4.5" fill="none" stroke={ac.badge} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  {plan.cta_href ? (
                    <a href={plan.cta_href} target="_blank" rel="noopener noreferrer"
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "13px", borderRadius: 12, fontWeight: 700, fontSize: "0.9rem", textDecoration: "none", background: plan.color_accent === "blue" ? "rgba(96,165,250,0.12)" : "rgba(255,255,255,0.05)", color: plan.color_accent === "blue" ? "#60a5fa" : "var(--foreground)", border: `1px solid ${plan.color_accent === "blue" ? "rgba(96,165,250,0.3)" : "rgba(255,255,255,0.1)"}`, transition: "background 0.2s, border-color 0.2s" }}>
                      {plan.cta_label} →
                    </a>
                  ) : (
                    <button
                      onClick={() => handleBuy(plan)}
                      disabled={!!paying || !!success}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "13px", borderRadius: 12, fontWeight: 700, fontSize: "0.9rem", cursor: paying || success ? "not-allowed" : "pointer", opacity: paying && !isBuying ? 0.55 : 1, background: plan.is_featured ? ac.cta : "rgba(255,255,255,0.05)", color: plan.is_featured ? ac.ctaText : "var(--foreground)", border: plan.is_featured ? "none" : "1px solid rgba(255,255,255,0.1)", boxShadow: plan.is_featured ? "0 6px 20px rgba(232,98,10,0.35)" : "none", fontFamily: "var(--font-body)", transition: "opacity 0.15s" }}>
                      {isBuying ? "Opening checkout…" : (success || isMember) && plan.razorpay_plan ? "Active ✓" : plan.cta_label}
                    </button>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* ── Coupon code (only shown when Razorpay plans exist) ── */}
        {plans.some(p => p.razorpay_plan && !p.is_contact_only) && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            {couponData ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.22)", borderRadius: 8, padding: "8px 14px", fontSize: "0.8rem" }}>
                <span style={{ color: "#4ade80", fontWeight: 700 }}>✓ {couponData.description || "Coupon applied"}</span>
                <button onClick={() => { setCouponData(null); setCouponCode(""); }} style={{ background: "none", border: "none", color: "var(--muted-foreground)", cursor: "pointer", fontSize: "0.75rem", padding: 0 }}>Remove</button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: "0.5rem", width: "100%", maxWidth: 340 }}>
                <input value={couponCode} onChange={e => { setCouponCode(e.target.value); setCouponErr(""); }}
                  onKeyDown={e => e.key === "Enter" && validateCoupon()}
                  placeholder="Have a coupon code?"
                  style={{ flex: 1, padding: "9px 12px", background: "var(--surface)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "var(--foreground)", fontSize: "0.82rem", fontFamily: "var(--font-body)", outline: "none" }} />
                <button onClick={validateCoupon} disabled={couponLoading || !couponCode.trim()}
                  style={{ padding: "9px 16px", background: "var(--surface)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "var(--foreground)", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", opacity: couponLoading || !couponCode.trim() ? 0.5 : 1 }}>
                  {couponLoading ? "…" : "Apply"}
                </button>
              </div>
            )}
            {couponErr && <div style={{ fontSize: "0.78rem", color: "#f09595" }}>{couponErr}</div>}
          </div>
        )}

        <p style={{ textAlign: "center", fontSize: 11, color: "var(--muted-foreground)", marginBottom: "4rem" }}>
          All prices inclusive of GST. Questions?{" "}
          <a href="https://wa.me/9703620570" target="_blank" rel="noopener noreferrer" style={{ color: "var(--cs-orange)", textDecoration: "none" }}>Chat with us on WhatsApp →</a>
        </p>

        {/* ── WHY JOIN CONNECTED STEPS ── */}
        <section style={{ marginBottom: "4rem" }}>
          <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 20, background: "oklch(0.72 0.19 49 / 10%)", border: "1px solid oklch(0.72 0.19 49 / 25%)", padding: "5px 14px", fontSize: 11, color: "var(--cs-orange)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "1rem" }}>
              Why Connected Steps
            </div>
            <h2 className="font-display" style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)", fontWeight: 300, lineHeight: 1.1, marginBottom: "0.875rem" }}>
              More than a running club.
            </h2>
            <p style={{ fontSize: "0.95rem", color: "var(--muted-foreground)", maxWidth: "440px", margin: "0 auto", lineHeight: 1.7 }}>
              We build runners from scratch and take them to finish lines they never thought possible.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: "1rem" }}>
            {WHY_ITEMS.map((w, i) => (
              <div key={i} style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "1.375rem 1.5rem", transition: "border-color 0.2s, transform 0.25s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(232,98,10,0.35)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.07)"; (e.currentTarget as HTMLElement).style.transform = ""; }}>
                <div style={{ fontSize: "1.75rem", marginBottom: "0.75rem" }}>{w.icon}</div>
                <div style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.4rem", color: "var(--foreground)" }}>{w.title}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", lineHeight: 1.65 }}>{w.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── TESTIMONIALS ── */}
        <section style={{ marginBottom: "4rem" }}>
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 20, background: "oklch(0.72 0.19 49 / 10%)", border: "1px solid oklch(0.72 0.19 49 / 25%)", padding: "5px 14px", fontSize: 11, color: "var(--cs-orange)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.875rem" }}>
              Member Stories
            </div>
            <h2 className="font-display" style={{ fontSize: "clamp(1.5rem, 3.5vw, 2.5rem)", fontWeight: 300, lineHeight: 1.1 }}>
              Real runners. Real results.
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: "1rem" }}>
            {TESTIMONIALS.map((t, i) => (
              <div key={i} style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "1.375rem 1.5rem", borderTop: "2px solid var(--cs-orange)" }}>
                <div style={{ display: "flex", gap: 2, marginBottom: "0.75rem" }}>
                  {"★★★★★".split("").map((s, j) => <span key={j} style={{ fontSize: 13, color: "var(--cs-orange)" }}>{s}</span>)}
                </div>
                <p style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", lineHeight: 1.7, margin: "0 0 0.875rem", fontStyle: "italic" }}>
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700 }}>{t.name}</div>
                  <div style={{ fontSize: 10, color: "var(--cs-orange)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{t.goal}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── FAQ ── */}
        <section style={{ maxWidth: "680px", margin: "0 auto 4rem" }}>
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 20, background: "oklch(0.72 0.19 49 / 10%)", border: "1px solid oklch(0.72 0.19 49 / 25%)", padding: "5px 14px", fontSize: 11, color: "var(--cs-orange)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.875rem" }}>
              FAQ
            </div>
            <h2 className="font-display" style={{ fontSize: "clamp(1.5rem, 3.5vw, 2.5rem)", fontWeight: 300, lineHeight: 1.1 }}>
              Common questions
            </h2>
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, background: "var(--surface)", padding: "0 1.5rem" }}>
            {FAQS.map((f, i) => <FaqItem key={i} q={f.q} a={f.a} />)}
          </div>
        </section>

        {/* ── FINAL CTA ── */}
        <section style={{ textAlign: "center", padding: "3rem 1.5rem", background: "linear-gradient(135deg, oklch(0.20 0.025 40) 0%, oklch(0.17 0.015 250) 100%)", borderRadius: 24, border: "1px solid rgba(232,98,10,0.2)", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -60, right: -60, width: 240, height: 240, borderRadius: "50%", background: "radial-gradient(circle, rgba(232,98,10,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />
          <h2 className="font-display" style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)", fontWeight: 300, lineHeight: 1.1, marginBottom: "0.875rem", position: "relative" }}>
            Your next milestone starts here.
          </h2>
          <p style={{ fontSize: "0.95rem", color: "var(--muted-foreground)", maxWidth: "400px", margin: "0 auto 2rem", lineHeight: 1.7, position: "relative" }}>
            Join hundreds of runners who found their community and hit goals they never thought possible.
          </p>
          <div style={{ display: "flex", gap: "0.875rem", justifyContent: "center", flexWrap: "wrap", position: "relative" }}>
            <Link href="/auth?tab=signup" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 30px", background: "var(--gradient-accent)", color: "#fff", borderRadius: 10, textDecoration: "none", fontSize: "0.95rem", fontWeight: 700, boxShadow: "0 8px 24px rgba(232,98,10,0.35)" }}>
              Join the Community →
            </Link>
            <a href="https://wa.me/9703620570" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 24px", background: "transparent", color: "var(--foreground)", borderRadius: 10, textDecoration: "none", fontSize: "0.95rem", fontWeight: 600, border: "1px solid rgba(255,255,255,0.15)" }}>
              Chat with us
            </a>
          </div>
          <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: "1.5rem" }}>
            No credit card required to browse. Cancel your membership anytime.
          </p>
        </section>

      </div>
    </div>
  );
}
