"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Category {
  id: string; slug: string; name: string; distance_km: number;
  category_type: "solo" | "duo" | "kid"; price_rupees: number;
  includes_timing: boolean; includes_medal: boolean;
  includes_tshirt: boolean; includes_certificate: boolean;
  color: string;
}

interface Participant {
  firstName: string; lastName: string; gender: string;
  dob: string; email: string; mobile: string;
  bloodGroup: string; emergencyName: string; emergencyPhone: string;
  companyName: string; employeeId: string;
  companyIdFile: File | null; companyIdUrl: string;
  tshirtSize: string; medicalConditions: string; foodPreference: string;
}

interface CouponData { id: string; code: string; discount: number; label: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Category",    short: "01" },
  { id: 2, label: "Participants",short: "02" },
  { id: 3, label: "Details",     short: "03" },
  { id: 4, label: "Verify",      short: "04" },
  { id: 5, label: "Review",      short: "05" },
  { id: 6, label: "Coupon",      short: "06" },
  { id: 7, label: "Payment",     short: "07" },
  { id: 8, label: "Success",     short: "08" },
];

const BLOOD_GROUPS = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];
const TSHIRT_SIZES = ["XS","S","M","L","XL","XXL","3XL"];
const FOOD_PREFS   = ["veg","non-veg","vegan"];

const emptyParticipant = (): Participant => ({
  firstName: "", lastName: "", gender: "", dob: "", email: "", mobile: "",
  bloodGroup: "", emergencyName: "", emergencyPhone: "",
  companyName: "", employeeId: "", companyIdFile: null, companyIdUrl: "",
  tshirtSize: "", medicalConditions: "", foodPreference: "veg",
});

// ── Styles ────────────────────────────────────────────────────────────────────

const PAGE_BG = "#080808";
const ACCENT  = "#e8620a";
const CARD    = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16 } as const;
const INPUT_S: React.CSSProperties = {
  width: "100%", padding: "11px 14px", borderRadius: 10,
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none",
  boxSizing: "border-box", transition: "border-color 0.2s",
};
const LABEL_S: React.CSSProperties = {
  display: "block", fontSize: 11, color: "rgba(255,255,255,0.5)",
  letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 5,
};
const BTN: React.CSSProperties = {
  padding: "13px 28px", borderRadius: 10, fontWeight: 700, fontSize: 15,
  cursor: "pointer", border: "none", fontFamily: "inherit", transition: "all 0.2s",
};
const PRIMARY: React.CSSProperties = { ...BTN, background: ACCENT, color: "#fff" };
const GHOST:   React.CSSProperties = { ...BTN, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" };

// ── Razorpay loader ────────────────────────────────────────────────────────────

declare global { interface Window { Razorpay: new (opts: Record<string, unknown>) => { open(): void } } }

function loadRazorpay() {
  return new Promise<void>(res => {
    if (typeof window !== "undefined" && window.Razorpay) { res(); return; }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => res();
    document.head.appendChild(s);
  });
}

// ── Step Indicator ─────────────────────────────────────────────────────────────

function StepBar({ step, total = 7 }: { step: number; total?: number }) {
  const effectiveStep = Math.min(step, total);
  return (
    <div style={{ marginBottom: 32 }}>
      {/* Progress bar */}
      <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginBottom: 20, overflow: "hidden" }}>
        <div style={{ height: "100%", background: ACCENT, width: `${((effectiveStep - 1) / (total - 1)) * 100}%`, transition: "width 0.5s ease", borderRadius: 2 }} />
      </div>
      {/* Step dots */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", overflow: "hidden" }}>
        {STEPS.slice(0, total).map((s) => (
          <div key={s.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700,
              background: s.id < step ? ACCENT : s.id === step ? "rgba(232,98,10,0.2)" : "rgba(255,255,255,0.06)",
              border: s.id === step ? `2px solid ${ACCENT}` : "2px solid transparent",
              color: s.id < step ? "#fff" : s.id === step ? ACCENT : "#555",
              transition: "all 0.3s",
            }}>
              {s.id < step ? "✓" : s.short}
            </div>
            <span style={{ fontSize: 9, color: s.id === step ? "#ccc" : "#444", textTransform: "uppercase", letterSpacing: "0.08em", display: "none" }}>{s.label}</span>
          </div>
        ))}
      </div>
      <div style={{ textAlign: "center", marginTop: 12 }}>
        <span style={{ fontSize: 12, color: "#888" }}>Step {effectiveStep} of {total}: </span>
        <span style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>{STEPS[effectiveStep - 1]?.label}</span>
      </div>
    </div>
  );
}

// ── Field component ────────────────────────────────────────────────────────────

function Field({ label, error, required, children }: { label: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={LABEL_S}>{label}{required && <span style={{ color: ACCENT, marginLeft: 3 }}>*</span>}</label>
      {children}
      {error && <span style={{ fontSize: 11, color: "#f87171" }}>{error}</span>}
    </div>
  );
}

