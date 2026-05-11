"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import MembershipCard from "@/components/ui/MembershipCard";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open(): void };
  }
}

interface Event {
  name: string;
  date: string;
  location: string;
  displayDate: string;
}

const UPCOMING_EVENT: Event = {
  name: "Weekend Special Run",
  date: "2026-06-29",
  displayDate: "Sunday, 29 June 2026",
  location: "Kondapur, Hyderabad",
};

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const DISTANCES    = ["5K", "10K", "16K", "21.1K"];
const RUN_FEE      = 199;

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
  const [isMember,   setIsMember]   = useState(false);
  const [memberName, setMemberName] = useState("");
  const [submitted,  setSubmitted]  = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");

  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", phone: "",
    blood_group: "", distance: "",
    emergency_contact_name: "", emergency_contact_phone: "",
  });

  useEffect(() => {
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
    }

    // Load Razorpay checkout script
    if (!document.getElementById("razorpay-script")) {
      const s = document.createElement("script");
      s.id  = "razorpay-script";
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      document.body.appendChild(s);
    }
  }, []);

  const set = (field: string, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setError("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.blood_group)    { setError("Please select your blood group."); return; }
    if (!form.distance)       { setError("Please select a distance."); return; }
    if (!form.first_name || !form.last_name || !form.email || !form.phone) {
      setError("Please fill in all required fields."); return;
    }
    if (!form.emergency_contact_name || !form.emergency_contact_phone) {
      setError("Please fill in the emergency contact details."); return;
    }

    setLoading(true); setError("");

    try {
      // Step 1: Create Razorpay order
      const orderRes = await fetch("/api/payment/run-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, event_date: UPCOMING_EVENT.date }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) { setError(orderData.error || "Could not initiate payment."); setLoading(false); return; }

      // Step 2: Open Razorpay modal
      const rzp = new window.Razorpay({
        key:         process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        order_id:    orderData.orderId,
        amount:      orderData.amount,
        currency:    "INR",
        name:        "Connected Steps",
        description: `${UPCOMING_EVENT.name} — ${UPCOMING_EVENT.displayDate}`,
        prefill: {
          name:  `${form.first_name} ${form.last_name}`,
          email: form.email,
          contact: form.phone,
        },
        theme: { color: "#e8620a" },
        modal: { ondismiss: () => setLoading(false) },
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          // Step 3: Verify + register
          const regRes = await fetch("/api/runs/pay-and-register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...response,
              ...form,
              event_name:     UPCOMING_EVENT.name,
              event_date:     UPCOMING_EVENT.date,
              event_location: UPCOMING_EVENT.location,
              is_member:      isMember,
            }),
          });
          const regData = await regRes.json();
          if (!regRes.ok) { setError(regData.error || "Registration failed after payment."); }
          else { setSubmitted(true); }
          setLoading(false);
        },
      });
      rzp.open();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--cs-black)", color: "var(--cs-white)" }}>

      {/* Navbar */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, background: "rgba(10,10,10,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 2rem", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
          <Image src="/logo.png" alt="Connected Steps" width={36} height={36} className="rounded-full" />
          <span className="font-display" style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--cs-white)" }}>Connected Steps</span>
        </Link>
        <Link href="/" style={{ fontSize: "0.8rem", color: "var(--cs-muted)", textDecoration: "none" }}>← Back to home</Link>
      </header>

      <div style={{ maxWidth: "680px", margin: "0 auto", padding: "6rem 1.5rem 4rem" }}>

        {/* Event banner */}
        <div style={{ background: "rgba(232,98,10,0.08)", border: "1px solid rgba(232,98,10,0.25)", borderRadius: "8px", padding: "1.25rem 1.5rem", marginBottom: "1.25rem", display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "10px", color: "var(--cs-orange)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "4px" }}>Upcoming Event</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--cs-white)" }}>{UPCOMING_EVENT.name}</div>
            <div style={{ fontSize: "0.8rem", color: "var(--cs-muted)", marginTop: "2px" }}>📅 {UPCOMING_EVENT.displayDate} &nbsp;·&nbsp; 📍 {UPCOMING_EVENT.location}</div>
          </div>
          <div style={{ fontSize: "11px", padding: "4px 12px", borderRadius: "20px", background: "var(--cs-orange)", color: "var(--cs-white)", fontWeight: 600 }}>Open</div>
        </div>

        {/* Fee notice */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", padding: "0.9rem 1.25rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span style={{ fontSize: "1.1rem" }}>🎟️</span>
            <div>
              <div style={{ fontSize: "0.82rem", color: "var(--cs-white)", fontWeight: 600 }}>Registration Fee</div>
              <div style={{ fontSize: "11px", color: "var(--cs-muted)" }}>Paid via Razorpay · Secure checkout</div>
            </div>
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--cs-orange)" }}>₹{RUN_FEE}</div>
        </div>

        {/* Membership */}
        {form.email && <MembershipCard email={form.email} name={memberName} />}

        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem" }}>Connected Steps</div>
          <h1 className="font-display" style={{ fontSize: "2rem", fontWeight: 300, color: "var(--cs-white)", marginBottom: "0.5rem" }}>Run Registration</h1>
          <p style={{ fontSize: "0.875rem", color: "var(--cs-muted)" }}>Every last Sunday of the month. Different location, same spirit.</p>
        </div>

        {submitted ? (
          <div style={{ background: "rgba(232,98,10,0.08)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: "10px", padding: "3rem", textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎉</div>
            <h2 className="font-display" style={{ fontSize: "1.5rem", fontWeight: 300, color: "var(--cs-white)", marginBottom: "0.75rem" }}>You're registered!</h2>
            <p style={{ fontSize: "0.875rem", color: "var(--cs-muted)", marginBottom: "0.5rem" }}>
              See you on <strong style={{ color: "var(--cs-white)" }}>{UPCOMING_EVENT.displayDate}</strong> at {UPCOMING_EVENT.location}.
            </p>
            <p style={{ fontSize: "0.8rem", color: "var(--cs-muted)" }}>Stay tuned on WhatsApp & Instagram for updates.</p>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: "2rem", flexWrap: "wrap" }}>
              <Link href="/" style={{ padding: "10px 24px", background: "var(--cs-orange)", color: "var(--cs-white)", borderRadius: "4px", textDecoration: "none", fontSize: "0.85rem", fontWeight: 600 }}>Back to home</Link>
              <Link href="/dashboard" style={{ padding: "10px 24px", border: "1px solid rgba(255,255,255,0.15)", color: "var(--cs-white)", borderRadius: "4px", textDecoration: "none", fontSize: "0.85rem" }}>Go to dashboard</Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>

            {isMember && (
              <div style={{ background: "rgba(232,98,10,0.08)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: "6px", padding: "10px 14px", marginBottom: "1.5rem", fontSize: "0.825rem", color: "var(--cs-orange)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
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
            <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.5rem", marginBottom: "1.5rem" }}>
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

            {error && (
              <div style={{ background: "rgba(226,75,74,0.1)", border: "1px solid rgba(226,75,74,0.3)", borderRadius: "6px", padding: "10px 14px", marginBottom: "1.25rem", fontSize: "0.825rem", color: "#f09595" }}>
                {error}
              </div>
            )}

            {/* Pay button */}
            <button type="submit" disabled={loading} style={{
              width: "100%", padding: "16px",
              background: loading ? "rgba(232,98,10,0.6)" : "var(--cs-orange)",
              color: "var(--cs-white)", border: "none", borderRadius: "6px",
              fontSize: "1rem", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "var(--font-body)", letterSpacing: "0.04em", transition: "background 0.2s",
            }}>
              {loading ? "Opening payment…" : `Pay ₹${RUN_FEE} & Register 🏃`}
            </button>

            <p style={{ textAlign: "center", fontSize: "11px", color: "var(--cs-muted)", marginTop: "1rem" }}>
              Powered by Razorpay · 100% secure · Amount: ₹{RUN_FEE}
            </p>
            <p style={{ textAlign: "center", fontSize: "11px", color: "var(--cs-muted)", marginTop: "4px" }}>
              {isMember ? "Already a Connected Steps member." : (
                <>Not a member yet? <Link href="/auth" style={{ color: "var(--cs-orange)" }}>Join the community</Link></>
              )}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
