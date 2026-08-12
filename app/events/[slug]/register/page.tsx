"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { isTokenValid, handleAuthExpiry } from "@/lib/client-auth";
import { getDistanceOption } from "@/lib/event-distances";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FieldCondition {
  field_key: string; operator: "equals" | "not_equals" | "contains" | "is_empty" | "is_not_empty"; value: string;
}

interface EventFormField {
  id: string; field_key: string; field_type: string; label: string;
  placeholder: string | null; help_text: string | null; required: boolean;
  options: string[]; display_order: number;
  conditions: FieldCondition[]; default_value: string | null;
  max_length: number | null; min_length: number | null;
  validation_pattern: string | null; validation_rules: Record<string, unknown>;
  editable_after_reg: boolean; section: string | null;
  race_ids: string[];
  is_hidden: boolean; is_readonly: boolean;
}

interface RegConfig {
  require_gender:            boolean;
  require_dob:               boolean;
  require_blood_group:       boolean;
  require_emergency_contact: boolean;
  show_notes:                boolean;
  notes_label:               string;
  notes_placeholder:         string;
  multi_step:                boolean;
}

const REG_DEFAULTS: RegConfig = {
  require_gender:            true,
  require_dob:               true,
  require_blood_group:       true,
  require_emergency_contact: true,
  show_notes:                true,
  notes_label:               "Notes",
  notes_placeholder:         "Medical conditions, dietary needs, or any questions. Enter NA if none.",
  multi_step:                false,
};

function getRegConfig(raw: Partial<RegConfig> | null | undefined): RegConfig {
  return { ...REG_DEFAULTS, ...raw };
}

interface RacePerks { medal: boolean; bib: boolean; tshirt: boolean; breakfast: boolean; certificate: boolean; goodies: boolean; }

interface RaceInfo {
  id: string; name: string; distance: string;
  price: number; early_bird_price: number | null;
  price_type: string;
  min_participants: number; max_participants: number;
  max_slots: number | null; slot_reserved: number;
  reporting_time: string | null; gun_time: string | null;
  timing_chip: boolean; perks: RacePerks | null;
  gender_restriction: string | null;
  min_age: number | null; max_age: number | null;
  display_order: number; status: string;
}

