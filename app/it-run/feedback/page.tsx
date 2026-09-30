"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";

const ACCENT = "#e8620a";
const GREEN  = "#10b981";
const AMBER  = "#f59e0b";
const RED    = "#ef4444";

// ── Improvement area options ───────────────────────────────────────────────────

const IMPROVEMENT_OPTIONS = [
  { id: "registration",   label: "Registration process"  },
  { id: "water_stations", label: "Water stations"        },
  { id: "route_marking",  label: "Route marking"         },
  { id: "tshirts",        label: "T-shirts / kits"       },
  { id: "checkin",        label: "Check-in process"      },
  { id: "bag_drop",       label: "Bag drop"              },
  { id: "finish_line",    label: "Finish line experience"},
  { id: "bib_collection", label: "BIB collection"        },
  { id: "parking",        label: "Parking"               },
  { id: "timing",         label: "Race timing"           },
  { id: "refreshments",   label: "Refreshments"          },
  { id: "support_staff",  label: "Support staff"         },
  { id: "communication",  label: "Communication"         },
  { id: "safety",         label: "Safety & medicals"     },
  { id: "photography",    label: "Photography"           },
];

// ── Star rating component ─────────────────────────────────────────────────────

function StarRating({
  label,
  value,
  onChange,
  required = false,
  size = 36,
}: {
  label: string;
  value: number | null;
  onChange: (n: number) => void;
  required?: boolean;
  size?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value ?? 0;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 14, color: "#ccc", marginBottom: 8 }}>
        {label}{required && <span style={{ color: RED }}> *</span>}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(null)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: size, lineHeight: 1, padding: 0,
              color: display >= n ? AMBER : "rgba(255,255,255,0.12)",
              transition: "color 0.1s, transform 0.1s",
              transform: hover === n ? "scale(1.2)" : "scale(1)",
            }}>
            ★
          </button>
        ))}
      </div>
      {value !== null && (
        <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
          {["", "Poor", "Fair", "Good", "Very good", "Excellent"][value]}
        </div>
      )}
    </div>
  );
}

// ── NPS selector ─────────────────────────────────────────────────────────────

