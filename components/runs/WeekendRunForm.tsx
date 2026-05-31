"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open(): void };
  }
}

interface LiveEvent {
  id: string;
  name: string;
  date: string;
  time?: string;
  location: string;
  description?: string;
  price: number;
}

interface CouponResult {
  valid: true;
  coupon_id: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  description: string;
}

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const DISTANCES    = ["5K", "10K", "16K", "21.1K"];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "6px", color: "var(--cs-white)",
  fontSize: "0.875rem", fontFamily: "var(--font-body)",
  outline: "none", boxSizing: "border-box", transition: "border-color 0.2s",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "11px", color: "var(--cs-muted)",
  letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px",
};

export default function WeekendRunForm() {
  const [isMember,       setIsMember]       = useState(false);
  const [isActiveMember, setIsActiveMember] = useState(false);
  const [memberName,     setMemberName]     = useState("");
  const [submitted,      setSubmitted]      = useState(false);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState("");

  const [event,        setEvent]        = useState<LiveEvent | null>(null);
  const [eventLoading, setEventLoading] = useState(true);

  const [couponCode,    setCouponCode]    = useState("");
  const [couponApplied, setCouponApplied] = useState<CouponResult | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError,   setCouponError]   = useState("");

  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", phone: "",
    blood_group: "", distance: "",
    emergency_contact_name: "", emergency_contact_phone: "",
  });

  useEffect(() => {
    fetch("/api/events/live")
      .then((r) => r.json())
      .then((d) => setEvent(d.event ?? null))
      .catch(() => {})
      .finally(() => setEventLoading(false));

    const stored = localStorage.getItem("cs_user");
    if (stored) {
      const u = JSON.parse(stored);
      setIsMember(true);
      setMemberName(`${u.firstName} ${u.lastName}`);
      setForm((f) => ({
        ...f,
        first_name: u.firstName ?? "",
        last_name:  u.lastName  ?? "",
        email:      u.email     ?? "",
        phone:      u.phone     ?? "",
      }));

      fetch(`/api/membership?email=${encodeURIComponent(u.email)}`)
        .then((r) => r.json())
        .then((d) => { if (d.membership?.isActive) setIsActiveMember(true); })
        .catch(() => {});
    }

    if (!document.getElementById("razorpay-script")) {
      const s = document.createElement("script");
      s.id  = "razorpay-script";
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      document.body.appendChild(s);
    }
  }, []);

  const basePrice  = event?.price ?? 0;
  const discount   = couponApplied
    ? couponApplied.discount_type === "percentage"
      ? Math.round(basePrice * couponApplied.discount_value / 100)
      : Math.min(couponApplied.discount_value, basePrice)
    : 0;
  const finalPrice = Math.max(0, basePrice - discount);

  const set = (field: string, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setError("");
  };

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError("");
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponCode, email: form.email || undefined, event_id: event?.id }),
      });
      const data = await res.json();
      if (!res.ok) { setCouponError(data.error || "Invalid coupon."); return; }
      setCouponApplied(data as CouponResult);
    } catch {
      setCouponError("Failed to validate coupon.");
    } finally {
      setCouponLoading(false);
    }
  };

  const removeCoupon = () => {
    setCouponApplied(null);
    setCouponCode("");
    setCouponError("");
  };

  const validate = () => {
    if (!form.first_name || !form.last_name || !form.email || !form.phone)
      return "Please fill in all personal details.";
    if (!form.blood_group) return "Please select your blood group.";
    if (!form.distance)    return "Please select a distance.";
    if (!form.emergency_contact_name || !form.emergency_contact_phone)
      return "Please fill in the emergency contact details.";
    return null;
  };

  const submitFree = async () => {
    const res = await fetch("/api/runs/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        event_name:     event!.name,
        event_date:     event!.date,
        event_location: event!.location,
        is_member:      true,
        coupon_id:      couponApplied?.coupon_id ?? null,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Registration failed.");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    if (!event) { setError("No upcoming event found."); return; }

    setLoading(true); setError("");

    try {
      if (isActiveMember || finalPrice === 0) {
        await submitFree();
        setSubmitted(true);
        return;
      }

      const orderRes = await fetch("/api/payment/run-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email:        form.email,
          event_date:   event.date,
          amount_paise: finalPrice * 100,
        }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) { setError(orderData.error || "Could not initiate payment."); return; }

      const rzp = new window.Razorpay({
        key:         process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        order_id:    orderData.orderId,
        amount:      orderData.amount,
        currency:    "INR",
        name:        "Connected Steps",
        description: `${event.name} — ${formatDate(event.date)}`,
        prefill: {
          name:    `${form.first_name} ${form.last_name}`,
          email:   form.email,
          contact: form.phone,
        },
        theme:  { color: "#ff7a00" },
        modal:  { ondismiss: () => setLoading(false) },
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          const regRes = await fetch("/api/runs/pay-and-register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...response,
              ...form,
              event_name:     event.name,
              event_date:     event.date,
              event_location: event.location,
              is_member:      isMember,
              coupon_id:      couponApplied?.coupon_id ?? null,
              amount_paid:    finalPrice,
            }),
          });
          const regData = await regRes.json();
          if (!regRes.ok) setError(regData.error || "Registration failed after payment.");
          else setSubmitted(true);
          setLoading(false);
        },
      });
      rzp.open();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      if (isActiveMember || finalPrice === 0) setLoading(false);
    }
  };

  // Loading state
  if (eventLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--cs-black)", color: "var(--cs-white)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: "0.875rem", color: "var(--cs-muted)" }}>Loading event details…</div>
      </div>
    );
  }

  // No live event
  if (!event) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--cs-black)", color: "var(--cs-white)" }}>
        <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, background: "rgba(8,28,45,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 2rem", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
            <Image src="/logo.png" alt="Connected Steps" width={36} height={36} className="rounded-full" />
            <span className="font-display" style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--cs-white)" }}>Connected Steps</span>
          </Link>
          <Link href="/" style={{ fontSize: "0.8rem", color: "var(--cs-muted)", textDecoration: "none" }}>← Back</Link>
        </header>
        <div style={{ maxWidth: "480px", margin: "0 auto", padding: "10rem 1.5rem 4rem", textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📅</div>
          <h1 className="font-display" style={{ fontSize: "1.75rem", fontWeight: 300, marginBottom: "0.75rem" }}>No Upcoming Event</h1>
          <p style={{ fontSize: "0.875rem", color: "var(--cs-muted)", marginBottom: "2rem" }}>There's no weekend run scheduled right now. Check back soon!</p>
          <Link href="/" style={{ padding: "10px 24px", background: "var(--cs-orange)", color: "var(--cs-white)", borderRadius: "4px", textDecoration: "none", fontSize: "0.875rem", fontWeight: 600 }}>Back to Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--cs-black)", color: "var(--cs-white)" }}>

      {/* Navbar */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, background: "rgba(8,28,45,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 2rem", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
          <Image src="/logo.png" alt="Connected Steps" width={36} height={36} className="rounded-full" />
          <span className="font-display" style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--cs-white)" }}>Connected Steps</span>
        </Link>
        <Link href="/dashboard" style={{ fontSize: "0.8rem", color: "var(--cs-muted)", textDecoration: "none" }}>← Back to dashboard</Link>
      </header>

      <div style={{ maxWidth: "680px", margin: "0 auto", padding: "6rem 1.5rem 4rem" }}>

        {/* Event banner */}
        <div style={{ background: "rgba(255,122,0,0.08)", border: "1px solid rgba(255,122,0,0.25)", borderRadius: "8px", padding: "1.25rem 1.5rem", marginBottom: "1.25rem", display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "10px", color: "var(--cs-orange)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "4px" }}>Upcoming Event</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--cs-white)" }}>{event.name}</div>
            <div style={{ fontSize: "0.8rem", color: "var(--cs-muted)", marginTop: "2px" }}>
              📅 {formatDate(event.date)}
              {event.time && <> &nbsp;·&nbsp; 🕐 {event.time}</>}
              &nbsp;·&nbsp; 📍 {event.location}
            </div>
            {event.description && (
              <div style={{ fontSize: "0.78rem", color: "var(--cs-muted)", marginTop: "4px" }}>{event.description}</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => document.getElementById("run-form")?.scrollIntoView({ behavior: "smooth" })}
            style={{ fontSize: "11px", padding: "4px 12px", borderRadius: "20px", background: "var(--cs-orange)", color: "var(--cs-white)", fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
            Register
          </button>
        </div>

        {/* Fee notice */}
        <div style={{
          background: isActiveMember ? "rgba(74,222,128,0.06)" : "rgba(255,255,255,0.03)",
          border: `1px solid ${isActiveMember ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.08)"}`,
          borderRadius: "8px", padding: "0.9rem 1.25rem", marginBottom: "2rem",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span style={{ fontSize: "1.1rem" }}>{isActiveMember ? "🎁" : "🎟️"}</span>
            <div>
              <div style={{ fontSize: "0.82rem", color: "var(--cs-white)", fontWeight: 600 }}>
                {isActiveMember ? "Member Benefit — Free Entry" : "Registration Fee"}
              </div>
              <div style={{ fontSize: "11px", color: "var(--cs-muted)" }}>
                {isActiveMember ? "Your active membership covers the entry fee" : "Paid via Razorpay · Secure checkout"}
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            {!isActiveMember && couponApplied && (
              <div style={{ fontSize: "11px", color: "var(--cs-muted)", textDecoration: "line-through", marginBottom: "2px" }}>₹{basePrice}</div>
            )}
            <div style={{ fontSize: "1.4rem", fontWeight: 700, color: isActiveMember ? "#4ade80" : (couponApplied ? "#4ade80" : "var(--cs-orange)") }}>
              {isActiveMember ? "FREE" : (finalPrice === 0 ? "FREE" : `₹${finalPrice}`)}
            </div>
            {!isActiveMember && couponApplied && (
              <div style={{ fontSize: "11px", color: "#4ade80" }}>−₹{discount} saved</div>
            )}
          </div>
        </div>

        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem" }}>Connected Steps</div>
          <h1 className="font-display" style={{ fontSize: "2rem", fontWeight: 300, color: "var(--cs-white)", marginBottom: "0.5rem" }}>Run Registration</h1>
          <p style={{ fontSize: "0.875rem", color: "var(--cs-muted)" }}>Every last Sunday of the month. Different location, same spirit.</p>
        </div>

        {submitted ? (
          <div style={{ background: "rgba(255,122,0,0.08)", border: "1px solid rgba(255,122,0,0.3)", borderRadius: "10px", padding: "3rem", textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎉</div>
            <h2 className="font-display" style={{ fontSize: "1.5rem", fontWeight: 300, color: "var(--cs-white)", marginBottom: "0.75rem" }}>You're registered!</h2>
            <p style={{ fontSize: "0.875rem", color: "var(--cs-muted)", marginBottom: "0.5rem" }}>
              See you on <strong style={{ color: "var(--cs-white)" }}>{formatDate(event.date)}</strong> at {event.location}.
            </p>
            <p style={{ fontSize: "0.8rem", color: "var(--cs-muted)" }}>Stay tuned on WhatsApp &amp; Instagram for updates.</p>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: "2rem", flexWrap: "wrap" }}>
              <Link href="/" style={{ padding: "10px 24px", background: "var(--cs-orange)", color: "var(--cs-white)", borderRadius: "4px", textDecoration: "none", fontSize: "0.85rem", fontWeight: 600 }}>Back to home</Link>
              <Link href="/dashboard" style={{ padding: "10px 24px", border: "1px solid rgba(255,255,255,0.15)", color: "var(--cs-white)", borderRadius: "4px", textDecoration: "none", fontSize: "0.85rem" }}>Go to dashboard</Link>
            </div>
          </div>
        ) : (
          <form id="run-form" onSubmit={handleSubmit} noValidate>

            {isMember && (
              <div style={{ background: "rgba(255,122,0,0.08)", border: "1px solid rgba(255,122,0,0.2)", borderRadius: "6px", padding: "10px 14px", marginBottom: "1.5rem", fontSize: "0.825rem", color: "var(--cs-orange)" }}>
                ✓ Welcome back, <strong>{memberName}</strong>! We've pre-filled your details.
              </div>
            )}

            {/* Personal details */}
            <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.5rem", marginBottom: "1.25rem" }}>
              <div style={{ fontSize: "11px", color: "var(--cs-orange)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "1.25rem", fontWeight: 600 }}>Personal Details</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                <div>
                  <label style={labelStyle}>First Name *</label>
                  <input style={inputStyle} value={form.first_name} onChange={(e) => set("first_name", e.target.value)} placeholder="First name" required readOnly={isMember} onFocus={(e) => e.target.style.borderColor = "var(--cs-orange)"} onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"} />
                </div>
                <div>
                  <label style={labelStyle}>Last Name *</label>
                  <input style={inputStyle} value={form.last_name} onChange={(e) => set("last_name", e.target.value)} placeholder="Last name" required readOnly={isMember} onFocus={(e) => e.target.style.borderColor = "var(--cs-orange)"} onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                <div>
                  <label style={labelStyle}>Email *</label>
                  <input style={inputStyle} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="Email address" required readOnly={isMember} onFocus={(e) => e.target.style.borderColor = "var(--cs-orange)"} onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"} />
                </div>
                <div>
                  <label style={labelStyle}>Mobile Number *</label>
                  <input style={inputStyle} type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 XXXXX XXXXX" required onFocus={(e) => e.target.style.borderColor = "var(--cs-orange)"} onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={labelStyle}>Blood Group *</label>
                  <select style={{ ...inputStyle, cursor: "pointer", colorScheme: "dark" }} value={form.blood_group} onChange={(e) => set("blood_group", e.target.value)} required onFocus={(e) => e.target.style.borderColor = "var(--cs-orange)"} onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}>
                    <option value="" disabled>Select blood group</option>
                    {BLOOD_GROUPS.map((bg) => <option key={bg} value={bg} style={{ background: "#1a1a1a" }}>{bg}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Distance *</label>
                  <select style={{ ...inputStyle, cursor: "pointer", colorScheme: "dark" }} value={form.distance} onChange={(e) => set("distance", e.target.value)} required onFocus={(e) => e.target.style.borderColor = "var(--cs-orange)"} onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}>
                    <option value="" disabled>Select distance</option>
                    {DISTANCES.map((d) => <option key={d} value={d} style={{ background: "#1a1a1a" }}>{d}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Emergency contact */}
            <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.5rem", marginBottom: "1.25rem" }}>
              <div style={{ fontSize: "11px", color: "var(--cs-orange)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "6px", fontWeight: 600 }}>Emergency Contact</div>
              <p style={{ fontSize: "11px", color: "var(--cs-muted)", marginBottom: "1.25rem" }}>In case of emergency during the run, we will contact this person.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={labelStyle}>Contact Name *</label>
                  <input style={inputStyle} value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} placeholder="Full name" required onFocus={(e) => e.target.style.borderColor = "var(--cs-orange)"} onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"} />
                </div>
                <div>
                  <label style={labelStyle}>Contact Number *</label>
                  <input style={inputStyle} type="tel" value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} placeholder="+91 XXXXX XXXXX" required onFocus={(e) => e.target.style.borderColor = "var(--cs-orange)"} onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"} />
                </div>
              </div>
            </div>

            {/* Promo code — only for non-active-members with a paid event */}
            {!isActiveMember && basePrice > 0 && (
              <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.25rem 1.5rem", marginBottom: "1.25rem" }}>
                <div style={{ fontSize: "11px", color: "var(--cs-orange)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "1rem", fontWeight: 600 }}>Promo Code</div>

                {couponApplied ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: "6px", padding: "10px 14px" }}>
                    <div>
                      <div style={{ fontSize: "0.825rem", color: "#4ade80", fontWeight: 600 }}>
                        ✓ {couponApplied.description || "Coupon applied"}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--cs-muted)", marginTop: "2px" }}>
                        {couponApplied.discount_type === "percentage"
                          ? `${couponApplied.discount_value}% off`
                          : `₹${couponApplied.discount_value} off`}
                        {" "}— you save ₹{discount}
                      </div>
                    </div>
                    <button type="button" onClick={removeCoupon} style={{ fontSize: "11px", color: "var(--cs-muted)", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>Remove</button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <input
                        style={{ ...inputStyle, flex: 1, textTransform: "uppercase" }}
                        value={couponCode}
                        onChange={(e) => { setCouponCode(e.target.value); setCouponError(""); }}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), applyCoupon())}
                        placeholder="Enter promo code"
                        onFocus={(e) => e.target.style.borderColor = "var(--cs-orange)"}
                        onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
                      />
                      <button
                        type="button"
                        onClick={applyCoupon}
                        disabled={couponLoading || !couponCode.trim()}
                        style={{ padding: "11px 18px", background: couponLoading ? "rgba(255,122,0,0.5)" : "var(--cs-orange)", color: "var(--cs-white)", border: "none", borderRadius: "6px", fontSize: "0.825rem", fontWeight: 600, cursor: couponLoading ? "not-allowed" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                        {couponLoading ? "…" : "Apply"}
                      </button>
                    </div>
                    {couponError && (
                      <div style={{ fontSize: "11px", color: "#f09595", marginTop: "6px" }}>{couponError}</div>
                    )}
                  </>
                )}
              </div>
            )}

            {error && (
              <div style={{ background: "rgba(226,75,74,0.1)", border: "1px solid rgba(226,75,74,0.3)", borderRadius: "6px", padding: "10px 14px", marginBottom: "1.25rem", fontSize: "0.825rem", color: "#f09595" }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              width: "100%", padding: "16px",
              background: loading ? "rgba(255,122,0,0.6)" : "var(--cs-orange)",
              color: "var(--cs-white)", border: "none", borderRadius: "6px",
              fontSize: "1rem", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "var(--font-body)", letterSpacing: "0.04em", transition: "background 0.2s",
            }}>
              {loading
                ? (isActiveMember || finalPrice === 0 ? "Registering…" : "Opening payment…")
                : (isActiveMember ? "Register for the Run 🏃" : (finalPrice === 0 ? "Register for Free 🏃" : `Pay ₹${finalPrice} & Register 🏃`))}
            </button>

            <p style={{ textAlign: "center", fontSize: "11px", color: "var(--cs-muted)", marginTop: "1rem" }}>
              {isActiveMember
                ? "Your active membership includes free entry to weekend runs."
                : finalPrice === 0
                ? "Your coupon covers the full registration fee."
                : `Powered by Razorpay · 100% secure · Amount: ₹${finalPrice}`}
            </p>
            <p style={{ textAlign: "center", fontSize: "11px", color: "var(--cs-muted)", marginTop: "4px" }}>
              {isMember ? "" : (
                <>Not a member? <Link href="/auth" style={{ color: "var(--cs-orange)" }}>Join the community</Link></>
              )}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