interface EventInfo {
  id: string; title: string; event_type: string; start_date: string;
  start_time: string | null; location: string; price: number;
  max_participants: number | null; share_slug: string | null;
  distance_categories: string[] | null;
  collect_tshirt: boolean;
  tshirt_size_chart_url?: string | null;
  allow_multi_participant: boolean;
  max_per_registration: number;
  form_fields?: EventFormField[];
  registration_config?: Partial<RegConfig> | null;
  races?: RaceInfo[];
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

// ── Consent Checkbox ─────────────────────────────────────────────────────────

const CONSENT_TEXT = "We'd like to keep you informed about your registrations, upcoming training sessions, events, route maps, schedule changes, exclusive offers, community activities, and other Connected Steps updates through email and WhatsApp. You can update your communication preferences at any time from your profile. We will not sell your personal information or send unrelated promotional content.";

function ConsentCheckbox({ checked, onChange, showInfo, onToggleInfo }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  showInfo: boolean;
  onToggleInfo: () => void;
}) {
  return (
    <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
          style={{ marginTop: 3, accentColor: "#e8620a", flexShrink: 0 }} />
        <span style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
          I agree to receive promotional communications from Connected Steps via email and WhatsApp.
          {" "}
          <button type="button" onClick={e => { e.preventDefault(); onToggleInfo(); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.45)", fontSize: "0.82rem", padding: 0, verticalAlign: "baseline" }}>
            ℹ️
          </button>
        </span>
      </label>
      {showInfo && (
        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 6, background: "rgba(255,255,255,0.05)", fontSize: "0.78rem", color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
          {CONSENT_TEXT}
        </div>
      )}
      <p style={{ margin: "6px 0 0 26px", fontSize: "0.72rem", color: "rgba(255,255,255,0.3)" }}>
        Optional — transactional emails (registration confirmations, payment receipts, OTPs) are sent regardless.
      </p>
    </div>
  );
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
  const [registrantMode,   setRegistrantMode]   = useState<"myself" | "others" | null>(null);
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
  const [showSizeGuide,    setShowSizeGuide]    = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [showConsentInfo,  setShowConsentInfo]  = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitErr,   setSubmitErr]   = useState("");
  const [capacityFull, setCapacityFull] = useState(false);
  const [alreadyReg,  setAlreadyReg]  = useState<string | null>(null);
  const [userEmail,   setUserEmail]   = useState("");
  const [userToken,   setUserToken]   = useState("");
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [customFieldErrors, setCustomFieldErrors] = useState<Record<string, string>>({});

  // Auth guard + pre-fill
  useEffect(() => {
    const raw = localStorage.getItem("cs_user");
    if (!raw) {
      // Send to the streamlined OTP registration flow; preserve this page as return URL
      router.replace(`/auth/event-register?return=${encodeURIComponent(`/events/${slug}/register`)}`);
      return;
    }
    try {
      const u: StoredUser = JSON.parse(raw);
      if (!u.email) {
        router.replace(`/auth/event-register?return=${encodeURIComponent(`/events/${slug}/register`)}`);
        return;
      }
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
    } catch { router.replace(`/auth/event-register?return=${encodeURIComponent(`/events/${slug}/register`)}`); }
  }, [slug, router]);

  // Fetch event
  useEffect(() => {
    if (!slug) return;
    fetch(`/api/events/by-slug?slug=${slug}`)
      .then(r => r.json())
      .then(d => {
        if (d.event) {
          const fields: EventFormField[] = d.form_fields ?? [];
          const races: RaceInfo[] = d.races ?? [];
          setEv({ ...d.event, form_fields: fields, races });
          // Pre-fill default values
          const defaults: Record<string, string> = {};
          for (const f of fields) {
            if (f.default_value) defaults[f.field_key] = f.default_value;
          }
          if (Object.keys(defaults).length > 0) setCustomFieldValues(defaults);
        } else { setEvErr(true); }
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

  // When the selected race changes, initialize or clamp participant count.
  useEffect(() => {
    if (!ev || !selectedRace) return;
    const min = selectedRace.min_participants ?? 1;
    const max = Math.min(selectedRace.max_participants ?? 10, 20);
    // Group categories: snap to min when category changes so participant cards auto-generate.
    // Legacy multi / individual: clamp within [min, max].
    const target = (selectedRace.max_participants ?? 1) > 1
      ? min
      : Math.max(min, Math.min(participantCount, max));
    if (target !== participantCount) changeCount(target);
  }, [distanceCategory, ev?.id]); // eslint-disable-line

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

  function computeAge(dob: string): number {
    const birth = new Date(dob);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
    return age;
  }

  function validate(f: typeof form) {
    const cfg = getRegConfig(ev?.registration_config);
    const e: Record<string, string> = {};
    if (!f.name.trim() || f.name.trim().length < 3)   e.name = "Full name must be at least 3 characters.";
    if (!f.phone.trim() || !/^\d{10}$/.test(f.phone.replace(/\s/g, ""))) e.phone = "Phone must be exactly 10 digits.";
    if (cfg.require_gender && !f.gender)                                   e.gender = "Please select your gender.";
    if (cfg.require_dob && !f.date_of_birth)                               e.date_of_birth = "Date of birth is required.";
    else if (cfg.require_dob && f.date_of_birth && new Date(f.date_of_birth) >= new Date()) e.date_of_birth = "Date of birth must be in the past.";
    if (cfg.require_blood_group && !f.blood_group)                         e.blood_group = "Please select your blood group.";
    if (cfg.require_emergency_contact && !f.emergency_contact_name.trim()) e.emergency_contact_name = "Emergency contact name is required.";
    if (cfg.require_emergency_contact && (!f.emergency_contact_phone.trim() || !/^\d{10}$/.test(f.emergency_contact_phone.replace(/\s/g, "")))) e.emergency_contact_phone = "Emergency contact number must be 10 digits.";
    if (cfg.show_notes && !f.special_notes.trim())                         e.special_notes = "Required — enter NA if no medical conditions.";

    // Race-level age restriction (requires DOB)
    if (selectedRace && f.date_of_birth && !e.date_of_birth) {
      const age = computeAge(f.date_of_birth);
      const catLabel = selectedRace.name ?? selectedRace.distance;
      if (selectedRace.min_age !== null && age < selectedRace.min_age) {
        e.date_of_birth = `You must be at least ${selectedRace.min_age} years old for ${catLabel}.`;
      } else if (selectedRace.max_age !== null && age > selectedRace.max_age) {
        e.date_of_birth = `You must be ${selectedRace.max_age} years or younger for ${catLabel}.`;
      }
    }

    // Race-level gender restriction
    if (selectedRace?.gender_restriction && !["any", "all", null, ""].includes(selectedRace.gender_restriction) && f.gender) {
      if (f.gender !== selectedRace.gender_restriction) {
        const catLabel = selectedRace.name ?? selectedRace.distance;
        e.gender = `${catLabel} is open to ${selectedRace.gender_restriction === "male" ? "male" : "female"} participants only.`;
      }
    }

    return e;
  }

  function validateParticipant(p: ParticipantData, event: EventInfo): Record<string, string> {
    const cfg = getRegConfig(event.registration_config);
    const e: Record<string, string> = {};
    if (!p.first_name.trim())                           e.first_name = "First name is required.";
    if (cfg.require_gender && !p.gender)                e.gender = "Please select gender.";
    if (cfg.require_dob && !p.date_of_birth)            e.date_of_birth = "Date of birth is required.";
    else if (cfg.require_dob && p.date_of_birth && new Date(p.date_of_birth) >= new Date()) e.date_of_birth = "Must be in the past.";
    if (cfg.require_blood_group && !p.blood_group)      e.blood_group = "Please select blood group.";
    if (!p.mobile || !/^\d{10}$/.test(p.mobile.replace(/\s/g, ""))) e.mobile = "Phone must be exactly 10 digits.";
    const cats = event.distance_categories ?? [];
    if (cats.length > 1 && !p.distance_category) e.distance_category = "Please select a distance category.";
    if (event.collect_tshirt && !p.tshirt_size) e.tshirt_size = "Please select a T-shirt size.";

    // Race-level age/gender restrictions for this participant's chosen category
    const pCat = p.distance_category || (cats.length === 1 ? cats[0] : null);
    const pRace = pCat ? (event.races ?? []).find(r => r.distance === pCat) ?? null : null;
    if (pRace && p.date_of_birth && !e.date_of_birth) {
      const age = computeAge(p.date_of_birth);
      const catLabel = pRace.name ?? pRace.distance;
      if (pRace.min_age !== null && age < pRace.min_age) {
        e.date_of_birth = `Must be at least ${pRace.min_age} years for ${catLabel}.`;
      } else if (pRace.max_age !== null && age > pRace.max_age) {
        e.date_of_birth = `Must be ${pRace.max_age} years or younger for ${catLabel}.`;
      }
    }
    if (pRace?.gender_restriction && !["any", "all", null, ""].includes(pRace.gender_restriction) && p.gender) {
      if (p.gender !== pRace.gender_restriction) {
        const catLabel = pRace.name ?? pRace.distance;
        e.gender = `${catLabel} is for ${pRace.gender_restriction === "male" ? "male" : "female"} participants only.`;
      }
    }

    return e;
  }

  function evaluateConditions(
    conditions: FieldCondition[],
    customVals: Record<string, string>,
    builtinVals: Record<string, string>,
  ): boolean {
    if (!conditions || conditions.length === 0) return true;
    return conditions.every(c => {
      const val = customVals[c.field_key] ?? builtinVals[c.field_key] ?? "";
      switch (c.operator) {
        case "equals":       return val === c.value;
        case "not_equals":   return val !== c.value;
        case "contains":     return val.toLowerCase().includes(c.value.toLowerCase());
        case "is_empty":     return !val.trim();
        case "is_not_empty": return !!val.trim();
        default:             return true;
      }
    });
  }

  function validateCustomFields(vals: Record<string, string>) {
    const e: Record<string, string> = {};
    const builtins: Record<string, string> = {
      distance_category: distanceCategory,
      gender:            form.gender,
      blood_group:       form.blood_group,
    };
    for (const f of (ev?.form_fields ?? [])) {
      // race_ids: empty array means show for all; non-empty means only for listed races
      if (f.race_ids?.length > 0 && selectedRace && !f.race_ids.includes(selectedRace.id)) continue;
      const visible = evaluateConditions(f.conditions ?? [], vals, builtins);
      if (!visible) continue;  // skip validation for conditionally hidden fields
      if (f.required && !vals[f.field_key]?.trim()) {
        e[f.field_key] = `${f.label} is required.`;
      }
      if (f.max_length && vals[f.field_key] && vals[f.field_key].length > f.max_length) {
        e[f.field_key] = `${f.label} must be ${f.max_length} characters or fewer.`;
      }
      if (f.validation_pattern && vals[f.field_key]?.trim()) {
        try {
          if (!new RegExp(f.validation_pattern).test(vals[f.field_key])) {
            e[f.field_key] = `${f.label} format is invalid.`;
          }
        } catch { /* invalid regex — skip */ }
      }
    }
    return e;
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(f => {
      const next = { ...f, [k]: e.target.value };
      if (submitted) setErrors(validate(next));
      return next;
    });
  };

  // ── Race / pricing resolution ─────────────────────────────────────────────
  // Computed before isMulti so group-category races can trigger the multi-participant path.
  // Falls back to ev.price when no event_races rows exist (backward compat).
  const races = ev?.races ?? [];
  const selectedRace = races.find(r => r.distance === distanceCategory) ?? races[0] ?? null;
  const pricePerPerson = selectedRace?.price ?? ev?.price ?? 0;
  const selectedRaceMaxParticipants = selectedRace?.max_participants ?? ev?.max_per_registration ?? 10;
  const selectedRaceMinParticipants = selectedRace?.min_participants ?? 1;
  const isPricePerReg = selectedRace?.price_type === "per_registration";

  // A group category has max_participants > 1 on the selected race.
  // isMulti covers both group categories and the legacy event-level flag.
  const isGroupCategory = (selectedRace?.max_participants ?? 1) > 1;

  // When a group category is active, keep every participant entry's category in sync with the
  // top-level distanceCategory selector so the server always receives it on submit.
  useEffect(() => {
    if (!isGroupCategory || !distanceCategory) return;
    setParticipants(prev => prev.map(p => ({ ...p, distance_category: distanceCategory })));
  }, [distanceCategory, isGroupCategory]); // eslint-disable-line

  // ── Coupon validation ──────────────────────────────────────────────────────

  const isMulti = isGroupCategory || (ev?.allow_multi_participant ?? false) || registrantMode === "others";

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
      const evRaces = ev?.races ?? [];
      const selRace = evRaces.find(r => r.distance === distanceCategory) ?? evRaces[0] ?? null;
      const perPersonPrice = selRace?.price ?? ev?.price ?? 0;
      const perRegPrice    = selRace?.price_type === "per_registration";
      const totalPrice     = isMulti ? (perRegPrice ? perPersonPrice : perPersonPrice * participantCount) : perPersonPrice;
      const disc = data.discount_type === "percentage"
        ? Math.min(totalPrice, Math.round(totalPrice * data.discount_value / 100))
        : Math.min(totalPrice, data.discount_value);
      setCouponApplied({ id: data.coupon_id, discount: disc, label: data.description ?? coupon.toUpperCase() });
    } catch { setCouponErr("Could not validate coupon. Please try again."); }
    finally   { setCouponLoading(false); }
  }, [coupon, userEmail, ev?.id, ev?.price, ev?.races, isMulti, participantCount, distanceCategory]);

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
    // Validate custom fields
    const cfErrs = validateCustomFields(customFieldValues);
    setCustomFieldErrors(cfErrs);
    if (Object.keys(cfErrs).length > 0) {
      const firstKey = Object.keys(cfErrs)[0];
      document.getElementById(`cf-${firstKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
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
          custom_fields:     customFieldValues,
          marketing_consent: marketingConsent,
        }),
      });
      const data = await res.json();
      if (res.status === 401) { handleAuthExpiry(`/events/${slug}/register`); return; }
      if (!res.ok) {
        if (res.status === 409) setCapacityFull(true);
        setSubmitErr(data.error ?? "Registration failed."); setSubmitting(false); return;
      }
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

    // For group categories: require a category to be chosen when the event has multiple
    if (isGroupCategory && (ev.distance_categories ?? []).length > 1 && !distanceCategory) {
      setSubmitErr("Please select a category before registering.");
      return;
    }

    // Enforce min_participants for the selected race
    if (selectedRace && selectedRace.min_participants > 1 && participantCount < selectedRace.min_participants) {
      setSubmitErr(`The ${selectedRace.name ?? selectedRace.distance} category requires at least ${selectedRace.min_participants} participants.`);
      return;
    }

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
          custom_fields:     customFieldValues,
          marketing_consent: marketingConsent,
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
      if (!res.ok) {
        if (res.status === 409) setCapacityFull(true);
        setSubmitErr(data.error ?? "Registration failed."); setSubmitting(false); return;
      }
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

  const totalBeforeDisc = isMulti
    ? (isPricePerReg ? pricePerPerson : pricePerPerson * participantCount)
    : pricePerPerson;
  const regCfg          = getRegConfig(ev?.registration_config);
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

  const CouponSection = (ev?.price ?? 0) > 0 || (ev?.races ?? []).some(r => r.price > 0) ? (
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
  ) : null;

  // ── Multi-participant form ─────────────────────────────────────────────────

  if (isMulti) {
    const minPax   = selectedRaceMinParticipants;
    // In "others" mode on a solo-race event, the race cap of 1 applies per individual,
    // not per booking — override to the event-level max_per_registration (or 10).
    const maxSlots = registrantMode === "others" && !isGroupCategory
      ? Math.min(ev.max_per_registration ?? 10, 20)
      : Math.min(selectedRaceMaxParticipants || 10, 20);
    const isFixedGroup = isGroupCategory && minPax === maxSlots && minPax > 1;
    const cats         = ev.distance_categories ?? [];

    return (
      <div style={{ minHeight: "100vh", background: "#0d0d10", color: "#fff" }}>
        <nav style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(13,13,16,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 1.5rem", height: "56px", display: "flex", alignItems: "center" }}>
          <Link href={`/events/${slug}`} style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>← Event Details</Link>
        </nav>

        <div style={{ maxWidth: "640px", margin: "0 auto", padding: "2rem 1.5rem 5rem" }}>
          {EventHeader}
          {AlreadyBanner}

          {registrantMode === "others" && !isGroupCategory && !(ev?.allow_multi_participant) && (
            <div style={{ marginBottom: "1.5rem" }}>
              <button type="button" onClick={() => setRegistrantMode(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", fontSize: "0.8rem", fontFamily: "inherit", padding: 0 }}>
                ← Change who you&apos;re registering
              </button>
            </div>
          )}

          {/* Top-level category selector for group registrations */}
          {isGroupCategory && cats.length > 0 && (
            <section style={{ marginBottom: "1.75rem" }}>
              <div style={{ fontSize: "10px", color: "#e8620a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.875rem" }}>
                Category *
              </div>
              {cats.length > 1 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {cats.map(cat => {
                    const d   = getDistanceOption(cat);
                    const sel = distanceCategory === cat;
                    return (
                      <button key={cat} type="button" onClick={() => setDistanceCategory(cat)}
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
              ) : (
                <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)", padding: "8px 0" }}>{cats[0]}</div>
              )}
            </section>
          )}

          {/* Participant count selector — hidden for fixed-size groups (min === max > 1) */}
          {!isFixedGroup && (
          <section style={{ marginBottom: "1.75rem" }}>
            <div style={{ fontSize: "10px", color: "#e8620a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.875rem" }}>
              Number of Participants *
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {Array.from({ length: maxSlots - minPax + 1 }, (_, i) => minPax + i).map(n => (
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
              Each participant gets their own QR code ·{" "}
              {isPricePerReg
                ? `₹${pricePerPerson} flat per registration (${selectedRaceMinParticipants}–${maxSlots} people)`
                : `₹${pricePerPerson} per person`}
            </div>
          </section>
          )}

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
                <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "#e8620a", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: idx === 0 && registrantMode === "others" ? "0.5rem" : "1rem" }}>
                  Participant {idx + 1}{idx === 0 && registrantMode !== "others" ? " (You)" : ""}
                </div>
                {idx === 0 && registrantMode === "others" && (
                  <button type="button"
                    onClick={() => {
                      const nameParts = form.name.trim().split(/\s+/);
                      setParticipant(0, "first_name", nameParts[0] || "");
                      setParticipant(0, "last_name", nameParts.slice(1).join(" "));
                      setParticipant(0, "mobile", form.phone);
                      setParticipant(0, "email", userEmail);
                    }}
                    style={{ marginBottom: "1rem", background: "none", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", cursor: "pointer", color: "rgba(255,255,255,0.5)", fontSize: "11px", fontFamily: "inherit", padding: "4px 10px" }}>
                    Fill with my details →
                  </button>
                )}

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

                  {regCfg.require_gender && (
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
                  )}

                  {regCfg.require_dob && (
                    <div>
                      <label style={LABEL}>Date of Birth *</label>
                      <input style={{ ...INPUT, colorScheme: "dark", borderColor: multiErrors[idx]?.date_of_birth ? "rgba(239,68,68,0.6)" : undefined }}
                        type="date" value={p.date_of_birth}
                        onChange={e => setParticipant(idx, "date_of_birth", e.target.value)}
                        max={new Date().toISOString().split("T")[0]} />
                      {multiErrors[idx]?.date_of_birth && <Err>{multiErrors[idx].date_of_birth}</Err>}
                    </div>
                  )}

                  {regCfg.require_blood_group && (
                    <div>
                      <label style={LABEL}>Blood Group *</label>
                      <select style={{ ...INPUT, cursor: "pointer", colorScheme: "dark", borderColor: multiErrors[idx]?.blood_group ? "rgba(239,68,68,0.6)" : undefined }}
                        value={p.blood_group} onChange={e => setParticipant(idx, "blood_group", e.target.value)}>
                        <option value="" style={{ background: "#1a1a1a" }}>Select blood group</option>
                        {BLOOD_GROUPS.map(g => <option key={g} value={g} style={{ background: "#1a1a1a" }}>{g}</option>)}
                      </select>
                      {multiErrors[idx]?.blood_group && <Err>{multiErrors[idx].blood_group}</Err>}
                    </div>
                  )}

                  <div>
                    <label style={LABEL}>Mobile Number *</label>
                    <input style={{ ...INPUT, borderColor: multiErrors[idx]?.mobile ? "rgba(239,68,68,0.6)" : undefined }}
                      type="tel" maxLength={10} value={p.mobile}
                      onChange={e => setParticipant(idx, "mobile", e.target.value)}
                      placeholder="10-digit number" />
                    {multiErrors[idx]?.mobile && <Err>{multiErrors[idx].mobile}</Err>}
                  </div>

                  <div>
                    <label style={LABEL}>Email (optional)</label>
                    <input style={INPUT} type="email" value={p.email ?? ""}
                      onChange={e => setParticipant(idx, "email", e.target.value)}
                      placeholder="Participant's email for QR delivery" />
                  </div>

                  {/* Distance category — per participant (legacy multi only; group uses top-level selector) */}
                  {cats.length > 1 && !isGroupCategory && (
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
                  {cats.length === 1 && !isGroupCategory && (
                    <div style={{ gridColumn: "1/-1", fontSize: "11px", color: "#555" }}>
                      Category: {cats[0]}
                    </div>
                  )}

                  {/* T-shirt size — per participant */}
                  {ev.collect_tshirt && (
                    <div style={{ gridColumn: "1/-1" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "5px" }}>
                        <label style={{ ...LABEL, marginBottom: 0 }}>T-Shirt Size *</label>
                        {ev.tshirt_size_chart_url && (
                          <button
                            type="button"
                            onClick={() => setShowSizeGuide(true)}
                            style={{ fontSize: "11px", color: "#60a5fa", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, padding: 0, textDecoration: "underline" }}
                          >
                            View Size Guide ↗
                          </button>
                        )}
                      </div>
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
            {(regCfg.require_emergency_contact || regCfg.show_notes) && (
            <section style={{ marginBottom: "1.5rem" }}>
              <div style={{ fontSize: "10px", color: "#e8620a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>
                {regCfg.require_emergency_contact ? "Emergency Contact (for all participants)" : "Additional Info"}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                {regCfg.require_emergency_contact && (<>
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
                </>)}
                {regCfg.show_notes && (
                  <div style={{ gridColumn: "1/-1" }}>
                    <label style={LABEL}>{regCfg.notes_label} *</label>
                    <textarea
                      style={{ ...INPUT, minHeight: "70px", resize: "vertical" } as React.CSSProperties}
                      value={sharedNotes}
                      onChange={e => setSharedNotes(e.target.value)}
                      placeholder={regCfg.notes_placeholder} />
                  </div>
                )}
              </div>
            </section>
            )}

            {/* Custom form fields (shared for the booking) */}
            {(() => {
              const builtins: Record<string, string> = { distance_category: distanceCategory, gender: form.gender, blood_group: form.blood_group };
              const visibleFields = (ev.form_fields ?? []).filter(f => {
                if (f.race_ids?.length > 0 && selectedRace && !f.race_ids.includes(selectedRace.id)) return false;
                return evaluateConditions(f.conditions ?? [], customFieldValues, builtins);
              });
              if (visibleFields.length === 0) return null;
              // Group by section label
              const sections: { sectionLabel: string | null; fields: EventFormField[] }[] = [];
              for (const f of visibleFields) {
                const last = sections[sections.length - 1];
                if (last && last.sectionLabel === (f.section ?? null)) { last.fields.push(f); }
                else { sections.push({ sectionLabel: f.section ?? null, fields: [f] }); }
              }
              return (
                <section style={{ marginBottom: "1.5rem" }}>
                  {sections.map((sec, si) => (
                    <div key={si}>
                      {sec.sectionLabel && <div style={{ fontSize: "10px", color: "#e8620a", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: "0.75rem", marginTop: si > 0 ? "1.25rem" : 0 }}>{sec.sectionLabel}</div>}
                      {si === 0 && !sec.sectionLabel && <div style={{ fontSize: "10px", color: "#e8620a", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: "1rem" }}>Additional Information</div>}
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                        {sec.fields.map(field => (
                          <CustomFieldInput
                            key={field.field_key}
                            field={field}
                            value={customFieldValues[field.field_key] ?? ""}
                            error={customFieldErrors[field.field_key]}
                            onChange={v => setCustomFieldValues(prev => ({ ...prev, [field.field_key]: v }))}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              );
            })()}

            {CouponSection}

            {/* Price summary */}
            <div style={{ padding: "1rem 1.25rem", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", marginBottom: "1.5rem" }}>
              {pricePerPerson > 0 ? (
                <>
                  <PriceLine
                    label={isPricePerReg
                      ? `Registration Fee (${participantCount} participants)`
                      : `₹${pricePerPerson} × ${participantCount} participant${participantCount > 1 ? "s" : ""}`}
                    value={`₹${totalBeforeDisc}`}
                  />
                  {discount > 0 && <PriceLine label={`Coupon (${coupon})`} value={`−₹${discount}`} muted />}
                  <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "0.75rem 0" }} />
                  <PriceLine label="Total" value={final === 0 ? "Free" : `₹${final}`} bold />
                </>
              ) : (
                <PriceLine label={`Free Entry × ${participantCount}`} value="Free" bold />
              )}
            </div>

            {submitErr && (
              <div style={{ padding: "12px 14px", borderRadius: "8px", marginBottom: "1rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", fontSize: "0.82rem" }}>
                {submitErr}
                {capacityFull && (
                  <a href={`/events/${slug}/waitlist${distanceCategory ? `?category=${encodeURIComponent(distanceCategory)}` : ""}`}
                    style={{ display: "inline-block", marginTop: 8, padding: "7px 16px", borderRadius: 7, background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.3)", color: "#60a5fa", textDecoration: "none", fontSize: "0.8rem", fontWeight: 700 }}>
                    Join Waitlist →
                  </a>
                )}
              </div>
            )}

            <ConsentCheckbox
              checked={marketingConsent}
              onChange={setMarketingConsent}
              showInfo={showConsentInfo}
              onToggleInfo={() => setShowConsentInfo(v => !v)}
            />
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

  // ── Single-participant form ───────────────────────────────────────────────
  // dynKeys: if the admin has added a form-builder field with the same key as a
  // hardcoded built-in (gender, date_of_birth, blood_group, etc.), the dynamic
  // field takes priority and the hardcoded rendering is skipped.
  const dynKeys = new Set((ev.form_fields ?? []).map(f => f.field_key));

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
                const d    = getDistanceOption(cat);
                const sel  = distanceCategory === cat;
                const race = (ev.races ?? []).find(r => r.distance === cat) ?? null;
                const isCatFull = race?.max_slots != null && race.slot_reserved >= race.max_slots;
                const slotsLeft = race?.max_slots != null ? Math.max(0, race.max_slots - race.slot_reserved) : null;
                return (
                  <button key={cat} type="button"
                    onClick={() => { setDistanceCategory(cat); setSubmitErr(""); setCapacityFull(false); }}
                    style={{
                      padding: "10px 22px", borderRadius: "10px",
                      border: `2px solid ${isCatFull ? "rgba(239,68,68,0.3)" : sel ? d.color : "rgba(255,255,255,0.12)"}`,
                      cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                      background: isCatFull ? (sel ? "rgba(239,68,68,0.1)" : "rgba(239,68,68,0.03)") : sel ? d.bg : "transparent",
                      color: isCatFull ? "#ef4444" : sel ? d.color : "rgba(255,255,255,0.55)",
                      fontWeight: sel ? 800 : 500, fontSize: "1rem", opacity: isCatFull ? 0.75 : 1,
                      boxShadow: sel ? `0 0 0 1px ${d.border}` : "none",
                    }}>
                    {cat}
                    <div style={{ fontSize: "11px", fontWeight: 400, opacity: isCatFull ? 1 : 0.75, marginTop: "1px",
                      color: isCatFull ? "#ef4444" : undefined }}>
                      {isCatFull
                        ? "Sold Out"
                        : slotsLeft !== null && slotsLeft <= 20
                          ? `${slotsLeft} left`
                          : getDistanceOption(cat).label !== cat ? getDistanceOption(cat).label : ""}
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
            {/* Show race-level constraints when a category is selected */}
            {selectedRace && (selectedRace.min_age || selectedRace.max_age || selectedRace.gender_restriction) && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {selectedRace.min_age && selectedRace.max_age && (
                  <span style={{ fontSize: "11px", color: "#fbbf24", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 5, padding: "2px 8px" }}>
                    Age {selectedRace.min_age}–{selectedRace.max_age} yrs
                  </span>
                )}
                {selectedRace.min_age && !selectedRace.max_age && (
                  <span style={{ fontSize: "11px", color: "#fbbf24", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 5, padding: "2px 8px" }}>
                    Age {selectedRace.min_age}+ yrs
                  </span>
                )}
                {!selectedRace.min_age && selectedRace.max_age && (
                  <span style={{ fontSize: "11px", color: "#fbbf24", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 5, padding: "2px 8px" }}>
                    Up to {selectedRace.max_age} yrs
                  </span>
                )}
                {selectedRace.gender_restriction && !["any", "all"].includes(selectedRace.gender_restriction) && (
                  <span style={{ fontSize: "11px", color: "#a78bfa", background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: 5, padding: "2px 8px" }}>
                    {selectedRace.gender_restriction === "male" ? "♂ Male only" : "♀ Female only"}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* T-Shirt Size selector */}
        {ev.collect_tshirt && (
          <div id="field-tshirt_size" style={{ marginBottom: "1.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem" }}>
              <div style={{ fontSize: "10px", color: "#e8620a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                T-Shirt Size *
              </div>
              {ev.tshirt_size_chart_url && (
                <button
                  type="button"
                  onClick={() => setShowSizeGuide(true)}
                  style={{ fontSize: "11px", color: "#60a5fa", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, padding: 0, textDecoration: "underline" }}
                >
                  View Size Guide ↗
                </button>
              )}
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

        {!isGroupCategory && !(ev?.allow_multi_participant) && registrantMode === null && !alreadyReg ? (
          <div style={{ marginTop: "0.5rem" }}>
            <div style={{ fontSize: "10px", color: "#e8620a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1.5rem" }}>
              Who are you registering?
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <button type="button" onClick={() => setRegistrantMode("myself")}
                style={{ width: "100%", padding: "16px 20px", borderRadius: "12px", border: "2px solid rgba(232,98,10,0.35)", background: "rgba(232,98,10,0.05)", color: "#fff", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: "14px" }}>
                <span style={{ fontSize: "1.5rem" }}>👤</span>
                <div>
                  <div>Register Myself</div>
                  <div style={{ fontSize: "12px", fontWeight: 400, color: "rgba(255,255,255,0.45)", marginTop: "2px" }}>I am attending this event</div>
                </div>
              </button>
              <button type="button"
                onClick={() => { setRegistrantMode("others"); setParticipantCount(1); setParticipants([{ ...EMPTY_PARTICIPANT }]); setMultiErrors([{}]); }}
                style={{ width: "100%", padding: "16px 20px", borderRadius: "12px", border: "2px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "#fff", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: "14px" }}>
                <span style={{ fontSize: "1.5rem" }}>👥</span>
                <div>
                  <div>Register Someone Else</div>
                  <div style={{ fontSize: "12px", fontWeight: 400, color: "rgba(255,255,255,0.45)", marginTop: "2px" }}>Friend, family member, or colleague — you can add multiple people</div>
                </div>
              </button>
            </div>
            <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.3)", textAlign: "center", marginTop: "1.25rem" }}>
              One payment · Individual QR codes for each participant
            </p>
          </div>
        ) : (
          <>
            {registrantMode === "myself" && !isGroupCategory && !(ev?.allow_multi_participant) && (
              <div style={{ marginBottom: "1.25rem" }}>
                <button type="button" onClick={() => setRegistrantMode(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", fontSize: "0.8rem", fontFamily: "inherit", padding: 0 }}>
                  ← Change who you&apos;re registering
                </button>
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

              {regCfg.require_gender && !dynKeys.has("gender") && (
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
              )}

              {regCfg.require_dob && !dynKeys.has("date_of_birth") && (
                <div id="field-date_of_birth">
                  <label style={LABEL}>Date of Birth *</label>
                  <input style={{ ...INPUT, colorScheme: "dark", borderColor: errors.date_of_birth ? "rgba(239,68,68,0.6)" : undefined }} type="date" value={form.date_of_birth} onChange={set("date_of_birth")} max={new Date().toISOString().split("T")[0]} />
                  {errors.date_of_birth && <Err>{errors.date_of_birth}</Err>}
                </div>
              )}

            </div>
          </section>

          {/* Event information (hardcoded built-in fields — skipped if replaced by dynamic form fields) */}
          {((regCfg.require_blood_group && !dynKeys.has("blood_group")) ||
            (regCfg.require_emergency_contact && !dynKeys.has("emergency_contact_name")) ||
            (regCfg.show_notes && !dynKeys.has("notes"))) && (
          <section style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontSize: "10px", color: "#e8620a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>Event Information</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>

              {regCfg.require_blood_group && !dynKeys.has("blood_group") && (
                <div id="field-blood_group">
                  <label style={LABEL}>Blood Group *</label>
                  <select style={{ ...INPUT, cursor: "pointer", colorScheme: "dark", borderColor: errors.blood_group ? "rgba(239,68,68,0.6)" : undefined }} value={form.blood_group} onChange={set("blood_group")}>
                    <option value="" style={{ background: "#1a1a1a" }}>Select blood group</option>
                    {BLOOD_GROUPS.map(g => <option key={g} value={g} style={{ background: "#1a1a1a" }}>{g}</option>)}
                  </select>
                  {errors.blood_group && <Err>{errors.blood_group}</Err>}
                </div>
              )}

              {regCfg.require_emergency_contact && !dynKeys.has("emergency_contact_name") && (<>
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
              </>)}

              {regCfg.show_notes && !dynKeys.has("notes") && (
                <div style={{ gridColumn: "1/-1" }} id="field-special_notes">
                  <label style={LABEL}>{regCfg.notes_label} *</label>
                  <textarea style={{ ...INPUT, minHeight: "70px", resize: "vertical", borderColor: errors.special_notes ? "rgba(239,68,68,0.6)" : undefined } as React.CSSProperties} value={form.special_notes} onChange={set("special_notes")} placeholder={regCfg.notes_placeholder} />
                  {errors.special_notes && <Err>{errors.special_notes}</Err>}
                </div>
              )}

            </div>
          </section>
          )}

          {/* Custom form fields */}
          {(() => {
            const builtins: Record<string, string> = { distance_category: distanceCategory, gender: form.gender, blood_group: form.blood_group };
            const visibleFields = (ev.form_fields ?? []).filter(f => {
              if (f.is_hidden) return false;
              if (f.race_ids?.length > 0 && selectedRace && !f.race_ids.includes(selectedRace.id)) return false;
              return evaluateConditions(f.conditions ?? [], customFieldValues, builtins);
            });
            if (visibleFields.length === 0) return null;
            const sections: { sectionLabel: string | null; fields: EventFormField[] }[] = [];
            for (const f of visibleFields) {
              const last = sections[sections.length - 1];
              if (last && last.sectionLabel === (f.section ?? null)) { last.fields.push(f); }
              else { sections.push({ sectionLabel: f.section ?? null, fields: [f] }); }
            }
            return (
              <section style={{ marginBottom: "1.5rem" }}>
                {sections.map((sec, si) => (
                  <div key={si}>
                    {sec.sectionLabel && <div style={{ fontSize: "10px", color: "#e8620a", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: "0.75rem", marginTop: si > 0 ? "1.25rem" : 0 }}>{sec.sectionLabel}</div>}
                    {si === 0 && !sec.sectionLabel && <div style={{ fontSize: "10px", color: "#e8620a", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: "1rem" }}>Additional Information</div>}
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      {sec.fields.map(field => (
                        <CustomFieldInput
                          key={field.field_key}
                          field={field}
                          value={customFieldValues[field.field_key] ?? ""}
                          error={customFieldErrors[field.field_key]}
                          onChange={v => {
                            setCustomFieldValues(prev => ({ ...prev, [field.field_key]: v }));
                            if (submitted) setCustomFieldErrors(e => ({ ...e, [field.field_key]: field.required && !v.trim() ? `${field.label} is required.` : "" }));
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            );
          })()}

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
            <div style={{ padding: "12px 14px", borderRadius: "8px", marginBottom: "1rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", fontSize: "0.82rem" }}>
              {submitErr}
              {capacityFull && (
                <a href={`/events/${slug}/waitlist${distanceCategory ? `?category=${encodeURIComponent(distanceCategory)}` : ""}`}
                  style={{ display: "inline-block", marginTop: 8, padding: "7px 16px", borderRadius: 7, background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.3)", color: "#60a5fa", textDecoration: "none", fontSize: "0.8rem", fontWeight: 700 }}>
                  Join Waitlist →
                </a>
              )}
            </div>
          )}

          {submitted && Object.keys(errors).length > 0 && (
            <div style={{ padding: "10px 14px", borderRadius: "8px", marginBottom: "1rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", fontSize: "0.82rem" }}>
              Please fix {Object.keys(errors).length} error{Object.keys(errors).length > 1 ? "s" : ""} above before continuing.
            </div>
          )}

          <ConsentCheckbox
            checked={marketingConsent}
            onChange={setMarketingConsent}
            showInfo={showConsentInfo}
            onToggleInfo={() => setShowConsentInfo(v => !v)}
          />
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
          </>
        )}
      </div>

      {/* T-Shirt Size Guide Modal */}
      {showSizeGuide && ev?.tshirt_size_chart_url && (
        <div
          onClick={() => setShowSizeGuide(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#111", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 20, padding: "1.25rem", maxWidth: 540, width: "100%",
              maxHeight: "90vh", overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>T-Shirt Size Guide</div>
              <button
                onClick={() => setShowSizeGuide(false)}
                style={{ fontSize: 18, color: "#555", background: "none", border: "none", cursor: "pointer", lineHeight: 1, padding: "2px 6px" }}
              >
                ×
              </button>
            </div>

            <div style={{ borderRadius: 10, overflow: "hidden", touchAction: "pinch-zoom" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ev.tshirt_size_chart_url}
                alt="T-Shirt Size Guide"
                style={{ width: "100%", height: "auto", display: "block", maxWidth: "100%" }}
              />
            </div>

            {tshirtSize && (
              <div style={{ marginTop: "0.875rem", padding: "8px 12px", borderRadius: 8, background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.3)", fontSize: 12, color: "#e8620a", textAlign: "center", fontWeight: 700 }}>
                Your selected size: {tshirtSize}
              </div>
            )}

            <button
              onClick={() => setShowSizeGuide(false)}
              style={{ marginTop: "1rem", width: "100%", padding: "10px", borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#ccc", fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomFieldInput({
  field, value, error, onChange,
}: {
  field: EventFormField;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const borderErr = error ? "rgba(239,68,68,0.6)" : undefined;
  const baseInput: React.CSSProperties = {
    width: "100%", padding: "11px 14px",
    background: "rgba(255,255,255,0.05)", border: `1px solid ${borderErr ?? "rgba(255,255,255,0.1)"}`,
    borderRadius: "10px", color: "#fff", fontFamily: "inherit",
    fontSize: "0.875rem", outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)",
    letterSpacing: "0.07em", textTransform: "uppercase" as const, marginBottom: "5px",
  };
  const t = field.field_type;
  // Selected values for multi_select stored as comma-separated
  const multiSelected = value ? value.split(",").map(s => s.trim()).filter(Boolean) : [];

  return (
    <div id={`cf-${field.field_key}`}>
      {t !== "section_heading" && <label style={labelStyle}>{field.label}{field.required ? " *" : ""}</label>}

      {t === "textarea" && (
        <textarea
          style={{ ...baseInput, minHeight: "70px", resize: "vertical" } as React.CSSProperties}
          value={value} onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder ?? ""}
          maxLength={field.max_length ?? undefined}
        />
      )}

      {(t === "select") && (
        <select style={{ ...baseInput, cursor: "pointer", colorScheme: "dark" } as React.CSSProperties}
          value={value} onChange={e => onChange(e.target.value)}>
          <option value="" style={{ background: "#1a1a1a" }}>Select…</option>
          {(field.options ?? []).map(opt => (
            <option key={opt} value={opt} style={{ background: "#1a1a1a" }}>{opt}</option>
          ))}
        </select>
      )}

      {t === "radio" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", paddingTop: "4px" }}>
          {(field.options ?? []).map(opt => (
            <label key={opt} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <input
                type="radio"
                name={`cf-${field.field_key}`}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                style={{ accentColor: "#e8620a", width: 16, height: 16, cursor: "pointer" }}
              />
              <span style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.8)" }}>{opt}</span>
            </label>
          ))}
        </div>
      )}

      {t === "multi_select" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", paddingTop: "4px" }}>
          {(field.options ?? []).map(opt => {
            const checked = multiSelected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  const next = checked ? multiSelected.filter(v => v !== opt) : [...multiSelected, opt];
                  onChange(next.join(", "));
                }}
                style={{
                  padding: "6px 14px", borderRadius: "20px", fontSize: "0.8125rem", cursor: "pointer",
                  border: `1px solid ${checked ? "#e8620a" : "rgba(255,255,255,0.15)"}`,
                  background: checked ? "rgba(232,98,10,0.18)" : "rgba(255,255,255,0.04)",
                  color: checked ? "#e8620a" : "rgba(255,255,255,0.65)", fontFamily: "inherit",
                  transition: "all 0.15s",
                }}
              >{opt}</button>
            );
          })}
        </div>
      )}

      {t === "checkbox" && (
        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", paddingTop: "4px" }}>
          <input
            type="checkbox"
            checked={value === "yes"}
            onChange={e => onChange(e.target.checked ? "yes" : "")}
            style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#e8620a" }}
          />
          <span style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.7)" }}>{field.placeholder ?? "Yes"}</span>
        </label>
      )}

      {t === "section_heading" && (
        <div style={{ fontSize: "10px", color: "#e8620a", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", paddingBottom: "6px", borderBottom: "1px solid rgba(232,98,10,0.2)", marginTop: "0.5rem" }}>
          {field.label}
        </div>
      )}

      {(t === "text" || t === "number" || t === "date") && (
        <input
          style={{ ...baseInput, colorScheme: t === "date" ? "dark" : undefined } as React.CSSProperties}
          type={t}
          value={value} onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder ?? ""}
          maxLength={t === "text" && field.max_length ? field.max_length : undefined}
          readOnly={field.is_readonly}
        />
      )}

      {t === "decimal" && (
        <input style={baseInput} type="number" step="any"
          value={value} onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder ?? ""}
          readOnly={field.is_readonly}
        />
      )}

      {t === "time" && (
        <input style={{ ...baseInput, colorScheme: "dark" } as React.CSSProperties}
          type="time" value={value} onChange={e => onChange(e.target.value)}
          readOnly={field.is_readonly}
        />
      )}

      {t === "datetime" && (
        <input style={{ ...baseInput, colorScheme: "dark" } as React.CSSProperties}
          type="datetime-local" value={value} onChange={e => onChange(e.target.value)}
          readOnly={field.is_readonly}
        />
      )}

      {t === "yes_no" && (
        <div style={{ display: "flex", gap: "8px", paddingTop: "4px" }}>
          {["Yes", "No"].map(opt => {
            const sel = value === opt.toLowerCase();
            return (
              <button key={opt} type="button" onClick={() => !field.is_readonly && onChange(sel ? "" : opt.toLowerCase())}
                style={{ padding: "8px 22px", borderRadius: "8px", cursor: field.is_readonly ? "default" : "pointer", fontFamily: "inherit", fontSize: "0.875rem",
                  border: `2px solid ${sel ? "#e8620a" : "rgba(255,255,255,0.12)"}`,
                  background: sel ? "rgba(232,98,10,0.15)" : "transparent",
                  color: sel ? "#e8620a" : "rgba(255,255,255,0.55)", fontWeight: sel ? 700 : 500 }}>
                {opt}
              </button>
            );
          })}
        </div>
      )}

      {t === "url" && (
        <input style={baseInput} type="url"
          value={value} onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder ?? "https://"}
          readOnly={field.is_readonly}
        />
      )}

      {(t === "country" || t === "state") && (
        <input style={baseInput} type="text"
          value={value} onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder ?? (t === "country" ? "e.g. India" : "e.g. Maharashtra")}
          readOnly={field.is_readonly}
        />
      )}

      {t === "pincode" && (
        <input style={baseInput} type="number" min="100000" max="999999"
          value={value} onChange={e => { if (e.target.value.length <= 6) onChange(e.target.value); }}
          placeholder={field.placeholder ?? "6-digit PIN code"}
          readOnly={field.is_readonly}
        />
      )}

      {t === "image_upload" && (
        <label style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: "8px", padding: "20px 14px",
          border: `2px dashed ${borderErr ?? "rgba(255,255,255,0.15)"}`,
          borderRadius: "10px", cursor: field.is_readonly ? "default" : "pointer",
          background: "rgba(255,255,255,0.02)", color: "rgba(255,255,255,0.5)",
          fontSize: "0.875rem",
        }}>
          {!field.is_readonly && <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) onChange(f.name); }} />}
          <span>🖼️ {value || (field.placeholder ?? "Click to upload an image")}</span>
        </label>
      )}

      {t === "rating" && (
        <div style={{ display: "flex", gap: "6px", paddingTop: "4px" }}>
          {[1,2,3,4,5].map(n => (
            <button key={n} type="button" onClick={() => !field.is_readonly && onChange(String(n))}
              style={{ fontSize: "24px", background: "none", border: "none", cursor: field.is_readonly ? "default" : "pointer", color: Number(value || 0) >= n ? "#f59e0b" : "#333", lineHeight: 1 }}>
              ★
            </button>
          ))}
        </div>
      )}

      {t === "email" && (
        <input
          style={baseInput}
          type="email"
          value={value} onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder ?? "email@example.com"}
        />
      )}

      {t === "phone" && (
        <input
          style={baseInput}
          type="tel"
          value={value} onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder ?? "10-digit mobile number"}
          maxLength={field.max_length ?? 10}
        />
      )}

      {t === "address" && (
        <textarea
          style={{ ...baseInput, minHeight: "80px", resize: "vertical" } as React.CSSProperties}
          value={value} onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder ?? "Street, City, State, PIN"}
        />
      )}

      {t === "waiver" && (
        <div style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", overflow: "hidden" }}>
          <div style={{
            padding: "12px 14px", background: "rgba(255,255,255,0.03)",
            fontSize: "0.8125rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.55,
            maxHeight: "140px", overflowY: "auto",
          }}>
            {field.placeholder ?? field.help_text ?? "Please read and accept the waiver below."}
          </div>
          <label style={{
            display: "flex", alignItems: "center", gap: "10px", cursor: "pointer",
            padding: "10px 14px", background: value === "accepted" ? "rgba(232,98,10,0.1)" : "rgba(255,255,255,0.02)",
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}>
            <input
              type="checkbox"
              checked={value === "accepted"}
              onChange={e => onChange(e.target.checked ? "accepted" : "")}
              style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#e8620a" }}
            />
            <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.7)" }}>I have read and agree to the above</span>
          </label>
        </div>
      )}

      {t === "file" && (
        <label style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: "8px", padding: "20px 14px",
          border: `2px dashed ${borderErr ?? "rgba(255,255,255,0.15)"}`,
          borderRadius: "10px", cursor: "pointer",
          background: "rgba(255,255,255,0.02)", color: "rgba(255,255,255,0.5)",
          fontSize: "0.875rem",
        }}>
          <input
            type="file"
            style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) onChange(f.name); }}
          />
          <span>{value || (field.placeholder ?? "Click to upload a file")}</span>
        </label>
      )}

      {t === "signature" && (
        <div style={{ border: `1px solid ${borderErr ?? "rgba(255,255,255,0.1)"}`, borderRadius: "10px", overflow: "hidden" }}>
          <div style={{ padding: "32px 14px", background: "rgba(255,255,255,0.03)", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "0.8125rem" }}>
            {value
              ? <span style={{ color: "rgba(255,255,255,0.7)" }}>Signed: {value}</span>
              : <span>{field.placeholder ?? "Type your full name to sign"}</span>
            }
          </div>
          <input
            style={{ ...baseInput, borderRadius: 0, borderWidth: "1px 0 0 0", background: "rgba(255,255,255,0.02)" } as React.CSSProperties}
            type="text"
            value={value} onChange={e => onChange(e.target.value)}
            placeholder="Type your full legal name"
          />
        </div>
      )}

      {field.max_length && (t === "text" || t === "textarea") && (
        <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.25)", marginTop: "3px", textAlign: "right" }}>
          {value.length}/{field.max_length}
        </div>
      )}

      {field.help_text && !error && (
        <div style={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.3)", marginTop: "4px" }}>{field.help_text}</div>
      )}
      {error && <div style={{ fontSize: "0.75rem", color: "#f87171", marginTop: "4px" }}>{error}</div>}
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