function NpsSelector({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 14, color: "#ccc", marginBottom: 4 }}>
        How likely are you to recommend IT Run to a friend? <span style={{ color: "#666" }}>(optional)</span>
      </div>
      <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>0 = Not at all · 10 = Extremely likely</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {Array.from({ length: 11 }, (_, i) => i).map(n => {
          const color = n >= 9 ? GREEN : n >= 7 ? AMBER : n <= 6 ? "#ef444480" : "#555";
          const selected = value === n;
          return (
            <button key={n} type="button" onClick={() => onChange(n)}
              style={{
                width: 40, height: 40, border: `2px solid ${selected ? ACCENT : "rgba(255,255,255,0.12)"}`,
                borderRadius: 8, background: selected ? `${ACCENT}20` : "rgba(255,255,255,0.04)",
                color: selected ? ACCENT : color,
                fontSize: 14, fontWeight: selected ? 800 : 400, cursor: "pointer", fontFamily: "inherit",
              }}>
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main feedback page ────────────────────────────────────────────────────────

type Step = "code" | "form" | "submitted" | "already" | "gate" | "error";

export default function ItRunFeedbackPage() {
  const searchParams = useSearchParams();

  const [step,        setStep]        = useState<Step>("code");
  const [code,        setCode]        = useState(searchParams?.get("code") ?? "");
  const [codeError,   setCodeError]   = useState("");
  const [checking,    setChecking]    = useState(false);
  const [gateMessage, setGateMessage] = useState("");
  const [existing,    setExisting]    = useState<{
    overall_rating: number; comment: string; created_at: string;
  } | null>(null);
  const [submitting,  setSubmitting]  = useState(false);

  // Form state
  const [overallRating,      setOverallRating]      = useState<number | null>(null);
  const [organisationRating, setOrganisationRating] = useState<number | null>(null);
  const [routeRating,        setRouteRating]        = useState<number | null>(null);
  const [supportRating,      setSupportRating]      = useState<number | null>(null);
  const [nps,                setNps]                = useState<number | null>(null);
  const [comment,            setComment]            = useState("");
  const [wouldRecommend,     setWouldRecommend]     = useState<boolean | null>(null);
  const [selectedAreas,      setSelectedAreas]      = useState<Set<string>>(new Set());
  const [formError,          setFormError]          = useState("");

  // Auto-check code if passed via URL
  useEffect(() => {
    const urlCode = searchParams?.get("code");
    if (urlCode) {
      setCode(urlCode.toUpperCase());
      checkCode(urlCode.toUpperCase());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkCode(raw?: string) {
    const c = (raw ?? code).trim().toUpperCase();
    if (!c) { setCodeError("Please enter your registration code."); return; }
    setChecking(true);
    setCodeError("");
    try {
      const r = await fetch(`/api/it-run/feedback?code=${encodeURIComponent(c)}`);
      if (r.status === 200) {
        const d = await r.json() as { feedback: { overall_rating: number; comment: string; created_at: string } | null };
        if (d.feedback) {
          setExisting(d.feedback);
          setStep("already");
        } else {
          setStep("form");
        }
      } else if (r.status === 400) {
        setCodeError("Registration code not found. Please check and try again.");
      } else if (r.status === 403) {
        const e = await r.json() as { error: string };
        setGateMessage(e.error);
        setStep("gate");
      } else {
        setCodeError("Something went wrong. Please try again.");
      }
    } catch {
      setCodeError("Network error. Please try again.");
    }
    setChecking(false);
  }

  function toggleArea(id: string) {
    setSelectedAreas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function submitFeedback(e: React.FormEvent) {
    e.preventDefault();
    if (!overallRating) { setFormError("Please provide an overall rating."); return; }
    setFormError("");
    setSubmitting(true);
    try {
      const r = await fetch("/api/it-run/feedback", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registration_code:   code,
          overall_rating:      overallRating,
          organisation_rating: organisationRating,
          route_rating:        routeRating,
          support_rating:      supportRating,
          nps_score:           nps,
          comment:             comment.trim() || null,
          would_recommend:     wouldRecommend,
          improvement_areas:   [...selectedAreas],
        }),
      });

      if (r.status === 200) {
        setStep("submitted");
      } else if (r.status === 409) {
        const d = await r.json() as { already: boolean; feedback: { overall_rating: number; comment: string; created_at: string } | null };
        if (d.already) { setExisting(d.feedback); setStep("already"); }
      } else if (r.status === 429) {
        setFormError("Too many attempts. Please wait a minute and try again.");
      } else {
        const d = await r.json() as { error?: string };
        setFormError(d.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setFormError("Network error. Please try again.");
    }
    setSubmitting(false);
  }

  // ── Render steps ──────────────────────────────────────────────────────────

  const shell = (children: React.ReactNode) => (
    <div style={{
      background: "#080808", minHeight: "100vh", color: "#fff",
      fontFamily: "'Inter',system-ui,sans-serif",
      padding: "env(safe-area-inset-top,0) 0 env(safe-area-inset-bottom,0)",
    }}>
      {/* Header */}
      <div style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "14px 20px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: ACCENT }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>IT Run Sprint-2</span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#555" }}>Participant Feedback</span>
      </div>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 20px 60px" }}>
        {children}
      </div>
    </div>
  );

  if (step === "code") {
    return shell(
      <>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.2, marginBottom: 8 }}>
            How was your IT Run experience?
          </h1>
          <p style={{ fontSize: 14, color: "#888", lineHeight: 1.6 }}>
            Your feedback helps us improve future editions. Takes under 2 minutes.
          </p>
        </div>

        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 24 }}>
          <label style={{ fontSize: 13, color: "#aaa", display: "block", marginBottom: 8 }}>
            Enter your registration code
          </label>
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && checkCode()}
            placeholder="ITRUN2-XXXXXXXX"
            maxLength={20}
            style={{
              width: "100%", padding: "12px 14px",
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 10, color: "#fff", fontSize: 16, fontFamily: "inherit",
              letterSpacing: "0.05em", textTransform: "uppercase", boxSizing: "border-box",
            }}
          />
          {codeError && <div style={{ fontSize: 13, color: RED, marginTop: 8 }}>{codeError}</div>}
          <p style={{ fontSize: 12, color: "#555", marginTop: 8 }}>
            You can find your code in the confirmation email you received when you registered.
          </p>

          <button onClick={() => checkCode()} disabled={checking}
            style={{
              marginTop: 16, width: "100%", padding: "13px 0",
              background: checking ? "rgba(255,255,255,0.08)" : ACCENT,
              border: "none", borderRadius: 10, color: "#fff",
              fontSize: 15, fontWeight: 700, cursor: checking ? "default" : "pointer",
              fontFamily: "inherit",
            }}>
            {checking ? "Checking…" : "Continue →"}
          </button>
        </div>
      </>
    );
  }

  if (step === "gate") {
    return shell(
      <div style={{ textAlign: "center", paddingTop: 40 }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Feedback not yet available</h2>
        <p style={{ fontSize: 14, color: "#888", lineHeight: 1.6, maxWidth: 380, margin: "0 auto" }}>{gateMessage}</p>
        <button onClick={() => setStep("code")}
          style={{ marginTop: 24, padding: "10px 24px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#aaa", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          ← Back
        </button>
      </div>
    );
  }

  if (step === "already") {
    return shell(
      <div style={{ textAlign: "center", paddingTop: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, color: GREEN }}>Already submitted!</h2>
        <p style={{ fontSize: 14, color: "#888", lineHeight: 1.6, maxWidth: 380, margin: "0 auto" }}>
          You&#39;ve already submitted feedback for this event.
        </p>
        {existing && (
          <div style={{ margin: "24px auto", maxWidth: 380, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 20, textAlign: "left" }}>
            <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
              {[1,2,3,4,5].map(n => (
                <span key={n} style={{ fontSize: 22, color: (existing.overall_rating ?? 0) >= n ? AMBER : "rgba(255,255,255,0.1)" }}>★</span>
              ))}
            </div>
            {existing.comment && <p style={{ fontSize: 13, color: "#aaa", lineHeight: 1.6, margin: 0 }}>{existing.comment}</p>}
            <div style={{ fontSize: 11, color: "#444", marginTop: 10 }}>
              Submitted {new Date(existing.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (step === "submitted") {
    return shell(
      <div style={{ textAlign: "center", paddingTop: 40 }}>
        <div style={{ fontSize: 60, marginBottom: 16 }}>🙏</div>
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 10, color: GREEN }}>Thank you!</h2>
        <p style={{ fontSize: 15, color: "#aaa", lineHeight: 1.7, maxWidth: 400, margin: "0 auto" }}>
          Your feedback has been recorded. It helps us make every edition of IT Run better for all participants.
        </p>
        <p style={{ fontSize: 13, color: "#555", marginTop: 20, lineHeight: 1.6, maxWidth: 360, margin: "20px auto 0" }}>
          See you at the next IT Run. 🏃
        </p>
        <a href="/it-run"
          style={{ display: "inline-block", marginTop: 28, padding: "11px 28px", background: ACCENT, borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
          Back to IT Run
        </a>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  return shell(
    <form onSubmit={submitFeedback} noValidate>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2, marginBottom: 6 }}>Your feedback</h1>
        <p style={{ fontSize: 13, color: "#666" }}>{code}</p>
      </div>

      {/* Overall rating */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 20, marginBottom: 16 }}>
        <StarRating
          label="Overall experience"
          value={overallRating}
          onChange={setOverallRating}
          required
          size={42}
        />
      </div>

      {/* NPS */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 20, marginBottom: 16 }}>
        <NpsSelector value={nps} onChange={setNps} />
        {/* Would recommend */}
        <div style={{ marginBottom: 0 }}>
          <div style={{ fontSize: 14, color: "#ccc", marginBottom: 8 }}>
            Would you recommend IT Run to a friend? <span style={{ color: "#666" }}>(optional)</span>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {[{ val: true, label: "Yes" }, { val: false, label: "No" }].map(opt => (
              <button key={String(opt.val)} type="button"
                onClick={() => setWouldRecommend(opt.val)}
                style={{
                  flex: 1, padding: "10px 0",
                  background: wouldRecommend === opt.val ? (opt.val ? `${GREEN}20` : `${RED}20`) : "rgba(255,255,255,0.04)",
                  border: `2px solid ${wouldRecommend === opt.val ? (opt.val ? GREEN : RED) : "rgba(255,255,255,0.1)"}`,
                  borderRadius: 10, color: wouldRecommend === opt.val ? (opt.val ? GREEN : RED) : "#888",
                  fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Category ratings */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>Detailed ratings <span style={{ fontWeight: 400 }}>(optional)</span></div>
        <StarRating label="Organisation" value={organisationRating} onChange={setOrganisationRating} />
        <StarRating label="Route & course"  value={routeRating}        onChange={setRouteRating} />
        <StarRating label="Support & staff" value={supportRating}      onChange={setSupportRating} />
      </div>

      {/* Comment */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 20, marginBottom: 16 }}>
        <label style={{ fontSize: 14, color: "#ccc", display: "block", marginBottom: 10 }}>
          What did you enjoy most? <span style={{ color: "#666" }}>(optional)</span>
        </label>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="The route was beautiful, the support staff were amazing…"
          maxLength={2000}
          rows={4}
          style={{
            width: "100%", padding: "12px 14px",
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10, color: "#fff", fontSize: 14, fontFamily: "inherit",
            resize: "vertical", lineHeight: 1.5, boxSizing: "border-box",
          }}
        />
        <div style={{ fontSize: 11, color: "#444", marginTop: 4, textAlign: "right" }}>{comment.length}/2000</div>
      </div>

      {/* Improvement areas */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 14, color: "#ccc", marginBottom: 12 }}>
          What could we improve? <span style={{ color: "#666" }}>(optional, select all that apply)</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {IMPROVEMENT_OPTIONS.map(opt => {
            const active = selectedAreas.has(opt.id);
            return (
              <button key={opt.id} type="button" onClick={() => toggleArea(opt.id)}
                style={{
                  padding: "7px 14px",
                  background: active ? `${ACCENT}20` : "rgba(255,255,255,0.04)",
                  border: `1px solid ${active ? ACCENT + "60" : "rgba(255,255,255,0.1)"}`,
                  borderRadius: 20, color: active ? ACCENT : "#888",
                  fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                }}>
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {formError && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: `${RED}15`, border: `1px solid ${RED}30`, borderRadius: 10, fontSize: 13, color: RED }}>
          {formError}
        </div>
      )}

      <button type="submit" disabled={submitting || !overallRating}
        style={{
          width: "100%", padding: "14px 0",
          background: submitting || !overallRating ? "rgba(255,255,255,0.08)" : ACCENT,
          border: "none", borderRadius: 12,
          color: submitting || !overallRating ? "#444" : "#fff",
          fontSize: 16, fontWeight: 700, cursor: submitting || !overallRating ? "default" : "pointer",
          fontFamily: "inherit",
        }}>
        {submitting ? "Submitting…" : "Submit Feedback"}
      </button>

      <p style={{ fontSize: 12, color: "#444", textAlign: "center", marginTop: 14, lineHeight: 1.5 }}>
        Your feedback is confidential. Your name is not shown publicly.
      </p>
    </form>
  );
}
