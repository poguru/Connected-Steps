"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Session {
  staffId: string;
  email: string;
  fullName: string;
  role: string;
  permissions: string[];
}

interface Stats {
  bibCollected?: number;
  checkedIn?: number;
  breakfastIssued?: number;
  goodiesIssued?: number;
  tshirtIssued?: number;
  medalIssued?: number;
  certificateIssued?: number;
}

const ACCENT = "#e8620a";
const GREEN = "#10b981";

export default function StaffDashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [stats, setStats] = useState<Stats>({});
  const [loading, setLoading] = useState(true);

  // Check session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch("/api/it-run/staff/me");
        if (!res.ok) {
          router.push("/it-run/staff/login");
          return;
        }
        const data = (await res.json()) as { session: Session };
        setSession(data.session);

        // Load today's stats
        const statsRes = await fetch("/api/it-run/staff/stats");
        if (statsRes.ok) {
          const statsData = (await statsRes.json()) as { stats: Stats };
          setStats(statsData.stats);
        }
      } catch {
        router.push("/it-run/staff/login");
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, [router]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#888" }}>
        Loading…
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const operations: Array<{
    perm: string;
    label: string;
    icon: string;
    color: string;
    route: string;
    stat?: keyof Stats;
  }> = [
    { perm: "BIB_COLLECT", label: "Collect BIB", icon: "🎫", color: "#f59e0b", route: "/it-run/staff/bib-collect", stat: "bibCollected" },
    { perm: "EVENT_CHECKIN", label: "Check In", icon: "✓", color: GREEN, route: "/it-run/staff/checkin", stat: "checkedIn" },
    { perm: "BREAKFAST_ISSUE", label: "Breakfast", icon: "🍽", color: "#ec4899", route: "/it-run/staff/breakfast", stat: "breakfastIssued" },
    { perm: "GOODIES_ISSUE", label: "Goodies", icon: "🎁", color: "#8b5cf6", route: "/it-run/staff/goodies", stat: "goodiesIssued" },
    { perm: "TSHIRT_ISSUE", label: "T-Shirt", icon: "👕", color: "#06b6d4", route: "/it-run/staff/tshirt", stat: "tshirtIssued" },
    { perm: "MEDAL_ISSUE", label: "Medal", icon: "🏅", color: "#fbbf24", route: "/it-run/staff/medal", stat: "medalIssued" },
    { perm: "CERTIFICATE_ISSUE", label: "Certificate", icon: "📜", color: "#60a5fa", route: "/it-run/staff/certificate", stat: "certificateIssued" },
  ];

  const permitted = operations.filter(op => session.role === "super_admin" || session.role === "event_admin" || session.permissions.includes(op.perm));

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)", padding: "16px", fontFamily: "inherit" }}>
      {/* Header */}
      <div style={{ maxWidth: 800, margin: "0 auto", marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 14, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
              IT Run Sprint-2
            </div>
            <h1 style={{ fontSize: "clamp(20px, 5vw, 28px)", fontWeight: 800, color: "#fff", margin: 0, marginBottom: 4 }}>
              {session.fullName}
            </h1>
            <div style={{ fontSize: 14, color: ACCENT, fontWeight: 600 }}>{session.role.replace("_", " ").toUpperCase()}</div>
          </div>
          <button
            onClick={async () => {
              await fetch("/api/it-run/staff/auth/logout", { method: "POST" });
              router.push("/it-run/staff/login");
            }}
            style={{
              padding: "8px 16px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              color: "#888",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Sign Out
          </button>
        </div>

        {/* Time */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          padding: 16,
        }}>
          <div>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
              Today
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>
              {new Date().toLocaleDateString("en-IN", { weekday: "long", month: "short", day: "numeric" })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
              Current Time
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>
              {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>
      </div>

      {/* Operations Grid */}
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
            Assigned Operations ({permitted.length})
          </div>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
          marginBottom: 40,
        }}>
          {permitted.map(op => (
            <button
              key={op.perm}
              onClick={() => router.push(op.route)}
              style={{
                padding: 20,
                background: `${op.color}12`,
                border: `1px solid ${op.color}40`,
                borderRadius: 12,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                transition: "all 0.15s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = `${op.color}25`;
                (e.currentTarget as HTMLButtonElement).style.borderColor = `${op.color}60`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = `${op.color}12`;
                (e.currentTarget as HTMLButtonElement).style.borderColor = `${op.color}40`;
              }}
            >
              <div style={{ fontSize: 32 }}>{op.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: op.color, textAlign: "center", lineHeight: 1.3 }}>
                {op.label}
              </div>
              {op.stat && stats[op.stat] !== undefined && (
                <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>
                  {stats[op.stat]} done
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Today's Activity Summary */}
        {Object.values(stats).some(v => v && v > 0) && (
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            padding: 20,
          }}>
            <div style={{ fontSize: 12, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, fontWeight: 600 }}>
              Today's Activity
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
              gap: 12,
            }}>
              {permitted.map(op => {
                const count = op.stat ? stats[op.stat] : 0;
                if (!count) return null;
                return (
                  <div key={op.perm} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: op.color }}>
                      {count}
                    </div>
                    <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                      {op.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
