"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { ItRunEventConfig, ItRunCategory } from "@/lib/it-run-types";

// ─────────────────────────────────────────────────────────────────────────────
// Local types
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

const FLOW_STEPS = [
  { id: 1, key: "category",     label: "Category"   },
  { id: 2, key: "confirm",      label: "Booking"    },
  { id: 3, key: "participants", label: "Details"    },
  { id: 4, key: "company",      label: "Verify"     },
  { id: 5, key: "review",       label: "Review"     },
  { id: 6, key: "coupon",       label: "Coupon"     },
  { id: 7, key: "payment",      label: "Payment"    },
  // step 8 = success — not shown in progress bar
];

const BLOOD_GROUPS = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];
const TSHIRT_SIZES = ["XS","S","M","L","XL","XXL","3XL"];
const TSHIRT_CHILD = ["XS","S","M"];
const FOOD_PREFS   = ["veg","non-veg","vegan"];

const emptyParticipant = (): Participant => ({
  firstName: "", lastName: "", gender: "", dob: "", email: "", mobile: "",
  bloodGroup: "", emergencyName: "", emergencyPhone: "",
  companyName: "", employeeId: "", companyIdFile: null, companyIdUrl: "",
  tshirtSize: "", medicalConditions: "", foodPreference: "veg",
});

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens (consistent with landing page and IT Run brand)
// ─────────────────────────────────────────────────────────────────────────────

const BG     = "#080808";
const ACCENT = "#e8620a";

const CARD_BASE: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
};

const INPUT_S: React.CSSProperties = {
  width: "100%", padding: "11px 14px", borderRadius: 10,
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none",
  boxSizing: "border-box" as const, transition: "border-color 0.2s",
};

const LABEL_S: React.CSSProperties = {
  display: "block", fontSize: 11, color: "rgba(255,255,255,0.45)",
  letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 5,
};

const BTN: React.CSSProperties = {
  padding: "12px 26px", borderRadius: 10, fontWeight: 700, fontSize: 15,
  cursor: "pointer", border: "none", fontFamily: "inherit",
  transition: "all 0.2s", display: "inline-flex", alignItems: "center", gap: 8,
};
const BTN_PRIMARY: React.CSSProperties = { ...BTN, background: ACCENT, color: "#fff" };
const BTN_GHOST: React.CSSProperties   = {
  ...BTN, background: "transparent", color: "#ccc",
  border: "1px solid rgba(255,255,255,0.15)",
};

// ─────────────────────────────────────────────────────────────────────────────
// Razorpay loader — preserved exactly from original
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
// ProgressStepper
// ─────────────────────────────────────────────────────────────────────────────

