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
  collect_tshirt: boolean;
  allow_multi_participant: boolean;
  max_per_registration: number;
}

interface ParticipantData {
  first_name: string; last_name: string;
  gender: string; date_of_birth: string;
  blood_group: string; mobile: string;
  email: string;
  distance_category: string; tshirt_size: string;
}

const EMPTY_PARTICIPANT: ParticipantData = {
  first_name: "", last_name: "", gender: "", date_of_birth: "",
  blood_group: "", mobile: "", email: "", distance_category: "", tshirt_size: "",
};

const TSHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] as const;
const BLOOD_GROUPS = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];

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
  running:   { label: "Running",   icon: "🏃", color: "#e8620a" },
  cycling:   { label: "Cycling",   icon: "🚴", color: "#3b82f6" },
  training:  { label: "Training",  icon: "💪", color: "#a855f7" },
  race:      { label: "Race",      icon: "🏆", color: "#ef4444" },
  community: { label: "Community", icon: "🤝", color: "#22c55e" },
  workshop:  { label: "Workshop",  icon: "📚", color: "#eab308" },
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

  const [ev,      setEv]      = useState<EventInfo | null>(null);
  const [evErr,   setEvErr]   = useState(false);
  const [loading, setLoading] = useState(true);

  // ── Single-participant form state (legacy / non-multi) ──────────────────────
  const [form, setForm] = useState({
    name: "", email: "", phone: "",
    gender: "", date_of_birth: "",
    blood_group: "",
    emergency_contact_name: "", emergency_contact_phone: "",
    special_notes: "",
  });
  const [errors,    setErrors]    = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  // ── Multi-participant form state ──────────────────────────────────────────
  const [participantCount, setParticipantCount] = useState(1);
  const [participants,     setParticipants]     = useState<ParticipantData[]>([{ ...EMPTY_PARTICIPANT }]);
  const [multiErrors,      setMultiErrors]      = useState<Array<Record<string, string>>>([{}]);
  const [multiSubmitted,   setMultiSubmitted]   = useState(false);
  const [sharedEmergency,  setSharedEmergency]  = useState({ name: "", phone: "" });
  const [sharedNotes,      setSharedNotes]      = useState("");

  // ── Shared state ──────────────────────────────────────────────────────────
  const [coupon,        setCoupon]        = useState("");
  const [couponApplied, setCouponApplied] = useState<{ id: string; discount: number; label: string } | null>(null);
  const [couponErr,     setCouponErr]     = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [distanceCategory, setDistanceCategory] = useState("");
  const [tshirtSize,       setTshirtSize]       = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [submitErr,   setSubmitErr]   = useState("");
  const [alreadyReg,  setAlreadyReg]  = useState<string | null>(null);
  const [userEmail,   setUserEmail]   = useState("");
  const [userToken,   setUserToken]   = useState("");

  // Auth guard + pre-fill
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
      if (!isTokenValid(storedToken)) { handleAuthExpiry(`/events/${slug}/register`); return; }
      setUserEmail(u.email);
      setUserToken(storedToken);
      const fullName = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
      setForm(f => ({ ...f, name: fullName, email: u.email ?? "", phone: u.phone ?? "" }));
      // Pre-fill first participant with account info
      setParticipants([{
        ...EMPTY_PARTICIPANT,
        first_name: u.firstName ?? "",
        last_name:  u.lastName  ?? "",
        mobile:     u.phone     ?? "",
        email:      u.email     ?? "",
      }]);
    } catch { router.replace("/auth?tab=login"); }
  }, [slug, router]);

  // Fetch event
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

  // Already-registered check
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

  // Sync participant count with the participants array
  function changeCount(n: number) {
    setParticipantCount(n);
    setParticipants(prev => {
      if (n > prev.length) {
        return [...prev, ...Array(n - prev.length).fill(null).map(() => ({ ...EMPTY_PARTICIPANT }))];
      }
      return prev.slice(0, n);
    });
    setMultiErrors(prev => {
      if (n > prev.length) return [...prev, ...Array(n - prev.length).fill({})];
      return prev.slice(0, n);
    });
  }

  function setParticipant(idx: number, field: keyof ParticipantData, value: string) {
    setParticipants(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
    if (multiSubmitted) {
      setMultiErrors(prev => {
        const next = [...prev];
        next[idx] = validateParticipant({ ...participants[idx], [field]: value }, ev!);
        return next;
      });
    }
  }

  // ── Validation ─────────────────────────────────────────────────────────────

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

  function validateParticipant(p: ParticipantData, event: EventInfo): Record<string, string> {
    const e: Record<string, string> = {};
    if (!p.first_name.trim())  e.first_name = "First name is required.";
    if (!p.gender)             e.gender = "Please select gender.";
    if (!p.date_of_birth)      e.date_of_birth = "Date of birth is required.";
    else if (new Date(p.date_of_birth) >= new Date()) e.date_of_birth = "Must be in the past.";
    if (!p.blood_group)        e.blood_group = "Please select blood group.";
    if (!p.mobile || !/^\d{10}$/.test(p.mobile.replace(/\s/g, ""))) e.mobile = "Phone must be exactly 10 digits.";
    const cats = event.distance_categories ?? [];
    if (cats.length > 1 && !p.distance_category) e.distance_category = "Please select a distance category.";
    if (event.collect_tshirt && !p.tshirt_size) e.tshirt_size = "Please select a T-shirt size.";
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

  const isMulti = ev?.allow_multi_participant ?? false;

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
      const perPersonPrice = ev?.price ?? 0;
      const totalPrice     = isMulti ? perPersonPrice * participantCount : perPersonPrice;
      const disc = data.discount_type === "percentage"
        ? Math.min(totalPrice, Math.round(totalPrice * data.discount_value / 100))
        : Math.min(totalPrice, data.discount_value);
      setCouponApplied({ id: data.coupon_id, discount: disc, label: data.description ?? coupon.toUpperCase() });
    } catch { setCouponErr("Could not validate coupon. Please try again."); }
    finally   { setCouponLoading(false); }
  }, [coupon, userEmail, ev?.id, ev?.price, isMulti, participantCount]);

  // ── Payment helper ─────────────────────────────────────────────────────────

  async function openRazorpay(registrationCode: string, leadName: string, finalPrice: number) {
    if (!ev) return;
    await loadRazorpay();
    const orderRes = await fetch("/api/events/create-payment-order", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-token": userToken },
      body: JSON.stringify({ event_id: ev.id, email: userEmail, registration_code: registrationCode }),
    });
    const orderData = await orderRes.json();
    if (!orderRes.ok) { setSubmitErr(orderData.error ?? "Could not create payment order."); setSubmitting(false); return; }

    const rzp = new window.Razorpay({
      key:         orderData.key,
      amount:      orderData.amount,
      currency:    "INR",
      name:        "Connected Steps",
      description: ev.title,
      order_id:    orderData.orderId,
      prefill:     { name: leadName, email: userEmail, contact: isMulti ? participants[0]?.mobile : form.phone },
      theme:       { color: "#e8620a" },
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        const vRes  = await fetch("/api/events/verify-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...response, registration_code: registrationCode }),
        });
        const vData = await vRes.json();
        if (vData.success) {
          router.push(`/events/${slug}/register/success?code=${registrationCode}&paid=1`);
        } else {
          setSubmitErr("Payment verification failed. Please contact support.");
          setSubmitting(false);
        }
      },
      modal: { ondismiss: () => setSubmitting(false) },
    });
    rzp.open();
  }

  // ── Submit: single participant (legacy) ────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ev) return;
    setSubmitted(true);
    const errs = validate(form);
    const cats = ev.distance_categories ?? [];
    if (cats.length > 1 && !distanceCategory) {
      setSubmitErr("Please select a distance category.");
      document.getElementById("field-distance_category")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (ev.collect_tshirt && !tshirtSize) {
      setSubmitErr("Please select your T-shirt size.");
      document.getElementById("field-tshirt_size")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      const el = document.getElementById(`field-${Object.keys(errs)[0]}`);
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
          tshirt_size:       tshirtSize || undefined,
        }),
      });
      const data = await res.json();
      if (res.status === 401) { handleAuthExpiry(`/events/${slug}/register`); return; }
      if (!res.ok) { setSubmitErr(data.error ?? "Registration failed."); setSubmitting(false); return; }
      if (data.already || data.free) {
        router.push(`/events/${slug}/register/success?code=${data.registration_code}`);
        return;
      }
      await openRazorpay(data.registration_code, form.name, data.final_price ?? 0);
    } catch (err: unknown) {
      setSubmitErr(String(err)); setSubmitting(false);
    }
  }

  // ── Submit: multi-participant ──────────────────────────────────────────────

  async function handleMultiSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ev) return;
    setMultiSubmitted(true);

    // Validate all participants
    const allErrs = participants.map(p => validateParticipant(p, ev));
    setMultiErrors(allErrs);

    const hasErrors = allErrs.some(e => Object.keys(e).length > 0);
    if (hasErrors) {
      document.getElementById("multi-participant-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (!sharedEmergency.name.trim()) { setSubmitErr("Emergency contact name is required."); return; }
    if (!sharedEmergency.phone.trim() || !/^\d{10}$/.test(sharedEmergency.phone.replace(/\s/g, ""))) {
      setSubmitErr("Emergency contact number must be 10 digits.");
      return;
    }
    if (!sharedNotes.trim()) { setSubmitErr("Special notes are required (enter NA if none)."); return; }

    setSubmitting(true); setSubmitErr("");

    try {
      const res = await fetch("/api/events/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-token": userToken },
        body: JSON.stringify({
          event_id:          ev.id,
          email:             userEmail,
          emergency_contact: `${sharedEmergency.name} / ${sharedEmergency.phone}`,
          special_notes:     sharedNotes,
          coupon_code:       couponApplied ? coupon : undefined,
          participants:      participants.map(p => ({
            first_name:        p.first_name.trim(),
            last_name:         p.last_name.trim() || undefined,
            gender:            p.gender,
            date_of_birth:     p.date_of_birth,
            blood_group:       p.blood_group,
            mobile:            p.mobile,
            email:             p.email || userEmail,
            distance_category: p.distance_category || undefined,
            tshirt_size:       p.tshirt_size || undefined,
          })),
        }),
      });
      const data = await res.json();
      if (res.status === 401) { handleAuthExpiry(`/events/${slug}/register`); return; }
      if (!res.ok) { setSubmitErr(data.error ?? "Registration failed."); setSubmitting(false); return; }
      if (data.already || data.free) {
        router.push(`/events/${slug}/register/success?code=${data.registration_code}`);
        return;
      }
      const leadName = [participants[0]?.first_name, participants[0]?.last_name].filter(Boolean).join(" ");
      await openRazorpay(data.registration_code, leadName, data.final_price ?? 0);
    } catch (err: unknown) {
      setSubmitErr(String(err)); setSubmitting(false);
    }
  }

  // ── Price display ──────────────────────────────────────────────────────────

  const pricePerPerson  = ev?.price ?? 0;
  const totalBeforeDisc = isMulti ? pricePerPerson * participantCount : pricePerPerson;
  const discount        = couponApplied?.discount ?? 0;
  const final           = Math.max(0, totalBeforeDisc - discount);

  // ── Loading / error states ─────────────────────────────────────────────────

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

  // ── Shared top section ────────────────────────────────────────────────────

  const EventHeader = (
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
  );

  const AlreadyBanner = alreadyReg && (
    <div style={{ padding: "1.25rem 1.5rem", borderRadius: "12px", background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.3)", marginBottom: "1.5rem", textAlign: "center" }}>
      <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>✅</div>
      <div style={{ fontWeight: 700, color: "#4ade80", marginBottom: "0.25rem" }}>You&apos;re already registered!</div>
      <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.5)", marginBottom: "1rem", fontFamily: "monospace" }}>{alreadyReg}</div>
      <Link href={`/events/${slug}/register/success?code=${alreadyReg}`}
        style={{ display: "inline-block", padding: "10px 24px", borderRadius: "8px", background: "linear-gradient(135deg,#e8620a,#f07c2a)", color: "#fff", fontWeight: 700, fontSize: "0.875rem", textDecoration: "none" }}>
        View Registration Details →
      </Link>
    </div>
  );

  const CouponSection = pricePerPerson > 0 && (
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
  );

  // ── Multi-participant form ─────────────────────────────────────────────────

  if (isMulti) {
    const maxSlots = Math.min(ev.max_per_registration || 10, 10);
    const cats     = ev.distance_categories ?? [];

    return (
      <div style={{ minHeight: "100vh", background: "#0d0d10", color: "#fff" }}>
        <nav style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(13,13,16,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 1.5rem", height: "56px", display: "flex", alignItems: "center" }}>
          <Link href={`/events/${slug}`} style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>← Event Details</Link>
        </nav>

        <div style={{ maxWidth: "640px", margin: "0 auto", padding: "2rem 1.5rem 5rem" }}>
          {EventHeader}
          {AlreadyBanner}

          {/* Participant count selector */}
          <section style={{ marginBottom: "1.75rem" }}>
            <div style={{ fontSize: "10px", color: "#e8620a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.875rem" }}>
              Number of Participants *
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {Array.from({ length: maxSlots }, (_, i) => i + 1).map(n => (
                <button key={n} type="button" onClick={() => changeCount(n)}
                  style={{
                    width: "44px", height: "44px", borderRadius: "10px", fontFamily: "inherit",
                    fontWeight: n === participantCount ? 800 : 500, fontSize: "1rem",
                    border: `2px solid ${n === participantCount ? "#e8620a" : "rgba(255,255,255,0.12)"}`,
                    background: n === participantCount ? "rgba(232,98,10,0.15)" : "transparent",
                    color: n === participantCount ? "#e8620a" : "rgba(255,255,255,0.55)",
                    cursor: "pointer", transition: "all 0.15s",
                  }}>
                  {n}
                </button>
              ))}
            </div>
            <div style={{ fontSize: "11px", color: "#555", marginTop: "6px" }}>
              Each participant gets their own QR code · ₹{pricePerPerson} per person
            </div>
          </section>

          <form id="multi-participant-form" onSubmit={handleMultiSubmit} noValidate
            style={{ opacity: alreadyReg ? 0.4 : 1, pointerEvents: alreadyReg ? "none" : "auto" }}>

            {/* Per-participant sections */}
            {participants.map((p, idx) => (
              <div key={idx} style={{
                marginBottom: "1.5rem",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "14px", padding: "1.25rem",
              }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "#e8620a", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>
                  Participant {idx + 1}{idx === 0 ? " (You)" : ""}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <label style={LABEL}>First Name *</label>
                    <input style={{ ...INPUT, borderColor: multiErrors[idx]?.first_name ? "rgba(239,68,68,0.6)" : undefined }}
                      value={p.first_name} onChange={e => setParticipant(idx, "first_name", e.target.value)}
                      placeholder="First name" />
                    {multiErrors[idx]?.first_name && <Err>{multiErrors[idx].first_name}</Err>}
                  </div>

                  <div>
                    <label style={LABEL}>Last Name</label>
                    <input style={INPUT} value={p.last_name}
                      onChange={e => setParticipant(idx, "last_name", e.target.value)}
                      placeholder="Last name" />
                  </div>

                  <div>
                    <label style={LABEL}>Gender *</label>
                    <select style={{ ...INPUT, cursor: "pointer", colorScheme: "dark", borderColor: multiErrors[idx]?.gender ? "rgba(239,68,68,0.6)" : undefined }}
                      value={p.gender} onChange={e => setParticipant(idx, "gender", e.target.value)}>
                      <option value="" style={{ background: "#1a1a1a" }}>Select gender</option>
                      <option value="male"   style={{ background: "#1a1a1a" }}>Male</option>
                      <option value="female" style={{ background: "#1a1a1a" }}>Female</option>
                      <option value="other"  style={{ background: "#1a1a1a" }}>Other</option>
                    </select>
                    {multiErrors[idx]?.gender && <Err>{multiErrors[idx].gender}</Err>}
                  </div>

                  <div>
                    <label style={LABEL}>Date of Birth *</label>
                    <input style={{ ...INPUT, colorScheme: "dark", borderColor: multiErrors[idx]?.date_of_birth ? "rgba(239,68,68,0.6)" : undefined }}
                      type="date" value={p.date_of_birth}
                      onChange={e => setParticipant(idx, "date_of_birth", e.target.value)}
                      max={new Date().toISOString().split("T")[0]} />
                    {multiErrors[idx]?.date_of_birth && <Err>{multiErrors[idx].date_of_birth}</Err>}
                  </div>

                  <div>
                    <label style={LABEL}>Blood Group *</label>
                    <select style={{ ...INPUT, cursor: "pointer", colorScheme: "dark", borderColor: multiErrors[idx]?.blood_group ? "rgba(239,68,68,0.6)" : undefined }}
                      value={p.blood_group} onChange={e => setParticipant(idx, "blood_group", e.target.value)}>
                      <option value="" style={{ background: "#1a1a1a" }}>Select blood group</option>
                      {BLOOD_GROUPS.map(g => <option key={g} value={g} style={{ background: "#1a1a1a" }}>{g}</option>)}
                    </select>
                    {multiErrors[idx]?.blood_group && <Err>{multiErrors[idx].blood_group}</Err>}
                  </div>

                  <div>
                    <label style={LABEL}>Mobile Number *</label>
                    <input style={{ ...INPUT, borderColor: multiErrors[idx]?.mobile ? "rgba(239,68,68,0.6)" : undefined }}
                      type="tel" maxLength={10} value={p.mobile}
                      onChange={e => setParticipant(idx, "mobile", e.target.value)}
                      placeholder="10-digit number" />
                    {multiErrors[idx]?.mobile && <Err>{multiErrors[idx].mobile}</Err>}
                  </div>

                  {/* Distance category — per participant */}
                  {cats.length > 1 && (
                    <div style={{ gridColumn: "1/-1" }}>
                      <label style={LABEL}>Distance Category *</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {cats.map(cat => {
                          const d   = getDistanceOption(cat);
                          const sel = p.distance_category === cat;
                          return (
                            <button key={cat} type="button"
                              onClick={() => setParticipant(idx, "distance_category", cat)}
                              style={{
                                padding: "8px 18px", borderRadius: "8px", cursor: "pointer",
                                fontFamily: "inherit", transition: "all 0.15s",
                                border: `2px solid ${sel ? d.color : "rgba(255,255,255,0.12)"}`,
                                background: sel ? d.bg : "transparent",
                                color: sel ? d.color : "rgba(255,255,255,0.55)",
                                fontWeight: sel ? 800 : 500, fontSize: "0.9rem",
                              }}>
                              {cat}
                            </button>
                          );
                        })}
                      </div>
                      {multiErrors[idx]?.distance_category && <Err>{multiErrors[idx].distance_category}</Err>}
                    </div>
                  )}
                  {cats.length === 1 && (
                    <div style={{ gridColumn: "1/-1", fontSize: "11px", color: "#555" }}>
                      Category: {cats[0]}
                    </div>
                  )}

                  {/* T-shirt size — per participant */}
                  {ev.collect_tshirt && (
                    <div style={{ gridColumn: "1/-1" }}>
                      <label style={LABEL}>T-Shirt Size *</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {TSHIRT_SIZES.map(size => {
                          const sel = p.tshirt_size === size;
                          return (
                            <button key={size} type="button"
                              onClick={() => setParticipant(idx, "tshirt_size", size)}
                              style={{
                                padding: "8px 16px", borderRadius: "8px", cursor: "pointer",
                                fontFamily: "inherit", fontWeight: sel ? 800 : 500, fontSize: "0.875rem",
                                border: `2px solid ${sel ? "#e8620a" : "rgba(255,255,255,0.12)"}`,
                                background: sel ? "rgba(232,98,10,0.15)" : "transparent",
                                color: sel ? "#e8620a" : "rgba(255,255,255,0.55)",
                                transition: "all 0.15s",
                              }}>
                              {size}
                            </button>
                          );
                        })}
                      </div>
                      {multiErrors[idx]?.tshirt_size && <Err>{multiErrors[idx].tshirt_size}</Err>}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Shared emergency contact */}
            <section style={{ marginBottom: "1.5rem" }}>
              <div style={{ fontSize: "10px", color: "#e8620a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>
                Emergency Contact (for all participants)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={LABEL}>Contact Name *</label>
                  <input style={INPUT} value={sharedEmergency.name}
                    onChange={e => setSharedEmergency(v => ({ ...v, name: e.target.value }))}
                    placeholder="Contact person's name" />
                </div>
                <div>
                  <label style={LABEL}>Contact Number *</label>
                  <input style={INPUT} type="tel" maxLength={10} value={sharedEmergency.phone}
                    onChange={e => setSharedEmergency(v => ({ ...v, phone: e.target.value }))}
                    placeholder="10-digit number" />
                </div>
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={LABEL}>Special Notes *</label>
                  <textarea
                    style={{ ...INPUT, minHeight: "70px", resize: "vertical" } as React.CSSProperties}
                    value={sharedNotes}
                    onChange={e => setSharedNotes(e.target.value)}
                    placeholder="Medical conditions, dietary needs, or any questions. Enter NA if none." />
                </div>
              </div>
            </section>

            {CouponSection}

            {/* Price summary */}
            <div style={{ padding: "1rem 1.25rem", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", marginBottom: "1.5rem" }}>
              {pricePerPerson > 0 ? (
                <>
                  <PriceLine label={`₹${pricePerPerson} × ${participantCount} participant${participantCount > 1 ? "s" : ""}`} value={`₹${totalBeforeDisc}`} />
                  {discount > 0 && <PriceLine label={`Coupon (${coupon})`} value={`−₹${discount}`} muted />}
                  <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "0.75rem 0" }} />
                  <PriceLine label="Total" value={final === 0 ? "Free" : `₹${final}`} bold />
                </>
              ) : (
                <PriceLine label={`Free Entry × ${participantCount}`} value="Free" bold />
              )}
            </div>

            {submitErr && (
              <div style={{ padding: "10px 14px", borderRadius: "8px", marginBottom: "1rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", fontSize: "0.82rem" }}>
                {submitErr}
              </div>
            )}

            <button type="submit" disabled={submitting}
              style={{ width: "100%", padding: "14px", borderRadius: "10px", background: submitting ? "rgba(232,98,10,0.45)" : "linear-gradient(135deg,#e8620a,#f07c2a)", border: "none", color: "#fff", fontWeight: 700, fontSize: "1rem", cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: submitting ? "none" : "0 4px 20px rgba(232,98,10,0.35)" }}>
              {submitting
                ? "Processing…"
                : final > 0
                  ? `Pay ₹${final} & Register ${participantCount} Participant${participantCount > 1 ? "s" : ""}`
                  : `Register ${participantCount} Participant${participantCount > 1 ? "s" : ""} →`
              }
            </button>
            <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.3)", textAlign: "center", marginTop: "0.75rem" }}>
              By registering you agree to our terms &amp; conditions.
            </p>
          </form>
        </div>
      </div>
    );
  }

  // ── Single-participant form (original, unchanged) ─────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d10", color: "#fff" }}>

      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(13,13,16,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 1.5rem", height: "56px", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <Link href={`/events/${slug}`} style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>← Event Details</Link>
      </nav>

      <div style={{ maxWidth: "600px", margin: "0 auto", padding: "2rem 1.5rem 5rem" }}>
        {EventHeader}

        {/* Distance category selector */}
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

        {/* T-Shirt Size selector */}
        {ev.collect_tshirt && (
          <div id="field-tshirt_size" style={{ marginBottom: "1.75rem" }}>
            <div style={{ fontSize: "10px", color: "#e8620a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.875rem" }}>
              T-Shirt Size *
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {TSHIRT_SIZES.map(size => {
                const sel = tshirtSize === size;
                return (
                  <button key={size} type="button"
                    onClick={() => { setTshirtSize(size); setSubmitErr(""); }}
                    style={{
                      padding: "9px 18px", borderRadius: "8px", cursor: "pointer",
                      fontFamily: "inherit", fontWeight: sel ? 800 : 500, fontSize: "0.9rem",
                      border: `2px solid ${sel ? "#e8620a" : "rgba(255,255,255,0.12)"}`,
                      background: sel ? "rgba(232,98,10,0.15)" : "transparent",
                      color: sel ? "#e8620a" : "rgba(255,255,255,0.55)",
                      transition: "all 0.15s",
                    }}>
                    {size}
                  </button>
                );
              })}
            </div>
            {!tshirtSize && (
              <div style={{ fontSize: "11px", color: "#555", marginTop: "6px" }}>
                Select a size — T-shirt is included with your registration
              </div>
            )}
          </div>
        )}

        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.75rem", color: "#fff" }}>Registration Form</h1>

        {AlreadyBanner}

        <form onSubmit={handleSubmit} noValidate style={{ opacity: alreadyReg ? 0.4 : 1, pointerEvents: alreadyReg ? "none" : "auto" }}>

          {/* Personal details */}
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

          {/* Event information */}
          <section style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontSize: "10px", color: "#e8620a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>Event Information</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>

              <div id="field-blood_group">
                <label style={LABEL}>Blood Group *</label>
                <select style={{ ...INPUT, cursor: "pointer", colorScheme: "dark", borderColor: errors.blood_group ? "rgba(239,68,68,0.6)" : undefined }} value={form.blood_group} onChange={set("blood_group")}>
                  <option value="" style={{ background: "#1a1a1a" }}>Select blood group</option>
                  {BLOOD_GROUPS.map(g => <option key={g} value={g} style={{ background: "#1a1a1a" }}>{g}</option>)}
                </select>
                {errors.blood_group && <Err>{errors.blood_group}</Err>}
              </div>

              <div />

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

          {CouponSection}

          {/* Price summary */}
          <div style={{ padding: "1rem 1.25rem", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", marginBottom: "1.5rem" }}>
            {pricePerPerson > 0 ? (
              <>
                <PriceLine label="Registration Fee" value={`₹${pricePerPerson}`} />
                {discount > 0 && <PriceLine label={`Coupon Discount (${coupon})`} value={`−₹${discount}`} muted />}
                <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "0.75rem 0" }} />
                <PriceLine label="Total" value={final === 0 ? "Free" : `₹${final}`} bold />
              </>
            ) : (
              <PriceLine label="Registration Fee" value="Free Entry" bold />
            )}
          </div>

          {submitErr && (
            <div style={{ padding: "10px 14px", borderRadius: "8px", marginBottom: "1rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", fontSize: "0.82rem" }}>
              {submitErr}
            </div>
          )}

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
