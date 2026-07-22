"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppNav from "@/components/layout/AppNav";
import type { MenuUser } from "@/components/ui/UserMenu";

interface BugReport {
  id:                 string;
  title:              string | null;
  category:           string;
  severity:           string | null;
  priority:           string;
  status:             string;
  created_at:         string;
  updated_at:         string;
  resolved_at:        string | null;
  resolution_summary: string | null;
  version_fixed:      string | null;
  description:        string;
  attachments:        { path: string; type: string; name: string; size: number }[] | null;
  screenshot_url:     string | null;
}

const STATUS_LABELS: Record<string, string> = {
  new: "New", acknowledged: "Acknowledged", in_progress: "In Progress",
  testing: "Testing", resolved: "Resolved", closed: "Closed",
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  new:          { bg: "oklch(0.62 0.22 22 / 15%)",  color: "#ef4444" },
  acknowledged: { bg: "oklch(0.78 0.18 90 / 15%)",  color: "#eab308" },
  in_progress:  { bg: "oklch(0.65 0.15 240 / 15%)", color: "#60a5fa" },
  testing:      { bg: "oklch(0.62 0.18 290 / 15%)", color: "#a78bfa" },
  resolved:     { bg: "oklch(0.72 0.19 145 / 15%)", color: "#22c55e" },
  closed:       { bg: "oklch(0.55 0.04 260 / 15%)", color: "#94a3b8" },
};

