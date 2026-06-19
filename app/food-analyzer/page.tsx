"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DetectedFood  { name: string; quantity: string; confidence: number }
interface Nutrition     { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; sugar_g: number; sodium_mg: number; confidence: number }
interface GoalRec       { summary: string; tips: string[]; add_foods: string[] }
interface MissingNutr   { nutrient: string; suggestion: string }

interface Analysis {
  detected_foods:      DetectedFood[];
  nutrition:           Nutrition;
  health_score:        number;
  health_grade:        string;
  health_grade_reason: string;
  healthy_ingredients: string[];
  concerns:            string[];
  goal_recommendation: GoalRec;
  missing_nutrients:   MissingNutr[];
}

interface UsageInfo { used: number; limit: number | null; is_premium: boolean }

interface HistoryItem {
  id:             string;
  image_data:     string | null;
  detected_foods: DetectedFood[];
  nutrition:      Nutrition;
  health_score:   number;
  health_grade:   string;
  meal_type:      string | null;
  created_at:     string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack", "Pre-workout", "Post-workout"];

const GRADE_COLORS: Record<string, string> = {
  "Excellent":          "#4ade80",
  "Good":               "#86efac",
  "Average":            "#fbbf24",
  "Needs Improvement":  "#f09595",
};

const MACRO_COLORS: Record<string, string> = {
  protein:  "#60a5fa",
  carbs:    "#fbbf24",
  fat:      "#f472b6",
  fiber:    "#34d399",
};

function scoreColor(s: number) {
  if (s >= 80) return "#4ade80";
  if (s >= 60) return "#fbbf24";
  if (s >= 40) return "#f97316";
  return "#f09595";
}

async function compressImage(file: File, maxDim: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h && w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; }
        else if (h > w && h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; }
        else if (w > maxDim) { w = h = maxDim; }
        const canvas = document.createElement("canvas");
        canvas.width  = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function HealthScoreRing({ score }: { score: number }) {
  const r   = 44;
  const circ = 2 * Math.PI * r;
  const pct  = Math.max(0, Math.min(100, score)) / 100;
  const col  = scoreColor(score);
  return (
    <div style={{ position: "relative", width: 120, height: 120, flexShrink: 0 }}>
      <svg width="120" height="120" viewBox="0 0 120 120" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={r}
          fill="none"
          stroke={col}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${circ * pct} ${circ * (1 - pct)}`}
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: "1.6rem", fontWeight: 800, color: col, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: "9px", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>/100</span>
      </div>
    </div>
  );
}

function MacroBar({ label, value, max, color, unit = "g" }: { label: string; value: number; max: number; color: string; unit?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", textTransform: "capitalize" }}>{label}</span>
        <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--foreground)" }}>{value}{unit}</span>
      </div>
      <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.8s ease" }} />
      </div>
    </div>
  );
}

// ── Upload area ───────────────────────────────────────────────────────────────

function UploadArea({ onFile }: { onFile: (f: File) => void }) {
  const cameraRef  = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{ border: "2px dashed rgba(255,255,255,0.12)", borderRadius: 16, padding: "2.5rem 1.5rem", textAlign: "center", background: "rgba(255,255,255,0.02)" }}>
      <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🍽️</div>
      <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--foreground)", marginBottom: "0.4rem" }}>Snap or upload your meal</div>
      <div style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", marginBottom: "1.5rem", lineHeight: 1.6 }}>
        AI will identify food items, estimate macros,<br />and give goal-based recommendations.
      </div>

      <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
        <button
          onClick={() => cameraRef.current?.click()}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 20px", background: "var(--gradient-accent)", border: "none", borderRadius: 10, color: "#fff", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "var(--shadow-orange)" }}>
          <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          Take Photo
        </button>
        <button
          onClick={() => galleryRef.current?.click()}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 20px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "var(--foreground)", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
          </svg>
          Upload from Gallery
        </button>
      </div>

      {/* Camera capture input */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment"
        onChange={e => e.target.files?.[0] && onFile(e.target.files[0])}
        style={{ display: "none" }} />
      {/* Gallery input (no capture attribute) */}
      <input ref={galleryRef} type="file" accept="image/*"
        onChange={e => e.target.files?.[0] && onFile(e.target.files[0])}
        style={{ display: "none" }} />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FoodAnalyzerPage() {
  const [tab,        setTab]        = useState<"analyze" | "history">("analyze");
  const [imageFile,  setImageFile]  = useState<File | null>(null);
  const [preview,    setPreview]    = useState<string | null>(null);     // display preview
  const [apiImage,   setApiImage]   = useState<string | null>(null);     // base64 for API
  const [thumbImage, setThumbImage] = useState<string | null>(null);     // 200px thumbnail for storage
  const [mealType,   setMealType]   = useState("Lunch");
  const [analyzing,  setAnalyzing]  = useState(false);
  const [analysis,   setAnalysis]   = useState<Analysis | null>(null);
  const [analyzeErr, setAnalyzeErr] = useState("");
  const [saved,      setSaved]      = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [saveMsg,    setSaveMsg]    = useState("");
  const [usage,      setUsage]      = useState<UsageInfo | null>(null);
  const [history,    setHistory]    = useState<HistoryItem[]>([]);
  const [histLoading,setHistLoading]= useState(false);
  const [goal,            setGoal]           = useState("fitness");
  const [featureDisabled, setFeatureDisabled] = useState(false);

  // Load usage + goal from localStorage on mount
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("cs_user") ?? "{}");
      if (u.goal) setGoal(u.goal);
    } catch { /* ignore */ }

    const tok = localStorage.getItem("cs_user_token") ?? "";
    if (!tok) return;
    fetch("/api/food/history", { headers: { "x-user-token": tok } })
      .then(r => r.json())
      .then(d => {
        if (d.disabled) { setFeatureDisabled(true); return; }
        if (d.usage)    setUsage(d.usage);
        if (d.analyses) setHistory(d.analyses);
      })
      .catch(() => {});
  }, []);

  const loadHistory = useCallback(() => {
    const tok = localStorage.getItem("cs_user_token") ?? "";
    if (!tok) return;
    setHistLoading(true);
    fetch("/api/food/history", { headers: { "x-user-token": tok } })
      .then(r => r.json())
      .then(d => {
        if (d.usage)    setUsage(d.usage);
        if (d.analyses) setHistory(d.analyses);
      })
      .catch(() => {})
      .finally(() => setHistLoading(false));
  }, []);

  async function handleFile(file: File) {
    setAnalysis(null);
    setSaved(false);
    setSaveMsg("");
    setAnalyzeErr("");
    setImageFile(file);

    // Generate three sizes in parallel
    const [displayB64, apiB64, thumbB64] = await Promise.all([
      compressImage(file, 600, 0.85),   // display preview (≤600px)
      compressImage(file, 900, 0.82),   // API call (≤900px for accuracy)
      compressImage(file, 220, 0.65),   // storage thumbnail
    ]);
    setPreview(displayB64);
    setApiImage(apiB64);
    setThumbImage(thumbB64);
  }

  function reset() {
    setImageFile(null);
    setPreview(null);
    setApiImage(null);
    setThumbImage(null);
    setAnalysis(null);
    setSaved(false);
    setSaveMsg("");
    setAnalyzeErr("");
  }

  async function analyze() {
    if (!apiImage) return;
    setAnalyzing(true);
    setAnalyzeErr("");
    try {
      const tok = localStorage.getItem("cs_user_token") ?? "";
      const res = await fetch("/api/food/analyze", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-user-token": tok },
        body:    JSON.stringify({ image_base64: apiImage, meal_type: mealType, goal }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "FREE_LIMIT_REACHED") {
          setAnalyzeErr(data.message ?? "Monthly limit reached. Upgrade to Premium.");
        } else {
          setAnalyzeErr(data.error ?? "Analysis failed. Please try again.");
        }
        return;
      }
      setAnalysis(data.analysis);
      if (data.usage) setUsage(data.usage);
    } catch {
      setAnalyzeErr("Network error. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function saveAnalysis() {
    if (!analysis || saved || saving) return;
    setSaving(true);
    try {
      const tok = localStorage.getItem("cs_user_token") ?? "";
      const res = await fetch("/api/food/history", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-user-token": tok },
        body:    JSON.stringify({
          image_data:          thumbImage,
          detected_foods:      analysis.detected_foods,
          nutrition:           analysis.nutrition,
          health_score:        analysis.health_score,
          health_grade:        analysis.health_grade,
          health_grade_reason: analysis.health_grade_reason,
          healthy_ingredients: analysis.healthy_ingredients,
          concerns:            analysis.concerns,
          goal_recommendation: analysis.goal_recommendation,
          missing_nutrients:   analysis.missing_nutrients,
          meal_type:           mealType,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setSaveMsg("Saved to your food history.");
        loadHistory();
      } else {
        const d = await res.json();
        setSaveMsg(d.error ?? "Save failed.");
      }
    } catch {
      setSaveMsg("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const usagePct  = usage ? (usage.limit ? (usage.used / usage.limit) * 100 : 0) : 0;
  const gradeCol  = analysis ? (GRADE_COLORS[analysis.health_grade] ?? "#fbbf24") : "#fbbf24";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>

      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--bg-glass)", backdropFilter: "blur(18px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "env(safe-area-inset-top) 1.25rem 0", height: "calc(56px + env(safe-area-inset-top))", display: "flex", alignItems: "flex-end", justifyContent: "space-between", paddingBottom: "0.75rem" }}>
        <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none", color: "var(--muted-foreground)", fontSize: "0.85rem" }}>
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back
        </Link>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "0.9rem", fontWeight: 700 }}>AI Food Analyzer</div>
          {usage && (
            <div style={{ fontSize: "10px", color: usage.is_premium ? "#4ade80" : "var(--muted-foreground)", marginTop: 1 }}>
              {usage.is_premium ? "✓ Premium — Unlimited" : `${usage.used}/${usage.limit} free this month`}
            </div>
          )}
        </div>
        <button
          onClick={() => { setTab(t => t === "history" ? "analyze" : "history"); if (tab === "analyze") loadHistory(); }}
          style={{ fontSize: "0.78rem", color: "var(--cs-orange)", fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
          {tab === "analyze" ? "History" : "Analyze"}
        </button>
      </header>

      <div style={{ maxWidth: 540, margin: "0 auto", padding: "1.25rem 1.25rem 6rem" }}>

        {/* ── Feature disabled: Coming Soon ── */}
        {featureDisabled && (
          <div style={{ textAlign: "center", padding: "4rem 1.5rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
            <div style={{ fontSize: "3rem" }}>🍽️</div>
            <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--foreground)" }}>AI Food Analyzer</div>
            <div style={{ fontSize: "0.85rem", color: "var(--cs-orange)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Coming Soon</div>
            <div style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", lineHeight: 1.7, maxWidth: 300 }}>
              Snap a meal and instantly get macros, a health score, and personalised recommendations for your fitness goal.
            </div>
            <Link href="/dashboard" style={{ marginTop: "0.5rem", padding: "10px 22px", background: "var(--gradient-accent)", borderRadius: 10, color: "#fff", fontSize: "0.85rem", fontWeight: 700, textDecoration: "none", boxShadow: "var(--shadow-orange)" }}>
              Back to Dashboard
            </Link>
          </div>
        )}

        {/* ── Free tier usage bar ── */}
        {!featureDisabled && (<>
        {usage && !usage.is_premium && (
          <div style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "0.875rem 1rem", marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: "0.78rem", color: "var(--muted-foreground)" }}>Free analyses this month</span>
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: usagePct >= 100 ? "#f09595" : "var(--foreground)" }}>
                {usage.used} / {usage.limit}
              </span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(100, usagePct)}%`, background: usagePct >= 100 ? "#f09595" : "var(--gradient-accent)", borderRadius: 2, transition: "width 0.4s ease" }} />
            </div>
            {usagePct >= 100 && (
              <div style={{ marginTop: "0.6rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.75rem", color: "#f09595" }}>Monthly limit reached</span>
                <Link href="/membership" style={{ fontSize: "0.75rem", color: "var(--cs-orange)", fontWeight: 700, textDecoration: "none" }}>Upgrade →</Link>
              </div>
            )}
          </div>
        )}

        {/* ── ANALYZE TAB ── */}
        {tab === "analyze" && (
          <>
            {!imageFile ? (
              <UploadArea onFile={handleFile} />
            ) : (
              <>
                {/* Image preview + reset */}
                <div style={{ position: "relative", marginBottom: "1rem" }}>
                  {preview && (
                    <img src={preview} alt="Meal preview"
                      style={{ width: "100%", maxHeight: 280, objectFit: "cover", borderRadius: 14, display: "block" }} />
                  )}
                  <button
                    onClick={reset}
                    style={{ position: "absolute", top: 10, right: 10, width: 32, height: 32, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>
                    ✕
                  </button>
                </div>

                {/* Meal type */}
                <div style={{ marginBottom: "1rem" }}>
                  <div style={{ fontSize: "11px", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Meal type</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {MEAL_TYPES.map(mt => (
                      <button key={mt} onClick={() => setMealType(mt)}
                        style={{ padding: "6px 14px", borderRadius: 20, fontSize: "0.78rem", fontWeight: mealType === mt ? 700 : 500, cursor: "pointer", fontFamily: "inherit", border: "1px solid", background: mealType === mt ? "rgba(232,98,10,0.15)" : "transparent", borderColor: mealType === mt ? "rgba(232,98,10,0.5)" : "rgba(255,255,255,0.12)", color: mealType === mt ? "var(--cs-orange)" : "var(--muted-foreground)", transition: "all 0.12s" }}>
                        {mt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Analyze button */}
                {!analysis && (
                  <button
                    onClick={analyze}
                    disabled={analyzing}
                    style={{ display: "block", width: "100%", padding: "14px", background: analyzing ? "rgba(255,255,255,0.08)" : "var(--gradient-accent)", border: "none", borderRadius: 12, color: analyzing ? "var(--muted-foreground)" : "#fff", fontSize: "0.95rem", fontWeight: 700, cursor: analyzing ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: analyzing ? "none" : "var(--shadow-orange)", marginBottom: "0.75rem", transition: "all 0.2s" }}>
                    {analyzing ? (
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ animation: "spin 1s linear infinite" }}>
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        </svg>
                        Analysing your meal…
                      </span>
                    ) : "🔍 Analyse Meal"}
                  </button>
                )}

                {analyzeErr && (
                  <div style={{ background: "rgba(240,149,149,0.08)", border: "1px solid rgba(240,149,149,0.25)", borderRadius: 10, padding: "0.875rem 1rem", marginBottom: "0.75rem", fontSize: "0.82rem", color: "#f09595", lineHeight: 1.6 }}>
                    {analyzeErr}
                    {analyzeErr.toLowerCase().includes("limit") && (
                      <Link href="/membership" style={{ display: "block", marginTop: 8, color: "var(--cs-orange)", fontWeight: 700, textDecoration: "none", fontSize: "0.82rem" }}>
                        Upgrade to Premium →
                      </Link>
                    )}
                  </div>
                )}

                {/* ── RESULTS ── */}
                {analysis && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>

                    {/* Health score + grade */}
                    <div style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "1.25rem" }}>
                      <div style={{ fontSize: "11px", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1rem" }}>Health Score</div>
                      <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
                        <HealthScoreRing score={analysis.health_score} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "1.1rem", fontWeight: 800, color: gradeCol, marginBottom: 4 }}>{analysis.health_grade}</div>
                          <div style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", lineHeight: 1.6 }}>{analysis.health_grade_reason}</div>
                          <div style={{ marginTop: 8, fontSize: "0.75rem", color: "var(--muted-foreground)", fontStyle: "italic" }}>
                            {mealType} · {analysis.nutrition.confidence < 0.6 ? "Estimated" : "Confidence"}: {Math.round(analysis.nutrition.confidence * 100)}%
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Detected foods */}
                    {analysis.detected_foods.length > 0 && (
                      <div style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "1.25rem" }}>
                        <div style={{ fontSize: "11px", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.875rem" }}>Detected Foods</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {analysis.detected_foods.map((food, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: i < analysis.detected_foods.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)" }}>{food.name}</span>
                              <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", textAlign: "right", minWidth: 80 }}>{food.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Nutrition breakdown */}
                    <div style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "1.25rem" }}>
                      <div style={{ fontSize: "11px", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1rem" }}>Nutrition Breakdown</div>

                      {/* Calories headline */}
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <span style={{ fontSize: "2rem", fontWeight: 800, color: "var(--cs-orange)", lineHeight: 1 }}>{analysis.nutrition.calories}</span>
                        <span style={{ fontSize: "0.85rem", color: "var(--muted-foreground)" }}>kcal</span>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                        <MacroBar label="Protein"  value={analysis.nutrition.protein_g}  max={60}   color={MACRO_COLORS.protein} />
                        <MacroBar label="Carbs"    value={analysis.nutrition.carbs_g}    max={120}  color={MACRO_COLORS.carbs}   />
                        <MacroBar label="Fat"      value={analysis.nutrition.fat_g}      max={60}   color={MACRO_COLORS.fat}     />
                        <MacroBar label="Fiber"    value={analysis.nutrition.fiber_g}    max={30}   color={MACRO_COLORS.fiber}   />
                      </div>

                      {/* Secondary macros */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginTop: "0.875rem", paddingTop: "0.875rem", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        {[
                          { l: "Sugar",  v: `${analysis.nutrition.sugar_g}g`   },
                          { l: "Sodium", v: `${analysis.nutrition.sodium_mg}mg` },
                        ].map(({ l, v }) => (
                          <div key={l} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 10px" }}>
                            <div style={{ fontSize: "10px", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{l}</div>
                            <div style={{ fontSize: "0.88rem", fontWeight: 700 }}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Ingredients analysis */}
                    {(analysis.healthy_ingredients.length > 0 || analysis.concerns.length > 0) && (
                      <div style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "1.25rem" }}>
                        <div style={{ fontSize: "11px", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.875rem" }}>Ingredient Insights</div>
                        {analysis.healthy_ingredients.length > 0 && (
                          <div style={{ marginBottom: analysis.concerns.length > 0 ? "0.875rem" : 0 }}>
                            <div style={{ fontSize: "0.75rem", color: "#4ade80", fontWeight: 600, marginBottom: 5 }}>✓ Healthy</div>
                            {analysis.healthy_ingredients.map((item, i) => (
                              <div key={i} style={{ fontSize: "0.82rem", color: "var(--foreground)", padding: "3px 0", display: "flex", gap: 8 }}>
                                <span style={{ color: "#4ade80", flexShrink: 0 }}>✓</span>
                                <span>{item}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {analysis.concerns.length > 0 && (
                          <div>
                            <div style={{ fontSize: "0.75rem", color: "#fbbf24", fontWeight: 600, marginBottom: 5 }}>⚠ Watch Out</div>
                            {analysis.concerns.map((c, i) => (
                              <div key={i} style={{ fontSize: "0.82rem", color: "var(--foreground)", padding: "3px 0", display: "flex", gap: 8 }}>
                                <span style={{ color: "#fbbf24", flexShrink: 0 }}>⚠</span>
                                <span>{c}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Goal recommendation */}
                    {analysis.goal_recommendation && (
                      <div style={{ background: "rgba(232,98,10,0.06)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: 16, padding: "1.25rem" }}>
                        <div style={{ fontSize: "11px", color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem", fontWeight: 700 }}>Goal Recommendation</div>
                        <div style={{ fontSize: "0.85rem", color: "var(--foreground)", lineHeight: 1.6, marginBottom: "0.875rem" }}>{analysis.goal_recommendation.summary}</div>
                        {analysis.goal_recommendation.tips?.length > 0 && (
                          <div style={{ marginBottom: "0.75rem" }}>
                            {analysis.goal_recommendation.tips.map((tip, i) => (
                              <div key={i} style={{ display: "flex", gap: 8, fontSize: "0.8rem", color: "var(--muted-foreground)", padding: "3px 0", lineHeight: 1.5 }}>
                                <span style={{ color: "var(--cs-orange)", flexShrink: 0 }}>→</span>
                                <span>{tip}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {analysis.goal_recommendation.add_foods?.length > 0 && (
                          <div>
                            <div style={{ fontSize: "10px", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Add to your meal</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {analysis.goal_recommendation.add_foods.map((food, i) => (
                                <span key={i} style={{ fontSize: "0.75rem", background: "rgba(232,98,10,0.12)", border: "1px solid rgba(232,98,10,0.25)", color: "var(--cs-orange)", borderRadius: 20, padding: "3px 10px" }}>{food}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Missing nutrients */}
                    {analysis.missing_nutrients?.length > 0 && (
                      <div style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "1.25rem" }}>
                        <div style={{ fontSize: "11px", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.875rem" }}>Missing Nutrients</div>
                        {analysis.missing_nutrients.map((mn, i) => (
                          <div key={i} style={{ display: "flex", gap: "0.75rem", padding: "0.5rem 0", borderBottom: i < analysis.missing_nutrients.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", alignItems: "flex-start" }}>
                            <span style={{ fontSize: "1rem", flexShrink: 0, marginTop: 1 }}>💊</span>
                            <div>
                              <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--foreground)" }}>{mn.nutrient}</div>
                              <div style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginTop: 2, lineHeight: 1.5 }}>{mn.suggestion}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Save button */}
                    <div>
                      <button
                        onClick={saveAnalysis}
                        disabled={saving || saved}
                        style={{ display: "block", width: "100%", padding: "13px", background: saved ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.06)", border: `1px solid ${saved ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.12)"}`, borderRadius: 12, color: saved ? "#4ade80" : "var(--foreground)", fontSize: "0.88rem", fontWeight: 700, cursor: saved ? "default" : "pointer", fontFamily: "inherit", transition: "all 0.2s" }}>
                        {saving ? "Saving…" : saved ? "✓ Saved to History" : "Save Analysis to History"}
                      </button>
                      {saveMsg && !saved && (
                        <div style={{ fontSize: "0.75rem", color: "#f09595", marginTop: 6, textAlign: "center" }}>{saveMsg}</div>
                      )}
                    </div>

                    {/* Analyze another */}
                    <button
                      onClick={reset}
                      style={{ display: "block", width: "100%", padding: "11px", background: "transparent", border: "none", color: "var(--cs-orange)", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                      ← Analyse Another Meal
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === "history" && (
          <div>
            <div style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
              {histLoading ? "Loading…" : `${history.length} saved meal${history.length !== 1 ? "s" : ""}`}
            </div>

            {!histLoading && history.length === 0 && (
              <div style={{ textAlign: "center", padding: "3rem 1rem", background: "var(--surface)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>📋</div>
                <div style={{ fontSize: "0.88rem", fontWeight: 600, marginBottom: 4 }}>No analyses saved yet</div>
                <div style={{ fontSize: "0.78rem", color: "var(--muted-foreground)" }}>Analyse a meal and tap "Save to History"</div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {history.map((item) => {
                const foods = (item.detected_foods as DetectedFood[]) ?? [];
                const nutr  = item.nutrition as Nutrition;
                const col   = scoreColor(item.health_score ?? 0);
                return (
                  <div key={item.id} style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "1rem", display: "flex", gap: "0.875rem", alignItems: "center" }}>
                    {/* Thumbnail */}
                    <div style={{ width: 60, height: 60, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {item.image_data ? (
                        <img src={item.image_data} alt="meal" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <span style={{ fontSize: "1.5rem" }}>🍽️</span>
                      )}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                        <div style={{ fontSize: "0.82rem", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "65%" }}>
                          {foods.slice(0, 2).map(f => f.name).join(", ") || "Meal"}
                          {foods.length > 2 ? ` +${foods.length - 2}` : ""}
                        </div>
                        <div style={{ fontSize: "0.88rem", fontWeight: 800, color: col, flexShrink: 0 }}>{item.health_score ?? "—"}</div>
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginBottom: 4 }}>
                        {item.meal_type && <span style={{ marginRight: 6 }}>{item.meal_type}</span>}
                        {fmtDate(item.created_at)}
                      </div>
                      <div style={{ display: "flex", gap: "0.75rem", fontSize: "11px", color: "var(--muted-foreground)" }}>
                        <span style={{ color: "var(--cs-orange)", fontWeight: 700 }}>{nutr?.calories ?? 0} kcal</span>
                        <span>P: {nutr?.protein_g ?? 0}g</span>
                        <span>C: {nutr?.carbs_g ?? 0}g</span>
                        <span>F: {nutr?.fat_g ?? 0}g</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {!usage?.is_premium && history.length > 0 && (
              <div style={{ marginTop: "1.25rem", background: "rgba(232,98,10,0.06)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: 14, padding: "1rem 1.1rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
                <div>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--cs-orange)", marginBottom: 2 }}>Upgrade to Premium</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", lineHeight: 1.5 }}>Unlimited analyses, coach review &amp; advanced insights</div>
                </div>
                <Link href="/membership" style={{ flexShrink: 0, padding: "8px 14px", background: "var(--gradient-accent)", borderRadius: 8, color: "#fff", fontSize: "0.78rem", fontWeight: 700, textDecoration: "none", boxShadow: "var(--shadow-orange)", whiteSpace: "nowrap" }}>
                  Upgrade
                </Link>
              </div>
            )}
          </div>
        )}

        </>)}

      </div>

      {/* Spinner keyframe */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
