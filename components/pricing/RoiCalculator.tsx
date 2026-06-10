"use client";

import { useState } from "react";

// Walk-up price per session for non-members.
// Update this when the standard event registration price changes.
const WALK_UP_PRICE = 299;

// Best-value monthly equivalent for each plan (paise → INR).
const PLANS = [
  { label: "Monthly",   months: 1,  monthlyRate: 1200 },
  { label: "Quarterly", months: 3,  monthlyRate: 1000 },
  { label: "6 Months",  months: 6,  monthlyRate: 1000 },
  { label: "Annual",    months: 12, monthlyRate:  900 },
];

// The plan shown highlighted in the calculator (best value at most session counts).
const RECOMMENDED_PLAN = PLANS[3]; // Annual

export default function RoiCalculator() {
  const [sessions, setSessions] = useState(4);

  const monthlyCostNoMembership = sessions * WALK_UP_PRICE;
  const annualCostNoMembership  = monthlyCostNoMembership * 12;

  // Use the annual plan for comparison (best value).
  const membershipMonthly = RECOMMENDED_PLAN.monthlyRate;
  const membershipAnnual  = membershipMonthly * 12;

  const savesPerMonth = Math.max(0, monthlyCostNoMembership - membershipMonthly);
  const savesPerYear  = Math.max(0, annualCostNoMembership  - membershipAnnual);

  const breakEvenSessions = Math.ceil(membershipMonthly / WALK_UP_PRICE);
  const isPastBreakEven   = sessions >= breakEvenSessions;

  // Bar widths — cap membership bar at 100%, scale run-cost bar relative.
  const maxBar     = Math.max(monthlyCostNoMembership, membershipMonthly, 1);
  const runBarPct  = Math.round((monthlyCostNoMembership / maxBar) * 100);
  const memBarPct  = Math.round((membershipMonthly      / maxBar) * 100);

  return (
    <div style={{
      background:   "var(--surface)",
      border:       "1px solid var(--border)",
      borderRadius: 16,
      padding:      "1.75rem 1.5rem",
      maxWidth:     520,
      margin:       "0 auto",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
        <div style={{ fontSize: 10, color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: "0.4rem" }}>
          Is premium worth it?
        </div>
        <div style={{ fontSize: "1.15rem", fontWeight: 700, lineHeight: 1.3 }}>
          Calculate your savings
        </div>
      </div>

      {/* Slider */}
      <div style={{ marginBottom: "1.75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.6rem" }}>
          <label style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", fontWeight: 500 }}>
            I attend
          </label>
          <span style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--cs-orange)", lineHeight: 1 }}>
            {sessions} <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--muted-foreground)" }}>sessions/month</span>
          </span>
        </div>

        <input
          type="range"
          min={1}
          max={12}
          value={sessions}
          onChange={e => setSessions(Number(e.target.value))}
          style={{ width: "100%", accentColor: "var(--cs-orange)", cursor: "pointer" }}
        />

        {/* Tick labels */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.25rem" }}>
          {[1, 4, 8, 12].map(n => (
            <span key={n} style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>{n}</span>
          ))}
        </div>
      </div>

      {/* Bar comparison */}
      <div style={{ marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>

        {/* Pay per run bar */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
            <span style={{ fontSize: "0.78rem", color: "var(--muted-foreground)" }}>Pay per run</span>
            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: isPastBreakEven ? "#f09595" : "var(--foreground)" }}>
              ₹{monthlyCostNoMembership.toLocaleString("en-IN")}<span style={{ fontSize: "10px", fontWeight: 400, color: "var(--muted-foreground)", marginLeft: 2 }}>/mo</span>
            </span>
          </div>
          <div style={{ height: 10, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width:  `${runBarPct}%`,
              background: isPastBreakEven ? "rgba(240,149,149,0.6)" : "rgba(255,255,255,0.2)",
              borderRadius: 99,
              transition: "width 0.3s ease",
            }} />
          </div>
        </div>

        {/* Membership bar */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
            <span style={{ fontSize: "0.78rem", color: "var(--cs-orange)", fontWeight: 600 }}>
              Annual membership
            </span>
            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--cs-orange)" }}>
              ₹{membershipMonthly.toLocaleString("en-IN")}<span style={{ fontSize: "10px", fontWeight: 400, color: "var(--muted-foreground)", marginLeft: 2 }}>/mo</span>
            </span>
          </div>
          <div style={{ height: 10, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width:  `${memBarPct}%`,
              background: "var(--gradient-accent)",
              borderRadius: 99,
              transition: "width 0.3s ease",
            }} />
          </div>
        </div>
      </div>

      {/* Savings callout — only shown when premium wins */}
      {isPastBreakEven ? (
        <div style={{
          background:   "oklch(0.72 0.19 49 / 10%)",
          border:       "1px solid oklch(0.72 0.19 49 / 25%)",
          borderRadius: 12,
          padding:      "1rem 1.25rem",
          textAlign:    "center",
        }}>
          <div style={{ fontSize: "0.72rem", color: "var(--cs-orange)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.6rem" }}>
            Your savings with Annual
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: "2rem", marginBottom: "0.75rem" }}>
            <div>
              <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#4ade80", lineHeight: 1, letterSpacing: "-0.5px" }}>
                ₹{savesPerMonth.toLocaleString("en-IN")}
              </div>
              <div style={{ fontSize: "10px", color: "var(--muted-foreground)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>per month</div>
            </div>
            <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch" }} />
            <div>
              <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#4ade80", lineHeight: 1, letterSpacing: "-0.5px" }}>
                ₹{savesPerYear.toLocaleString("en-IN")}
              </div>
              <div style={{ fontSize: "10px", color: "var(--muted-foreground)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>per year</div>
            </div>
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", lineHeight: 1.6 }}>
            Plus personalised coaching, weekly check-ins & direct WhatsApp access to your coach.
          </div>
        </div>
      ) : (
        <div style={{
          background:   "rgba(255,255,255,0.03)",
          border:       "1px solid var(--border)",
          borderRadius: 12,
          padding:      "0.875rem 1.25rem",
          textAlign:    "center",
        }}>
          <div style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", lineHeight: 1.7 }}>
            Attend <strong style={{ color: "var(--foreground)" }}>{breakEvenSessions} or more sessions</strong> per month and premium pays for itself — plus you get a personalised training plan, weekly coach check-ins, and direct WhatsApp access.
          </div>
        </div>
      )}

      {/* Walk-up price note */}
      <div style={{ marginTop: "0.875rem", textAlign: "center", fontSize: "10px", color: "var(--muted-foreground)" }}>
        Based on ₹{WALK_UP_PRICE} standard walk-up price per session.
      </div>
    </div>
  );
}