const CATEGORY_LABELS: Record<string, string> = {
  bug: "🐛 Bug", ui: "🎨 UI Issue", payment: "💳 Payment", session: "📅 Session",
  event: "🏁 Event", feature: "✨ Feature Request", performance: "⚡ Performance",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m    = Math.floor(diff / 60000);
  if (m < 1)   return "just now";
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)   return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? { bg: "rgba(255,255,255,0.06)", color: "#888" };
  return (
    <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: c.bg, color: c.color, letterSpacing: "0.03em" }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function ConfirmModal({ bugId, bugTitle, onConfirm, onDeny, onClose }: {
  bugId:    string;
  bugTitle: string;
  onConfirm: () => void;
  onDeny:    () => void;
  onClose:   () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const userToken = () => typeof window !== "undefined" ? (localStorage.getItem("cs_user_token") ?? "") : "";
  const email     = () => {
    try { return JSON.parse(localStorage.getItem("cs_user") ?? "{}").email ?? ""; } catch { return ""; }
  };

  async function handle(confirmed: boolean) {
    setLoading(true); setError("");
    const res = await fetch(`/api/bug-reports/${bugId}/confirm`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", "x-user-token": userToken() },
      body:    JSON.stringify({ email: email(), confirmed }),
    }).catch(() => null);
    setLoading(false);
    if (!res?.ok) { setError("Something went wrong. Please try again."); return; }
    confirmed ? onConfirm() : onDeny();
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ width: "100%", maxWidth: 400, background: "var(--surface, #111)", border: "1px solid var(--border, rgba(255,255,255,0.1))", borderRadius: 16, padding: "1.5rem" }}>
        <div style={{ fontSize: "2rem", textAlign: "center", marginBottom: "0.75rem" }}>✅</div>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1rem", fontWeight: 700, textAlign: "center", color: "var(--foreground)" }}>
          Is this issue resolved?
        </h2>
        <p style={{ margin: "0 0 1.25rem", fontSize: "0.82rem", color: "var(--muted-foreground)", textAlign: "center", lineHeight: 1.5 }}>
          <em>{bugTitle}</em>
        </p>
        {error && (
          <div style={{ fontSize: "0.78rem", color: "#f87171", marginBottom: "0.75rem", textAlign: "center" }}>{error}</div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => handle(true)} disabled={loading}
            style={{ flex: 1, padding: "12px", background: "#22c55e", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: "0.9rem", cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {loading ? "…" : "✓ Yes, fixed!"}
          </button>
          <button onClick={() => handle(false)} disabled={loading}
            style={{ flex: 1, padding: "12px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: "0.9rem", cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {loading ? "…" : "✗ Still broken"}
          </button>
        </div>
        <button onClick={onClose} style={{ display: "block", width: "100%", marginTop: 10, background: "none", border: "none", color: "var(--muted-foreground)", fontSize: "0.78rem", cursor: "pointer", fontFamily: "inherit" }}>
          Remind me later
        </button>
      </div>
    </div>
  );
}

function MyBugsContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const confirmId    = searchParams.get("confirm");

  const [user,    setUser]    = useState<MenuUser | null>(null);
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [confirmBug, setConfirmBug] = useState<BugReport | null>(null);

  const userToken = () => typeof window !== "undefined" ? (localStorage.getItem("cs_user_token") ?? "") : "";

  const load = useCallback(async (email: string) => {
    setLoading(true); setError("");
    try {
      const res  = await fetch(`/api/bug-reports/my?email=${encodeURIComponent(email)}`, {
        headers: { "x-user-token": userToken() },
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to load"); return; }
      setReports(data.reports ?? []);
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const stored = localStorage.getItem("cs_user");
    if (!stored) { router.push("/auth"); return; }
    let u: MenuUser;
    try { u = JSON.parse(stored); } catch { router.push("/auth"); return; }
    setUser(u);
    load(u.email);
  }, [router, load]);

  // Auto-open confirm modal if ?confirm=<id>
  useEffect(() => {
    if (!confirmId || reports.length === 0) return;
    const bug = reports.find(r => r.id === confirmId);
    if (bug && bug.status === "resolved") setConfirmBug(bug);
  }, [confirmId, reports]);

  function patchReport(id: string, patch: Partial<BugReport>) {
    setReports(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  if (!user) return null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>
      <AppNav
        user={user}
        onUserUpdate={u => { setUser(u); localStorage.setItem("cs_user", JSON.stringify(u)); }}
        activeLabel="My Reports"
      />

      {confirmBug && (
        <ConfirmModal
          bugId={confirmBug.id}
          bugTitle={confirmBug.title || confirmBug.description.slice(0, 60)}
          onConfirm={() => { patchReport(confirmBug.id, { status: "closed" }); setConfirmBug(null); router.replace("/my-bugs"); }}
          onDeny={() => { patchReport(confirmBug.id, { status: "in_progress" }); setConfirmBug(null); router.replace("/my-bugs"); }}
          onClose={() => { setConfirmBug(null); router.replace("/my-bugs"); }}
        />
      )}

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "var(--page-top-pad) 1rem var(--page-bottom-pad)" }}>

        <div style={{ marginBottom: "1.5rem" }}>
          <h1 className="font-display" style={{ fontSize: "clamp(1.4rem,4vw,1.75rem)", fontWeight: 700, letterSpacing: "-0.015em", margin: "0 0 4px" }}>
            My Bug Reports
          </h1>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
            Issues you&apos;ve reported — we&apos;ll notify you at every step.
          </p>
        </div>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "1rem", height: 90 }} />
            ))}
          </div>
        ) : error ? (
          <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "1rem", color: "#f87171", fontSize: "0.85rem" }}>
            {error}
          </div>
        ) : reports.length === 0 ? (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "3rem 1.5rem", textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🐛</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>No bug reports yet</div>
            <div style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", lineHeight: 1.6 }}>
              Use the &quot;Report an issue&quot; button at the bottom-left of any page to report a bug.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {reports.map(r => (
              <div key={r.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "1rem 1.125rem", transition: "border-color 0.15s" }}>

                {/* Top row */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: "0.5rem" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.title || r.description.slice(0, 60)}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: 2 }}>
                      {CATEGORY_LABELS[r.category] ?? r.category}
                      {r.severity && <span style={{ marginLeft: 8, textTransform: "capitalize" }}>· {r.severity}</span>}
                    </div>
                  </div>
                  <StatusBadge status={r.status} />
                </div>

                {/* Meta row */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "0.7rem", color: "var(--muted-foreground)", flexWrap: "wrap" }}>
                  <span>Reported {timeAgo(r.created_at)}</span>
                  {r.updated_at !== r.created_at && <span>· Updated {timeAgo(r.updated_at)}</span>}
                  {(r.attachments?.length ?? 0) > 0 && <span>· {r.attachments!.length} screenshot{r.attachments!.length > 1 ? "s" : ""}</span>}
                </div>

                {/* Resolution */}
                {r.resolution_summary && (
                  <div style={{ marginTop: "0.75rem", background: "oklch(0.72 0.19 145 / 8%)", border: "1px solid oklch(0.72 0.19 145 / 25%)", borderRadius: 8, padding: "0.625rem 0.75rem" }}>
                    <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "#22c55e", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Resolution</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--foreground)", lineHeight: 1.5 }}>{r.resolution_summary}</div>
                    {r.version_fixed && <div style={{ fontSize: "0.7rem", color: "#22c55e", marginTop: 4 }}>Fixed in {r.version_fixed}</div>}
                  </div>
                )}

                {/* Confirm button for resolved bugs */}
                {r.status === "resolved" && (
                  <button
                    onClick={() => setConfirmBug(r)}
                    style={{ marginTop: "0.75rem", width: "100%", padding: "9px", background: "oklch(0.72 0.19 145 / 12%)", border: "1px solid oklch(0.72 0.19 145 / 30%)", borderRadius: 9, color: "#22c55e", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    Is this issue fixed for you? →
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MyBugsPage() {
  return (
    <Suspense>
      <MyBugsContent />
    </Suspense>
  );
}