// ── ParticipantForm ────────────────────────────────────────────────────────────

function ParticipantForm({
  idx, type, data, onChange, errors, isChild
}: {
  idx: number;
  type: string;
  data: Participant;
  onChange: (field: keyof Participant, val: string | File | null) => void;
  errors: Partial<Record<keyof Participant, string>>;
  isChild: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const typeLabels: Record<string, string> = {
    solo:      "Runner",
    primary:   "Runner 1",
    secondary: "Runner 2",
    parent:    "Parent",
    child:     "Child",
  };

  return (
    <div style={{ ...CARD, padding: 24, marginBottom: 20 }}>
      <div style={{ fontSize: 13, color: ACCENT, fontWeight: 700, marginBottom: 20, textTransform: "uppercase", letterSpacing: "0.1em" }}>
        {typeLabels[type] ?? `Participant ${idx + 1}`}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16 }}>
        <Field label="First Name" error={errors.firstName} required>
          <input style={INPUT_S} value={data.firstName} onChange={e => onChange("firstName", e.target.value)} placeholder="First name" />
        </Field>
        <Field label="Last Name" error={errors.lastName} required>
          <input style={INPUT_S} value={data.lastName} onChange={e => onChange("lastName", e.target.value)} placeholder="Last name" />
        </Field>
        <Field label="Gender" error={errors.gender} required>
          <select style={INPUT_S} value={data.gender} onChange={e => onChange("gender", e.target.value)}>
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="prefer_not">Prefer not to say</option>
          </select>
        </Field>
        <Field label="Date of Birth" error={errors.dob} required>
          <input style={INPUT_S} type="date" value={data.dob} onChange={e => onChange("dob", e.target.value)}
            max={isChild ? new Date(new Date().setFullYear(new Date().getFullYear() - 0)).toISOString().split("T")[0] : undefined} />
        </Field>
        {!isChild && (
          <Field label="Email" error={errors.email} required>
            <input style={INPUT_S} type="email" value={data.email} onChange={e => onChange("email", e.target.value)} placeholder="your@email.com" />
          </Field>
        )}
        <Field label="Mobile" error={errors.mobile} required>
          <input style={INPUT_S} type="tel" value={data.mobile} onChange={e => onChange("mobile", e.target.value)} placeholder="10-digit mobile" maxLength={10} />
        </Field>
        <Field label="Blood Group" error={errors.bloodGroup} required>
          <select style={INPUT_S} value={data.bloodGroup} onChange={e => onChange("bloodGroup", e.target.value)}>
            <option value="">Select blood group</option>
            {BLOOD_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="T-Shirt Size" error={errors.tshirtSize} required>
          <select style={INPUT_S} value={data.tshirtSize} onChange={e => onChange("tshirtSize", e.target.value)}>
            <option value="">Select size</option>
            {TSHIRT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </div>

      {!isChild && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16, marginTop: 16 }}>
          <Field label="Emergency Contact Name" error={errors.emergencyName} required>
            <input style={INPUT_S} value={data.emergencyName} onChange={e => onChange("emergencyName", e.target.value)} placeholder="Contact person name" />
          </Field>
          <Field label="Emergency Contact Phone" error={errors.emergencyPhone} required>
            <input style={INPUT_S} type="tel" value={data.emergencyPhone} onChange={e => onChange("emergencyPhone", e.target.value)} placeholder="Emergency number" maxLength={10} />
          </Field>
          <Field label="Company Name" error={errors.companyName} required>
            <input style={INPUT_S} value={data.companyName} onChange={e => onChange("companyName", e.target.value)} placeholder="Your employer / company" />
          </Field>
          <Field label="Employee ID">
            <input style={INPUT_S} value={data.employeeId} onChange={e => onChange("employeeId", e.target.value)} placeholder="Employee / staff ID (optional)" />
          </Field>
          <Field label="Medical Conditions">
            <input style={INPUT_S} value={data.medicalConditions} onChange={e => onChange("medicalConditions", e.target.value)} placeholder="Any conditions we should know (optional)" />
          </Field>
          <Field label="Food Preference">
            <select style={INPUT_S} value={data.foodPreference} onChange={e => onChange("foodPreference", e.target.value)}>
              {FOOD_PREFS.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
            </select>
          </Field>
        </div>
      )}

      {isChild && (
        <div style={{ marginTop: 16 }}>
          <Field label="T-Shirt Size" error={errors.tshirtSize} required>
            <select style={{ ...INPUT_S, maxWidth: 200 }} value={data.tshirtSize} onChange={e => onChange("tshirtSize", e.target.value)}>
              <option value="">Select size</option>
              {["XS","S","M"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
      )}
    </div>
  );
}

// ── Main Registration Page ────────────────────────────────────────────────────

export default function RegisterPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#080808" }} />}>
      <RegisterPageContent />
    </Suspense>
  );
}

function RegisterPageContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();

  // Step state
  const [step,         setStep]         = useState(1);
  const [categories,   setCategories]   = useState<Category[]>([]);
  const [loadingCats,  setLoadingCats]  = useState(true);
  const [selectedCat,  setSelectedCat]  = useState<Category | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([emptyParticipant()]);
  const [pErrors,      setPErrors]      = useState<Partial<Record<keyof Participant, string>>[]>([{}]);
  const [couponCode,   setCouponCode]   = useState("");
  const [coupon,       setCoupon]       = useState<CouponData | null>(null);
  const [couponError,  setCouponError]  = useState("");
  const [couponLoading,setCouponLoading]= useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [regCode,      setRegCode]      = useState("");
  const [regId,        setRegId]        = useState("");
  const [submitError,  setSubmitError]  = useState("");
  const [paymentDone,  setPaymentDone]  = useState(false);
  const [uploading,    setUploading]    = useState<number[]>([]);

  // Load categories
  useEffect(() => {
    fetch("/api/it-run/categories")
      .then(r => r.json())
      .then(d => { setCategories(d.data ?? []); setLoadingCats(false); })
      .catch(() => setLoadingCats(false));
  }, []);

  // Pre-select category from URL param
  useEffect(() => {
    const slug = searchParams.get("category");
    if (slug && categories.length) {
      const cat = categories.find(c => c.slug === slug);
      if (cat) { setSelectedCat(cat); }
    }
  }, [searchParams, categories]);

  // Auto-save to localStorage
  useEffect(() => {
    if (step > 1 && selectedCat) {
      localStorage.setItem("it_run_draft", JSON.stringify({ step, selectedCat, participants, couponCode }));
    }
  }, [step, selectedCat, participants, couponCode]);

  // Restore draft on mount
  useEffect(() => {
    const draft = localStorage.getItem("it_run_draft");
    if (draft) {
      try {
        const d = JSON.parse(draft);
        if (d.step && d.selectedCat) {
          setSelectedCat(d.selectedCat);
          setParticipants(d.participants ?? [emptyParticipant()]);
          setCouponCode(d.couponCode ?? "");
          setStep(Math.min(d.step, 3));
        }
      } catch { /* ignore */ }
    }
  }, []);

  // Clear draft on success
  useEffect(() => {
    if (step === 8) localStorage.removeItem("it_run_draft");
  }, [step]);

  // ── Category selection ────────────────────────────────────────────────────

  function selectCategory(cat: Category) {
    setSelectedCat(cat);
    const pList = cat.category_type === "duo" ? [emptyParticipant(), emptyParticipant()] : [emptyParticipant(), emptyParticipant()];
    const count  = cat.category_type === "duo" ? 2 : cat.category_type === "kid" ? 2 : 1;
    setParticipants(Array.from({ length: count }, emptyParticipant));
    setPErrors(Array.from({ length: count }, () => ({})));
    setStep(2);
  }

  // ── Participant type labels ───────────────────────────────────────────────

  function pType(idx: number): Participant["companyName"] {
    if (!selectedCat) return "solo";
    if (selectedCat.category_type === "solo") return "solo";
    if (selectedCat.category_type === "duo")  return idx === 0 ? "primary" : "secondary";
    if (selectedCat.category_type === "kid")  return idx === 0 ? "parent" : "child";
    return "solo";
  }

  function isChild(idx: number) {
    return selectedCat?.category_type === "kid" && idx === 1;
  }

  // ── Participant field update ──────────────────────────────────────────────

  function updateParticipant(idx: number, field: keyof Participant, val: string | File | null) {
    setParticipants(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
    // Clear error
    setPErrors(prev => { const c = [...prev]; c[idx] = { ...c[idx], [field]: undefined }; return c; });
  }

  // ── Company ID upload ────────────────────────────────────────────────────

  const uploadCompanyId = useCallback(async (idx: number, file: File) => {
    setUploading(prev => [...prev, idx]);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("participantIdx", String(idx));
      const res  = await fetch("/api/it-run/upload/company-id", { method: "POST", body: form });
      const data = await res.json();
      if (data.url) updateParticipant(idx, "companyIdUrl", data.url);
      else          updateParticipant(idx, "companyIdUrl", "error");
    } catch {
      updateParticipant(idx, "companyIdUrl", "error");
    } finally {
      setUploading(prev => prev.filter(i => i !== idx));
    }
  }, []);

  // ── Validation ────────────────────────────────────────────────────────────

  function validateParticipants(): boolean {
    let valid = true;
    const newErrors = participants.map((p, idx) => {
      const e: Partial<Record<keyof Participant, string>> = {};
      const child = isChild(idx);

      if (!p.firstName.trim()) { e.firstName = "Required"; valid = false; }
      if (!p.lastName.trim())  { e.lastName  = "Required"; valid = false; }
      if (!p.gender)           { e.gender    = "Required"; valid = false; }
      if (!p.dob)              { e.dob       = "Required"; valid = false; }
      if (!p.mobile || !/^\d{10}$/.test(p.mobile)) { e.mobile = "10-digit mobile required"; valid = false; }
      if (!p.bloodGroup)       { e.bloodGroup = "Required"; valid = false; }
      if (!p.tshirtSize)       { e.tshirtSize = "Required"; valid = false; }

      if (!child) {
        if (!p.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) { e.email = "Valid email required"; valid = false; }
        if (!p.emergencyName.trim())  { e.emergencyName  = "Required"; valid = false; }
        if (!p.emergencyPhone.trim()) { e.emergencyPhone = "Required"; valid = false; }
        if (!p.companyName.trim())    { e.companyName    = "Required"; valid = false; }
      }

      if (child && p.dob) {
        const age = (new Date().getTime() - new Date(p.dob).getTime()) / (1000 * 60 * 60 * 24 * 365);
        if (age > 11) { e.dob = "Child must be 10 years or younger"; valid = false; }
      }

      return e;
    });
    setPErrors(newErrors);
    return valid;
  }

  // ── Submit registration ────────────────────────────────────────────────────

  async function submitRegistration() {
    setSubmitting(true);
    setSubmitError("");
    try {
      const res  = await fetch("/api/it-run/register", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          categoryId:   selectedCat!.id,
          couponId:     coupon?.id ?? null,
          participants: participants.map((p, idx) => ({
            type:               pType(idx),
            firstName:          p.firstName,
            lastName:           p.lastName,
            gender:             p.gender,
            dob:                p.dob,
            email:              p.email,
            mobile:             p.mobile,
            bloodGroup:         p.bloodGroup,
            emergencyName:      p.emergencyName,
            emergencyPhone:     p.emergencyPhone,
            companyName:        p.companyName,
            employeeId:         p.employeeId,
            companyIdUrl:       p.companyIdUrl,
            tshirtSize:         p.tshirtSize,
            medicalConditions:  p.medicalConditions,
            foodPreference:     p.foodPreference,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setSubmitError(data.error ?? "Registration failed"); return; }
      setRegCode(data.registrationCode);
      setRegId(data.registrationId);

      // Free category - go to success
      if (data.finalPrice === 0) { setStep(8); return; }

      // Paid - go to payment step
      setStep(7);
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Payment ────────────────────────────────────────────────────────────────

  async function initiatePayment() {
    setSubmitting(true);
    setSubmitError("");
    try {
      await loadRazorpay();
      const res  = await fetch("/api/it-run/payment/create-order", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ registrationId: regId }),
      });
      const data = await res.json();
      if (!res.ok) { setSubmitError(data.error ?? "Could not create payment"); return; }

      const rz = new window.Razorpay({
        key:         data.key,
        amount:      data.amount,
        currency:    "INR",
        order_id:    data.orderId,
        name:        "Connected Steps",
        description: `The IT Run Sprint-2 - ${selectedCat?.name ?? "Registration"}`,
        image:       "/logo.png",
        prefill: {
          email: participants[0]?.email,
          contact: participants[0]?.mobile,
          name: `${participants[0]?.firstName ?? ""} ${participants[0]?.lastName ?? ""}`.trim(),
        },
        theme: { color: "#e8620a" },
        handler: async (response: Record<string, string>) => {
          await verifyPayment(response.razorpay_payment_id, response.razorpay_order_id, response.razorpay_signature);
        },
        modal: {
          ondismiss: () => { setSubmitting(false); },
        },
      });
      rz.open();
    } catch {
      setSubmitError("Payment setup failed. Please try again.");
      setSubmitting(false);
    }
  }

  async function verifyPayment(paymentId: string, orderId: string, signature: string) {
    try {
      const res  = await fetch("/api/it-run/payment/verify", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ registrationId: regId, paymentId, orderId, signature }),
      });
      const data = await res.json();
      if (!res.ok) { setSubmitError(data.error ?? "Payment verification failed"); return; }
      setPaymentDone(true);
      setStep(8);
    } catch {
      setSubmitError("Verification failed. Contact support if payment was deducted.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Coupon validation ──────────────────────────────────────────────────────

  async function validateCoupon() {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError("");
    try {
      const res  = await fetch("/api/it-run/coupons/validate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ code: couponCode.trim().toUpperCase(), categoryId: selectedCat!.id, amount: finalPrice }),
      });
      const data = await res.json();
      if (!res.ok) { setCouponError(data.error ?? "Invalid coupon"); return; }
      setCoupon(data);
    } catch {
      setCouponError("Failed to validate coupon");
    } finally {
      setCouponLoading(false);
    }
  }

  // ── Price calculation ──────────────────────────────────────────────────────

  const basePrice  = selectedCat?.price_rupees ?? 0;
  const discount   = coupon?.discount ?? 0;
  const finalPrice = Math.max(0, basePrice - discount);

  // ── Render steps ──────────────────────────────────────────────────────────

  const containerStyle: React.CSSProperties = {
    maxWidth: 700, margin: "0 auto",
    padding: "clamp(1rem,4vw,2rem)",
    paddingTop: "calc(64px + clamp(1rem,4vw,2rem))",
    minHeight: "100vh",
  };

  const sectionTitle: React.CSSProperties = { fontSize: "clamp(20px,3vw,26px)", fontWeight: 800, color: "#fff", marginBottom: 8 };
  const sectionSub:   React.CSSProperties = { fontSize: 14, color: "#888", marginBottom: 28, lineHeight: 1.6 };

  return (
    <div style={{ background: PAGE_BG, color: "#fff", fontFamily: "'Inter',system-ui,sans-serif", minHeight: "100vh" }}>

      {/* Nav */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: "rgba(8,8,8,0.97)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)", height: 64, display: "flex", alignItems: "center", padding: "0 clamp(1rem,4vw,2rem)", justifyContent: "space-between" }}>
        <Link href="/it-run" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <Image src="/logo.png" alt="" width={28} height={28} style={{ borderRadius: "50%" }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>The IT Run Sprint-2</div>
            <div style={{ fontSize: 10, color: "#888" }}>Registration</div>
          </div>
        </Link>
        {step < 8 && (
          <Link href="/it-run" style={{ fontSize: 13, color: "#888", textDecoration: "none" }}>Cancel</Link>
        )}
      </nav>

      <div style={containerStyle}>

        {/* Step 1: Select Category */}
        {step === 1 && (
          <div>
            {loadingCats ? (
              <div style={{ textAlign: "center", padding: 80, color: "#888" }}>Loading categories...</div>
            ) : (
              <>
                <div style={{ marginBottom: 32 }}>
                  <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Step 1 of 7</div>
                  <h1 style={sectionTitle}>Choose Your Race Category</h1>
                  <p style={sectionSub}>Select the category that matches your challenge level. Prices are per booking.</p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {categories.map(cat => (
                    <button key={cat.id} onClick={() => selectCategory(cat)}
                      style={{
                        ...CARD,
                        padding: 20,
                        background: selectedCat?.id === cat.id ? `rgba(232,98,10,0.08)` : "rgba(255,255,255,0.03)",
                        border: selectedCat?.id === cat.id ? `1px solid ${cat.color}` : "1px solid rgba(255,255,255,0.08)",
                        cursor: "pointer",
                        textAlign: "left",
                        width: "100%",
                        transition: "all 0.2s",
                        fontFamily: "inherit",
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = cat.color ?? ACCENT; }}
                      onMouseLeave={e => { if (selectedCat?.id !== cat.id) (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)"; }}>
                      <div style={{ fontSize: "clamp(24px,4vw,32px)", fontWeight: 900, color: cat.color ?? ACCENT, minWidth: 80, lineHeight: 1 }}>
                        {cat.distance_km < 2 ? "1.5 KM" : `${cat.distance_km} KM`}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 2 }}>{cat.name}</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                          {cat.includes_timing  && <span style={{ fontSize: 10, color: "#ccc", background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 4 }}>Chip Timing</span>}
                          {cat.includes_medal   && <span style={{ fontSize: 10, color: "#ccc", background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 4 }}>Medal</span>}
                          {cat.includes_tshirt  && <span style={{ fontSize: 10, color: "#ccc", background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 4 }}>T-Shirt</span>}
                          {cat.category_type === "duo" && <span style={{ fontSize: 10, color: "#a78bfa", background: "rgba(167,139,250,0.1)", padding: "2px 6px", borderRadius: 4 }}>2 Runners</span>}
                          {cat.category_type === "kid" && <span style={{ fontSize: 10, color: "#ec4899", background: "rgba(236,72,153,0.1)", padding: "2px 6px", borderRadius: 4 }}>Parent + Child</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: "clamp(18px,3vw,22px)", fontWeight: 900, color: cat.color ?? ACCENT }}>Rs.{cat.price_rupees}</div>
                        {cat.category_type === "duo" && <div style={{ fontSize: 11, color: "#888" }}>for 2</div>}
                        {cat.category_type === "kid" && <div style={{ fontSize: 11, color: "#888" }}>parent+child</div>}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 2: Confirm participant count */}
        {step === 2 && selectedCat && (
          <div>
            <StepBar step={2} />
            <h2 style={sectionTitle}>Confirm Your Booking</h2>
            <p style={sectionSub}>You are registering for <strong style={{ color: "#fff" }}>{selectedCat.name}</strong>.</p>

            <div style={{ ...CARD, padding: 24, marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{selectedCat.name}</div>
                  <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
                    {selectedCat.distance_km < 2 ? "1.5 KM" : `${selectedCat.distance_km} KM`}
                    {selectedCat.category_type === "duo" && " - 2 runners included"}
                    {selectedCat.category_type === "kid" && " - Parent + Child"}
                  </div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: selectedCat.color ?? ACCENT }}>Rs.{selectedCat.price_rupees}</div>
              </div>
              {[
                selectedCat.includes_timing  && "Chip Timing",
                selectedCat.includes_medal   && "Finisher Medal",
                selectedCat.includes_tshirt  && "Dry-fit T-Shirt",
                selectedCat.includes_certificate && "Digital Certificate",
              ].filter(Boolean).map(item => (
                <div key={item as string} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#ccc", marginBottom: 4 }}>
                  <span style={{ color: ACCENT, fontSize: 14 }}>+</span> {item}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button onClick={() => setStep(1)} style={GHOST}>Back</button>
              <button onClick={() => setStep(3)} style={PRIMARY}>Fill Participant Details</button>
            </div>
          </div>
        )}

        {/* Step 3: Participant Details */}
        {step === 3 && selectedCat && (
          <div>
            <StepBar step={3} />
            <h2 style={sectionTitle}>Participant Details</h2>
            <p style={sectionSub}>
              {selectedCat.category_type === "duo" ? "Fill details for both runners." :
               selectedCat.category_type === "kid" ? "Fill details for parent and child. Child must be age 10 or younger." :
               "Fill your personal details carefully. These will appear on your BIB and certificate."}
            </p>

            {participants.map((p, idx) => (
              <ParticipantForm
                key={idx} idx={idx}
                type={pType(idx) as string}
                data={p}
                onChange={(field, val) => updateParticipant(idx, field, val)}
                errors={pErrors[idx] ?? {}}
                isChild={isChild(idx)}
              />
            ))}

            {submitError && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 16 }}>{submitError}</div>}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button onClick={() => setStep(2)} style={GHOST}>Back</button>
              <button onClick={() => { if (validateParticipants()) setStep(4); }} style={PRIMARY}>Continue to Company Verification</button>
            </div>
          </div>
        )}

        {/* Step 4: Company Verification */}
        {step === 4 && selectedCat && (
          <div>
            <StepBar step={4} />
            <h2 style={sectionTitle}>Company Verification</h2>
            <p style={sectionSub}>Upload your company ID or employee card. This verifies you are an IT professional. Our team reviews within 24 hours. Verified participants skip physical verification at BIB collection.</p>

            <div style={{ ...CARD, padding: 20, marginBottom: 16, border: "1px solid rgba(232,98,10,0.2)", background: "rgba(232,98,10,0.05)" }}>
              <div style={{ fontSize: 13, color: "#e8620a", fontWeight: 600, marginBottom: 4 }}>What to upload</div>
              <div style={{ fontSize: 13, color: "#ccc", lineHeight: 1.7 }}>
                Company ID card, Employee card, or Offer Letter showing company name. A photo of yourself holding the ID is also acceptable.
              </div>
            </div>

            {participants.filter((_, idx) => !isChild(idx)).map((p, idx) => (
              <div key={idx} style={{ ...CARD, padding: 20, marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: ACCENT, fontWeight: 700, marginBottom: 12 }}>
                  {selectedCat.category_type === "duo" ? idx === 0 ? "Runner 1" : "Runner 2" : "Your Company ID"}
                  {" - "}
                  {p.companyName || "Company not specified"}
                </div>

                {p.companyIdUrl && p.companyIdUrl !== "error" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 10 }}>
                    <span style={{ color: "#10b981", fontSize: 20 }}>&#10003;</span>
                    <div>
                      <div style={{ fontSize: 13, color: "#10b981", fontWeight: 600 }}>ID uploaded successfully</div>
                      <button onClick={() => updateParticipant(idx, "companyIdUrl", "")} style={{ background: "none", border: "none", color: "#888", fontSize: 12, cursor: "pointer", padding: 0, marginTop: 2, fontFamily: "inherit" }}>
                        Upload a different file
                      </button>
                    </div>
                  </div>
                ) : (
                  <label style={{
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    padding: 32, border: "2px dashed rgba(255,255,255,0.15)", borderRadius: 12,
                    cursor: "pointer", gap: 8, textAlign: "center",
                    background: "rgba(255,255,255,0.02)", transition: "border-color 0.2s",
                  }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(232,98,10,0.4)")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)")}>
                    {uploading.includes(idx) ? (
                      <div style={{ fontSize: 14, color: "#888" }}>Uploading...</div>
                    ) : (
                      <>
                        <div style={{ fontSize: 28 }}>&#8679;</div>
                        <div style={{ fontSize: 14, color: "#ccc", fontWeight: 600 }}>Click to upload Company ID</div>
                        <div style={{ fontSize: 12, color: "#666" }}>JPG, PNG or PDF, max 5 MB</div>
                      </>
                    )}
                    <input type="file" accept="image/*,.pdf" style={{ display: "none" }}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) { updateParticipant(idx, "companyIdFile", file); uploadCompanyId(idx, file); }
                      }} />
                  </label>
                )}
                {p.companyIdUrl === "error" && (
                  <div style={{ fontSize: 12, color: "#f87171", marginTop: 8 }}>Upload failed. Please try again.</div>
                )}
              </div>
            ))}

            <div style={{ ...CARD, padding: 16, border: "1px solid rgba(255,255,255,0.06)", marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: "#888", lineHeight: 1.7 }}>
                <strong style={{ color: "#ccc" }}>Note:</strong> You can proceed without uploading. However, unverified participants must carry their original company ID to the BIB collection counter for physical verification.
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button onClick={() => setStep(3)} style={GHOST}>Back</button>
              <button onClick={() => setStep(5)} style={PRIMARY}>Review Registration</button>
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {step === 5 && selectedCat && (
          <div>
            <StepBar step={5} />
            <h2 style={sectionTitle}>Review Your Registration</h2>
            <p style={sectionSub}>Please verify all details before proceeding. You cannot edit after payment.</p>

            <div style={{ ...CARD, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Category</div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{selectedCat.name}</div>
                  <div style={{ fontSize: 13, color: "#888" }}>{selectedCat.distance_km} KM</div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: selectedCat.color ?? ACCENT }}>Rs.{selectedCat.price_rupees}</div>
              </div>
            </div>

            {participants.map((p, idx) => (
              <div key={idx} style={{ ...CARD, padding: 20, marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
                  {selectedCat.category_type === "solo" ? "Participant" :
                   selectedCat.category_type === "duo" ? (idx === 0 ? "Runner 1" : "Runner 2") :
                   idx === 0 ? "Parent" : "Child"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "8px 16px" }}>
                  {[
                    ["Name",    `${p.firstName} ${p.lastName}`],
                    ["Gender",  p.gender],
                    ["DOB",     p.dob],
                    ["Email",   p.email],
                    ["Mobile",  p.mobile],
                    ["Blood",   p.bloodGroup],
                    ["T-Shirt", p.tshirtSize],
                    ...(!isChild(idx) ? [["Company", p.companyName], ["Emergency", `${p.emergencyName} - ${p.emergencyPhone}`]] : []),
                  ].filter((x): x is string[] => Array.isArray(x)).map(([label, value]) => (
                    <div key={label as string}>
                      <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label as string}</div>
                      <div style={{ fontSize: 13, color: "#ccc", marginTop: 2 }}>{value as string || "-"}</div>
                    </div>
                  ))}
                </div>
                {!isChild(idx) && p.companyIdUrl && p.companyIdUrl !== "error" && (
                  <div style={{ fontSize: 12, color: "#10b981", marginTop: 8 }}>Company ID: Uploaded</div>
                )}
              </div>
            ))}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button onClick={() => setStep(4)} style={GHOST}>Back</button>
              <button onClick={() => setStep(6)} style={PRIMARY}>Proceed to Coupon</button>
            </div>
          </div>
        )}

        {/* Step 6: Coupon */}
        {step === 6 && selectedCat && (
          <div>
            <StepBar step={6} />
            <h2 style={sectionTitle}>Have a Coupon?</h2>
            <p style={sectionSub}>Apply a discount coupon to your registration. You can also skip this step.</p>

            <div style={{ ...CARD, padding: 24, marginBottom: 24 }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <input
                  style={{ ...INPUT_S, flex: 1, textTransform: "uppercase" }}
                  placeholder="Enter coupon code"
                  value={couponCode}
                  onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCoupon(null); setCouponError(""); }}
                  onKeyDown={e => e.key === "Enter" && validateCoupon()}
                />
                <button onClick={validateCoupon} disabled={couponLoading || !couponCode.trim()}
                  style={{ ...PRIMARY, opacity: (couponLoading || !couponCode.trim()) ? 0.5 : 1, flexShrink: 0 }}>
                  {couponLoading ? "..." : "Apply"}
                </button>
              </div>
              {couponError && <div style={{ fontSize: 13, color: "#f87171" }}>{couponError}</div>}
              {coupon && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 10 }}>
                  <span style={{ color: "#10b981", fontSize: 18, fontWeight: 700 }}>-Rs.{coupon.discount}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: "#10b981", fontWeight: 600 }}>{coupon.label} applied!</div>
                    <div style={{ fontSize: 12, color: "#888" }}>Code: {coupon.code}</div>
                  </div>
                  <button onClick={() => { setCoupon(null); setCouponCode(""); }} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 18, fontFamily: "inherit" }}>x</button>
                </div>
              )}
            </div>

            {/* Price summary */}
            <div style={{ ...CARD, padding: 20, marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Order Summary</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#ccc", marginBottom: 8 }}>
                <span>{selectedCat.name}</span>
                <span>Rs.{basePrice}</span>
              </div>
              {coupon && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#10b981", marginBottom: 8 }}>
                  <span>Coupon ({coupon.code})</span>
                  <span>- Rs.{discount}</span>
                </div>
              )}
              <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "12px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 800, color: "#fff" }}>
                <span>Total</span>
                <span style={{ color: ACCENT }}>Rs.{finalPrice}</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button onClick={() => setStep(5)} style={GHOST}>Back</button>
              <button onClick={submitRegistration} disabled={submitting} style={{ ...PRIMARY, opacity: submitting ? 0.6 : 1 }}>
                {submitting ? "Processing..." : finalPrice === 0 ? "Complete Registration (Free)" : "Proceed to Payment"}
              </button>
            </div>
            {submitError && <div style={{ color: "#f87171", fontSize: 13, marginTop: 12 }}>{submitError}</div>}
          </div>
        )}

        {/* Step 7: Payment */}
        {step === 7 && selectedCat && (
          <div>
            <StepBar step={7} />
            <h2 style={sectionTitle}>Complete Payment</h2>
            <p style={sectionSub}>Your registration has been saved. Complete payment to confirm your spot.</p>

            <div style={{ ...CARD, padding: 24, marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Registration Saved</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 14, color: "#ccc" }}>Registration Code</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "0.05em", marginTop: 4 }}>{regCode}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: "#888" }}>Amount Due</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: ACCENT }}>Rs.{finalPrice}</div>
                </div>
              </div>
            </div>

            <div style={{ ...CARD, padding: 16, marginBottom: 24, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 12, color: "#888", lineHeight: 1.7 }}>
                Your spot is reserved for 15 minutes. Complete payment now to avoid losing it. We accept UPI, Cards, Net Banking, and Wallets.
              </div>
            </div>

            <button onClick={initiatePayment} disabled={submitting}
              style={{ ...PRIMARY, width: "100%", justifyContent: "center", display: "flex", alignItems: "center", gap: 10, fontSize: 16, padding: "16px 28px", opacity: submitting ? 0.6 : 1 }}>
              {submitting ? "Opening Payment..." : `Pay Rs.${finalPrice} Now`}
            </button>
            {submitError && <div style={{ color: "#f87171", fontSize: 13, marginTop: 12 }}>{submitError}</div>}
          </div>
        )}

        {/* Step 8: Success */}
        {step === 8 && (
          <div style={{ textAlign: "center", paddingTop: 40 }}>
            <div style={{
              width: 80, height: 80, margin: "0 auto 24px",
              background: "rgba(16,185,129,0.1)",
              border: "2px solid rgba(16,185,129,0.3)",
              borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 36, animation: "popIn 0.5s ease",
            }}>
              &#10003;
            </div>
            <h1 style={{ fontSize: "clamp(24px,4vw,36px)", fontWeight: 900, color: "#fff", marginBottom: 8 }}>
              {paymentDone ? "Payment Confirmed!" : "Registration Complete!"}
            </h1>
            <p style={{ fontSize: 16, color: "#888", marginBottom: 8 }}>
              You are registered for <strong style={{ color: "#fff" }}>The IT Run Sprint-2</strong>
            </p>
            <p style={{ fontSize: 14, color: "#666", marginBottom: 32 }}>
              Check your email for confirmation, QR code, and invoice.
            </p>

            <div style={{ ...CARD, padding: 24, marginBottom: 24, textAlign: "left", display: "inline-block", width: "100%", maxWidth: 400 }}>
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Registration Code</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: ACCENT, letterSpacing: "0.08em" }}>{regCode}</div>
              </div>
              <div style={{ fontSize: 12, color: "#666", textAlign: "center" }}>Save this code. You will need it to access your participant dashboard and book your BIB collection slot.</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 24 }}>
              {[
                { icon: "&#128231;", label: "Confirmation Email", note: "Sent to your email" },
                { icon: "&#128196;", label: "QR Code & Invoice",  note: "In confirmation email" },
                { icon: "&#127987;", label: "BIB Collection",     note: "Book slot from dashboard" },
              ].map(item => (
                <div key={item.label} style={{ ...CARD, padding: 16, textAlign: "center" }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }} dangerouslySetInnerHTML={{ __html: item.icon }} />
                  <div style={{ fontSize: 13, color: "#fff", fontWeight: 600, marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: "#888" }}>{item.note}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <Link href={`/it-run/dashboard/${regCode}`} style={PRIMARY}>View My Dashboard</Link>
              <Link href="/it-run" style={GHOST}>Back to Event</Link>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes popIn { 0%{transform:scale(0.5);opacity:0} 80%{transform:scale(1.1)} 100%{transform:scale(1);opacity:1} }
        * { box-sizing: border-box; }
        input:focus, select:focus, textarea:focus { border-color: rgba(232,98,10,0.5) !important; }
      `}</style>
    </div>
  );
}
