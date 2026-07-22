"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppNav from "@/components/layout/AppNav";
import { MenuUser } from "@/components/ui/UserMenu";
import { Card, CardBody, ProgressBar, Badge, Skeleton, EmptyState, Pagination } from "@/components/ui/ds";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Transaction {
  id:            number;
  session_id:    string | null;
  session_title: string | null;
  session_date:  string | null;
  points:        number;
  category:      string;
  reason:        string;
  label:         string;
  icon:          string;
  awarded_by:    string | null;
  week_key:      string | null;
  created_at:    string;
  running_total: number;
}

interface HistoryResponse {
  transactions: Transaction[];
  page:         number;
  total_pages:  number;
  total_count:  number;
  summary: {
    total_points: number;
    month_points: number;
    rank:         number | null;
  };
  week: {
    sessions_count:  number;
    bonus_earned:    boolean;
    sessions_needed: number;
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: "all",             label: "All"        },
  { key: "attendance",      label: "Attendance" },
  { key: "weekly_bonus",    label: "Weekly Bonus" },
  { key: "challenge",       label: "Challenges" },
  { key: "admin_adjustment",label: "Adjustments"},
];

const CATEGORY_COLOR: Record<string, string> = {
  attendance:       "#4ade80",
  weekly_bonus:     "#fbbf24",
  challenge:        "#60a5fa",
  admin_adjustment: "#a78bfa",
  bonus:            "#f87171",
  referral:         "#34d399",
  strava:           "#f97316",
  streak:           "#fb923c",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatPoints(p: number): string {
  return p >= 0 ? `+${p}` : `${p}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MyPoints() {
  const router = useRouter();
  const [user,      setUser]      = useState<MenuUser | null>(null);
  const [data,      setData]      = useState<HistoryResponse | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [category,  setCategory]  = useState("all");
  const [page,      setPage]      = useState(1);

  const fetchHistory = useCallback(async (token: string, cat: string, pg: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pg), limit: "20", category: cat });
      const res  = await fetch(`/api/points/history?${params}`, {
        headers: { "x-user-token": token },
      });
      if (!res.ok) return;
      const json = await res.json() as HistoryResponse;
      setData(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("cs_user");
    const token  = localStorage.getItem("cs_user_token") ?? "";
    if (!stored || !token) { router.push("/auth"); return; }
    let u: MenuUser;
    try { u = JSON.parse(stored) as MenuUser; } catch { router.push("/auth"); return; }
    setUser(u);
    void fetchHistory(token, "all", 1);
  }, [router, fetchHistory]);

  // Re-fetch summary when user returns to this tab so points never appear stale
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const token = localStorage.getItem("cs_user_token") ?? "";
      if (!token) return;
      void fetchHistory(token, category, page);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [category, page, fetchHistory]);

  function changeCategory(cat: string) {
    setCategory(cat);
    setPage(1);
    const token = localStorage.getItem("cs_user_token") ?? "";
    void fetchHistory(token, cat, 1);
  }

  function changePage(pg: number) {
    setPage(pg);
    const token = localStorage.getItem("cs_user_token") ?? "";
    void fetchHistory(token, category, pg);
  }

  if (!user) return null;

  const summary     = data?.summary;
  const week        = data?.week;
  const weekPct     = Math.min(100, ((week?.sessions_count ?? 0) / 4) * 100);
  const totalPoints = summary?.total_points ?? 0;
  const monthPoints = summary?.month_points ?? 0;
  const rank        = summary?.rank;

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>
      <AppNav
        user={user}
        onUserUpdate={u => { setUser(u); localStorage.setItem("cs_user", JSON.stringify(u)); }}
        activeLabel="My Points"
      />

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px 80px" }}>

        {/* ── Page title ── */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "var(--foreground)" }}>
            My Points
          </h1>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 4 }}>
            Track your earnings, weekly progress, and full transaction history.
          </p>
        </div>

        {/* ── Summary stat cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Total Points", value: loading ? "—" : String(totalPoints), icon: "🏆", color: "#fbbf24" },
            { label: "This Month",   value: loading ? "—" : String(monthPoints), icon: "📅", color: "#60a5fa" },
            { label: "Rank",         value: loading ? "—" : rank ? `#${rank}` : "—", icon: "📊", color: "#e8620a" },
          ].map(s => (
            <Card key={s.label} style={{ textAlign: "center" }}>
              <CardBody style={{ padding: "16px 12px" }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.color, lineHeight: 1 }}>
                  {loading ? <Skeleton style={{ height: 28, width: 60, margin: "0 auto" }} /> : s.value}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {s.label}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>

        {/* ── Weekly bonus progress ── */}
        <Card style={{ marginBottom: 24 }}>
          <CardBody style={{ padding: "18px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)", marginBottom: 2 }}>
                  This Week&#39;s Progress
                </div>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                  Attend 4 sessions in a week to earn +5 bonus points
                </div>
              </div>
              {week?.bonus_earned ? (
                <Badge color="green" style={{ flexShrink: 0 }}>Bonus Earned! 🎉</Badge>
              ) : (
                <Badge color="gray" style={{ flexShrink: 0, background: "rgba(255,255,255,0.06)" }}>
                  {week?.sessions_count ?? 0} / 4 sessions
                </Badge>
              )}
            </div>

            <ProgressBar
              value={weekPct}
              max={100}
              color={week?.bonus_earned ? "#4ade80" : "#e8620a"}
              height={8}
            />

            <div style={{ marginTop: 10, fontSize: 12, color: week?.bonus_earned ? "#4ade80" : "var(--muted-foreground)" }}>
              {week?.bonus_earned
                ? "You've earned your weekly bonus! Great work!"
                : week?.sessions_needed
                  ? `Complete ${week.sessions_needed} more session${week.sessions_needed !== 1 ? "s" : ""} this week to earn +5 bonus points`
                  : "Loading…"
              }
            </div>
          </CardBody>
        </Card>

        {/* ── Points history ── */}
        <Card>
          <CardBody style={{ padding: 0 }}>
            {/* Header + filters */}
            <div style={{ padding: "16px 20px 0" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Points History</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                {CATEGORIES.map(c => (
                  <button
                    key={c.key}
                    onClick={() => changeCategory(c.key)}
                    style={{
                      fontSize: 12, fontWeight: category === c.key ? 700 : 400,
                      padding: "5px 12px", borderRadius: 20,
                      border: "1px solid",
                      borderColor: category === c.key ? "#e8620a" : "rgba(255,255,255,0.1)",
                      background:  category === c.key ? "rgba(232,98,10,0.12)" : "transparent",
                      color:       category === c.key ? "#e8620a" : "var(--muted-foreground)",
                      cursor: "pointer", fontFamily: "inherit",
                      transition: "all 0.15s",
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "12px 0" }} />

            {/* Table header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "90px 1fr 130px 60px 80px",
              gap: 8, padding: "0 20px 8px",
              fontSize: 10, fontWeight: 700,
              color: "var(--muted-foreground)",
              textTransform: "uppercase", letterSpacing: "0.08em",
            }}>
              <span>Date</span>
              <span>Description</span>
              <span>Session</span>
              <span style={{ textAlign: "right" }}>Points</span>
              <span style={{ textAlign: "right" }}>Total</span>
            </div>

            {/* Rows */}
            {loading ? (
              <div style={{ padding: "0 20px 16px" }}>
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 1fr 130px 60px 80px", gap: 8, padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <Skeleton style={{ height: 14, width: 70 }} />
                    <Skeleton style={{ height: 14 }} />
                    <Skeleton style={{ height: 14, width: 100 }} />
                    <Skeleton style={{ height: 14, width: 30 }} />
                    <Skeleton style={{ height: 14, width: 30 }} />
                  </div>
                ))}
              </div>
            ) : !data?.transactions.length ? (
              <div style={{ padding: "32px 20px" }}>
                <EmptyState
                  icon="🏃"
                  title="No transactions yet"
                  body="Attend sessions to start earning points!"
                />
              </div>
            ) : (
              <div style={{ padding: "0 20px 16px" }}>
                {data.transactions.map((tx, idx) => (
                  <div
                    key={tx.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "90px 1fr 130px 60px 80px",
                      gap: 8,
                      padding: "12px 0",
                      borderBottom: idx < data.transactions.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                      alignItems: "center",
                    }}
                  >
                    {/* Date */}
                    <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                      {formatDate(tx.created_at)}
                    </span>

                    {/* Description */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 14 }}>{tx.icon}</span>
                        <span style={{
                          fontSize: 13, fontWeight: 500,
                          color: "var(--foreground)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {tx.label}
                        </span>
                      </div>
                      {tx.awarded_by && tx.awarded_by !== "system" && (
                        <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 1, paddingLeft: 20 }}>
                          by {tx.awarded_by}
                        </div>
                      )}
                    </div>

                    {/* Session */}
                    <span style={{
                      fontSize: 12, color: "var(--muted-foreground)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {tx.session_title ?? "—"}
                    </span>

                    {/* Points */}
                    <span style={{
                      fontSize: 14, fontWeight: 700, textAlign: "right",
                      color: CATEGORY_COLOR[tx.category] ?? (tx.points >= 0 ? "#4ade80" : "#f87171"),
                    }}>
                      {formatPoints(tx.points)}
                    </span>

                    {/* Running total */}
                    <span style={{ fontSize: 13, fontWeight: 600, textAlign: "right", color: "var(--foreground)" }}>
                      {tx.running_total}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {(data?.total_pages ?? 0) > 1 && (
              <div style={{ padding: "12px 20px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <Pagination
                  page={page}
                  totalPages={data!.total_pages}
                  onChange={changePage}
                />
              </div>
            )}

            {/* Footer count */}
            {(data?.total_count ?? 0) > 0 && (
              <div style={{ padding: "0 20px 16px", fontSize: 11, color: "var(--muted-foreground)" }}>
                {data!.total_count} transaction{data!.total_count !== 1 ? "s" : ""}
              </div>
            )}
          </CardBody>
        </Card>

      </div>
    </div>
  );
}
