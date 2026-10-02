"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { ItRunEventConfig, ItRunCategory } from "@/lib/it-run-types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Participant {
  firstName: string; lastName: string; gender: string;
  dob: string; email: string; mobile: string;
  bloodGroup: string; emergencyName: string; emergencyPhone: string;
  companyName: string; employeeId: string;
  companyIdFile: File | null; companyIdUrl: string;
  tshirtSize: string; medicalConditions: string; foodPreference: string;
}

type ParticipantErrors = Partial<Record<keyof Participant, string>>;

interface CouponData { id: string; code: string; discount: number; label: string }

interface DraftRecord {
  version?:          number;
  eventSlug?:        string;
  step:              number;
  participantSubIdx: number;
  selectedCatId:     string;
  participants:      Participant[];
  couponCode:        string;
  regId?:            string;
  regCode?:          string;
  finalPrice?:       number;
  savedAt:           number;
  expiresAt?:        number;
}

interface ProfileAutoFill {
  firstName: string; lastName: string;
  mobile: string; dob: string; gender: string;
  bloodGroup: string; emergencyName: string; emergencyPhone: string;
  companyName: string; employeeId: string; tshirtSize: string;
  foodPreference: string; medicalConditions: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

// 6 visible progress steps — Confirm is gone, Participants/Verification replace it
const FLOW_STEPS = [
  { id: 1, label: "Category"     },
  { id: 2, label: "Participants" },
  { id: 3, label: "Verification" },
  { id: 4, label: "Review"       },
  { id: 5, label: "Coupon"       },
  { id: 6, label: "Payment"      },
];

// ─────────────────────────────────────────────────────────────────────────────
// Draft helpers
// ─────────────────────────────────────────────────────────────────────────────

const DRAFT_KEY    = "it_run_draft_v4:sprint-2"; // event-scoped; v4 adds eventSlug + version
const DRAFT_KEY_V3 = "it_run_draft_v3";          // legacy — read-only for migration
const DRAFT_TTL_MS = 4 * 60 * 60 * 1000;        // 4 hours (unchanged)

function stepLabel(s: number): string {
  const labels: Record<number, string> = {
    1: "Category", 2: "Participant Details", 3: "Company Verification",
    4: "Review", 5: "Coupon", 6: "Payment",
  };
  return labels[s] ?? "Registration";
}

function timeAgo(ms: number): string {
  const d = Date.now() - ms;
  if (d < 60_000)  return "just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} min ago`;
  return `${Math.floor(d / 3_600_000)}h ago`;
}

const BLOOD_GROUPS = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];
const TSHIRT_SIZES = ["XS","S","M","L","XL","XXL","3XL"]; // adult fallback only
const FOOD_PREFS   = ["veg","non-veg","vegan"];

const emptyParticipant = (): Participant => ({
  firstName: "", lastName: "", gender: "", dob: "", email: "", mobile: "",
  bloodGroup: "", emergencyName: "", emergencyPhone: "",
  companyName: "", employeeId: "", companyIdFile: null, companyIdUrl: "",
  tshirtSize: "", medicalConditions: "", foodPreference: "veg",
});

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────

const BG     = "#080808";
const ACCENT = "#e8620a";

const CARD_BASE: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
};

// 16px minimum prevents iOS Safari auto-zoom on focus
const INPUT_S: React.CSSProperties = {
  width: "100%", padding: "13px 14px", borderRadius: 10,
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  color: "#fff", fontSize: 16, fontFamily: "inherit", outline: "none",
  boxSizing: "border-box" as const, transition: "border-color 0.2s",
  WebkitAppearance: "none" as const,
};

const INPUT_ERR: React.CSSProperties = {
  ...INPUT_S, borderColor: "rgba(248,113,113,0.5)", background: "rgba(248,113,113,0.04)",
};

const LABEL_S: React.CSSProperties = {
  display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)",
  letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 5,
};

// 50px min-height = comfortable touch target
const BTN: React.CSSProperties = {
  padding: "14px 24px", borderRadius: 12, fontWeight: 700, fontSize: 15,
  cursor: "pointer", border: "none", fontFamily: "inherit",
  transition: "all 0.18s", display: "inline-flex", alignItems: "center", gap: 8,
  minHeight: 50,
};
const BTN_PRIMARY: React.CSSProperties = { ...BTN, background: ACCENT, color: "#fff" };
const BTN_GHOST: React.CSSProperties   = {
  ...BTN, background: "transparent", color: "#aaa",
  border: "1px solid rgba(255,255,255,0.13)",
};