function ProgressStepper({ step }: { step: number }) {
  const total = FLOW_STEPS.length;
  const pct   = ((Math.min(step, total) - 1) / (total - 1)) * 100;

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Bar */}
      <div style={{ height: 2, background: "rgba(255,255,255,0.07)", borderRadius: 2, marginBottom: 16, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: ACCENT, transition: "width 0.4s ease", borderRadius: 2 }} />
      </div>

      {/* Dots + labels */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        {FLOW_STEPS.map(s => {
          const done    = s.id < step;
          const current = s.id === step;
          return (
            <div key={s.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flex: 1, minWidth: 0 }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 800,
                background: done ? ACCENT : current ? "rgba(232,98,10,0.15)" : "rgba(255,255,255,0.05)",
                border: current ? `2px solid ${ACCENT}` : "2px solid transparent",
                color: done ? "#fff" : current ? ACCENT : "#444",
                transition: "all 0.3s",
                flexShrink: 0,
              }}>
                {done ? "✓" : s.id}
              </div>
              <span style={{
                fontSize: 9, color: current ? "#ccc" : done ? "#666" : "#333",
                textTransform: "uppercase" as const, letterSpacing: "0.06em",
                fontWeight: current ? 700 : 400,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                maxWidth: "100%", textAlign: "center" as const,
              }}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Field — labeled form control wrapper
// ─────────────────────────────────────────────────────────────────────────────

function Field({
  label, error, required, hint, children,
}: {
  label: string; error?: string; required?: boolean; hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={LABEL_S}>
        {label}
        {required && <span style={{ color: ACCENT, marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {hint  && !error && <span style={{ fontSize: 11, color: "#555" }}>{hint}</span>}
      {error && <span style={{ fontSize: 11, color: "#f87171" }}>{error}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ParticipantForm — modular form for one participant
// ─────────────────────────────────────────────────────────────────────────────

function ParticipantForm({
  participantLabel, data, onChange, errors, isChild,
}: {
  participantLabel: string;
  data: Participant;
  onChange: (field: keyof Participant, val: string | File | null) => void;
  errors: ParticipantErrors;
  isChild: boolean;
}) {
  const sizes = isChild ? TSHIRT_CHILD : TSHIRT_SIZES;

  return (
    <div style={{ ...CARD_BASE, padding: 24, marginBottom: 20 }}>
      <div style={{
        fontSize: 11, color: ACCENT, fontWeight: 700, marginBottom: 20,
        textTransform: "uppercase" as const, letterSpacing: "0.1em",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT }} />
        {participantLabel}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16 }}>
        <Field label="First Name" error={errors.firstName} required>
          <input style={INPUT_S} value={data.firstName}
            onChange={e => onChange("firstName", e.target.value)} placeholder="First name" />
        </Field>
        <Field label="Last Name" error={errors.lastName} required>
          <input style={INPUT_S} value={data.lastName}
            onChange={e => onChange("lastName", e.target.value)} placeholder="Last name" />
        </Field>
        <Field label="Gender" error={errors.gender} required>
          <select style={INPUT_S} value={data.gender} onChange={e => onChange("gender", e.target.value)}>
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other / Non-binary</option>
            <option value="prefer_not">Prefer not to say</option>
          </select>
        </Field>
        <Field label="Date of Birth" error={errors.dob} required
          hint={isChild ? "Must be 10 years or younger" : undefined}>
          <input style={INPUT_S} type="date" value={data.dob}
            onChange={e => onChange("dob", e.target.value)} />
        </Field>
        {!isChild && (
          <Field label="Email" error={errors.email} required>
            <input style={INPUT_S} type="email" value={data.email}
              onChange={e => onChange("email", e.target.value)} placeholder="your@email.com" />
          </Field>
        )}
        <Field label="Mobile" error={errors.mobile} required>
          <input style={INPUT_S} type="tel" value={data.mobile}
            onChange={e => onChange("mobile", e.target.value)}
            placeholder="10-digit mobile" maxLength={10} />
        </Field>
        <Field label="Blood Group" error={errors.bloodGroup} required>
          <select style={INPUT_S} value={data.bloodGroup} onChange={e => onChange("bloodGroup", e.target.value)}>
            <option value="">Select blood group</option>
            {BLOOD_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="T-Shirt Size" error={errors.tshirtSize} required
          hint={isChild ? "Child sizes only" : undefined}>
          <select style={INPUT_S} value={data.tshirtSize} onChange={e => onChange("tshirtSize", e.target.value)}>
            <option value="">Select size</option>
            {sizes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </div>

      {!isChild && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16, marginTop: 16 }}>
          <Field label="Emergency Contact Name" error={errors.emergencyName} required>
            <input style={INPUT_S} value={data.emergencyName}
              onChange={e => onChange("emergencyName", e.target.value)} placeholder="Contact person name" />
          </Field>
          <Field label="Emergency Contact Phone" error={errors.emergencyPhone} required>
            <input style={INPUT_S} type="tel" value={data.emergencyPhone}
              onChange={e => onChange("emergencyPhone", e.target.value)} maxLength={10} placeholder="Emergency number" />
          </Field>
          <Field label="Company Name" error={errors.companyName} required>
            <input style={INPUT_S} value={data.companyName}
              onChange={e => onChange("companyName", e.target.value)} placeholder="Your employer / company" />
          </Field>
          <Field label="Employee ID">
            <input style={INPUT_S} value={data.employeeId}
              onChange={e => onChange("employeeId", e.target.value)} placeholder="Staff or employee ID (optional)" />
          </Field>
          <Field label="Medical Conditions">
            <input style={INPUT_S} value={data.medicalConditions}
              onChange={e => onChange("medicalConditions", e.target.value)} placeholder="Conditions we should know about (optional)" />
          </Field>
          <Field label="Food Preference">
            <select style={INPUT_S} value={data.foodPreference} onChange={e => onChange("foodPreference", e.target.value)}>
              {FOOD_PREFS.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
            </select>
          </Field>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PriceBar — sticky bottom bar shown from step 2 onwards
// ─────────────────────────────────────────────────────────────────────────────

function PriceBar({ category, finalPrice, couponApplied }: {
  category: ItRunCategory;
  finalPrice: number;
  couponApplied: boolean;
}) {
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 90,
      background: "rgba(12,12,12,0.96)", backdropFilter: "blur(16px)",
      borderTop: "1px solid rgba(255,255,255,0.07)",
      padding: "12px clamp(1rem,4vw,2rem)",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: category.color, flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: "#ccc", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {category.name}
        </span>
        {category.participant_count > 1 && (
          <span style={{ fontSize: 11, color: "#666" }}>· {category.participant_count} participants</span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {couponApplied && (
          <span style={{ fontSize: 11, color: "#10b981", background: "rgba(16,185,129,0.1)", padding: "2px 8px", borderRadius: 6 }}>
            Coupon Applied
          </span>
        )}
        <span style={{ fontSize: 17, fontWeight: 900, color: ACCENT }}>
          ₹{finalPrice.toLocaleString("en-IN")}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Category Selection
// ─────────────────────────────────────────────────────────────────────────────

function StepCategory({
  config, loading, onSelect,
}: {
  config: ItRunEventConfig | null;
  loading: boolean;
  onSelect: (cat: ItRunCategory) => void;
}) {
  const eventDate = config?.event.event_date
    ? new Date(config.event.event_date + "T12:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "—";

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "80px 0", color: "#555" }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>◌</div>
        Loading race categories…
      </div>
    );
  }

  return (
    <div>
      {/* Event badge */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(232,98,10,0.12)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: 100, padding: "4px 12px", marginBottom: 16 }}>
          <span style={{ fontSize: 9, color: ACCENT, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {config?.event.subtitle ?? "IT Professionals Only"}
          </span>
        </div>
        <h1 style={{ fontSize: "clamp(22px,4vw,30px)", fontWeight: 900, color: "#fff", margin: "0 0 6px", lineHeight: 1.2 }}>
          Choose Your Race Category
        </h1>
        <p style={{ fontSize: 13, color: "#666", margin: 0 }}>
          {config?.event.venue_name && `${config.event.venue_name} · `}{eventDate}
        </p>
      </div>

      {/* Category cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
              opacity: cat.is_soldout ? 0.5 : 1,
              transition: "all 0.2s",
            }}
            onMouseEnter={e => {
              if (!cat.is_soldout) (e.currentTarget as HTMLButtonElement).style.borderColor = `${cat.color}80`;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = `${cat.color}22`;
            }}
          >
            {/* Distance */}
            <div style={{
              fontSize: "clamp(22px,3.5vw,28px)", fontWeight: 900, color: cat.color,
              minWidth: 68, lineHeight: 1, flexShrink: 0,
            }}>
              {cat.distance_km < 2 ? "1.5" : cat.distance_km}
              <span style={{ fontSize: 12, fontWeight: 700, marginLeft: 2 }}>KM</span>
            </div>

            {/* Middle */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 3 }}>
                {cat.name}
                {cat.is_soldout && (
                  <span style={{ marginLeft: 8, fontSize: 10, color: "#f87171", background: "rgba(248,113,113,0.1)", padding: "1px 6px", borderRadius: 4 }}>
                    SOLD OUT
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                {cat.inclusions.map(inc => (
                  <span key={inc} style={{ fontSize: 10, color: "#888", background: "rgba(255,255,255,0.05)", padding: "2px 7px", borderRadius: 4 }}>
                    {inc}
                  </span>
                ))}
                {cat.participant_count > 1 && (
                  <span style={{ fontSize: 10, color: cat.color, background: `${cat.color}15`, padding: "2px 7px", borderRadius: 4 }}>
                    {cat.participant_labels.map(l => l.label).join(" + ")}
                  </span>
                )}
              </div>
              {cat.description && (
                <div style={{ fontSize: 12, color: "#555", marginTop: 5, lineHeight: 1.5 }}>
                  {cat.description}
                </div>
              )}
              {/* Capacity indicator */}
              {cat.max_participants != null && !cat.is_soldout && (
                (() => {
                  const remaining = cat.max_participants - cat.current_participants;
                  const pct = Math.min(100, (cat.current_participants / cat.max_participants) * 100);
                  const low = remaining <= 20;
                  return (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 10, color: low ? "#fbbf24" : "#555" }}>
                          {low ? `Only ${remaining} spots left!` : `${remaining} spots available`}
                        </span>
                        <span style={{ fontSize: 10, color: "#444" }}>{Math.round(pct)}% filled</span>
                      </div>
                      <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: low ? "#fbbf24" : cat.color, borderRadius: 2, transition: "width 0.3s" }} />
                      </div>
                    </div>
                  );
                })()
              )}
            </div>

            {/* Price */}
            <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
              <div style={{ fontSize: "clamp(18px,2.5vw,22px)", fontWeight: 900, color: cat.color }}>
                ₹{cat.price_rupees.toLocaleString("en-IN")}
              </div>
              {cat.participant_count > 1 && (
                <div style={{ fontSize: 10, color: "#555", marginTop: 1 }}>
                  for {cat.participant_count}
                </div>
              )}
            </div>

            {/* Arrow */}
            {!cat.is_soldout && (
              <div style={{ color: "#444", flexShrink: 0, fontSize: 16 }}>›</div>
            )}
          </button>
        ))}
      </div>

      {/* Terms note */}
      {config && (
        <div style={{ marginTop: 24, fontSize: 12, color: "#444", lineHeight: 1.7 }}>
          By registering you agree to the event terms. Questions? Email{" "}
          <a href={`mailto:${config.registration.contact_email}`} style={{ color: ACCENT, textDecoration: "none" }}>
            {config.registration.contact_email}
          </a>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Booking Summary / Confirm
// ─────────────────────────────────────────────────────────────────────────────

function StepConfirm({
  category, onBack, onNext,
}: {
  category: ItRunCategory;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      <ProgressStepper step={2} />
      <h2 style={{ fontSize: "clamp(20px,3vw,26px)", fontWeight: 800, color: "#fff", marginBottom: 6 }}>
        Confirm Your Booking
      </h2>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 28 }}>
        Review what you are registering for before filling participant details.
      </p>

      <div style={{ ...CARD_BASE, padding: 24, marginBottom: 20 }}>
        {/* Category header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: category.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
              {category.distance_km < 2 ? "1.5 KM" : `${category.distance_km} KM`}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{category.name}</div>
            {category.description && (
              <div style={{ fontSize: 13, color: "#666", marginTop: 4, lineHeight: 1.5 }}>{category.description}</div>
            )}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: category.color }}>
              ₹{category.price_rupees.toLocaleString("en-IN")}
            </div>
            {category.participant_count > 1 && (
              <div style={{ fontSize: 11, color: "#555" }}>for {category.participant_count} participants</div>
            )}
          </div>
        </div>

        {/* Inclusions */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
          <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            What&#39;s Included
          </div>
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
            {category.inclusions.map(item => (
              <div key={item} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#ccc" }}>
                <span style={{ color: category.color, fontSize: 14, fontWeight: 700 }}>+</span> {item}
              </div>
            ))}
          </div>
        </div>

        {/* Participants */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16, marginTop: 16 }}>
          <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            Participants
          </div>
          {category.participant_labels.map((pl, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#ccc", marginBottom: 4 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: `${category.color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: category.color, fontWeight: 700, flexShrink: 0 }}>
                {i + 1}
              </div>
              {pl.label}
              {pl.is_child && (
                <span style={{ fontSize: 10, color: "#f9a8d4", background: "rgba(249,168,212,0.1)", padding: "1px 6px", borderRadius: 4 }}>
                  age ≤ 10
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
        <button onClick={onBack} style={BTN_GHOST}>← Back</button>
        <button onClick={onNext} style={BTN_PRIMARY}>Continue to Details →</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Participant Details
// ─────────────────────────────────────────────────────────────────────────────

function StepParticipants({
  category, participants, errors, onChange, submitError, onBack, onNext,
}: {
  category: ItRunCategory;
  participants: Participant[];
  errors: ParticipantErrors[];
  onChange: (idx: number, field: keyof Participant, val: string | File | null) => void;
  submitError: string;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      <ProgressStepper step={3} />
      <h2 style={{ fontSize: "clamp(20px,3vw,26px)", fontWeight: 800, color: "#fff", marginBottom: 6 }}>
        Participant Details
      </h2>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 28 }}>
        {category.participant_count > 1
          ? `Fill details for all ${category.participant_count} participants. Details appear on your BIB and certificate.`
          : "Fill your personal details. These will appear on your BIB and certificate."}
      </p>

      {participants.map((p, idx) => (
        <ParticipantForm
          key={idx}
          participantLabel={category.participant_labels[idx]?.label ?? `Participant ${idx + 1}`}
          data={p}
          onChange={(field, val) => onChange(idx, field, val)}
          errors={errors[idx] ?? {}}
          isChild={category.participant_labels[idx]?.is_child ?? false}
        />
      ))}

      {submitError && (
        <div style={{ color: "#f87171", fontSize: 13, marginBottom: 16 }}>{submitError}</div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
        <button onClick={onBack} style={BTN_GHOST}>← Back</button>
        <button onClick={onNext} style={BTN_PRIMARY}>Continue to Verification →</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Company Verification
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
      <ProgressStepper step={4} />
      <h2 style={{ fontSize: "clamp(20px,3vw,26px)", fontWeight: 800, color: "#fff", marginBottom: 6 }}>
        Company Verification
      </h2>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 24 }}>
        Upload your company ID or employee card. Verified participants skip physical verification at BIB collection. This step is optional — unverified participants must bring their ID on the day.
      </p>

      <div style={{ ...CARD_BASE, padding: 16, marginBottom: 20, border: "1px solid rgba(232,98,10,0.15)", background: "rgba(232,98,10,0.04)" }}>
        <div style={{ fontSize: 12, color: ACCENT, fontWeight: 600, marginBottom: 3 }}>Accepted documents</div>
        <div style={{ fontSize: 12, color: "#888", lineHeight: 1.6 }}>
          Company ID card, Employee card, or Offer Letter showing company name. A photo of yourself holding the ID is also acceptable.
        </div>
      </div>

      {nonChildIdxs.map(idx => {
        const p = participants[idx];
        const label = category.participant_labels[idx]?.label ?? `Participant ${idx + 1}`;
        const uploaded = p.companyIdUrl && p.companyIdUrl !== "error";
        const errored  = p.companyIdUrl === "error";

        return (
          <div key={idx} style={{ ...CARD_BASE, padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: ACCENT, fontWeight: 700, marginBottom: 14 }}>
              {label} — {p.companyName || "Company not specified"}
            </div>

            {uploaded ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 10 }}>
                <span style={{ color: "#10b981", fontSize: 18 }}>✓</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "#10b981", fontWeight: 600 }}>ID uploaded successfully</div>
                  <button onClick={() => onChange(idx, "companyIdUrl", "")}
                    style={{ background: "none", border: "none", color: "#555", fontSize: 11, cursor: "pointer", padding: 0, marginTop: 2, fontFamily: "inherit" }}>
                    Upload a different file
                  </button>
                </div>
              </div>
            ) : (
              <label style={{
                display: "flex", flexDirection: "column" as const, alignItems: "center",
                padding: "28px 20px", border: `2px dashed ${errored ? "rgba(248,113,113,0.4)" : "rgba(255,255,255,0.1)"}`,
                borderRadius: 12, cursor: "pointer", gap: 6, textAlign: "center" as const,
                background: "rgba(255,255,255,0.02)", transition: "border-color 0.2s",
              }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = `${ACCENT}50`)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = errored ? "rgba(248,113,113,0.4)" : "rgba(255,255,255,0.1)")}>
                {uploading.includes(idx) ? (
                  <div style={{ fontSize: 13, color: "#888" }}>Uploading…</div>
                ) : (
                  <>
                    <div style={{ fontSize: 22, color: "#444" }}>↑</div>
                    <div style={{ fontSize: 13, color: "#ccc", fontWeight: 600 }}>Tap to upload Company ID</div>
                    <div style={{ fontSize: 11, color: "#555" }}>JPG, PNG or PDF · max 5 MB</div>
                    {errored && <div style={{ fontSize: 11, color: "#f87171", marginTop: 4 }}>Upload failed. Try again.</div>}
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

      <div style={{ ...CARD_BASE, padding: 14, marginBottom: 24, fontSize: 12, color: "#555", lineHeight: 1.7 }}>
        <strong style={{ color: "#888" }}>Skipping? </strong>
        You can continue without uploading. Bring your original company ID to the BIB collection counter for physical verification.
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
        <button onClick={onBack} style={BTN_GHOST}>← Back</button>
        <button onClick={onNext} style={BTN_PRIMARY}>Review Registration →</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 — Review
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
      <ProgressStepper step={5} />
      <h2 style={{ fontSize: "clamp(20px,3vw,26px)", fontWeight: 800, color: "#fff", marginBottom: 6 }}>
        Review Your Registration
      </h2>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 24 }}>
        Verify all details before proceeding. You cannot edit after payment.
      </p>

      {/* Category card */}
      <div style={{ ...CARD_BASE, padding: 18, marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: ACCENT, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Category</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{category.name}</div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
              {category.distance_km < 2 ? "1.5 KM" : `${category.distance_km} KM`}
              {category.participant_count > 1 && ` · ${category.participant_count} participants`}
            </div>
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: category.color }}>
            ₹{category.price_rupees.toLocaleString("en-IN")}
          </div>
        </div>
      </div>

      {/* Participant cards */}
      {participants.map((p, idx) => {
        const pl = category.participant_labels[idx];
        return (
          <div key={idx} style={{ ...CARD_BASE, padding: 18, marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: ACCENT, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
              {pl?.label ?? `Participant ${idx + 1}`}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "8px 16px" }}>
              {([
                ["Name",    `${p.firstName} ${p.lastName}`],
                ["Gender",  p.gender],
                ["DOB",     p.dob],
                ["Mobile",  p.mobile],
                ["Blood",   p.bloodGroup],
                ["T-Shirt", p.tshirtSize],
                ...(!( pl?.is_child) ? [
                  ["Email",   p.email],
                  ["Company", p.companyName],
                  ["Emergency", `${p.emergencyName} · ${p.emergencyPhone}`],
                ] : []),
              ] as string[][]).filter(([, v]) => v?.trim()).map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
                  <div style={{ fontSize: 12, color: "#ccc", marginTop: 2 }}>{value || "—"}</div>
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
        <button onClick={onNext} style={BTN_PRIMARY}>Proceed to Coupon →</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 6 — Coupon + Order Summary
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
      <ProgressStepper step={6} />
      <h2 style={{ fontSize: "clamp(20px,3vw,26px)", fontWeight: 800, color: "#fff", marginBottom: 6 }}>
        {couponEnabled ? "Have a Coupon?" : "Order Summary"}
      </h2>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 24 }}>
        {couponEnabled ? "Apply a discount code, or skip and proceed to payment." : "Review your order before payment."}
      </p>

      {/* Coupon input (only if enabled in config) */}
      {couponEnabled && (
        <div style={{ ...CARD_BASE, padding: 20, marginBottom: 20 }}>
          {!coupon ? (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input
                  style={{ ...INPUT_S, flex: 1, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}
                  placeholder="COUPON CODE"
                  value={couponCode}
                  onChange={e => onCodeChange(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === "Enter" && onValidate()}
                />
                <button
                  onClick={onValidate}
                  disabled={couponLoading || !couponCode.trim()}
                  style={{ ...BTN_PRIMARY, flexShrink: 0, padding: "11px 18px", opacity: (couponLoading || !couponCode.trim()) ? 0.5 : 1 }}>
                  {couponLoading ? "…" : "Apply"}
                </button>
              </div>
              {couponError && <div style={{ fontSize: 12, color: "#f87171" }}>{couponError}</div>}
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#10b981" }}>−₹{coupon.discount}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: "#10b981", fontWeight: 600 }}>{coupon.label}</div>
                <div style={{ fontSize: 11, color: "#555" }}>Code: {coupon.code}</div>
              </div>
              <button onClick={onClearCoupon}
                style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 16, fontFamily: "inherit", padding: "2px 6px" }}>
                ×
              </button>
            </div>
          )}
        </div>
      )}

      {/* Order summary */}
      <div style={{ ...CARD_BASE, padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 10, color: ACCENT, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>
          Order Summary
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#ccc", marginBottom: 8 }}>
          <span>{category.name}</span>
          <span>₹{basePrice.toLocaleString("en-IN")}</span>
        </div>
        {coupon && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#10b981", marginBottom: 8 }}>
            <span>Coupon ({coupon.code})</span>
            <span>−₹{discount}</span>
          </div>
        )}
        <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "12px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, color: "#888" }}>Total</span>
          <span style={{ fontSize: 22, fontWeight: 900, color: ACCENT }}>₹{finalPrice.toLocaleString("en-IN")}</span>
        </div>
      </div>

      {submitError && (
        <div style={{ color: "#f87171", fontSize: 13, marginBottom: 16 }}>{submitError}</div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
        <button onClick={onBack} style={BTN_GHOST}>← Back</button>
        <button onClick={onSubmit} disabled={submitting}
          style={{ ...BTN_PRIMARY, opacity: submitting ? 0.6 : 1 }}>
          {submitting ? "Processing…" : finalPrice === 0 ? "Complete Registration (Free)" : `Proceed to Payment · ₹${finalPrice.toLocaleString("en-IN")}`}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 7 — Payment
// ─────────────────────────────────────────────────────────────────────────────

function StepPayment({
  regCode, finalPrice, submitting, submitError, onPay,
}: {
  regCode: string;
  finalPrice: number;
  submitting: boolean;
  submitError: string;
  onPay: () => void;
}) {
  return (
    <div>
      <ProgressStepper step={7} />
      <h2 style={{ fontSize: "clamp(20px,3vw,26px)", fontWeight: 800, color: "#fff", marginBottom: 6 }}>
        Complete Payment
      </h2>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 24 }}>
        Your registration is saved. Complete payment now to confirm your spot.
      </p>

      {/* Registration code card */}
      <div style={{ ...CARD_BASE, padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" as const, gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
              Registration Saved
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "0.06em" }}>{regCode}</div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>Your registration code</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#555", marginBottom: 2 }}>Amount Due</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: ACCENT }}>₹{finalPrice.toLocaleString("en-IN")}</div>
          </div>
        </div>
      </div>

      <div style={{ ...CARD_BASE, padding: 14, marginBottom: 24, fontSize: 12, color: "#555", lineHeight: 1.7 }}>
        Your spot is reserved for <strong style={{ color: "#888" }}>15 minutes</strong>. Complete payment now to avoid losing it.
        We accept UPI, Cards, Net Banking, and Wallets.
      </div>

      <button
        onClick={onPay}
        disabled={submitting}
        style={{ ...BTN_PRIMARY, width: "100%", justifyContent: "center", fontSize: 16, padding: "16px 28px", opacity: submitting ? 0.6 : 1 }}>
        {submitting ? "Opening Payment…" : `Pay ₹${finalPrice.toLocaleString("en-IN")} Now`}
      </button>

      {submitError && (
        <div style={{ color: "#f87171", fontSize: 13, marginTop: 12 }}>{submitError}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 8 — Success
// ─────────────────────────────────────────────────────────────────────────────

function StepSuccess({
  regCode, paymentDone, eventTitle,
}: {
  regCode: string;
  paymentDone: boolean;
  eventTitle: string;
}) {
  return (
    <div style={{ textAlign: "center", paddingTop: 32 }}>
      <div style={{
        width: 72, height: 72, margin: "0 auto 20px",
        background: "rgba(16,185,129,0.08)",
        border: "2px solid rgba(16,185,129,0.25)",
        borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 28, color: "#10b981", animation: "popIn 0.5s ease",
      }}>
        ✓
      </div>
      <h1 style={{ fontSize: "clamp(22px,4vw,32px)", fontWeight: 900, color: "#fff", marginBottom: 8 }}>
        {paymentDone ? "Payment Confirmed!" : "Registration Complete!"}
      </h1>
      <p style={{ fontSize: 15, color: "#888", marginBottom: 6 }}>
        You are registered for <strong style={{ color: "#fff" }}>{eventTitle}</strong>
      </p>
      <p style={{ fontSize: 13, color: "#555", marginBottom: 32 }}>
        Check your email for the confirmation, QR code, and invoice.
      </p>

      {/* Registration code */}
      <div style={{ ...CARD_BASE, padding: 24, marginBottom: 20, display: "inline-block", width: "100%", maxWidth: 380 }}>
        <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
          Registration Code
        </div>
        <div style={{ fontSize: 30, fontWeight: 900, color: ACCENT, letterSpacing: "0.1em", marginBottom: 6 }}>
          {regCode}
        </div>
        <div style={{ fontSize: 11, color: "#555", lineHeight: 1.6 }}>
          Save this code. Use it to access your participant dashboard and book your BIB collection slot.
        </div>
      </div>

      {/* Next steps */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 24, maxWidth: 480, margin: "0 auto 24px" }}>
        {[
          { icon: "✉", label: "Confirmation Email", note: "Sent to your email" },
          { icon: "⬡", label: "QR Code",            note: "In confirmation email" },
          { icon: "📋", label: "BIB Collection",     note: "Book slot from dashboard" },
        ].map(item => (
          <div key={item.label} style={{ ...CARD_BASE, padding: 14, textAlign: "center" as const }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{item.icon}</div>
            <div style={{ fontSize: 12, color: "#fff", fontWeight: 600, marginBottom: 2 }}>{item.label}</div>
            <div style={{ fontSize: 10, color: "#555" }}>{item.note}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" as const }}>
        <Link href={`/it-run/dashboard/${regCode}`} style={BTN_PRIMARY}>View My Dashboard</Link>
        <Link href="/it-run" style={BTN_GHOST}>Back to Event</Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RegisterPageContent — orchestrator (holds all state, passes down to steps)
// ─────────────────────────────────────────────────────────────────────────────

function RegisterPageContent() {
  const searchParams = useSearchParams();

  // ── Config state ─────────────────────────────────────────────────────────
  const [config,      setConfig]      = useState<ItRunEventConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  // ── Flow state ───────────────────────────────────────────────────────────
  const [step,         setStep]         = useState(1);
  const [selectedCat,  setSelectedCat]  = useState<ItRunCategory | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([emptyParticipant()]);
  const [pErrors,      setPErrors]      = useState<ParticipantErrors[]>([{}]);

  // ── Coupon state ─────────────────────────────────────────────────────────
  const [couponCode,    setCouponCode]    = useState("");
  const [coupon,        setCoupon]        = useState<CouponData | null>(null);
  const [couponError,   setCouponError]   = useState("");
  const [couponLoading, setCouponLoading] = useState(false);

  // ── Submission state ─────────────────────────────────────────────────────
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState("");
  const [regCode,      setRegCode]      = useState("");
  const [regId,        setRegId]        = useState("");
  const [paymentDone,  setPaymentDone]  = useState(false);

  // ── Upload state ─────────────────────────────────────────────────────────
  const [uploading, setUploading] = useState<number[]>([]);

  // ── Price calculation ─────────────────────────────────────────────────────
  const basePrice  = selectedCat?.price_rupees ?? 0;
  const discount   = coupon?.discount ?? 0;
  const finalPrice = Math.max(0, basePrice - discount);

  // ── Load event config ────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/it-run/event-config")
      .then(r => r.json())
      .then((d: ItRunEventConfig) => {
        setConfig(d);
        setConfigLoading(false);
      })
      .catch(() => setConfigLoading(false));
  }, []);

  // ── Pre-select category from URL ─────────────────────────────────────────
  useEffect(() => {
    const slug = searchParams.get("category");
    if (slug && config?.categories.length) {
      const cat = config.categories.find(c => c.slug === slug);
      if (cat && !cat.is_soldout) selectCategory(cat);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, config]);

  // ── Draft auto-save ──────────────────────────────────────────────────────
  useEffect(() => {
    if (step > 1 && selectedCat) {
      try {
        localStorage.setItem("it_run_draft_v2", JSON.stringify({
          step, selectedCatId: selectedCat.id, participants, couponCode,
        }));
      } catch { /* ignore */ }
    }
  }, [step, selectedCat, participants, couponCode]);

  // ── Draft restore on mount ───────────────────────────────────────────────
  useEffect(() => {
    if (!config) return;
    try {
      const raw = localStorage.getItem("it_run_draft_v2");
      if (!raw) return;
      const d = JSON.parse(raw) as { step: number; selectedCatId: string; participants: Participant[]; couponCode: string };
      if (!d.step || !d.selectedCatId) return;
      // Re-hydrate category from current config so inclusions/price are always fresh
      const cat = config.categories.find(c => c.id === d.selectedCatId);
      if (!cat || cat.is_soldout) return;
      setSelectedCat(cat);
      setParticipants(d.participants ?? [emptyParticipant()]);
      setCouponCode(d.couponCode ?? "");
      setStep(Math.min(d.step, 3)); // restore up to step 3
    } catch { /* ignore */ }
  }, [config]);

  // ── Clear draft on success ───────────────────────────────────────────────
  useEffect(() => {
    if (step === 8) {
      try { localStorage.removeItem("it_run_draft_v2"); } catch { /* ignore */ }
    }
  }, [step]);

  // ── Category selection ────────────────────────────────────────────────────

  function selectCategory(cat: ItRunCategory) {
    setSelectedCat(cat);
    setParticipants(Array.from({ length: cat.participant_count }, emptyParticipant));
    setPErrors(Array.from({ length: cat.participant_count }, () => ({})));
    setStep(2);
  }

  // ── Participant field update ──────────────────────────────────────────────

  function updateParticipant(idx: number, field: keyof Participant, val: string | File | null) {
    setParticipants(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
    setPErrors(prev => { const c = [...prev]; c[idx] = { ...c[idx], [field]: undefined }; return c; });
  }

  // ── Company ID upload ─────────────────────────────────────────────────────

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

  // ── Validation ────────────────────────────────────────────────────────────

  function validateParticipants(): boolean {
    if (!selectedCat) return false;
    let valid = true;
    const newErrors = participants.map((p, idx) => {
      const e: ParticipantErrors = {};
      const child = selectedCat.participant_labels[idx]?.is_child ?? false;

      if (!p.firstName.trim()) { e.firstName = "Required"; valid = false; }
      if (!p.lastName.trim())  { e.lastName  = "Required"; valid = false; }
      if (!p.gender)           { e.gender    = "Required"; valid = false; }
      if (!p.dob)              { e.dob       = "Required"; valid = false; }
      if (!p.mobile || !/^\d{10}$/.test(p.mobile)) { e.mobile = "10-digit mobile required"; valid = false; }
      if (!p.bloodGroup)       { e.bloodGroup = "Required"; valid = false; }
      if (!p.tshirtSize)       { e.tshirtSize = "Required"; valid = false; }

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

      return e;
    });
    setPErrors(newErrors);
    return valid;
  }

  // ── Coupon validation ─────────────────────────────────────────────────────

  async function validateCoupon() {
    if (!couponCode.trim() || !selectedCat) return;
    setCouponLoading(true);
    setCouponError("");
    try {
      const res  = await fetch("/api/it-run/coupons/validate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ code: couponCode.trim().toUpperCase(), categoryId: selectedCat.id, amount: finalPrice }),
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

  // ── Submit registration (preserved exactly) ───────────────────────────────

  async function submitRegistration() {
    if (!selectedCat) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const res  = await fetch("/api/it-run/register", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
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

      if (data.finalPrice === 0) { setStep(8); return; }
      setStep(7);
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Payment (preserved exactly) ───────────────────────────────────────────

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

  // ── Derived state ─────────────────────────────────────────────────────────

  const regClosed = config?.event.registration_closes_at
    ? Date.now() > new Date(config.event.registration_closes_at).getTime()
    : false;

  const eventTitle = config?.event.title ?? "The IT Run Sprint-2";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: BG, color: "#fff", fontFamily: "'Inter',system-ui,sans-serif", minHeight: "100vh" }}>

      {/* Navigation */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        background: "rgba(8,8,8,0.97)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        height: 56, display: "flex", alignItems: "center",
        padding: "0 clamp(1rem,4vw,2rem)", justifyContent: "space-between",
      }}>
        <Link href="/it-run" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <Image src="/logo.png" alt="" width={24} height={24} style={{ borderRadius: "50%" }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{eventTitle}</div>
            <div style={{ fontSize: 10, color: "#555" }}>Registration</div>
          </div>
        </Link>
        {step < 8 && (
          <Link href="/it-run" style={{ fontSize: 12, color: "#555", textDecoration: "none" }}>Cancel</Link>
        )}
      </nav>

      {/* Registration closed banner */}
      {regClosed && step === 1 && (
        <div style={{
          position: "fixed", top: 56, left: 0, right: 0, zIndex: 99,
          background: "rgba(248,113,113,0.1)", borderBottom: "1px solid rgba(248,113,113,0.2)",
          padding: "8px clamp(1rem,4vw,2rem)", fontSize: 13, color: "#f87171", textAlign: "center",
        }}>
          Registration for this event is now closed.
        </div>
      )}

      {/* Main content */}
      <div style={{
        maxWidth: 680, margin: "0 auto",
        padding: `calc(56px + clamp(1.5rem,4vw,2.5rem)) clamp(1rem,4vw,2rem) ${step >= 2 && step <= 7 && selectedCat ? "80px" : "clamp(1.5rem,4vw,2.5rem)"}`,
        minHeight: "100vh",
      }}>

        {step === 1 && (
          <StepCategory
            config={config}
            loading={configLoading}
            onSelect={selectCategory}
          />
        )}

        {step === 2 && selectedCat && (
          <StepConfirm
            category={selectedCat}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}

        {step === 3 && selectedCat && (
          <StepParticipants
            category={selectedCat}
            participants={participants}
            errors={pErrors}
            onChange={updateParticipant}
            submitError={submitError}
            onBack={() => setStep(2)}
            onNext={() => { if (validateParticipants()) { setSubmitError(""); setStep(4); } }}
          />
        )}

        {step === 4 && selectedCat && (
          <StepCompany
            category={selectedCat}
            participants={participants}
            uploading={uploading}
            onChange={updateParticipant}
            onUpload={uploadCompanyId}
            onBack={() => setStep(3)}
            onNext={() => setStep(5)}
          />
        )}

        {step === 5 && selectedCat && (
          <StepReview
            category={selectedCat}
            participants={participants}
            onBack={() => setStep(4)}
            onNext={() => setStep(6)}
          />
        )}

        {step === 6 && selectedCat && (
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
            onBack={() => setStep(5)}
            onSubmit={submitRegistration}
          />
        )}

        {step === 7 && selectedCat && (
          <StepPayment
            regCode={regCode}
            finalPrice={finalPrice}
            submitting={submitting}
            submitError={submitError}
            onPay={initiatePayment}
          />
        )}

        {step === 8 && (
          <StepSuccess
            regCode={regCode}
            paymentDone={paymentDone}
            eventTitle={eventTitle}
          />
        )}
      </div>

      {/* Sticky price bar (shown steps 2-7) */}
      {step >= 2 && step <= 7 && selectedCat && (
        <PriceBar
          category={selectedCat}
          finalPrice={finalPrice}
          couponApplied={!!coupon}
        />
      )}

      <style>{`
        @keyframes popIn {
          0%   { transform: scale(0.5); opacity: 0; }
          80%  { transform: scale(1.1); }
          100% { transform: scale(1);   opacity: 1; }
        }
        * { box-sizing: border-box; }
        input:focus, select:focus, textarea:focus { border-color: rgba(232,98,10,0.5) !important; }
        button:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
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
