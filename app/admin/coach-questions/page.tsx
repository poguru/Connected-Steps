"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Button, Textarea, Badge, Tabs, EmptyState, Spinner } from "@/components/ui/ds";

interface Question {
  id: string;
  user_email: string;
  user_name: string;
  category: string;
  question: string;
  answer: string | null;
  status: string;
  created_at: string;
  answered_at: string | null;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function CoachQuestionsAdmin() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [answers,   setAnswers]   = useState<Record<string, string>>({});
  const [saving,    setSaving]    = useState<string | null>(null);
  const [tab,       setTab]       = useState<"pending" | "answered">("pending");

  function load() {
    setLoading(true);
    fetch("/api/coach-questions")
      .then((r) => r.json())
      .then((d) => { if (d.questions) setQuestions(d.questions); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function submitAnswer(id: string) {
    const answer = answers[id]?.trim();
    if (!answer) return;
    setSaving(id);
    try {
      const res = await fetch(`/api/coach-questions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });
      if (res.ok) {
        setAnswers((a) => { const copy = { ...a }; delete copy[id]; return copy; });
        load();
      }
    } finally { setSaving(null); }
  }

  const pending  = questions.filter((q) => q.status === "pending");
  const answered = questions.filter((q) => q.status === "answered");
  const list     = tab === "pending" ? pending : answered;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", padding: "2rem" }}>
      <div style={{ maxWidth: "760px", margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem" }}>
          <Link href="/admin" style={{ color: "#888", textDecoration: "none", fontSize: "0.875rem" }}>← Admin</Link>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 600, color: "#fff", margin: 0 }}>Coach Questions</h1>
            <p style={{ fontSize: "0.8rem", color: "#888", margin: "2px 0 0" }}>Questions submitted by members for coaching advice</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs variant="pill" style={{ marginBottom: "1.5rem" }}
          tabs={[
            { key: "pending",  label: `Pending (${pending.length})`  },
            { key: "answered", label: `Answered (${answered.length})` },
          ]}
          active={tab}
          onChange={k => setTab(k as "pending" | "answered")} />

        {/* List */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem" }}><Spinner /></div>
        ) : list.length === 0 ? (
          <EmptyState title={tab === "pending" ? "No pending questions — all caught up!" : "No answered questions yet."} />
        ) : list.map((q) => (
          <Card key={q.id} style={{ marginBottom: "1rem", borderColor: q.status === "pending" ? "rgba(232,98,10,0.3)" : undefined }}>

            {/* Meta */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <div>
                <div style={{ fontWeight: 600, color: "#fff", fontSize: "0.9rem" }}>{q.user_name}</div>
                <div style={{ fontSize: "11px", color: "#666" }}>{q.user_email} · {fmtDate(q.created_at)}</div>
              </div>
              <Badge color="orange" size="sm">{q.category}</Badge>
            </div>

            {/* Question */}
            <div style={{ fontSize: "0.9rem", color: "#ddd", lineHeight: 1.6, marginBottom: "1rem", padding: "0.75rem", background: "rgba(255,255,255,0.03)", borderRadius: "8px", borderLeft: "3px solid #e8620a" }}>
              {q.question}
            </div>

            {/* Answer (existing) */}
            {q.answer && (
              <div style={{ background: "rgba(74,222,128,0.05)", border: "1px solid rgba(74,222,128,0.15)", borderRadius: "8px", padding: "0.75rem", marginBottom: "0.75rem" }}>
                <div style={{ fontSize: "10px", color: "#4ade80", fontWeight: 700, marginBottom: "4px" }}>Your reply · {q.answered_at ? fmtDate(q.answered_at) : ""}</div>
                <div style={{ fontSize: "0.85rem", color: "#ccc", lineHeight: 1.6 }}>{q.answer}</div>
              </div>
            )}

            {/* Answer input */}
            {tab === "pending" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <Textarea value={answers[q.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  placeholder="Type your coaching advice or answer here…" style={{ minHeight: "76px" }} />
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <Button size="sm" loading={saving === q.id} disabled={!answers[q.id]?.trim()} onClick={() => submitAnswer(q.id)}>Send Reply</Button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
