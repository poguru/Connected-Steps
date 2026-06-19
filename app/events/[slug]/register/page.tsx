"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { isTokenValid, handleAuthExpiry } from "@/lib/client-auth";
import { getDistanceOption } from "@/lib/event-distances";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EventInfo {
  id: string; title: string; event_type: string; start_date: string;
  start_time: string | null; location: string; price: number;
  max_participants: number | null; share_slug: string | null;
  distance_categories: string[] | null;
}

interface StoredUser {
  firstName?: string; lastName?: string; email?: string; phone?: string;
}

const INPUT: React.CSSProperties = {
  width: "100%", padding: "11px 14px",
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "10px", color: "#fff", fontFamily: "inherit",
  fontSize: "0.875rem", outline: "none", boxSizing: "border-box",
};
const LABEL: React.CSSProperties = {
  display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)",
  letterSpacing: "0.07em", textTransform: "uppercase" as const, marginBottom: "5px",
};

const TYPE: Record<string, { label: string; icon: string; color: string }> = {
  running: { label: "Running", icon: "🏃", color: "#e8620a" },
  cycling: { label: "Cycling", icon: "🚴", color: "#3b82f6" },
  training: { label: "Training", icon: "💪", color: "#a855f7" },
  race: { label: "Race", icon: "🏆", color: "#ef4444" },
  community: { label: "Community", icon: "🤝", color: "#22c55e" },
  workshop: { label: "Workshop", icon: "📚", color: "#eab308" },
};

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function fmtTime(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

// ── Razorpay loader ───────────────────────────────────────────────────────────

declare global {
  interface Window {
    Razorpay: new (opts: Record<string, unknown>) => { open(): void };
  }
}

function loadRazorpay(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && window.Razorpay) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug   = params.slug;

  const [ev,     setEv]     = useState<EventInfo | null>(null);
  const [evErr,  setEvErr]  = useState(false);
  const [loading, setLoading] = useState(true);

  // Form state
  const [form, setForm] = useState({
    name: "", email: "", phone: "",
    gender: "", date_of_birth: "",
    blood_group: "",
    emergency_contact_name: "", emergency_contact_phone: "",
    special_notes: "",
  });
  const [errors,        setErrors]        = useState<Record<string, string>>({});
  const [submitted,     setSubmitted]     = useState(false);
  const [coupon,           setCoupon]           = useState("");
  const [couponApplied,    setCouponApplied]    = useState<{ id: string; discount: number; label: string } | null>(null);
  const [couponErr,        setCouponErr]        = useState("");
  const [couponLoading,    setCouponLoading]    = useState(false);
  const [distanceCategory, setDistanceCategory] = useState("");
  const [submitting,    setSubmitting]    = useState(false);
  const [submitErr,     setSubmitErr]     = useState("");
  const [alreadyReg,    setAlreadyReg]    = useState<string | null>(null);

  // Guard: must be logged in
  const [userEmail, setUserEmail] = useState("");
  const [userToken, setUserToken] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem("cs_user");
    if (!raw) {
      sessionStorage.setItem("cs_post_login_redirect", `/events/${slug}/register`);
      router.replace("/auth?tab=login");
      return;
    }
    try {
      const u: StoredUser = JSON.parse(raw);
      if (!u.email) { router.replace("/auth?tab=login"); return; }
      const storedToken = localStorage.getItem("cs_user_token") ?? "";
      if (!isTokenValid(storedToken)) {
        handleAuthExpiry(`/events/${slug}/register`);
        return;
      }
      setUserEmail(u.email);
      setUserToken(storedToken);
      setForm(f => ({
        ...f,
        name:  `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim(),
        email: u.email ?? "",
        phone: u.phone ?? "",
      }));
    } catch { router.replace("/auth?tab=login"); }
  }, [slug, router]);

  // Fetch event details via by-slug (returns all columns including price)
  useEffect(() => {
    if (!slug) return;
    fetch(`/api/events/by-slug?slug=${slug}`)
      .then(r => r.json())
      .then(d => {
        if (d.event) { setEv(d.event); } else { setEvErr(true); }
        setLoading(false);
      })
      .catch(() => { setEvErr(true); setLoading(false); });
  }, [slug]);

  // Check if already registered for this event
  useEffect(() => {
    if (!ev || !userToken) return;
    fetch("/api/events/my-registrations", { headers: { "x-user-token": userToken } })
      .then(r => r.json())
      .then(d => {
        const reg = (d.registrations ?? []).find(
          (r: { events: { id: string } | null; payment_status: string; registration_code: string }) =>
            r.events?.id === ev.id &&
            (r.payment_status === "free" || r.payment_status === "paid")
        );
        if (reg) setAlreadyReg(reg.registration_code);
      })
      .catch(() => {});
  }, [ev, userToken]);

  function validate(f: typeof form) {
    const e: Record<string, string> = {};
    if (!f.name.trim() || f.name.trim().length < 3)   e.name = "Full name must be at least 3 characters.";
    if (!f.phone.trim() || !/^\d{10}$/.test(f.phone.replace(/\s/g, ""))) e.phone = "Phone must be exactly 10 digits.";
    if (!f.gender)                                     e.gender = "Please select your gender.";
    if (!f.date_of_birth)                              e.date_of_birth = "Date of birth is required.";
    else if (new Date(f.date_of_birth) >= new Date())  e.date_of_birth = "Date of birth must be in the past.";
    if (!f.blood_group)                                e.blood_group = "Please select your blood group.";
    if (!f.emergency_contact_name.trim())              e.emergency_contact_name = "Emergency contact name is required.";
    if (!f.emergency_contact_phone.trim() || !/^\d{10}$/.test(f.emergency_contact_phone.replace(/\s/g, ""))) e.emergency_contact_phone = "Emergency contact number must be 10 digits.";
    if (!f.special_notes.trim())                       e.special_notes = "Required — enter NA if no medical conditions.";
    return e;
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(f => {
      const next = { ...f, [k]: e.target.value };
      if (submitted) setErrors(validate(next));
      return next;
    });
  };

  // ── Coupon validation ──────────────────────────────────────────────────────

  const applyCoupon = useCallback(async () => {
    if (!coupon.trim()) return;
    setCouponLoading(true); setCouponErr(""); setCouponApplied(null);
    try {
      const res  = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: coupon, email: userEmail, event_id: ev?.id }),
      });
      const data = await res.json();
      if (!res.ok) { setCouponErr(data.error ?? "Invalid coupon."); return; }

      const price    = ev?.price ?? 0;
      const disc     = data.discount_type === "percentage"
        ? Math.min(price, Math.round(price * data.discount_value / 100))
        : Math.min(price, data.discount_value);
      setCouponApplied({ id: data.coupon_id, discount: disc, label: data.description ?? coupon.toUpperCase() });
    } catch { setCouponErr("Could not validate coupon. Please try again."); }
    finally   { setCouponLoading(false); }
  }, [coupon, userEmail, ev?.id, ev?.price]);

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ev) return;
    setSubmitted(true);
    const errs = validate(form);
    // Require category selection when event has multiple categories
    const cats = ev.distance_categories ?? [];
    if (cats.length > 1 && !distanceCategory) {
      setSubmitErr("Please select a distance category.");
      const el = document.getElementById("field-distance_category");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      const firstKey = Object.keys(errs)[0];
      const el = document.getElementById(`field-${firstKey}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSubmitting(true); setSubmitErr("");

    try {
      const res  = await fetch("/api/events/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-token": userToken },
        body: JSON.stringify({
          event_id:          ev.id,
          email:             form.email,
          name:              form.name,
          phone:             form.phone,
          gender:            form.gender,
          date_of_birth:     form.date_of_birth || null,
          blood_group:       form.blood_group,
          emergency_contact: `${form.emergency_contact_name} / ${form.emergency_contact_phone}`,
          special_notes:     form.special_notes,
          coupon_code:       couponApplied ? coupon : undefined,
          distance_category: distanceCategory || undefined,
        }),
      });
      const data = await res.json();

      if (res.status === 401) { handleAuthExpiry(`/events/${slug}/register`); return; }
      if (!res.ok) { setSubmitErr(data.error ?? "Registration failed."); return; }

      // Already registered
      if (data.already) {
        router.push(`/events/${slug}/register/success?code=${data.registration_code}`);
        return;
      }

      // Free event
      if (data.free) {
        router.push(`/events/${slug}/register/success?code=${data.registration_code}`);
        return;
      }

      // Paid event — open Razorpay
      await loadRazorpay();
      const orderRes  = await fetch("/api/events/create-payment-order", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-token": userToken },
        body: JSON.stringify({ event_id: ev.id, email: form.email, registration_code: data.registration_code }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) { setSubmitErr(orderData.error ?? "Could not create payment order."); return; }

      const rzp = new window.Razorpay({
        key:         orderData.key,
        amount:      orderData.amount,
        currency:    "INR",
        name:        "Connected Steps",
        description: ev.title,
        order_id:    orderData.orderId,
        prefill:     { name: form.name, email: form.email, contact: form.phone },
        theme:       { color: "#e8620a" },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const vRes  = await fetch("/api/events/verify-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...response, registration_code: data.registration_code }),
          });
          const vData = await vRes.json();
          if (vData.success) {
            router.push(`/events/${slug}/register/success?code=${data.registration_code}&paid=1`);
          } else {
            setSubmitErr("Payment verification failed. Please contact support.");
            setSubmitting(false);
          }
        },
        modal: {
          ondismiss: () => setSubmitting(false),
        },
      });
      rzp.open();

    } catch (err: unknown) {
      setSubmitErr(String(err));
      setSubmitting(false);
    }
  }

  // ── Price display ──────────────────────────────────────────────────────────

  const price    = ev?.price ?? 0;
  const discount = couponApplied?.discount ?? 0;
  const final    = Math.max(0, price - discount);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d10", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.3)" }}>
        Loading event…
      </div>
    );
  }

  if (evErr || !ev) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d10", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "1rem", color: "rgba(255,255,255,0.4)" }}>
        <div style={{ fontSize: "2rem" }}>😕</div>
        <div>Event not found.</div>
        <Link href="/events" style={{ color: "#e8620a", textDecoration: "none", fontSize: "0.875rem" }}>← View all events</Link>
      </div>
    );
  }

  const conf = TYPE[ev.event_type] ?? TYPE.running;

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d10", color: "#fff" }}>

      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(13,13,16,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 1.5rem", height: "56px", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <Link href={`/events/${slug}`} style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>← Event Details</Link>
      </nav>

      <div style={{ maxWidth: "600px", margin: "0 auto", padding: "2rem 1.5rem 5rem" }}>

        {/* Event summary */}
        <div style={{ padding: "1rem 1.25rem", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", marginBottom: "1.75rem", display: "flex", gap: "0.875rem", alignItems: "flex-start" }}>
          <div style={{ fontSize: "1.75rem", flexShrink: 0 }}>{conf.icon}</div>
          <div>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: conf.color, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "2px" }}>{conf.label}</div>
            <div style={{ fontSize: "1rem", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>{ev.title}</div>
            <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.5)" }}>
              📅 {fmtDate(ev.start_date)}{ev.start_time ? ` · ${fmtTime(ev.start_time)}` : ""}  · 📍 {ev.location}
            </div>
          </div>
        </div>

        {/* ── Distance category selector (multi-category events) ─────────── */}
        {(ev.distance_categories ?? []).length > 0 && (
          <div id="field-distance_category" style={{ marginBottom: "1.75rem" }}>
            <div style={{ fontSize: "10px", color: "#e8620a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.875rem" }}>
              Select Distance *
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
              {(ev.distance_categories ?? []).map(cat => {
                const d   = getDistanceOption(cat);
                const sel = distanceCategory === cat;
                return (
                  <button key={cat} type="button"
                    onClick={() => { setDistanceCategory(cat); setSubmitErr(""); }}
                    style={{
                      padding: "10px 22px", borderRadius: "10px",
                      border: `2px solid ${sel ? d.color : "rgba(255,255,255,0.12)"}`,
                      cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                      background: sel ? d.bg : "transparent",
                      color: sel ? d.color : "rgba(255,255,255,0.55)",
                      fontWeight: sel ? 800 : 500, fontSize: "1rem",
                      boxShadow: sel ? `0 0 0 1px ${d.border}` : "none",
                    }}>
                    {cat}
                    <div style={{ fontSize: "11px", fontWeight: 400, opacity: 0.75, marginTop: "1px" }}>
                      {getDistanceOption(cat).label !== cat ? getDistanceOption(cat).label : ""}
                    </div>
                  </button>
                );
              })}
            </div>
            {(ev.distance_categories ?? []).length === 1 && !distanceCategory && (
              <div style={{ fontSize: "11px", color: "#555", marginTop: "6px" }}>
                Tap to confirm your category
              </div>
            )}
          </div>
        )}

        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.75rem", color: "#fff" }}>Registration Form</h1>

        {/* Already registered banner */}
        {alreadyReg && (
          <div style={{ padding: "1.25rem 1.5rem", borderRadius: "12px", background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.3)", marginBottom: "1.5rem", textAlign: "center" }}>
            <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>✅</div>
            <div style={{ fontWeight: 700, color: "#4ade80", marginBottom: "0.25rem" }}>You&apos;re already registered!</div>
            <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.5)", marginBottom: "1rem", fontFamily: "monospace" }}>{alreadyReg}</div>
            <Link href={`/events/${slug}/register/success?code=${alreadyReg}`}
              style={{ display: "inline-block", padding: "10px 24px", borderRadius: "8px", background: "linear-gradient(135deg,#e8620a,#f07c2a)", color: "#fff", fontWeight: 700, fontSize: "0.875rem", textDecoration: "none" }}>
              View Registration Details →
            </Link>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate style={{ opacity: alreadyReg ? 0.4 : 1, pointerEvents: alreadyReg ? "none" : "auto" }}>

          {/* ── Personal details ────────────────────────────────────────────── */}
          <section style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontSize: "10px", color: "#e8620a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>Personal Details</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>

              <div style={{ gridColumn: "1/-1" }} id="field-name">
                <label style={LABEL}>Full Name *</label>
                <input style={{ ...INPUT, borderColor: errors.name ? "rgba(239,68,68,0.6)" : undefined }} value={form.name} onChange={set("name")} placeholder="Your full name" />
                {errors.name && <Err>{errors.name}</Err>}
              </div>

              <div>
                <label style={LABEL}>Email *</label>
                <input style={{ ...INPUT, background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.5)" }} value={form.email} readOnly />
              </div>

              <div id="field-phone">
                <label style={LABEL}>Phone Number *</label>
                <input style={{ ...INPUT, borderColor: errors.phone ? "rgba(239,68,68,0.6)" : undefined }} value={form.phone} onChange={set("phone")} placeholder="10-digit mobile number" type="tel" maxLength={10} />
                {errors.phone && <Err>{errors.phone}</Err>}
              </div>

              <div id="field-gender">
                <label style={LABEL}>Gender *</label>
                <select style={{ ...INPUT, cursor: "pointer", colorScheme: "dark", borderColor: errors.gender ? "rgba(239,68,68,0.6)" : undefined }} value={form.gender} onChange={set("gender")}>
                  <option value="" style={{ background: "#1a1a1a" }}>Select gender</option>
                  <option value="male"   style={{ background: "#1a1a1a" }}>Male</option>
                  <option value="female" style={{ background: "#1a1a1a" }}>Female</option>
                  <option value="other"  style={{ background: "#1a1a1a" }}>Other</option>
                </select>
                {errors.gender && <Err>{errors.gender}</Err>}
              </div>

              <div id="field-date_of_birth">
                <label style={LABEL}>Date of Birth *</label>
                <input style={{ ...INPUT, colorScheme: "dark", borderColor: errors.date_of_birth ? "rgba(239,68,68,0.6)" : undefined }} type="date" value={form.date_of_birth} onChange={set("date_of_birth")} max={new Date().toISOString().split("T")[0]} />
                {errors.date_of_birth && <Err>{errors.date_of_birth}</Err>}
              </div>

            </div>
          </section>

          {/* ── Event-specific ─────────────────────────────────────────────── */}
          <section style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontSize: "10px", color: "#e8620a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>Event Information</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>

              <div id="field-blood_group">
                <label style={LABEL}>Blood Group *</label>
                <select style={{ ...INPUT, cursor: "pointer", colorScheme: "dark", borderColor: errors.blood_group ? "rgba(239,68,68,0.6)" : undefined }} value={form.blood_group} onChange={set("blood_group")}>
                  <option value="" style={{ background: "#1a1a1a" }}>Select blood group</option>
                  {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(g => <option key={g} value={g} style={{ background: "#1a1a1a" }}>{g}</option>)}
                </select>
                {errors.blood_group && <Err>{errors.blood_group}</Err>}
              </div>

              <div /> {/* spacer */}

              <div id="field-emergency_contact_name">
                <label style={LABEL}>Emergency Contact Name *</label>
                <input style={{ ...INPUT, borderColor: errors.emergency_contact_name ? "rgba(239,68,68,0.6)" : undefined }} value={form.emergency_contact_name} onChange={set("emergency_contact_name")} placeholder="Contact person's name" />
                {errors.emergency_contact_name && <Err>{errors.emergency_contact_name}</Err>}
              </div>

              <div id="field-emergency_contact_phone">
                <label style={LABEL}>Emergency Contact Number *</label>
                <input style={{ ...INPUT, borderColor: errors.emergency_contact_phone ? "rgba(239,68,68,0.6)" : undefined }} value={form.emergency_contact_phone} onChange={set("emergency_contact_phone")} placeholder="10-digit number" type="tel" maxLength={10} />
                {errors.emergency_contact_phone && <Err>{errors.emergency_contact_phone}</Err>}
              </div>

              <div style={{ gridColumn: "1/-1" }} id="field-special_notes">
                <label style={LABEL}>Special Notes *</label>
                <textarea style={{ ...INPUT, minHeight: "70px", resize: "vertical", borderColor: errors.special_notes ? "rgba(239,68,68,0.6)" : undefined } as React.CSSProperties} value={form.special_notes} onChange={set("special_notes")} placeholder="Medical conditions, dietary needs, or questions. Enter NA if none." />
                {errors.special_notes && <Err>{errors.special_notes}</Err>}
              </div>

            </div>
          </section>

          {/* ── Coupon ─────────────────────────────────────────────────────── */}
          {price > 0 && (
            <section style={{ marginBottom: "1.5rem" }}>
              <div style={{ fontSize: "10px", color: "#e8620a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>Coupon Code</div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  style={{ ...INPUT, flex: 1, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "monospace" }}
                  value={coupon}
                  onChange={e => { setCoupon(e.target.value.toUpperCase()); setCouponErr(""); setCouponApplied(null); }}
                  placeholder="ENTER CODE"
                  disabled={!!couponApplied}
                />
                <button
                  type="button"
                  onClick={couponApplied ? () => { setCouponApplied(null); setCoupon(""); } : applyCoupon}
                  disabled={couponLoading || (!couponApplied && !coupon.trim())}
                  style={{ padding: "0 1.25rem", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.15)", background: couponApplied ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.06)", color: couponApplied ? "#f87171" : "#fff", cursor: "pointer", fontSize: "0.8rem", fontWeight: 700, fontFamily: "inherit", whiteSpace: "nowrap" }}>
                  {couponLoading ? "…" : couponApplied ? "Remove" : "Apply"}
                </button>
              </div>
              {couponErr && <div style={{ fontSize: "0.78rem", color: "#f87171", marginTop: "0.5rem" }}>{couponErr}</div>}
              {couponApplied && <div style={{ fontSize: "0.78rem", color: "#4ade80", marginTop: "0.5rem" }}>✓ {couponApplied.label} — saves ₹{couponApplied.discount}</div>}
            </section>
          )}

          {/* ── Price summary ───────────────────────────────────────────────── */}
          <div style={{ padding: "1rem 1.25rem", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", marginBottom: "1.5rem" }}>
            {price > 0 ? (
              <>
                <PriceLine label="Registration Fee" value={`₹${price}`} />
                {discount > 0 && <PriceLine label={`Coupon Discount (${coupon})`} value={`−₹${discount}`} muted />}
                <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "0.75rem 0" }} />
                <PriceLine label="Total" value={final === 0 ? "Free" : `₹${final}`} bold />
              </>
            ) : (
              <PriceLine label="Registration Fee" value="Free Entry" bold />
            )}
          </div>

          {/* Error */}
          {submitErr && (
            <div style={{ padding: "10px 14px", borderRadius: "8px", marginBottom: "1rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", fontSize: "0.82rem" }}>
              {submitErr}
            </div>
          )}

          {/* Submit */}
          {submitted && Object.keys(errors).length > 0 && (
            <div style={{ padding: "10px 14px", borderRadius: "8px", marginBottom: "1rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", fontSize: "0.82rem" }}>
              Please fix {Object.keys(errors).length} error{Object.keys(errors).length > 1 ? "s" : ""} above before continuing.
            </div>
          )}
          <button
            type="submit"
            disabled={submitting || (submitted && Object.keys(errors).length > 0)}
            style={{ width: "100%", padding: "14px", borderRadius: "10px", background: (submitting || (submitted && Object.keys(errors).length > 0)) ? "rgba(232,98,10,0.45)" : "linear-gradient(135deg,#e8620a,#f07c2a)", border: "none", color: "#fff", fontWeight: 700, fontSize: "1rem", cursor: (submitting || (submitted && Object.keys(errors).length > 0)) ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: submitting ? "none" : "0 4px 20px rgba(232,98,10,0.35)" }}>
            {submitting ? "Processing…" : final > 0 ? `Pay ₹${final} & Register` : "Complete Registration →"}
          </button>

          <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.3)", textAlign: "center", marginTop: "0.75rem" }}>
            By registering you agree to our terms &amp; conditions.
          </p>
        </form>
      </div>
    </div>
  );
}

function Err({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: "0.75rem", color: "#f87171", marginTop: "4px" }}>{children}</div>;
}

function PriceLine({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.375rem" }}>
      <span style={{ fontSize: "0.82rem", color: muted ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.65)", fontStyle: muted ? "italic" : undefined }}>{label}</span>
      <span style={{ fontSize: bold ? "1rem" : "0.82rem", fontWeight: bold ? 700 : 500, color: muted ? "#4ade80" : bold ? "#fff" : "rgba(255,255,255,0.8)" }}>{value}</span>
    </div>
  );
}
