"use client";

import { useEffect, useRef, useState } from "react";

// Register a participant on someone's behalf. The server applies every registration rule (window, capacity, pricing,
// duplicates, age and field checks). Nothing here is trusted: payment is never marked paid from this form.

interface ParticipantLabel {
  role: string;
  label: string;
  is_child: boolean;
  tshirt_sizes: string[];
}
interface Category {
  id: string;
  name: string;
  distance_km: number;
  category_type: "solo" | "duo" | "kid";
  price_rupees: number;
  is_timed: boolean;
  is_soldout: boolean;
  participant_labels: ParticipantLabel[];
}
interface EventConfig { categories: Category[] }

interface Person {
  firstName: string; lastName: string; bibName: string; gender: string; dob: string;
  email: string; altEmail: string; mobile: string; bloodGroup: string;
  emergencyName: string; emergencyPhone: string; companyName: string; employeeId: string;
  tshirtSize: string; medicalConditions: string; foodPreference: string;
}

interface AppliedCoupon { id: string; code: string; discount: number; label: string }

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const FOOD = [{ value: "veg", label: "Vegetarian" }, { value: "non-veg", label: "Non-vegetarian" }, { value: "vegan", label: "Vegan" }];
const WAIVER_MIN = 10;
const WAIVER_MAX = 300;

const emptyPerson = (): Person => ({
  firstName: "", lastName: "", bibName: "", gender: "", dob: "", email: "", altEmail: "", mobile: "",
  bloodGroup: "", emergencyName: "", emergencyPhone: "", companyName: "", employeeId: "",
  tshirtSize: "", medicalConditions: "", foodPreference: "veg",
});

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID().replace(/-/g, "")
  : Math.random().toString(36).slice(2) + Date.now().toString(36));

const S = {
  card: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "16px 18px" },
  label: { display: "block", fontSize: 12, color: "#aaa", marginBottom: 4 },
  input: {
    width: "100%", minWidth: 0, boxSizing: "border-box" as const, padding: "9px 10px", borderRadius: 8, fontSize: 14,
    background: "#0b0b0b", color: "#fff", border: "1px solid rgba(255,255,255,0.15)", fontFamily: "inherit",
  },
};

