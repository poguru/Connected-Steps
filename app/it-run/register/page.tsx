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
          <Field label="Email" error={errors.email} required>
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
      padding: "12px clamp(1rem,4vw,2rem)",
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
  onBack, onNext,
}: {
  category: ItRunCategory;
  participantSubIdx: number;
  participants: Participant[];
  errors: ParticipantErrors[];
  onChange: (idx: number, field: keyof Participant, val: string | File | null) => void;
  submitError: string;
  onBack: () => void;
  onNext: () => void;
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
          {isLast
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
  category, participants, uploading, onChange, onUpload, onBack, onNext,
}: {
  category: ItRunCategory;
  participants: Participant[];
  uploading: number[];
  onChange: (idx: number, field: keyof Participant, val: string | File | null) => void;
  onUpload: (idx: number, file: File) => void;
  onBack: () => void;
  onNext: () => void;
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
          Review Registration →
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Review
// ─────────────────────────────────────────────────────────────────────────────

function StepReview({
  category, participants, onBack, onNext,
}: {
  category: ItRunCategory;
  participants: Participant[];
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      <ProgressStepper step={4} />
      <h2 style={{ fontSize: "clamp(20px,3vw,24px)", fontWeight: 800, color: "#fff", marginBottom: 6 }}>
        Review Your Registration
      </h2>
      <p style={{ fontSize: 13, color: "#555", marginBottom: 20 }}>
        Verify all details before proceeding. You cannot edit after payment.
      </p>

      {/* Category */}
      <div style={{ ...CARD_BASE, padding: 18, marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: ACCENT, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 10 }}>Category</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{category.name}</div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
              {category.distance_km < 2 ? "1.5 KM" : `${category.distance_km} KM`}
              {category.is_timed ? " · Timed" : " · Non-Timed"}
              {category.participant_count > 1 && ` · ${category.participant_count} participants`}
            </div>
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: category.color }}>
            ₹{category.price_rupees.toLocaleString("en-IN")}
          </div>
        </div>
      </div>

      {/* Per-participant cards */}
      {participants.map((p, idx) => {
        const pl = category.participant_labels[idx];
        return (
          <div key={idx} style={{ ...CARD_BASE, padding: 18, marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: ACCENT, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 12 }}>
              {pl?.label ?? `Participant ${idx + 1}`}
              {pl?.is_child && (
                <span style={{ marginLeft: 8, color: "#a78bfa", fontWeight: 400 }}>Child</span>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "8px 16px" }}>
              {([
                ["Name",    `${p.firstName} ${p.lastName}`],
                ["Gender",  p.gender],
                ["DOB",     p.dob],
                ["Mobile",  p.mobile],
                ["Blood",   p.bloodGroup],
                ["T-Shirt", p.tshirtSize],
                ...(!(pl?.is_child) ? [
                  ["Email",   p.email],
                  ["Company", p.companyName],
                  ["Emergency", p.emergencyName ? `${p.emergencyName} · ${p.emergencyPhone}` : ""],
                ] : []),
              ] as string[][]).filter(([, v]) => v?.trim()).map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 9, color: "#3a3a3a", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>{label}</div>
                  <div style={{ fontSize: 12, color: "#bbb", marginTop: 2 }}>{value}</div>
                </div>
              ))}
            </div>
            {!(pl?.is_child) && p.companyIdUrl && p.companyIdUrl !== "error" && (
              <div style={{ fontSize: 11, color: "#10b981", marginTop: 10 }}>✓ Company ID uploaded</div>
            )}
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const, marginTop: 8 }}>
        <button onClick={onBack} style={BTN_GHOST}>← Back</button>
        <button onClick={onNext} style={{ ...BTN_PRIMARY, flex: 1, justifyContent: "center" }}>
          Proceed to Coupon →
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
  onBack, onSubmit,
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

  // Submission
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [regCode,     setRegCode]     = useState("");
  const [regId,       setRegId]       = useState("");
  const [paymentDone, setPaymentDone] = useState(false);

  // Upload
  const [uploading, setUploading] = useState<number[]>([]);

  // Price
  const basePrice  = selectedCat?.price_rupees ?? 0;
  const discount   = coupon?.discount ?? 0;
  const finalPrice = Math.max(0, basePrice - discount);

  // ── Load event config ──────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/it-run/event-config")
      .then(r => r.json())
      .then((d: ItRunEventConfig) => { setConfig(d); setConfigLoading(false); })
      .catch(() => setConfigLoading(false));
  }, []);

  // ── Pre-select category from URL ───────────────────────────────────────────
  useEffect(() => {
    const slug = searchParams.get("category");
    if (slug && config?.categories.length) {
      const cat = config.categories.find(c => c.slug === slug);
      if (cat && !cat.is_soldout) selectCategory(cat);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, config]);

  // ── Draft auto-save (key v3 — step numbering changed from v2) ─────────────
  useEffect(() => {
    if (step > 1 && selectedCat) {
      try {
        localStorage.setItem("it_run_draft_v3", JSON.stringify({
          step, participantSubIdx, selectedCatId: selectedCat.id, participants, couponCode,
        }));
      } catch { /* ignore */ }
    }
  }, [step, participantSubIdx, selectedCat, participants, couponCode]);

  // ── Draft restore ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!config) return;
    try {
      const raw = localStorage.getItem("it_run_draft_v3");
      if (!raw) return;
      const d = JSON.parse(raw) as {
        step: number; participantSubIdx: number;
        selectedCatId: string; participants: Participant[]; couponCode: string;
      };
      if (!d.step || !d.selectedCatId) return;
      const cat = config.categories.find(c => c.id === d.selectedCatId);
      if (!cat || cat.is_soldout) return;
      setSelectedCat(cat);
      setParticipants(d.participants ?? [emptyParticipant()]);
      setCouponCode(d.couponCode ?? "");
      setParticipantSubIdx(0);
      setStep(Math.min(d.step, 2)); // restore up to participant step
    } catch { /* ignore */ }
  }, [config]);

  // ── Clear draft on success ─────────────────────────────────────────────────
  useEffect(() => {
    if (step === 7) {
      try { localStorage.removeItem("it_run_draft_v3"); } catch { /* ignore */ }
    }
  }, [step]);

  // ── Category selection ─────────────────────────────────────────────────────

  function selectCategory(cat: ItRunCategory) {
    setSelectedCat(cat);
    setParticipants(Array.from({ length: cat.participant_count }, emptyParticipant));
    setPErrors(Array.from({ length: cat.participant_count }, () => ({})));
    setParticipantSubIdx(0);
    setStep(2);
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

    if (!p.firstName.trim())  { e.firstName = "Required"; valid = false; }
    if (!p.lastName.trim())   { e.lastName  = "Required"; valid = false; }
    if (!p.gender)            { e.gender    = "Required"; valid = false; }
    if (!p.dob)               { e.dob       = "Required"; valid = false; }
    if (!p.mobile || !/^\d{10}$/.test(p.mobile)) {
      e.mobile = "10-digit mobile required"; valid = false;
    }
    if (!p.bloodGroup)  { e.bloodGroup  = "Required"; valid = false; }
    if (!p.tshirtSize)  { e.tshirtSize  = "Required"; valid = false; }

    if (!child) {
      if (!p.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) {
        e.email = "Valid email required"; valid = false;
      }
      if (!p.emergencyName.trim())  { e.emergencyName  = "Required"; valid = false; }
      if (!p.emergencyPhone.trim()) { e.emergencyPhone = "Required"; valid = false; }
      if (!p.companyName.trim())    { e.companyName    = "Required"; valid = false; }
    }

    if (child && p.dob) {
      const ageYears = (Date.now() - new Date(p.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      if (ageYears > 10.99) { e.dob = "Child must be 10 years or younger"; valid = false; }
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
    const lastIdx = (selectedCat?.participant_count ?? 1) - 1;
    if (participantSubIdx < lastIdx) {
      setParticipantSubIdx(i => i + 1);
    } else {
      setStep(3);
    }
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
        {step < 7 && (
          <Link href="/it-run" style={{ fontSize: 12, color: "#3a3a3a", textDecoration: "none" }}>
            Cancel
          </Link>
        )}
      </nav>

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

      {/* Main content */}
      <div style={{
        maxWidth: 640, margin: "0 auto",
        padding: `calc(52px + clamp(1.5rem,5vw,2.5rem)) clamp(1rem,5vw,2rem) ${step >= 2 && step <= 6 && selectedCat ? "80px" : "clamp(1.5rem,5vw,2.5rem)"}`,
        minHeight: "100vh",
      }}>

        {step === 1 && (
          <StepCategory config={config} loading={configLoading} onSelect={selectCategory} />
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
              // Go back to last participant
              setParticipantSubIdx((selectedCat.participant_count - 1));
              setStep(2);
            }}
            onNext={() => setStep(4)}
          />
        )}

        {step === 4 && selectedCat && (
          <StepReview
            category={selectedCat}
            participants={participants}
            onBack={() => setStep(3)}
            onNext={() => setStep(5)}
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