const BTN_EDIT: React.CSSProperties = {
  padding: "5px 12px", borderRadius: 7, fontWeight: 600, fontSize: 11,
  cursor: "pointer", border: "1px solid rgba(255,255,255,0.1)",
  background: "transparent", color: "#666",
  fontFamily: "inherit", letterSpacing: "0.05em", textTransform: "uppercase" as const,
  transition: "all 0.15s", flexShrink: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Razorpay loader
// ─────────────────────────────────────────────────────────────────────────────

declare global {
  interface Window { Razorpay: new (opts: Record<string, unknown>) => { open(): void } }
}

function loadRazorpay(): Promise<void> {
  return new Promise<void>(res => {
    if (typeof window !== "undefined" && window.Razorpay) { res(); return; }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => res();
    document.head.appendChild(s);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ProgressStepper — minimal bar + "Step X of 6 · Label" readable on 320px
// ─────────────────────────────────────────────────────────────────────────────

function ProgressStepper({
  step, participantSubIdx, participantCount,
}: {
  step: number;
  participantSubIdx?: number;
  participantCount?: number;
}) {
  const total  = FLOW_STEPS.length;
  const capped = Math.min(step, total);
  const pct    = ((capped - 1) / (total - 1)) * 100;
  const label  = FLOW_STEPS.find(s => s.id === capped)?.label ?? "";
  const showSub = step === 2 && participantCount && participantCount > 1;

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Track */}
      <div style={{
        height: 3, background: "rgba(255,255,255,0.07)",
        borderRadius: 2, marginBottom: 10, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: `linear-gradient(90deg, ${ACCENT}cc, ${ACCENT})`,
          transition: "width 0.45s cubic-bezier(.4,0,.2,1)", borderRadius: 2,
        }} />
      </div>

      {/* Label row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 11, color: "#444", fontWeight: 600 }}>
            Step {capped} of {total}
          </span>
          <span style={{ color: "#333", fontSize: 11 }}>·</span>
          <span style={{ fontSize: 11, color: "#ccc", fontWeight: 700, letterSpacing: "0.04em" }}>
            {label}
          </span>
          {showSub && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
              background: `${ACCENT}18`, color: ACCENT, letterSpacing: "0.04em", marginLeft: 4,
            }}>
              {(participantSubIdx ?? 0) + 1} of {participantCount}
            </span>
          )}
        </div>

        {/* Mini dot trail */}
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          {FLOW_STEPS.map(s => (
            <div key={s.id} style={{
              width: s.id === capped ? 20 : 6,
              height: 6, borderRadius: 3,
              background: s.id < capped ? ACCENT : s.id === capped ? ACCENT : "rgba(255,255,255,0.08)",
              transition: "all 0.3s",
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Field — labeled form control wrapper
// ─────────────────────────────────────────────────────────────────────────────

function Field({
  label, error, required, optional, hint, children,
}: {
  label: string; error?: string; required?: boolean; optional?: boolean;
  hint?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={LABEL_S}>
        {label}
        {required && <span style={{ color: ACCENT, marginLeft: 3 }}>*</span>}
        {optional && <span style={{ color: "#383838", marginLeft: 4, fontWeight: 400 }}>optional</span>}
      </label>
      {children}
      {hint  && !error && <span style={{ fontSize: 11, color: "#444", lineHeight: 1.4 }}>{hint}</span>}
      {error && <span style={{ fontSize: 11, color: "#f87171", lineHeight: 1.4 }}>{error}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SectionHeader — field group label
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 10, color: "#3a3a3a", fontWeight: 700,
      textTransform: "uppercase" as const, letterSpacing: "0.12em",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
      paddingBottom: 7, marginBottom: 14, marginTop: 2,
    }}>
      {label}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ParticipantForm — one participant, grouped fields, collapsible optional section
// ─────────────────────────────────────────────────────────────────────────────

function ParticipantForm({
  participantLabel, roleLabel, data, onChange, errors, isChild, tshirtSizes, indexOfTotal,
}: {
  participantLabel: string;
  roleLabel: string;
  data: Participant;
  onChange: (field: keyof Participant, val: string | File | null) => void;
  errors: ParticipantErrors;
  isChild: boolean;
  tshirtSizes: string[];
  indexOfTotal: string; // e.g. "1 of 2"
}) {
  const [showOptional, setShowOptional] = useState(false);

  const inp = (field: keyof Participant, hasErr: boolean) =>
    hasErr ? INPUT_ERR : INPUT_S;

  return (
    <div>
      {/* Participant identity header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        marginBottom: 24, paddingBottom: 16,
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
          background: `${ACCENT}18`, border: `1.5px solid ${ACCENT}50`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 800, color: ACCENT,
        }}>
          {indexOfTotal.split(" ")[0]}
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>
            {participantLabel}
          </div>
          <div style={{ fontSize: 11, color: "#444", marginTop: 2, letterSpacing: "0.04em" }}>
            {roleLabel}
          </div>
        </div>
      </div>

      {/* ── Section: Identity ── */}
      <SectionHeader label={isChild ? "About the Child" : "About You"} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Field label="First Name" error={errors.firstName} required>
          <input style={inp("firstName", !!errors.firstName)} value={data.firstName}
            onChange={e => onChange("firstName", e.target.value)}
            placeholder="First name" autoComplete="given-name" />
        </Field>
        <Field label="Last Name" error={errors.lastName} required>
          <input style={inp("lastName", !!errors.lastName)} value={data.lastName}
            onChange={e => onChange("lastName", e.target.value)}
            placeholder="Last name" autoComplete="family-name" />
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Field label="Gender" error={errors.gender} required>
          <select style={inp("gender", !!errors.gender)} value={data.gender}
            onChange={e => onChange("gender", e.target.value)}>
            <option value="">Select</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other / Non-binary</option>
            <option value="prefer_not">Prefer not to say</option>
          </select>
        </Field>
        <Field label="Date of Birth" error={errors.dob} required
          hint={isChild ? "Must be 10 years or younger" : undefined}>
          <input style={inp("dob", !!errors.dob)} type="date" value={data.dob}
            onChange={e => onChange("dob", e.target.value)} />
        </Field>
      </div>

      {/* ── Section: Contact ── */}
      <SectionHeader label="Contact" />

      <div style={{ display: "grid", gridTemplateColumns: isChild ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 14 }}>
        {!isChild && (
          <Field label="Email" error={errors.email} required hint="Your QR code and confirmation will be sent here — double-check before continuing">
            <input style={inp("email", !!errors.email)} type="email" value={data.email}
              onChange={e => onChange("email", e.target.value)}
              placeholder="your@email.com" autoComplete="email" />
          </Field>
        )}
        <Field label="Mobile" error={errors.mobile} required hint="10-digit Indian number">
          <input style={inp("mobile", !!errors.mobile)} type="tel" value={data.mobile}
            onChange={e => onChange("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="9XXXXXXXXX" inputMode="numeric" autoComplete="tel-national" />
        </Field>
      </div>

      {/* ── Section: Race Details ── */}
      <SectionHeader label="Race Details" />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Field label="Blood Group" error={errors.bloodGroup} required>
          <select style={inp("bloodGroup", !!errors.bloodGroup)} value={data.bloodGroup}
            onChange={e => onChange("bloodGroup", e.target.value)}>
            <option value="">Select</option>
            {BLOOD_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="T-Shirt Size" error={errors.tshirtSize} required
          hint={isChild ? "Child sizes (age-appropriate)" : undefined}>
          <select style={inp("tshirtSize", !!errors.tshirtSize)} value={data.tshirtSize}
            onChange={e => onChange("tshirtSize", e.target.value)}>
            <option value="">Select size</option>
            {tshirtSizes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </div>

      {/* ── Section: Emergency & Company (non-child only, all required) ── */}
      {!isChild && (
        <>
          <SectionHeader label="Emergency Contact" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <Field label="Contact Name" error={errors.emergencyName} required>
              <input style={inp("emergencyName", !!errors.emergencyName)} value={data.emergencyName}
                onChange={e => onChange("emergencyName", e.target.value)}
                placeholder="Person to call" />
            </Field>
            <Field label="Contact Phone" error={errors.emergencyPhone} required>
              <input style={inp("emergencyPhone", !!errors.emergencyPhone)} type="tel"
                value={data.emergencyPhone}
                onChange={e => onChange("emergencyPhone", e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="Emergency number" inputMode="numeric" />
            </Field>
          </div>

          <SectionHeader label="Company" />
          <div style={{ marginBottom: 14 }}>
            <Field label="Company Name" error={errors.companyName} required>
              <input style={inp("companyName", !!errors.companyName)} value={data.companyName}
                onChange={e => onChange("companyName", e.target.value)}
                placeholder="Your employer or company" autoComplete="organization" />
            </Field>
          </div>

          {/* ── Collapsible optional section ── */}
          <button
            type="button"
            onClick={() => setShowOptional(v => !v)}
            style={{
              width: "100%", background: "none", fontFamily: "inherit",
              border: "1px dashed rgba(255,255,255,0.09)",
              borderRadius: 10, padding: "10px 16px",
              color: "#3a3a3a", fontSize: 12, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              transition: "border-color 0.2s",
              marginBottom: showOptional ? 16 : 0,
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)")}
          >
            <span>
              {showOptional ? "▲  Hide" : "▼  Show"} optional fields
            </span>
            <span style={{ color: "#2a2a2a", fontSize: 11 }}>
              Employee ID · Medical info · Food preference
            </span>
          </button>

          {showOptional && (
            <div style={{
              padding: "18px 18px 4px",
              background: "rgba(255,255,255,0.015)",
              border: "1px dashed rgba(255,255,255,0.07)",
              borderRadius: 12, marginBottom: 4,
            }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <Field label="Employee ID" optional>
                  <input style={INPUT_S} value={data.employeeId}
                    onChange={e => onChange("employeeId", e.target.value)}
                    placeholder="Staff or employee ID" />
                </Field>
                <Field label="Food Preference" optional>
                  <select style={INPUT_S} value={data.foodPreference}
                    onChange={e => onChange("foodPreference", e.target.value)}>
                    {FOOD_PREFS.map(f => (
                      <option key={f} value={f}>
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div style={{ marginBottom: 14 }}>
                <Field label="Medical Conditions" optional>
                  <input style={INPUT_S} value={data.medicalConditions}
                    onChange={e => onChange("medicalConditions", e.target.value)}
                    placeholder="Any conditions the team should know about" />
                </Field>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PriceBar — sticky bottom bar shown from step 2 onwards
// ─────────────────────────────────────────────────────────────────────────────

function PriceBar({
  category, finalPrice, couponApplied, step, participantSubIdx,
}: {
  category: ItRunCategory;
  finalPrice: number;
  couponApplied: boolean;
  step: number;
  participantSubIdx: number;
}) {
  const showSubStep = step === 2 && category.participant_count > 1;

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 90,
      background: "rgba(8,8,8,0.97)", backdropFilter: "blur(20px)",
      borderTop: "1px solid rgba(255,255,255,0.06)",
      padding: `12px clamp(1rem,4vw,2rem) calc(12px + env(safe-area-inset-bottom, 0px))`,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: category.color, flexShrink: 0 }} />
        <span style={{
          fontSize: 13, color: "#999", fontWeight: 600,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
        }}>
          {category.name}
        </span>
        {showSubStep && (
          <span style={{
            fontSize: 10, color: ACCENT, fontWeight: 700, flexShrink: 0,
            background: `${ACCENT}15`, padding: "2px 7px", borderRadius: 10,
          }}>
            {participantSubIdx + 1} / {category.participant_count}
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {couponApplied && (
          <span style={{
            fontSize: 10, color: "#10b981", background: "rgba(16,185,129,0.08)",
            border: "1px solid rgba(16,185,129,0.2)",
            padding: "2px 8px", borderRadius: 6,
          }}>
            Coupon applied
          </span>
        )}
        <span style={{ fontSize: 18, fontWeight: 900, color: ACCENT }}>
          ₹{finalPrice.toLocaleString("en-IN")}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Category Selection (unchanged UX, direct navigation to step 2)
// ─────────────────────────────────────────────────────────────────────────────

function StepCategory({
  config, loading, onSelect,
}: {
  config: ItRunEventConfig | null;
  loading: boolean;
  onSelect: (cat: ItRunCategory) => void;
}) {
  const eventDate = config?.event.event_date
    ? new Date(config.event.event_date + "T12:00:00Z").toLocaleDateString("en-IN", {
        day: "numeric", month: "long", year: "numeric",
      })
    : "—";

  if (loading) {
    return (
      <div style={{ textAlign: "center" as const, padding: "80px 0", color: "#444" }}>
        <div style={{
          width: 40, height: 40, margin: "0 auto 16px",
          border: `2px solid rgba(232,98,10,0.3)`, borderTopColor: ACCENT,
          borderRadius: "50%", animation: "spin 0.8s linear infinite",
        }} />
        Loading race categories…
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.25)",
          borderRadius: 100, padding: "4px 12px", marginBottom: 14,
        }}>
          <span style={{
            fontSize: 9, color: ACCENT, fontWeight: 700,
            letterSpacing: "0.14em", textTransform: "uppercase" as const,
          }}>
            {config?.event.subtitle ?? "IT Professionals Only"}
          </span>
        </div>
        <h1 style={{
          fontSize: "clamp(22px,4vw,30px)", fontWeight: 900, color: "#fff",
          margin: "0 0 6px", lineHeight: 1.2,
        }}>
          Choose Your Race Category
        </h1>
        <p style={{ fontSize: 13, color: "#555", margin: 0 }}>
          {config?.event.venue_name && `${config.event.venue_name} · `}{eventDate}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
        {(config?.categories ?? []).map(cat => (
          <button
            key={cat.id}
            onClick={() => !cat.is_soldout && onSelect(cat)}
            disabled={cat.is_soldout}
            style={{
              ...CARD_BASE,
              padding: "18px 20px",
              cursor: cat.is_soldout ? "not-allowed" : "pointer",
              textAlign: "left" as const, width: "100%",
              border: `1px solid ${cat.color}22`,
              fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 16,
              opacity: cat.is_soldout ? 0.45 : 1,
              transition: "all 0.2s",
            }}
            onMouseEnter={e => {
              if (!cat.is_soldout) (e.currentTarget as HTMLButtonElement).style.borderColor = `${cat.color}60`;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = `${cat.color}22`;
            }}
          >
            {/* Distance */}
            <div style={{
              fontSize: "clamp(22px,3.5vw,26px)", fontWeight: 900, color: cat.color,
              minWidth: 60, lineHeight: 1, flexShrink: 0,
            }}>
              {cat.distance_km < 2 ? "1.5" : cat.distance_km}
              <span style={{ fontSize: 11, fontWeight: 700, marginLeft: 2 }}>KM</span>
            </div>

            {/* Middle */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 5 }}>
                {cat.name}
                {cat.is_soldout && (
                  <span style={{
                    marginLeft: 8, fontSize: 10, color: "#f87171",
                    background: "rgba(248,113,113,0.1)", padding: "1px 6px", borderRadius: 4,
                  }}>
                    SOLD OUT
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                  color:      cat.is_timed ? cat.color : "#64748b",
                  background: cat.is_timed ? `${cat.color}18` : "rgba(100,116,139,0.12)",
                }}>
                  {cat.is_timed ? "Timed" : "Non-Timed"}
                </span>
                {cat.inclusions.map(inc => (
                  <span key={inc} style={{
                    fontSize: 10, color: "#666",
                    background: "rgba(255,255,255,0.04)", padding: "2px 7px", borderRadius: 4,
                  }}>
                    {inc}
                  </span>
                ))}
                {cat.participant_count > 1 && (
                  <span style={{
                    fontSize: 10, color: cat.color, background: `${cat.color}15`,
                    padding: "2px 7px", borderRadius: 4,
                  }}>
                    {cat.participant_labels.map(l => l.label).join(" + ")}
                  </span>
                )}
              </div>

              {/* Capacity indicator */}
              {cat.max_participants != null && !cat.is_soldout && (
                (() => {
                  const remaining = cat.max_participants - cat.current_participants;
                  const pct = Math.min(100, (cat.current_participants / cat.max_participants) * 100);
                  const low = remaining <= 20;
                  return (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 10, color: low ? "#fbbf24" : "#444" }}>
                          {low ? `Only ${remaining} spots left!` : `${remaining} spots available`}
                        </span>
                        <span style={{ fontSize: 10, color: "#333" }}>{Math.round(pct)}% filled</span>
                      </div>
                      <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 2 }}>
                        <div style={{
                          height: "100%", width: `${pct}%`,
                          background: low ? "#fbbf24" : cat.color,
                          borderRadius: 2, transition: "width 0.3s",
                        }} />
                      </div>
                    </div>
                  );
                })()
              )}
            </div>

            {/* Price + arrow */}
            <div style={{ textAlign: "right" as const, flexShrink: 0, display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 4 }}>
              <div style={{ fontSize: "clamp(18px,2.5vw,22px)", fontWeight: 900, color: cat.color }}>
                ₹{cat.price_rupees.toLocaleString("en-IN")}
              </div>
              {cat.participant_count > 1 && (
                <div style={{ fontSize: 10, color: "#444" }}>for {cat.participant_count}</div>
              )}
              {!cat.is_soldout && (
                <div style={{ color: "#333", fontSize: 18, lineHeight: 1 }}>›</div>
              )}
            </div>
          </button>
        ))}
      </div>

      {config && (
        <div style={{ marginTop: 24, fontSize: 12, color: "#3a3a3a", lineHeight: 1.7 }}>
          By registering you agree to the event terms. Questions? Email{" "}
          <a href={`mailto:${config.registration.contact_email}`}
            style={{ color: ACCENT, textDecoration: "none" }}>
            {config.registration.contact_email}
          </a>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Participant Details (one participant at a time)
// ─────────────────────────────────────────────────────────────────────────────

function StepParticipants({
  category, participantSubIdx,
  participants, errors, onChange, submitError,
  onBack, onNext, returnToReview,
}: {
  category: ItRunCategory;
  participantSubIdx: number;
  participants: Participant[];
  errors: ParticipantErrors[];
  onChange: (idx: number, field: keyof Participant, val: string | File | null) => void;
  submitError: string;
  onBack: () => void;
  onNext: () => void;
  returnToReview?: boolean;
}) {
  const pl    = category.participant_labels[participantSubIdx];
  const total = category.participant_count;
  const isLast = participantSubIdx === total - 1;

  return (
    <div>
      <ProgressStepper step={2} participantSubIdx={participantSubIdx} participantCount={total} />

      {/* Category mini-reminder */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        marginBottom: 24,
        padding: "10px 14px",
        background: `${category.color}09`,
        border: `1px solid ${category.color}22`,
        borderRadius: 10,
      }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: category.color, flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: "#888", flex: 1 }}>
          {category.name}
          <span style={{ color: "#555", marginLeft: 6 }}>
            {category.distance_km < 2 ? "1.5" : category.distance_km} KM
            {category.is_timed ? " · Timed" : " · Non-Timed"}
          </span>
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: category.color }}>
          ₹{category.price_rupees.toLocaleString("en-IN")}
        </span>
      </div>

      <ParticipantForm
        participantLabel={pl?.label ?? `Participant ${participantSubIdx + 1}`}
        roleLabel={
          total === 1 ? "Your personal details — printed on BIB and certificate" :
          pl?.is_child ? "Child participant (age ≤ 10) — child sizes shown" :
          category.category_type === "kid" ? "Parent / Guardian — confirmation email goes here" :
          participantSubIdx === 0 ? "Lead registrant — confirmation email goes here" :
          "Second participant — BIB and certificate details"
        }
        data={participants[participantSubIdx]}
        onChange={(field, val) => onChange(participantSubIdx, field, val)}
        errors={errors[participantSubIdx] ?? {}}
        isChild={pl?.is_child ?? false}
        tshirtSizes={pl?.tshirt_sizes ?? TSHIRT_SIZES}
        indexOfTotal={`${participantSubIdx + 1} of ${total}`}
      />

      {submitError && (
        <div style={{
          color: "#f87171", fontSize: 13, marginTop: 16, marginBottom: 4,
          padding: "10px 14px", background: "rgba(248,113,113,0.06)",
          border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8,
        }}>
          {submitError}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 24, flexWrap: "wrap" as const }}>
        <button onClick={onBack} style={BTN_GHOST}>← Back</button>
        <button onClick={onNext} style={{ ...BTN_PRIMARY, flex: 1, justifyContent: "center" }}>
          {returnToReview
            ? "Save & Return to Review →"
            : isLast
              ? "Continue to Verification →"
              : `Next: ${category.participant_labels[participantSubIdx + 1]?.label ?? "Participant " + (participantSubIdx + 2)} →`}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Company Verification (optional upload)
// ─────────────────────────────────────────────────────────────────────────────

function StepCompany({
  category, participants, uploading, onChange, onUpload, onBack, onNext, returnToReview,
}: {
  category: ItRunCategory;
  participants: Participant[];
  uploading: number[];
  onChange: (idx: number, field: keyof Participant, val: string | File | null) => void;
  onUpload: (idx: number, file: File) => void;
  onBack: () => void;
  onNext: () => void;
  returnToReview?: boolean;
}) {
  const nonChildIdxs = participants
    .map((_, idx) => idx)
    .filter(idx => !(category.participant_labels[idx]?.is_child ?? false));

  return (
    <div>
      <ProgressStepper step={3} />
      <h2 style={{ fontSize: "clamp(20px,3vw,24px)", fontWeight: 800, color: "#fff", marginBottom: 6 }}>
        Company Verification
      </h2>
      <p style={{ fontSize: 13, color: "#555", marginBottom: 20 }}>
        Upload your company ID to skip physical verification at BIB collection.
        This step is <span style={{ color: "#aaa" }}>optional</span> — you can always bring your ID on the day.
      </p>

      <div style={{
        ...CARD_BASE, padding: 14, marginBottom: 20,
        border: "1px solid rgba(232,98,10,0.15)", background: "rgba(232,98,10,0.03)",
      }}>
        <div style={{ fontSize: 12, color: ACCENT, fontWeight: 600, marginBottom: 2 }}>Accepted documents</div>
        <div style={{ fontSize: 12, color: "#666", lineHeight: 1.6 }}>
          Company ID card, Employee card, or Offer Letter showing company name.
          A photo of yourself holding the ID is also acceptable.
        </div>
      </div>

      {nonChildIdxs.map(idx => {
        const p       = participants[idx];
        const label   = category.participant_labels[idx]?.label ?? `Participant ${idx + 1}`;
        const uploaded = p.companyIdUrl && p.companyIdUrl !== "error";
        const errored  = p.companyIdUrl === "error";

        return (
          <div key={idx} style={{ ...CARD_BASE, padding: 20, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 14, textTransform: "uppercase" as const }}>
              {label} — {p.companyName || "Company not specified"}
            </div>

            {uploaded ? (
              <div style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.18)",
                borderRadius: 10,
              }}>
                <span style={{ color: "#10b981", fontSize: 18, flexShrink: 0 }}>✓</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "#10b981", fontWeight: 600 }}>ID uploaded successfully</div>
                  <button onClick={() => onChange(idx, "companyIdUrl", "")}
                    style={{
                      background: "none", border: "none", color: "#444", fontSize: 11,
                      cursor: "pointer", padding: 0, marginTop: 2, fontFamily: "inherit",
                    }}>
                    Upload a different file
                  </button>
                </div>
              </div>
            ) : (
              <label style={{
                display: "flex", flexDirection: "column" as const, alignItems: "center",
                padding: "28px 20px",
                border: `2px dashed ${errored ? "rgba(248,113,113,0.4)" : "rgba(255,255,255,0.09)"}`,
                borderRadius: 12, cursor: "pointer", gap: 6,
                textAlign: "center" as const,
                background: "rgba(255,255,255,0.015)", transition: "border-color 0.2s",
              }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = `${ACCENT}50`)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = errored ? "rgba(248,113,113,0.4)" : "rgba(255,255,255,0.09)")}>
                {uploading.includes(idx) ? (
                  <div style={{ fontSize: 13, color: "#666" }}>Uploading…</div>
                ) : (
                  <>
                    <div style={{ fontSize: 24, color: "#333" }}>↑</div>
                    <div style={{ fontSize: 14, color: "#ccc", fontWeight: 600 }}>Tap to upload Company ID</div>
                    <div style={{ fontSize: 11, color: "#444" }}>JPG, PNG or PDF · max 5 MB</div>
                    {errored && (
                      <div style={{ fontSize: 11, color: "#f87171", marginTop: 4 }}>Upload failed. Please try again.</div>
                    )}
                  </>
                )}
                <input type="file" accept="image/*,.pdf" style={{ display: "none" }}
                  onChange={ev => {
                    const file = ev.target.files?.[0];
                    if (file) { onChange(idx, "companyIdFile", file); onUpload(idx, file); }
                  }} />
              </label>
            )}
          </div>
        );
      })}

      <div style={{
        ...CARD_BASE, padding: 14, marginBottom: 24,
        fontSize: 12, color: "#3a3a3a", lineHeight: 1.7,
      }}>
        <strong style={{ color: "#555" }}>Skipping?</strong>{" "}
        Bring your original company ID to the BIB collection counter on the day.
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
        <button onClick={onBack} style={BTN_GHOST}>← Back</button>
        <button onClick={onNext} style={{ ...BTN_PRIMARY, flex: 1, justifyContent: "center" }}>
          {returnToReview ? "Save & Return to Review →" : "Review Registration →"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Review
// ─────────────────────────────────────────────────────────────────────────────

function ReviewSectionHeader({
  label, onEdit, editLabel = "Edit",
}: { label: string; onEdit: () => void; editLabel?: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      marginBottom: 14,
    }}>
      <div style={{
        fontSize: 10, color: ACCENT, fontWeight: 700,
        textTransform: "uppercase" as const, letterSpacing: "0.1em",
      }}>
        {label}
      </div>
      <button
        onClick={onEdit}
        style={BTN_EDIT}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.25)";
          (e.currentTarget as HTMLButtonElement).style.color = "#ccc";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.1)";
          (e.currentTarget as HTMLButtonElement).style.color = "#666";
        }}
      >
        {editLabel}
      </button>
    </div>
  );
}

function StepReview({
  category, participants, coupon, basePrice, discount, finalPrice,
  onBack, onNext,
  onEditParticipant, onEditVerification, onEditCategory, onEditCoupon,
}: {
  category: ItRunCategory;
  participants: Participant[];
  coupon: CouponData | null;
  basePrice: number;
  discount: number;
  finalPrice: number;
  onBack: () => void;
  onNext: () => void;
  onEditParticipant: (idx: number) => void;
  onEditVerification: () => void;
  onEditCategory: () => void;
  onEditCoupon: () => void;
}) {
  const nonChildIdxs = participants
    .map((_, i) => i)
    .filter(i => !(category.participant_labels[i]?.is_child ?? false));

  return (
    <div>
      <ProgressStepper step={4} />
      <h2 style={{ fontSize: "clamp(20px,3vw,24px)", fontWeight: 800, color: "#fff", marginBottom: 6 }}>
        Review Your Registration
      </h2>
      <p style={{ fontSize: 13, color: "#555", marginBottom: 20 }}>
        Everything look right? You can edit any section below before paying.
      </p>

      {/* ── Category ── */}
      <div style={{ ...CARD_BASE, padding: 18, marginBottom: 10 }}>
        <ReviewSectionHeader label="Category" onEdit={onEditCategory} editLabel="Change" />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{category.name}</div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap" as const }}>
              <span>{category.distance_km < 2 ? "1.5 KM" : `${category.distance_km} KM`}</span>
              <span style={{ color: "#333" }}>·</span>
              <span>{category.is_timed ? "Timed" : "Non-Timed"}</span>
              {category.participant_count > 1 && (
                <>
                  <span style={{ color: "#333" }}>·</span>
                  <span>{category.participant_labels.map(l => l.label).join(" + ")}</span>
                </>
              )}
            </div>
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: category.color, flexShrink: 0 }}>
            ₹{category.price_rupees.toLocaleString("en-IN")}
          </div>
        </div>
      </div>

      {/* ── Per-participant cards ── */}
      {participants.map((p, idx) => {
        const pl    = category.participant_labels[idx];
        const label = pl?.label ?? `Participant ${idx + 1}`;
        const fields: string[][] = [
          ["Name",    `${p.firstName} ${p.lastName}`],
          ["Gender",  p.gender === "prefer_not" ? "Prefer not to say" : p.gender],
          ["DOB",     p.dob],
          ["Mobile",  p.mobile],
          ["Blood",   p.bloodGroup],
          ["T-Shirt", p.tshirtSize],
          ...(pl?.is_child ? [] : [
            ["Email",      p.email],
            ["Company",    p.companyName],
            ["Emergency",  p.emergencyName ? `${p.emergencyName} · ${p.emergencyPhone}` : ""],
          ]),
        ];

        return (
          <div key={idx} style={{ ...CARD_BASE, padding: 18, marginBottom: 10 }}>
            <ReviewSectionHeader
              label={label + (pl?.is_child ? " (Child)" : "")}
              onEdit={() => onEditParticipant(idx)}
            />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "10px 16px" }}>
              {fields.filter(([, v]) => v?.trim()).map(([lbl, val]) => (
                <div key={lbl}>
                  <div style={{ fontSize: 9, color: "#3a3a3a", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 2 }}>
                    {lbl}
                  </div>
                  <div style={{ fontSize: 12, color: "#bbb" }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* ── Company Verification ── */}
      {nonChildIdxs.length > 0 && (
        <div style={{ ...CARD_BASE, padding: 18, marginBottom: 10 }}>
          <ReviewSectionHeader label="Company Verification" onEdit={onEditVerification} />
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
            {nonChildIdxs.map(idx => {
              const p     = participants[idx];
              const label = category.participant_labels[idx]?.label ?? `Participant ${idx + 1}`;
              const ok    = p.companyIdUrl && p.companyIdUrl !== "error";
              return (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                    background: ok ? "#10b981" : "#444",
                  }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 12, color: "#bbb" }}>{label}</span>
                    <span style={{ fontSize: 11, color: "#444", marginLeft: 8 }}>
                      {p.companyName || "No company"}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    color:      ok ? "#10b981" : "#555",
                    background: ok ? "rgba(16,185,129,0.07)" : "rgba(255,255,255,0.03)",
                    padding: "2px 8px", borderRadius: 5,
                  }}>
                    {ok ? "ID Uploaded" : "Bring on day"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Order Summary ── */}
      <div style={{ ...CARD_BASE, padding: 18, marginBottom: 24 }}>
        <ReviewSectionHeader label="Order Summary" onEdit={onEditCoupon} editLabel={coupon ? "Edit Coupon" : "Add Coupon"} />

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#888", marginBottom: 8 }}>
          <span>{category.name}</span>
          <span>₹{basePrice.toLocaleString("en-IN")}</span>
        </div>

        {coupon && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#10b981", marginBottom: 8 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", padding: "1px 6px",
                background: "rgba(16,185,129,0.1)", borderRadius: 4, color: "#10b981",
              }}>
                {coupon.code}
              </span>
              {coupon.label}
            </span>
            <span>−₹{discount.toLocaleString("en-IN")}</span>
          </div>
        )}

        <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "10px 0 12px" }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#555" }}>
            Total{coupon ? " (after discount)" : ""}
          </span>
          <span style={{ fontSize: 22, fontWeight: 900, color: ACCENT }}>
            ₹{finalPrice.toLocaleString("en-IN")}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
        <button onClick={onBack} style={BTN_GHOST}>← Back</button>
        <button onClick={onNext} style={{ ...BTN_PRIMARY, flex: 1, justifyContent: "center" }}>
          Confirm & Proceed →
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 — Coupon + Order Summary
// ─────────────────────────────────────────────────────────────────────────────

function StepCoupon({
  category, couponEnabled, couponCode, coupon, couponError, couponLoading,
  basePrice, discount, finalPrice,
  submitting, submitError,
  onCodeChange, onValidate, onClearCoupon,
  onBack, onSubmit, returnToReview, onSaveAndReturn,
}: {
  category: ItRunCategory;
  couponEnabled: boolean;
  couponCode: string;
  coupon: CouponData | null;
  couponError: string;
  couponLoading: boolean;
  basePrice: number;
  discount: number;
  finalPrice: number;
  submitting: boolean;
  submitError: string;
  onCodeChange: (v: string) => void;
  onValidate: () => void;
  onClearCoupon: () => void;
  onBack: () => void;
  onSubmit: () => void;
  returnToReview?: boolean;
  onSaveAndReturn?: () => void;
}) {
  return (
    <div>
      <ProgressStepper step={5} />
      <h2 style={{ fontSize: "clamp(20px,3vw,24px)", fontWeight: 800, color: "#fff", marginBottom: 6 }}>
        {couponEnabled ? "Have a Coupon Code?" : "Order Summary"}
      </h2>
      <p style={{ fontSize: 13, color: "#555", marginBottom: 20 }}>
        {couponEnabled
          ? "Apply a discount code, or skip and proceed to payment."
          : "Review your order total before payment."}
      </p>

      {couponEnabled && (
        <div style={{ ...CARD_BASE, padding: 20, marginBottom: 18 }}>
          {!coupon ? (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input
                  style={{ ...INPUT_S, flex: 1, textTransform: "uppercase" as const, letterSpacing: "0.1em" }}
                  placeholder="COUPON CODE"
                  value={couponCode}
                  onChange={e => onCodeChange(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === "Enter" && onValidate()}
                />
                <button
                  onClick={onValidate}
                  disabled={couponLoading || !couponCode.trim()}
                  style={{
                    ...BTN_PRIMARY, flexShrink: 0, padding: "13px 20px",
                    opacity: (couponLoading || !couponCode.trim()) ? 0.45 : 1,
                  }}>
                  {couponLoading ? "…" : "Apply"}
                </button>
              </div>
              {couponError && (
                <div style={{ fontSize: 12, color: "#f87171" }}>{couponError}</div>
              )}
            </>
          ) : (
            <div style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
              background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.18)",
              borderRadius: 10,
            }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#10b981" }}>
                −₹{coupon.discount.toLocaleString("en-IN")}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: "#10b981", fontWeight: 600 }}>{coupon.label}</div>
                <div style={{ fontSize: 11, color: "#444" }}>Code: {coupon.code}</div>
              </div>
              <button onClick={onClearCoupon}
                style={{
                  background: "none", border: "none", color: "#444", cursor: "pointer",
                  fontSize: 18, fontFamily: "inherit", padding: "2px 6px", lineHeight: 1,
                }}>
                ×
              </button>
            </div>
          )}
        </div>
      )}

      {/* Order summary */}
      <div style={{ ...CARD_BASE, padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 10, color: ACCENT, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 14 }}>
          Order Summary
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#aaa", marginBottom: 8 }}>
          <span>{category.name}</span>
          <span>₹{basePrice.toLocaleString("en-IN")}</span>
        </div>
        {coupon && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#10b981", marginBottom: 8 }}>
            <span>Coupon ({coupon.code})</span>
            <span>−₹{discount.toLocaleString("en-IN")}</span>
          </div>
        )}
        <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "12px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, color: "#555" }}>Total</span>
          <span style={{ fontSize: 24, fontWeight: 900, color: ACCENT }}>
            ₹{finalPrice.toLocaleString("en-IN")}
          </span>
        </div>
      </div>

      {submitError && (
        <div style={{
          color: "#f87171", fontSize: 13, marginBottom: 16,
          padding: "10px 14px", background: "rgba(248,113,113,0.06)",
          border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8,
        }}>
          {submitError}
        </div>
      )}

      {returnToReview ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
          <button onClick={onSaveAndReturn} style={{ ...BTN_PRIMARY, flex: 1, justifyContent: "center" }}>
            Save & Return to Review →
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
          <button onClick={onBack} style={BTN_GHOST}>← Back</button>
          <button onClick={onSubmit} disabled={submitting}
            style={{ ...BTN_PRIMARY, flex: 1, justifyContent: "center", opacity: submitting ? 0.6 : 1 }}>
            {submitting
              ? "Processing…"
              : finalPrice === 0
                ? "Complete Registration (Free)"
                : `Proceed to Payment · ₹${finalPrice.toLocaleString("en-IN")}`}
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 6 — Payment
// ─────────────────────────────────────────────────────────────────────────────

function StepPayment({
  regCode, finalPrice, submitting, submitError, onPay,
}: {
  regCode: string; finalPrice: number;
  submitting: boolean; submitError: string; onPay: () => void;
}) {
  return (
    <div>
      <ProgressStepper step={6} />
      <h2 style={{ fontSize: "clamp(20px,3vw,24px)", fontWeight: 800, color: "#fff", marginBottom: 6 }}>
        Complete Payment
      </h2>
      <p style={{ fontSize: 13, color: "#555", marginBottom: 20 }}>
        Your registration is saved. Complete payment now to confirm your spot.
      </p>

      <div style={{ ...CARD_BASE, padding: 24, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" as const, gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: "#444", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 6 }}>
              Registration Saved
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "0.06em" }}>{regCode}</div>
            <div style={{ fontSize: 11, color: "#444", marginTop: 3 }}>Your registration code</div>
          </div>
          <div style={{ textAlign: "right" as const }}>
            <div style={{ fontSize: 11, color: "#444", marginBottom: 2 }}>Amount Due</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: ACCENT }}>₹{finalPrice.toLocaleString("en-IN")}</div>
          </div>
        </div>
      </div>

      <div style={{ ...CARD_BASE, padding: 14, marginBottom: 24, fontSize: 12, color: "#444", lineHeight: 1.7 }}>
        Your spot is reserved for <strong style={{ color: "#666" }}>15 minutes</strong>. Complete payment now to avoid losing it.
        We accept UPI, Cards, Net Banking, and Wallets.
      </div>

      <button
        onClick={onPay}
        disabled={submitting}
        style={{ ...BTN_PRIMARY, width: "100%", justifyContent: "center", fontSize: 16, padding: "18px 28px", opacity: submitting ? 0.6 : 1 }}>
        {submitting ? "Opening Payment…" : `Pay ₹${finalPrice.toLocaleString("en-IN")} Now`}
      </button>

      {submitError && (
        <div style={{
          color: "#f87171", fontSize: 13, marginTop: 12,
          padding: "10px 14px", background: "rgba(248,113,113,0.06)",
          border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8,
        }}>
          {submitError}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 7 — Success
// ─────────────────────────────────────────────────────────────────────────────

function StepSuccess({ regCode, paymentDone, eventTitle }: {
  regCode: string; paymentDone: boolean; eventTitle: string;
}) {
  return (
    <div style={{ textAlign: "center" as const, paddingTop: 32 }}>
      <div style={{
        width: 72, height: 72, margin: "0 auto 20px",
        background: "rgba(16,185,129,0.07)", border: "2px solid rgba(16,185,129,0.2)",
        borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 28, color: "#10b981", animation: "popIn 0.5s ease",
      }}>
        ✓
      </div>

      <h1 style={{ fontSize: "clamp(22px,4vw,30px)", fontWeight: 900, color: "#fff", marginBottom: 8 }}>
        {paymentDone ? "Payment Confirmed!" : "Registration Complete!"}
      </h1>
      <p style={{ fontSize: 15, color: "#777", marginBottom: 4 }}>
        You are registered for <strong style={{ color: "#ddd" }}>{eventTitle}</strong>
      </p>
      <p style={{ fontSize: 13, color: "#444", marginBottom: 32 }}>
        Check your email for the confirmation, QR code, and invoice.
      </p>

      <div style={{ ...CARD_BASE, padding: 24, marginBottom: 20, maxWidth: 380, margin: "0 auto 20px" }}>
        <div style={{ fontSize: 10, color: "#444", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 6 }}>
          Registration Code
        </div>
        <div style={{ fontSize: 30, fontWeight: 900, color: ACCENT, letterSpacing: "0.1em", marginBottom: 6 }}>
          {regCode}
        </div>
        <div style={{ fontSize: 11, color: "#444", lineHeight: 1.6 }}>
          Save this code. Use it to access your participant dashboard and book your BIB collection slot.
        </div>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10,
        marginBottom: 24, maxWidth: 420, margin: "0 auto 24px",
      }}>
        {[
          { icon: "✉", label: "Confirmation Email", note: "Sent to your inbox" },
          { icon: "⬡", label: "QR Code",            note: "In your email" },
          { icon: "📋", label: "BIB Collection",    note: "Book slot on dashboard" },
        ].map(item => (
          <div key={item.label} style={{ ...CARD_BASE, padding: 14, textAlign: "center" as const }}>
            <div style={{ fontSize: 20, marginBottom: 5 }}>{item.icon}</div>
            <div style={{ fontSize: 11, color: "#ccc", fontWeight: 600, marginBottom: 2 }}>{item.label}</div>
            <div style={{ fontSize: 10, color: "#444" }}>{item.note}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" as const }}>
        <Link href={`/it-run/dashboard/${regCode}`} style={BTN_PRIMARY}>
          View My Dashboard
        </Link>
        <Link href="/it-run" style={BTN_GHOST}>Back to Event</Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RegisterPageContent — orchestrator
// ─────────────────────────────────────────────────────────────────────────────

function RegisterPageContent() {
  const searchParams = useSearchParams();

  // Config
  const [config,        setConfig]        = useState<ItRunEventConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  // Flow — step 1=Category, 2=Participants, 3=Verification, 4=Review, 5=Coupon, 6=Payment, 7=Success
  const [step,              setStep]             = useState(1);
  const [participantSubIdx, setParticipantSubIdx] = useState(0);
  const [selectedCat,       setSelectedCat]      = useState<ItRunCategory | null>(null);
  const [participants,      setParticipants]     = useState<Participant[]>([emptyParticipant()]);
  const [pErrors,           setPErrors]          = useState<ParticipantErrors[]>([{}]);

  // Coupon
  const [couponCode,    setCouponCode]    = useState("");
  const [coupon,        setCoupon]        = useState<CouponData | null>(null);
  const [couponError,   setCouponError]   = useState("");
  const [couponLoading, setCouponLoading] = useState(false);

  // Edit-from-review: when true, step 2/3/5 return to step 4 after saving
  const [returnToReview, setReturnToReview] = useState(false);

  // Submission
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [regCode,     setRegCode]     = useState("");
  const [regId,       setRegId]       = useState("");
  // When payment step is restored from a draft after page refresh, we use the
  // price that was returned by the register API (already committed to the DB)
  // rather than re-deriving it, in case the coupon state didn't survive.
  const [finalPriceOverride, setFinalPriceOverride] = useState<number | null>(null);
  const [paymentDone, setPaymentDone] = useState(false);

  // Upload
  const [uploading, setUploading] = useState<number[]>([]);

  // Draft resume — holds a found draft until the user chooses Continue or Start New
  const [draftToResume, setDraftToResume] = useState<DraftRecord | null>(null);
  // Offline / save status indicator
  const [isOffline,  setIsOffline]  = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "offline" | "">("");

  // ── Email verification gate ──────────────────────────────────────────────────
  const [sessionChecked,  setSessionChecked]  = useState(false);
  const [emailVerified,   setEmailVerified]   = useState(false);
  const [verifiedEmail,     setVerifiedEmail]     = useState("");
  const [verifiedFirstName, setVerifiedFirstName] = useState("");
  const [isReturningUser,   setIsReturningUser]   = useState(false);
  const [profileData,     setProfileData]     = useState<ProfileAutoFill | null>(null);
  const [profileApplied,  setProfileApplied]  = useState(false);
  // OTP sub-states
  const [gateEmail,    setGateEmail]    = useState("");
  const [otpSent,      setOtpSent]      = useState(false);
  const [otpInput,     setOtpInput]     = useState("");
  const [needsName,    setNeedsName]    = useState(false);
  const [nameFirst,    setNameFirst]    = useState("");
  const [nameLast,     setNameLast]     = useState("");
  const [nameMobile,   setNameMobile]   = useState("");
  const [otpError,     setOtpError]     = useState("");
  const [sendingOtp,   setSendingOtp]   = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [resendAt,     setResendAt]     = useState(0);
  const [resendSecs,   setResendSecs]   = useState(0);

  // Price
  const basePrice  = selectedCat?.price_rupees ?? 0;
  const discount   = coupon?.discount ?? 0;
  const finalPrice = finalPriceOverride ?? Math.max(0, basePrice - discount);

  // ── Load event config ──────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/it-run/event-config")
      .then(r => r.json())
      .then((d: ItRunEventConfig) => { setConfig(d); setConfigLoading(false); })
      .catch(() => setConfigLoading(false));
  }, []);

  // ── Pre-select category from URL ───────────────────────────────────────────
  // Skip if a v4 or v3 draft exists — the resume banner will handle restoration.
  useEffect(() => {
    const slug = searchParams.get("category");
    if (!slug || !config?.categories.length) return;
    try {
      if (localStorage.getItem(DRAFT_KEY) || localStorage.getItem(DRAFT_KEY_V3)) return;
    } catch { /* storage unavailable — proceed with URL pre-select */ }
    const cat = config.categories.find(c => c.slug === slug);
    if (cat && !cat.is_soldout) selectCategory(cat);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, config]);

  // ── Draft auto-save (v4 — event-scoped key, added version + eventSlug) ──────
  useEffect(() => {
    if (step > 1 && selectedCat) {
      try {
        const draftParticipants = participants.map(p => ({ ...p, companyIdFile: null }));
        const now = Date.now();
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          version:  4,
          eventSlug: "sprint-2",
          step, participantSubIdx, selectedCatId: selectedCat.id,
          participants: draftParticipants, couponCode,
          regId:      regId   || undefined,
          regCode:    regCode || undefined,
          finalPrice: regId   ? finalPrice : undefined,
          savedAt:    now,
          expiresAt:  now + DRAFT_TTL_MS,
        } satisfies DraftRecord));
        setSaveStatus(isOffline ? "offline" : "saved");
      } catch {
        setSaveStatus("");
      }
    }
  }, [step, participantSubIdx, selectedCat, participants, couponCode, regId, regCode, isOffline, finalPrice]);

  // ── Draft restore — sets draftToResume so the user sees a resume banner ──────
  // The banner then calls applyDraft() or discardDraft() based on the user's choice.
  useEffect(() => {
    if (!config) return;
    try {
      // Prefer v4 key; fall back to v3 for backward compat (treated as v3 migration)
      const raw4 = localStorage.getItem(DRAFT_KEY);
      const raw3 = localStorage.getItem(DRAFT_KEY_V3);
      const raw  = raw4 ?? raw3;
      if (!raw) return;

      const d = JSON.parse(raw) as DraftRecord;
      if (!d.step || !d.selectedCatId) return;

      // Discard if expired (prefer expiresAt if present, else fall back to savedAt + TTL)
      const expiry = d.expiresAt ?? (d.savedAt ? d.savedAt + DRAFT_TTL_MS : 0);
      if (expiry && Date.now() > expiry) {
        try { localStorage.removeItem(DRAFT_KEY); localStorage.removeItem(DRAFT_KEY_V3); } catch {}
        return;
      }

      // Discard if category no longer exists or is sold out
      const cat = config.categories.find(c => c.id === d.selectedCatId);
      if (!cat || cat.is_soldout) return;

      // Store the draft — user will decide via the resume banner
      setDraftToResume(d);
    } catch { /* corrupted draft — ignore */ }
  }, [config]);

  // ── Clear draft on success ─────────────────────────────────────────────────
  useEffect(() => {
    if (step === 7) {
      try {
        localStorage.removeItem(DRAFT_KEY);
        localStorage.removeItem(DRAFT_KEY_V3); // also clear legacy key
      } catch { /* ignore */ }
    }
  }, [step]);

  // ── Offline detection ──────────────────────────────────────────────────────
  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const goOnline  = () => { setIsOffline(false); setSaveStatus("saved"); };
    const goOffline = () => { setIsOffline(true);  setSaveStatus("offline"); };
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // ── Cross-tab protection: discard draft changes from another tab if they are
  //    older than what this tab has already saved ──────────────────────────────
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== DRAFT_KEY || !e.newValue) return;
      try {
        const incoming = JSON.parse(e.newValue) as DraftRecord;
        // If this tab has a newer in-progress save, ignore the older write from the other tab.
        // The useEffect[step,…] will overwrite localStorage on the next state change anyway.
        if (step > 1 && incoming.savedAt && incoming.savedAt < Date.now() - 500) return;
      } catch {}
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [step]);

  // ── Session check on mount — skip email gate if already authenticated ─────────
  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then((d: { email?: string; firstName?: string } | null) => {
        if (d?.email) {
          const em = d.email.toLowerCase();
          setVerifiedEmail(em);
          setVerifiedFirstName(d.firstName ?? "");
          setEmailVerified(true);
          setIsReturningUser(true);
          fetch("/api/it-run/profile")
            .then(r => r.ok ? r.json() : null)
            .then((p: ProfileAutoFill | null) => { if (p) setProfileData(p); })
            .catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setSessionChecked(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resend OTP countdown ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!resendAt) return;
    const tick = () => {
      const s = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
      setResendSecs(s);
      if (s === 0) clearInterval(id);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [resendAt]);

  // ── Auto-fill participant form when entering step 2 ───────────────────────────
  useEffect(() => {
    if (step !== 2 || !profileData || profileApplied) return;
    setProfileApplied(true);
    setParticipants(prev => {
      const copy = [...prev];
      const p = { ...copy[0] };
      if (!p.firstName)       p.firstName       = profileData.firstName;
      if (!p.lastName)        p.lastName        = profileData.lastName;
      if (!p.mobile)          p.mobile          = profileData.mobile;
      if (!p.dob)             p.dob             = profileData.dob;
      if (!p.gender)          p.gender          = profileData.gender;
      if (!p.bloodGroup)      p.bloodGroup      = profileData.bloodGroup;
      if (!p.emergencyName)   p.emergencyName   = profileData.emergencyName;
      if (!p.emergencyPhone)  p.emergencyPhone  = profileData.emergencyPhone;
      if (!p.companyName)     p.companyName     = profileData.companyName;
      if (!p.employeeId)      p.employeeId      = profileData.employeeId;
      if (!p.tshirtSize)      p.tshirtSize      = profileData.tshirtSize;
      if (!p.foodPreference || p.foodPreference === "veg") {
        if (profileData.foodPreference) p.foodPreference = profileData.foodPreference;
      }
      if (!p.medicalConditions) p.medicalConditions = profileData.medicalConditions;
      copy[0] = p;
      return copy;
    });
  }, [step, profileData, profileApplied]);

  // Reset profileApplied when category changes so new category auto-fills properly
  useEffect(() => { setProfileApplied(false); }, [selectedCat]);

  // ── OTP email gate helpers ────────────────────────────────────────────────────

  function maskEmail(email: string): string {
    const [local, domain] = email.split("@");
    if (!local || !domain) return email;
    const visible = local.slice(0, 2);
    return `${visible}${"*".repeat(Math.max(2, local.length - 2))}@${domain}`;
  }

  async function sendOtp() {
    const em = gateEmail.trim().toLowerCase();
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setOtpError("Please enter a valid email address");
      return;
    }
    setSendingOtp(true);
    setOtpError("");
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "email", value: em, purpose: "event_register" }),
      });
      const d = await res.json();
      if (!res.ok) { setOtpError(d.error ?? "Failed to send code"); return; }
      setOtpSent(true);
      setOtpInput("");
      setNeedsName(false);
      setResendAt(Date.now() + 60_000);
    } catch {
      setOtpError("Network error. Please try again.");
    } finally {
      setSendingOtp(false);
    }
  }

  async function verifyOtp(extraName?: string, extraMobile?: string) {
    const em   = gateEmail.trim().toLowerCase();
    const code = otpInput.trim();
    if (code.length !== 6) { setOtpError("Enter the 6-digit code"); return; }
    setVerifyingOtp(true);
    setOtpError("");
    try {
      const body: Record<string, string> = { email: em, code };
      if (extraName)   body.name   = extraName;
      if (extraMobile) body.mobile = extraMobile;
      const res = await fetch("/api/auth/complete-event-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) { setOtpError(d.error ?? "Verification failed"); return; }

      if (d.needs_profile) {
        // New user — collect name before account creation
        setNeedsName(true);
        return;
      }

      // Authenticated (new or existing) — fetch auto-fill, enter flow
      setVerifiedEmail(em);
      setVerifiedFirstName(d.user?.firstName ?? "");
      setEmailVerified(true);
      setIsReturningUser(!!d.user?.firstName && !extraName);
      fetch("/api/it-run/profile")
        .then(r => r.ok ? r.json() : null)
        .then((p: ProfileAutoFill | null) => { if (p) setProfileData(p); })
        .catch(() => {});
    } catch {
      setOtpError("Network error. Please try again.");
    } finally {
      setVerifyingOtp(false);
    }
  }

  // ── Category selection ─────────────────────────────────────────────────────

  function selectCategory(cat: ItRunCategory) {
    setSelectedCat(cat);
    setParticipants(Array.from({ length: cat.participant_count }, emptyParticipant));
    setPErrors(Array.from({ length: cat.participant_count }, () => ({})));
    setParticipantSubIdx(0);
    setDraftToResume(null); // clear resume banner when user picks a new category
    setStep(2);
  }

  // ── Apply a saved draft (user clicked "Continue Registration") ─────────────
  function applyDraft(d: DraftRecord) {
    if (!config) return;
    const cat = config.categories.find(c => c.id === d.selectedCatId);
    if (!cat) return;

    setSelectedCat(cat);
    setParticipants(
      (d.participants ?? [emptyParticipant()]).map(p => ({ ...p, companyIdFile: null }))
    );
    setPErrors(Array.from({ length: d.participants?.length ?? 1 }, () => ({})));
    setParticipantSubIdx(0);
    setCouponCode(d.couponCode ?? "");
    setCoupon(null); // coupon must be revalidated — only the code text is restored

    if (d.regId && d.regCode && d.step >= 6) {
      // Registration was already created; go straight to payment step
      setRegId(d.regId);
      setRegCode(d.regCode);
      if (d.finalPrice !== undefined) setFinalPriceOverride(d.finalPrice);
      setStep(6);
    } else {
      // Restore to the saved step (2–5); never skip back to step 1 or forward to 6+
      setStep(Math.min(Math.max(d.step, 2), 5));
    }

    // Migrate from v3: write to v4 key immediately
    if (!localStorage.getItem(DRAFT_KEY)) {
      try { localStorage.removeItem(DRAFT_KEY_V3); } catch {}
    }

    setDraftToResume(null);
  }

  // ── Discard a saved draft (user clicked "Start New Registration") ──────────
  function discardDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(DRAFT_KEY_V3);
    } catch {}
    setDraftToResume(null);
  }

  // ── Participant field update ───────────────────────────────────────────────

  function updateParticipant(idx: number, field: keyof Participant, val: string | File | null) {
    setParticipants(prev => {
      const copy = [...prev]; copy[idx] = { ...copy[idx], [field]: val }; return copy;
    });
    // Clear the error for this field as the user edits
    setPErrors(prev => {
      const c = [...prev]; c[idx] = { ...c[idx], [field]: undefined }; return c;
    });
  }

  // ── Company ID upload ──────────────────────────────────────────────────────

  const uploadCompanyId = useCallback(async (idx: number, file: File) => {
    setUploading(prev => [...prev, idx]);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("participantIdx", String(idx));
      const res  = await fetch("/api/it-run/upload/company-id", { method: "POST", body: form });
      const data = await res.json();
      updateParticipant(idx, "companyIdUrl", data.url ?? "error");
    } catch {
      updateParticipant(idx, "companyIdUrl", "error");
    } finally {
      setUploading(prev => prev.filter(i => i !== idx));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Validation — validates one participant by index ────────────────────────

  function validateParticipant(idx: number): boolean {
    if (!selectedCat) return false;
    const p     = participants[idx];
    const child = selectedCat.participant_labels[idx]?.is_child ?? false;
    const e: ParticipantErrors = {};
    let valid = true;

    // Name: allow letters, spaces, hyphens, apostrophes, dots, accented/Unicode chars;
    // reject empty or symbol-only strings (e.g. "---", "!!!")
    const nameRe = /[\p{L}]/u;
    if (!p.firstName.trim() || !nameRe.test(p.firstName)) {
      e.firstName = "Enter a valid first name"; valid = false;
    }
    if (!p.lastName.trim() || !nameRe.test(p.lastName)) {
      e.lastName = "Enter a valid last name"; valid = false;
    }
    if (!p.gender)            { e.gender    = "Required"; valid = false; }
    if (!p.dob)               { e.dob       = "Required"; valid = false; }
    if (!p.mobile || !/^\d{10}$/.test(p.mobile.replace(/\D/g, "").slice(-10))) {
      e.mobile = "Enter a valid 10-digit Indian mobile number"; valid = false;
    }
    if (!p.bloodGroup)  { e.bloodGroup  = "Required"; valid = false; }
    if (!p.tshirtSize)  { e.tshirtSize  = "Required"; valid = false; }

    if (!child) {
      if (!p.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) {
        e.email = "Valid email required"; valid = false;
      }
      if (!p.emergencyName.trim())  { e.emergencyName  = "Required"; valid = false; }
      if (!p.emergencyPhone.trim()) { e.emergencyPhone = "Required"; valid = false; }
      if (!p.companyName.trim() || !nameRe.test(p.companyName)) {
        e.companyName = "Enter a valid company name"; valid = false;
      }
    }

    if (child && p.dob) {
      // Use event date (IST 00:00) for age calculation — matches server-side logic.
      // A child who turns 11 before the event is ineligible even if 10 today.
      const eventMs = config
        ? new Date(config.event.event_date + "T00:00:00+05:30").getTime()
        : Date.now();
      const ageYears = (eventMs - new Date(p.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      if (ageYears >= 11) { e.dob = "Child must be 10 years or younger on the event date"; valid = false; }
    }

    setPErrors(prev => { const c = [...prev]; c[idx] = e; return c; });
    return valid;
  }

  // ── Participant step navigation ────────────────────────────────────────────

  function handleParticipantBack() {
    if (participantSubIdx > 0) {
      setParticipantSubIdx(i => i - 1);
    } else {
      setStep(1);
    }
  }

  function handleParticipantNext() {
    setSubmitError("");
    if (!validateParticipant(participantSubIdx)) return;
    if (returnToReview) {
      setReturnToReview(false);
      setStep(4);
      return;
    }
    const lastIdx = (selectedCat?.participant_count ?? 1) - 1;
    if (participantSubIdx < lastIdx) {
      setParticipantSubIdx(i => i + 1);
    } else {
      setStep(3);
    }
  }

  // ── Edit-from-review handlers ──────────────────────────────────────────────

  function editParticipant(idx: number) {
    setParticipantSubIdx(idx);
    setReturnToReview(true);
    setStep(2);
  }

  function editVerification() {
    setReturnToReview(true);
    setStep(3);
  }

  function editCategory() {
    // Category change resets participants — don't set returnToReview
    setReturnToReview(false);
    setStep(1);
  }

  function editCoupon() {
    setReturnToReview(true);
    setStep(5);
  }

  // ── Coupon validation ──────────────────────────────────────────────────────

  async function validateCoupon() {
    if (!couponCode.trim() || !selectedCat) return;
    setCouponLoading(true);
    setCouponError("");
    try {
      const res  = await fetch("/api/it-run/coupons/validate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponCode.trim().toUpperCase(), categoryId: selectedCat.id, amount: finalPrice }),
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

  // ── Submit registration ────────────────────────────────────────────────────

  async function submitRegistration() {
    if (!selectedCat) return;
    setSubmitting(true);
    setSubmitError("");

    // Save draft explicitly BEFORE the API call so all entered data is preserved
    // if the network drops mid-request. The useEffect save is async; this is synchronous.
    try {
      const now = Date.now();
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        version: 4, eventSlug: "sprint-2",
        step, participantSubIdx, selectedCatId: selectedCat.id,
        participants: participants.map(p => ({ ...p, companyIdFile: null })),
        couponCode,
        savedAt: now, expiresAt: now + DRAFT_TTL_MS,
      } satisfies DraftRecord));
    } catch {}

    try {
      const res  = await fetch("/api/it-run/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId:   selectedCat.id,
          couponId:     coupon?.id ?? null,
          participants: participants.map((p, idx) => ({
            type:              selectedCat.participant_labels[idx]?.role ?? "solo",
            firstName:         p.firstName,
            lastName:          p.lastName,
            gender:            p.gender,
            dob:               p.dob,
            email:             p.email,
            mobile:            p.mobile,
            bloodGroup:        p.bloodGroup,
            emergencyName:     p.emergencyName,
            emergencyPhone:    p.emergencyPhone,
            companyName:       p.companyName,
            employeeId:        p.employeeId,
            companyIdUrl:      p.companyIdUrl,
            tshirtSize:        p.tshirtSize,
            medicalConditions: p.medicalConditions,
            foodPreference:    p.foodPreference,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setSubmitError(data.error ?? "Registration failed"); return; }
      setRegCode(data.registrationCode);
      setRegId(data.registrationId);
      if (data.finalPrice === 0) { setStep(7); return; }
      setStep(6);
    } catch {
      setSubmitError("Network error. Your information is saved — check your connection and try again.");
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: regId }),
      });
      const data = await res.json();
      if (!res.ok) { setSubmitError(data.error ?? "Could not create payment"); return; }

      const rz = new window.Razorpay({
        key:         data.key,
        amount:      data.amount,
        currency:    "INR",
        order_id:    data.orderId,
        name:        "Connected Steps",
        description: `${config?.event.title ?? "The IT Run Sprint-2"} — ${selectedCat?.name ?? "Registration"}`,
        image:       "/logo.png",
        prefill: {
          email:   participants[0]?.email,
          contact: participants[0]?.mobile,
          name:    `${participants[0]?.firstName ?? ""} ${participants[0]?.lastName ?? ""}`.trim(),
        },
        theme: { color: ACCENT },
        handler: async (response: Record<string, string>) => {
          await verifyPayment(response.razorpay_payment_id, response.razorpay_order_id, response.razorpay_signature);
        },
        modal: { ondismiss: () => { setSubmitting(false); } },
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: regId, paymentId, orderId, signature }),
      });
      const data = await res.json();
      if (!res.ok) { setSubmitError(data.error ?? "Payment verification failed"); return; }
      setPaymentDone(true);
      setStep(7);
    } catch {
      setSubmitError("Verification failed. Contact support if payment was deducted.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const regClosed = config?.event.registration_closes_at
    ? Date.now() > new Date(config.event.registration_closes_at).getTime()
    : false;
  const eventTitle = config?.event.title ?? "The IT Run Sprint-2";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: BG, color: "#fff", fontFamily: "'Inter',system-ui,sans-serif", minHeight: "100vh" }}>

      {/* Nav */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        background: "rgba(8,8,8,0.97)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        height: 52, display: "flex", alignItems: "center",
        padding: "0 clamp(1rem,4vw,2rem)", justifyContent: "space-between",
      }}>
        <Link href="/it-run" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <Image src="/logo.png" alt="" width={22} height={22} style={{ borderRadius: "50%" }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{eventTitle}</div>
            <div style={{ fontSize: 10, color: "#444" }}>Registration</div>
          </div>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {step > 1 && step < 7 && saveStatus && (
            <span style={{ fontSize: 11, color: saveStatus === "offline" ? "#f59e0b" : "#3a3a3a" }}>
              {saveStatus === "offline" ? "Offline — saved locally" : "Saved"}
            </span>
          )}
          {step < 7 && (
            <Link href="/it-run" style={{ fontSize: 12, color: "#3a3a3a", textDecoration: "none" }}>
              Cancel
            </Link>
          )}
        </div>
      </nav>

      {/* Offline banner */}
      {isOffline && step < 7 && (
        <div style={{
          position: "fixed", top: 52, left: 0, right: 0, zIndex: 99,
          background: "rgba(245,158,11,0.08)", borderBottom: "1px solid rgba(245,158,11,0.18)",
          padding: "8px clamp(1rem,4vw,2rem)", fontSize: 13, color: "#f59e0b", textAlign: "center" as const,
        }}>
          You&rsquo;re offline. Your registration details are saved on this device and will be restored when you reconnect.
        </div>
      )}

      {/* Registration closed banner */}
      {regClosed && step === 1 && (
        <div style={{
          position: "fixed", top: 52, left: 0, right: 0, zIndex: 99,
          background: "rgba(248,113,113,0.08)", borderBottom: "1px solid rgba(248,113,113,0.18)",
          padding: "8px clamp(1rem,4vw,2rem)", fontSize: 13, color: "#f87171", textAlign: "center" as const,
        }}>
          Registration for this event is now closed.
        </div>
      )}

      {/* Loading gate */}
      {!sessionChecked && (
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "calc(52px + 2rem) clamp(1rem,5vw,2rem)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" as const }}>
            <div style={{ width: 32, height: 32, border: "3px solid rgba(255,255,255,0.08)", borderTopColor: ACCENT, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
            <div style={{ fontSize: 14, color: "#555" }}>Loading…</div>
          </div>
        </div>
      )}

      {/* Email gate */}
      {sessionChecked && !emailVerified && (
        <div style={{ maxWidth: 480, margin: "0 auto", padding: `calc(52px + clamp(2rem,6vw,3rem)) clamp(1rem,5vw,2rem) clamp(2rem,6vw,3rem)`, minHeight: "100vh" }}>

          {/* Email input */}
          {!otpSent && (
            <div>
              <div style={{ marginBottom: 32, textAlign: "center" as const }}>
                <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 12 }}>
                  Email Verification
                </div>
                <h1 style={{ fontSize: "clamp(1.4rem,4vw,1.8rem)", fontWeight: 800, color: "#fff", margin: "0 0 10px" }}>
                  Verify your email to register
                </h1>
                <p style={{ fontSize: 14, color: "#888", margin: 0, lineHeight: 1.6 }}>
                  Enter your email to receive a one-time code. Existing accounts will have their details pre-filled.
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={gateEmail}
                  onChange={e => { setGateEmail(e.target.value); setOtpError(""); }}
                  onKeyDown={e => { if (e.key === "Enter") void sendOtp(); }}
                  autoFocus
                  style={{
                    width: "100%", padding: "14px 16px", background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12,
                    color: "#fff", fontSize: 16, fontFamily: "inherit", outline: "none",
                    boxSizing: "border-box" as const,
                  }}
                />
                {otpError && <div style={{ fontSize: 13, color: "#f87171" }}>{otpError}</div>}
                <button
                  onClick={() => void sendOtp()}
                  disabled={sendingOtp}
                  style={{
                    padding: "14px 24px", background: sendingOtp ? "rgba(232,98,10,0.5)" : ACCENT,
                    border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700,
                    cursor: sendingOtp ? "not-allowed" : "pointer", fontFamily: "inherit",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}>
                  {sendingOtp && <div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />}
                  {sendingOtp ? "Sending…" : "Send Verification Code"}
                </button>
              </div>
            </div>
          )}

          {/* OTP input */}
          {otpSent && !needsName && (
            <div>
              <div style={{ marginBottom: 32, textAlign: "center" as const }}>
                <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 12 }}>
                  Check Your Inbox
                </div>
                <h1 style={{ fontSize: "clamp(1.4rem,4vw,1.8rem)", fontWeight: 800, color: "#fff", margin: "0 0 10px" }}>
                  Enter the 6-digit code
                </h1>
                <p style={{ fontSize: 14, color: "#888", margin: 0, lineHeight: 1.6 }}>
                  Sent to <strong style={{ color: "#ccc" }}>{maskEmail(gateEmail)}</strong>. Check your spam folder if you don&apos;t see it.
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="123456"
                  maxLength={6}
                  value={otpInput}
                  onChange={e => { setOtpInput(e.target.value.replace(/\D/g, "")); setOtpError(""); }}
                  onKeyDown={e => { if (e.key === "Enter") void verifyOtp(); }}
                  autoFocus
                  style={{
                    width: "100%", padding: "14px 16px", background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12,
                    color: "#fff", fontSize: 24, fontWeight: 700, textAlign: "center" as const,
                    letterSpacing: "0.3em", fontFamily: "monospace", outline: "none",
                    boxSizing: "border-box" as const,
                  }}
                />
                {otpError && <div style={{ fontSize: 13, color: "#f87171" }}>{otpError}</div>}
                <button
                  onClick={() => void verifyOtp()}
                  disabled={verifyingOtp || otpInput.length !== 6}
                  style={{
                    padding: "14px 24px",
                    background: (verifyingOtp || otpInput.length !== 6) ? "rgba(232,98,10,0.4)" : ACCENT,
                    border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700,
                    cursor: (verifyingOtp || otpInput.length !== 6) ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}>
                  {verifyingOtp && <div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />}
                  {verifyingOtp ? "Verifying…" : "Verify & Continue"}
                </button>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" as const, gap: 8 }}>
                  {resendSecs > 0 ? (
                    <span style={{ fontSize: 13, color: "#555" }}>Resend in {resendSecs}s</span>
                  ) : (
                    <button
                      onClick={() => void sendOtp()}
                      style={{ fontSize: 13, color: ACCENT, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
                      Resend code
                    </button>
                  )}
                  <button
                    onClick={() => { setOtpSent(false); setOtpInput(""); setOtpError(""); }}
                    style={{ fontSize: 13, color: "#555", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
                    Change email
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Name collection for new accounts */}
          {needsName && (
            <div>
              <div style={{ marginBottom: 32, textAlign: "center" as const }}>
                <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 12 }}>
                  One More Step
                </div>
                <h1 style={{ fontSize: "clamp(1.4rem,4vw,1.8rem)", fontWeight: 800, color: "#fff", margin: "0 0 10px" }}>
                  Tell us your name
                </h1>
                <p style={{ fontSize: 14, color: "#888", margin: 0, lineHeight: 1.6 }}>
                  Your Connected Steps account will be created with the details below.
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <input
                    type="text"
                    placeholder="First name"
                    value={nameFirst}
                    onChange={e => { setNameFirst(e.target.value); setOtpError(""); }}
                    style={{
                      padding: "14px 16px", background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12,
                      color: "#fff", fontSize: 15, fontFamily: "inherit", outline: "none",
                      boxSizing: "border-box" as const,
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Last name"
                    value={nameLast}
                    onChange={e => { setNameLast(e.target.value); setOtpError(""); }}
                    style={{
                      padding: "14px 16px", background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12,
                      color: "#fff", fontSize: 15, fontFamily: "inherit", outline: "none",
                      boxSizing: "border-box" as const,
                    }}
                  />
                </div>
                <input
                  type="tel"
                  placeholder="Mobile number (optional)"
                  value={nameMobile}
                  onChange={e => { setNameMobile(e.target.value); setOtpError(""); }}
                  style={{
                    padding: "14px 16px", background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12,
                    color: "#fff", fontSize: 15, fontFamily: "inherit", outline: "none",
                    boxSizing: "border-box" as const, width: "100%",
                  }}
                />
                {otpError && <div style={{ fontSize: 13, color: "#f87171" }}>{otpError}</div>}
                <button
                  onClick={() => {
                    const fn = nameFirst.trim(), ln = nameLast.trim();
                    if (!fn || !ln) { setOtpError("Please enter your first and last name"); return; }
                    void verifyOtp(`${fn} ${ln}`, nameMobile.trim() || undefined);
                  }}
                  disabled={verifyingOtp}
                  style={{
                    padding: "14px 24px", background: verifyingOtp ? "rgba(232,98,10,0.5)" : ACCENT,
                    border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700,
                    cursor: verifyingOtp ? "not-allowed" : "pointer", fontFamily: "inherit",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}>
                  {verifyingOtp && <div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />}
                  {verifyingOtp ? "Creating account…" : "Create Account & Continue"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main content */}
      {sessionChecked && emailVerified && (
      <div style={{
        maxWidth: 640, margin: "0 auto",
        padding: `calc(52px + ${isOffline && step < 7 ? "36px + " : ""}clamp(1.5rem,5vw,2.5rem)) clamp(1rem,5vw,2rem) ${step >= 2 && step <= 6 && selectedCat ? "80px" : "clamp(1.5rem,5vw,2.5rem)"}`,
        minHeight: "100vh",
      }}>

        {step === 1 && draftToResume && config && (() => {
          const cat = config.categories.find(c => c.id === draftToResume.selectedCatId);
          return (
            <div style={{
              ...CARD_BASE,
              borderColor: "rgba(232,98,10,0.3)",
              background: "rgba(232,98,10,0.05)",
              padding: "20px 24px", marginBottom: 24,
            }}>
              <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
                Registration in Progress
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
                You have an incomplete IT Run Sprint-2 registration
              </div>
              {cat && (
                <div style={{ fontSize: 13, color: "#aaa", marginBottom: 4 }}>
                  Category: <strong style={{ color: "#fff" }}>{cat.name}</strong>
                </div>
              )}
              <div style={{ fontSize: 13, color: "#aaa", marginBottom: 4 }}>
                You were on: <strong style={{ color: "#fff" }}>{stepLabel(draftToResume.step)}</strong>
              </div>
              <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>
                Last saved: {timeAgo(draftToResume.savedAt)}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={() => applyDraft(draftToResume)}
                  style={{
                    padding: "11px 22px", background: ACCENT, border: "none",
                    borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>
                  Continue Registration
                </button>
                <button
                  onClick={() => {
                    if (confirm("Start a new registration? Your saved progress will be lost.")) {
                      discardDraft();
                    }
                  }}
                  style={{
                    padding: "11px 22px", background: "transparent",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 10, color: "#888", fontSize: 14,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>
                  Start New Registration
                </button>
              </div>
            </div>
          );
        })()}

        {step === 1 && emailVerified && isReturningUser && (
          <div style={{
            ...CARD_BASE,
            borderColor: "rgba(74,222,128,0.2)",
            background: "rgba(74,222,128,0.04)",
            padding: "16px 20px", marginBottom: 24,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#4ade80", marginBottom: 4 }}>
              Welcome back{verifiedFirstName ? `, ${verifiedFirstName}` : ""}!
            </div>
            <div style={{ fontSize: 13, color: "#aaa", lineHeight: 1.5 }}>
              Signed in as <strong style={{ color: "#888" }}>{verifiedEmail}</strong>.{" "}
              Your details will be pre-filled.
            </div>
          </div>
        )}

        {step === 1 && (
          <StepCategory config={config} loading={configLoading} onSelect={selectCategory} />
        )}

        {step === 2 && selectedCat && profileApplied && profileData && (
          <div style={{
            background: "rgba(74,222,128,0.05)",
            border: "1px solid rgba(74,222,128,0.15)",
            borderRadius: 12, padding: "12px 16px", marginBottom: 16,
            fontSize: 13, color: "#4ade80",
          }}>
            Some fields have been pre-filled from your Connected Steps account.
          </div>
        )}

        {step === 2 && selectedCat && (
          <StepParticipants
            category={selectedCat}
            participantSubIdx={participantSubIdx}
            participants={participants}
            errors={pErrors}
            onChange={updateParticipant}
            submitError={submitError}
            onBack={handleParticipantBack}
            onNext={handleParticipantNext}
            returnToReview={returnToReview}
          />
        )}

        {step === 3 && selectedCat && (
          <StepCompany
            category={selectedCat}
            participants={participants}
            uploading={uploading}
            onChange={updateParticipant}
            onUpload={uploadCompanyId}
            onBack={() => {
              if (returnToReview) {
                setReturnToReview(false);
                setStep(4);
              } else {
                setParticipantSubIdx(selectedCat.participant_count - 1);
                setStep(2);
              }
            }}
            onNext={() => { setReturnToReview(false); setStep(4); }}
            returnToReview={returnToReview}
          />
        )}

        {step === 4 && selectedCat && (
          <StepReview
            category={selectedCat}
            participants={participants}
            coupon={coupon}
            basePrice={basePrice}
            discount={discount}
            finalPrice={finalPrice}
            onBack={() => setStep(3)}
            onNext={() => setStep(5)}
            onEditParticipant={editParticipant}
            onEditVerification={editVerification}
            onEditCategory={editCategory}
            onEditCoupon={editCoupon}
          />
        )}

        {step === 5 && selectedCat && (
          <StepCoupon
            category={selectedCat}
            couponEnabled={config?.registration.coupon_enabled ?? false}
            couponCode={couponCode}
            coupon={coupon}
            couponError={couponError}
            couponLoading={couponLoading}
            basePrice={basePrice}
            discount={discount}
            finalPrice={finalPrice}
            submitting={submitting}
            submitError={submitError}
            onCodeChange={v => { setCouponCode(v); setCoupon(null); setCouponError(""); }}
            onValidate={validateCoupon}
            onClearCoupon={() => { setCoupon(null); setCouponCode(""); }}
            onBack={() => setStep(4)}
            onSubmit={submitRegistration}
            returnToReview={returnToReview}
            onSaveAndReturn={() => { setReturnToReview(false); setStep(4); }}
          />
        )}

        {step === 6 && selectedCat && (
          <StepPayment
            regCode={regCode}
            finalPrice={finalPrice}
            submitting={submitting}
            submitError={submitError}
            onPay={initiatePayment}
          />
        )}

        {step === 7 && (
          <StepSuccess regCode={regCode} paymentDone={paymentDone} eventTitle={eventTitle} />
        )}
      </div>
      )}

      {/* Sticky price bar */}
      {step >= 2 && step <= 6 && selectedCat && (
        <PriceBar
          category={selectedCat}
          finalPrice={finalPrice}
          couponApplied={!!coupon}
          step={step}
          participantSubIdx={participantSubIdx}
        />
      )}

      <style>{`
        @keyframes popIn {
          0%   { transform: scale(0.5); opacity: 0; }
          80%  { transform: scale(1.08); }
          100% { transform: scale(1);   opacity: 1; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        input:focus, select:focus, textarea:focus {
          border-color: rgba(232,98,10,0.6) !important;
          background: rgba(232,98,10,0.04) !important;
        }
        button:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
        select option { background: #1a1a1a; color: #fff; }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Default export — wrapped in Suspense for useSearchParams
// ─────────────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: BG }} />}>
      <RegisterPageContent />
    </Suspense>
  );
}