export default function ManualRegistrationPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadError, setLoadError] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [complimentary, setComplimentary] = useState(false);
  const [waiverReason, setWaiverReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ registrationCode: string; dashboardUrl: string; finalPrice: number } | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [couponError, setCouponError] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  // One key per form: a retried submit returns the registration it already made instead of creating another
  const keyRef = useRef(newKey());

  useEffect(() => {
    fetch("/api/it-run/event-config", { cache: "no-store" })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then((d: EventConfig) => setCategories(d.categories ?? []))
      .catch(() => setLoadError("We couldn't load the categories. Refresh the page to try again."));
  }, []);

  const category = categories.find(c => c.id === categoryId) ?? null;

  function chooseCategory(id: string) {
    const cat = categories.find(c => c.id === id);
    setCategoryId(id);
    setResult(null);
    setError("");
    setCoupon(null);
    setCouponError("");
    setCouponCode("");
    setPeople(cat ? cat.participant_labels.map(() => emptyPerson()) : []);
  }

  function update(idx: number, field: keyof Person, value: string) {
    setPeople(prev => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  }

  // The price the coupon is checked against: one price per runner when solo, one price for a whole pair or team
  function bookingAmount(): number {
    if (!category) return 0;
    return category.category_type === "solo" ? category.price_rupees * people.length : category.price_rupees;
  }

  async function applyCoupon() {
    if (!category || couponBusy) return;
    const code = couponCode.trim().toUpperCase();
    if (!code) { setCouponError("Enter a discount code."); return; }
    setCouponBusy(true);
    setCouponError("");
    try {
      const res = await fetch("/api/it-run/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, categoryId: category.id, amount: bookingAmount() }),
      });
      const data = await res.json().catch(() => ({})) as Partial<AppliedCoupon> & { error?: string };
      if (!res.ok || !data.id) {
        setCoupon(null);
        setCouponError(data.error ?? "That code can't be used for this registration.");
        return;
      }
      setCoupon({ id: data.id, code: data.code ?? code, discount: data.discount ?? 0, label: data.label ?? "" });
      setComplimentary(false);
    } catch {
      setCouponError("Couldn't check the code. Try again.");
    } finally {
      setCouponBusy(false);
    }
  }

  function removeCoupon() {
    setCoupon(null);
    setCouponCode("");
    setCouponError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!category || submitting) return;
    if (complimentary && coupon) {
      setError("A complimentary registration can't also use a discount code. Remove the code to continue.");
      return;
    }
    if (complimentary && (waiverReason.trim().length < WAIVER_MIN || waiverReason.trim().length > WAIVER_MAX)) {
      setError(`Give the reason for the complimentary registration (${WAIVER_MIN} to ${WAIVER_MAX} characters).`);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const participants = people.map((p, idx) => ({
        type: category.participant_labels[idx]?.role ?? "solo",
        firstName: p.firstName, lastName: p.lastName, bibName: p.bibName,
        gender: p.gender, dob: p.dob, email: p.email, altEmail: p.altEmail || null, mobile: p.mobile,
        bloodGroup: p.bloodGroup, emergencyName: p.emergencyName, emergencyPhone: p.emergencyPhone,
        companyName: p.companyName, employeeId: p.employeeId,
        // No ID document here: the participant can add one from their dashboard, as on the public form
        companyIdUrl: "", tshirtSize: p.tshirtSize, medicalConditions: p.medicalConditions, foodPreference: p.foodPreference,
        categoryId: category.id,
      }));
      const res = await fetch("/api/it-run/admin/manual-registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: category.id,
          participants,
          idempotencyKey: keyRef.current,
          complimentary,
          couponId: complimentary ? null : (coupon?.id ?? null),
          waiverReason: complimentary ? waiverReason.trim() : undefined,
        }),
      });
      const data = await res.json().catch(() => ({})) as {
        error?: string; field?: string; participant_index?: number; registrationCode?: string; dashboardUrl?: string; finalPrice?: number;
      };
      if (!res.ok) {
        const where = typeof data.participant_index === "number" ? `Participant ${data.participant_index + 1}: ` : "";
        setError(where + (data.error ?? "The registration couldn't be saved. Please try again."));
        return;
      }
      setResult({ registrationCode: data.registrationCode ?? "", dashboardUrl: data.dashboardUrl ?? "", finalPrice: data.finalPrice ?? 0 });
      keyRef.current = newKey();
    } catch {
      setError("Network error. Check the connection and submit again. The form won't create a second registration.");
    } finally {
      setSubmitting(false);
    }
  }

  function startAnother() {
    keyRef.current = newKey();
    setResult(null);
    setCategoryId("");
    setPeople([]);
    setComplimentary(false);
    setWaiverReason("");
    setError("");
    setCoupon(null);
    setCouponCode("");
    setCouponError("");
  }

  return (
    <div style={{ padding: "8px 4px", color: "#fff", maxWidth: 820 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 4px" }}>Register a participant</h1>
      <p style={{ fontSize: 13, color: "#888", margin: "0 0 18px", lineHeight: 1.5 }}>
        For participants who contact the team or can&apos;t register online. The registration is recorded as created by you.
        Payment is not taken here: the participant pays through their dashboard link.
      </p>

      {loadError && <div role="alert" style={{ color: "#fca5a5", marginBottom: 14 }}>{loadError}</div>}

      {result ? (
        <div style={{ ...S.card, borderColor: "rgba(52,211,153,0.5)" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#34d399" }}>Registration created</div>
          <div style={{ fontSize: 14, marginTop: 8 }}>Code: <strong>{result.registrationCode}</strong></div>
          <div style={{ fontSize: 14, marginTop: 6 }}>
            {result.finalPrice === 0
              ? "Complimentary: no payment is due."
              : `Amount due: ₹${result.finalPrice.toLocaleString("en-IN")}. Share the dashboard link so the participant can pay.`}
          </div>
          {result.dashboardUrl && (
            <div style={{ marginTop: 10, fontSize: 13, wordBreak: "break-all" as const, color: "#aaa" }}>{result.dashboardUrl}</div>
          )}
          <button type="button" onClick={startAnother} style={{ marginTop: 14, padding: "9px 14px", borderRadius: 8, background: "#e8620a", color: "#fff", border: "none", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Register another participant
          </button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <div style={{ ...S.card, marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>1. Category</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
              {categories.map(c => (
                <button
                  key={c.id}
                  type="button"
                  disabled={c.is_soldout}
                  onClick={() => chooseCategory(c.id)}
                  aria-pressed={categoryId === c.id}
                  style={{
                    textAlign: "left" as const, padding: "10px 12px", borderRadius: 10, fontFamily: "inherit",
                    background: categoryId === c.id ? "rgba(232,98,10,0.15)" : "transparent",
                    border: `1px solid ${categoryId === c.id ? "#e8620a" : "rgba(255,255,255,0.15)"}`,
                    color: "#fff", cursor: c.is_soldout ? "not-allowed" : "pointer", opacity: c.is_soldout ? 0.5 : 1,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                    {c.distance_km} KM · {c.participant_labels.length > 1 ? "Pair" : "Individual"} · ₹{c.price_rupees.toLocaleString("en-IN")}
                    {c.is_soldout ? " · Sold out" : ""}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {category && people.map((p, idx) => {
            const label = category.participant_labels[idx];
            const child = label?.is_child ?? false;
            return (
              <div key={idx} style={{ ...S.card, marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
                  {label?.label ?? "Participant"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
                  <Field label="First name *"><input style={S.input} value={p.firstName} onChange={e => update(idx, "firstName", e.target.value)} /></Field>
                  <Field label="Last name *"><input style={S.input} value={p.lastName} onChange={e => update(idx, "lastName", e.target.value)} /></Field>
                  <Field label="Name on BIB *"><input style={S.input} value={p.bibName} onChange={e => update(idx, "bibName", e.target.value)} /></Field>
                  <Field label="Gender *">
                    <select style={S.input} value={p.gender} onChange={e => update(idx, "gender", e.target.value)}>
                      <option value="">Select</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other / Non-binary</option>
                    </select>
                  </Field>
                  <Field label="Date of birth *"><input type="date" style={S.input} value={p.dob} onChange={e => update(idx, "dob", e.target.value)} /></Field>
                  <Field label={child ? "Email (optional)" : "Email *"}><input type="email" style={S.input} value={p.email} onChange={e => update(idx, "email", e.target.value)} /></Field>
                  <Field label="Alternative email (optional)"><input type="email" style={S.input} value={p.altEmail} onChange={e => update(idx, "altEmail", e.target.value)} /></Field>
                  <Field label="Mobile *"><input type="tel" inputMode="numeric" style={S.input} value={p.mobile} onChange={e => update(idx, "mobile", e.target.value)} /></Field>
                  <Field label="Blood group *">
                    <select style={S.input} value={p.bloodGroup} onChange={e => update(idx, "bloodGroup", e.target.value)}>
                      <option value="">Select</option>
                      {BLOOD_GROUPS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </Field>
                  <Field label="T-shirt size *">
                    <select style={S.input} value={p.tshirtSize} onChange={e => update(idx, "tshirtSize", e.target.value)}>
                      <option value="">Select</option>
                      {(label?.tshirt_sizes ?? []).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Food preference">
                    <select style={S.input} value={p.foodPreference} onChange={e => update(idx, "foodPreference", e.target.value)}>
                      {FOOD.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </Field>
                  {!child && (
                    <>
                      <Field label="Emergency contact name *"><input style={S.input} value={p.emergencyName} onChange={e => update(idx, "emergencyName", e.target.value)} /></Field>
                      <Field label="Emergency contact phone *"><input type="tel" inputMode="numeric" style={S.input} value={p.emergencyPhone} onChange={e => update(idx, "emergencyPhone", e.target.value)} /></Field>
                      <Field label="Company name *"><input style={S.input} value={p.companyName} onChange={e => update(idx, "companyName", e.target.value)} /></Field>
                      <Field label="Employee ID (optional)"><input style={S.input} value={p.employeeId} onChange={e => update(idx, "employeeId", e.target.value)} /></Field>
                    </>
                  )}
                  <div style={{ gridColumn: "1 / -1" }}>
                    <Field label="Medical conditions (optional)"><input style={S.input} value={p.medicalConditions} onChange={e => update(idx, "medicalConditions", e.target.value)} /></Field>
                  </div>
                </div>
              </div>
            );
          })}

          {category && (
            <div style={{ ...S.card, marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>3. Payment</div>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, marginBottom: 10, cursor: "pointer" }}>
                <input type="radio" name="pay" checked={!complimentary} onChange={() => setComplimentary(false)} style={{ marginTop: 3 }} />
                <span>Payment pending. The participant pays through their dashboard link.</span>
              </label>
              <div style={{ marginBottom: 12 }}>
                <span style={{ display: "block", fontSize: 12, color: "#aaa", marginBottom: 6 }}>Discount code (optional)</span>
                {coupon ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const, fontSize: 14 }}>
                    <strong>{coupon.code}</strong>
                    <span style={{ color: "#34d399" }}>−₹{coupon.discount.toLocaleString("en-IN")}</span>
                    <button type="button" onClick={removeCoupon} style={{ background: "transparent", border: "none", color: "#aaa", textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>Remove</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                    <input
                      style={{ ...S.input, width: "auto", flex: "1 1 160px" }}
                      value={couponCode}
                      onChange={e => setCouponCode(e.target.value.toUpperCase())}
                      placeholder="Code"
                      aria-label="Discount code"
                    />
                    <button type="button" onClick={applyCoupon} disabled={couponBusy} style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                      {couponBusy ? "Checking…" : "Apply"}
                    </button>
                  </div>
                )}
                {couponError && <div role="alert" style={{ color: "#fca5a5", fontSize: 13, marginTop: 6 }}>{couponError}</div>}
              </div>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, cursor: coupon ? "not-allowed" : "pointer", opacity: coupon ? 0.5 : 1 }}>
                <input type="radio" name="pay" checked={complimentary} disabled={!!coupon} onChange={() => setComplimentary(true)} style={{ marginTop: 3 }} />
                <span>Complimentary: no payment. This needs a reason, and it is recorded with your name.</span>
              </label>
              {complimentary && (
                <div style={{ marginTop: 12 }}>
                  <Field label={`Reason (${WAIVER_MIN} to ${WAIVER_MAX} characters) *`}>
                    <textarea
                      style={{ ...S.input, minHeight: 70, resize: "vertical" as const }}
                      maxLength={WAIVER_MAX}
                      value={waiverReason}
                      onChange={e => setWaiverReason(e.target.value)}
                    />
                  </Field>
                </div>
              )}
            </div>
          )}

          {error && <div role="alert" style={{ color: "#fca5a5", fontSize: 14, marginBottom: 12, lineHeight: 1.5 }}>{error}</div>}

          {category && (
            <button
              type="submit"
              disabled={submitting}
              style={{
                width: "100%", maxWidth: 360, padding: "12px 16px", borderRadius: 10, border: "none", fontFamily: "inherit",
                background: "#e8620a", color: "#fff", fontWeight: 800, fontSize: 15, cursor: submitting ? "wait" : "pointer", opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? "Saving…" : "Create registration"}
            </button>
          )}
        </form>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <span style={{ display: "block", fontSize: 12, color: "#aaa", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}
