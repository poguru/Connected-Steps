"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

interface Question {
  id:          string;
  category:    string;
  question:    string;
  answer:      string | null;
  status:      string;
  created_at:  string;
  answered_at: string | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  "Injury / Pain":     "#f09595",
  "Training Question": "#60a5fa",
  "Diet & Recovery":   "#4ade80",
  "General":           "#94a3b8",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function MyQuestionsPage() {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    let email = "";
    try {
      const u = JSON.parse(localStorage.getItem("cs_user") ?? "{}");
      email = u.email ?? "";
    } catch { /* ignore */ }

    if (!email) { router.replace("/auth?tab=signin&redirect=/my-questions"); return; }

    fetch(`/api/coach-questions?email=${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((d) => setQuestions(d.questions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  const answered = questions.filter((q) => q.status === "answered");
  const pending  = questions.filter((q) => q.status !== "answered");

  return (
    <div style={{ minHeight: "100vh", background: "var(--cs-black)", color: "var(--cs-white)" }}>

      {/* Navbar */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(8,28,45,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(56,189,248,0.08)", paddingTop: "env(safe-area-inset-top)", display: "flex", alignItems: "center", padding: "0 2rem", minHeight: "calc(var(--nav-h) + env(safe-area-inset-top))", gap: "0.75rem" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
          <Image src="/logo.png" alt="Connected Steps" width={32} height={32} className="rounded-full" />
          <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--cs-white)" }}>Connected Steps</span>
        </Link>
        <span style={{ color: "#444", fontSize: "0.8rem" }}>/</span>
        <span style={{ fontSize: "0.85rem", color: "var(--cs-muted)" }}>My Questions</span>
        <Link href="/dashboard" style={{ marginLeft: "auto", fontSize: "0.8rem", color: "var(--cs-muted)", textDecoration: "none", padding: "6px 14px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px" }}>← Dashboard</Link>
      </header>

      <div style={{ maxWidth: "680px", margin: "0 auto", padding: "3rem 1.5rem" }}>

        <h1 style={{ fontSize: "1.6rem", fontWeight: 300, color: "var(--cs-white)", marginBottom: "0.4rem" }}>My Coach Questions</h1>
        <p style={{ fontSize: "0.875rem", color: "var(--cs-muted)", marginBottom: "2.5rem" }}>
          Questions you've asked and replies from your coach.
        </p>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                <div style={{ width: "90px", height: "18px", background: "rgba(255,255,255,0.06)", borderRadius: "20px" }} />
                <div style={{ width: "80%", height: "14px", background: "rgba(255,255,255,0.05)", borderRadius: "4px" }} />
                <div style={{ width: "55%", height: "11px", background: "rgba(255,255,255,0.04)", borderRadius: "4px" }} />
              </div>
            ))}
          </div>
        ) : questions.length === 0 ? (
          <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", padding: "3rem", textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>💬</div>
            <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "0.5rem" }}>No questions yet</div>
            <div style={{ fontSize: "0.875rem", color: "var(--cs-muted)", marginBottom: "1.5rem" }}>
              Use the "Ask your coach" button on your dashboard to send your first question.
            </div>
            <Link href="/dashboard" style={{ display: "inline-block", padding: "10px 24px", background: "var(--cs-orange)", color: "#fff", borderRadius: "6px", textDecoration: "none", fontSize: "0.85rem", fontWeight: 600 }}>
              Go to Dashboard →
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>

            {/* Awaiting reply */}
            {pending.length > 0 && (
              <section>
                <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
                  Awaiting Reply ({pending.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {pending.map((q) => (
                    <QuestionCard key={q.id} q={q} />
                  ))}
                </div>
              </section>
            )}

            {/* Answered */}
            {answered.length > 0 && (
              <section>
                <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
                  Answered ({answered.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {answered.map((q) => (
                    <QuestionCard key={q.id} q={q} />
                  ))}
                </div>
              </section>
            )}

          </div>
        )}

      </div>
    </div>
  );
}

function QuestionCard({ q }: { q: Question }) {
  const catColor = CATEGORY_COLORS[q.category] ?? "#94a3b8";
  const answered = q.status === "answered";

  return (
    <div style={{ background: "var(--cs-dark)", border: `1px solid ${answered ? "rgba(74,222,128,0.12)" : "rgba(255,255,255,0.06)"}`, borderRadius: "10px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
        <span style={{ fontSize: "10px", fontWeight: 700, padding: "3px 10px", borderRadius: "20px", background: `${catColor}18`, color: catColor, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {q.category}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 9px", borderRadius: "20px", background: answered ? "rgba(74,222,128,0.1)" : "rgba(255,191,36,0.1)", color: answered ? "#4ade80" : "#fbbf24" }}>
            {answered ? "ANSWERED" : "PENDING"}
          </span>
          <span style={{ fontSize: "11px", color: "var(--cs-muted)" }}>{fmtDate(q.created_at)}</span>
        </div>
      </div>

      {/* Question */}
      <div style={{ fontSize: "0.9rem", color: "var(--cs-white)", lineHeight: 1.6 }}>{q.question}</div>

      {/* Coach reply */}
      {q.answer && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <div style={{ fontSize: "10px", color: "var(--cs-orange)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>
            Coach reply · {q.answered_at ? fmtDate(q.answered_at) : ""}
          </div>
          <div style={{ fontSize: "0.875rem", color: "#d0d0d0", lineHeight: 1.7, background: "rgba(232,98,10,0.05)", border: "1px solid rgba(232,98,10,0.12)", borderRadius: "6px", padding: "0.75rem 1rem" }}>
            {q.answer}
          </div>
        </div>
      )}

      {!q.answer && (
        <div style={{ fontSize: "0.8rem", color: "var(--cs-muted)", fontStyle: "italic" }}>
          Your coach will reply soon. You'll get an email when they do.
        </div>
      )}
    </div>
  );
}
