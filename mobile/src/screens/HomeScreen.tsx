import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Image, Linking,
} from "react-native";
import { useSafeAreaInsets }  from "react-native-safe-area-context";
import { useNavigation }      from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useUser }            from "../context/UserContext";
import {
  getUserStats, getUserAchievements, getSessions,
  getTrainingPlan, getMembership, getStories, getUserSessions,
} from "../services/api";
import type {
  UserStats, UserAchievements, Session,
  TrainingPlan, Membership, Story, UserSession,
} from "../types";
import type { TabParamList }  from "../navigation/TabNavigator";
import ProgressBar            from "../components/ProgressBar";
import LevelBadge             from "../components/LevelBadge";
import { getLevelInfo, getNextTitle } from "../utils/xp";
import { computeStreaks, streakEmoji } from "../utils/streak";
import { generateInsights }   from "../utils/insights";

type Nav = BottomTabNavigationProp<TabParamList>;

// ── Constants ──────────────────────────────────────────────────────────────────
const SESSIONS_GOAL = 8;
const XP_GOAL       = 1000;
const DAY_NAMES     = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MILESTONES    = [
  { target: 1,  icon: "🏅", label: "First Session",  xpReward: 50  },
  { target: 5,  icon: "🏃", label: "5 Sessions",     xpReward: 100 },
  { target: 10, icon: "⭐", label: "10 Sessions",    xpReward: 200 },
  { target: 25, icon: "🔥", label: "25 Sessions",    xpReward: 500 },
  { target: 50, icon: "🏆", label: "50 Sessions",    xpReward: 1000},
];

const todayIdx = () => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; };

function fmtDate(s: string) {
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
function fmtTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
function daysLeft(exp: string) {
  return Math.max(0, Math.round((new Date(exp).getTime() - Date.now()) / 86400000));
}
function planDur(start: string, exp: string) {
  return Math.max(1, Math.round((new Date(exp).getTime() - new Date(start).getTime()) / 86400000));
}

// ── Sub-components ──────────────────────────────────────────────────────────────

function SectionLabel({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={S.sectionRow}>
      <Text style={S.sectionLabel}>{title}</Text>
      {action ? <TouchableOpacity onPress={onAction}><Text style={S.sectionAction}>{action}</Text></TouchableOpacity> : null}
    </View>
  );
}

// ── Countdown hook ─────────────────────────────────────────────────────────────
function useCountdown(session: Session | null) {
  const getValues = useCallback(() => {
    if (!session) return null;
    const target = new Date(`${session.date}T${session.time ?? "06:00"}:00`).getTime();
    const diff   = target - Date.now();
    if (diff <= 0) return null;
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000)  / 60000);
    return { d, h, m, diff };
  }, [session]);

  const [cd, setCd] = useState(getValues);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setCd(getValues());
    ref.current = setInterval(() => setCd(getValues()), 60000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [getValues]);

  return cd;
}

// ── Main screen ─────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { user }                        = useUser();
  const navigation                      = useNavigation<Nav>();
  const insets                          = useSafeAreaInsets();

  const [stats,       setStats]         = useState<UserStats | null>(null);
  const [achieve,     setAchieve]       = useState<UserAchievements | null>(null);
  const [sessions,    setSessions]      = useState<Session[]>([]);
  const [plan,        setPlan]          = useState<TrainingPlan | null>(null);
  const [membership,  setMembership]    = useState<Membership | null>(null);
  const [stories,     setStories]       = useState<Story[]>([]);
  const [history,     setHistory]       = useState<UserSession[]>([]);
  const [loading,     setLoading]       = useState(true);
  const [refreshing,  setRefreshing]    = useState(false);
  const [planOpen,    setPlanOpen]      = useState(false);
  const [communityTab,setCommunityTab]  = useState<"sessions" | "stories">("sessions");

  const load = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    const R = await Promise.allSettled([
      getUserStats(user.email),
      getUserAchievements(user.email),
      getSessions(),
      getTrainingPlan(user.email),
      getMembership(user.email),
      getStories(),
      getUserSessions(user.email),
    ]);
    if (R[0].status === "fulfilled") setStats(R[0].value);
    if (R[1].status === "fulfilled") setAchieve(R[1].value);
    if (R[2].status === "fulfilled") setSessions(R[2].value as Session[]);
    if (R[3].status === "fulfilled") setPlan(R[3].value);
    if (R[4].status === "fulfilled") setMembership(R[4].value);
    if (R[5].status === "fulfilled") setStories((R[5].value as Story[]).slice(0, 4));
    if (R[6].status === "fulfilled") setHistory(R[6].value as UserSession[]);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const cd = useCountdown(sessions[0] ?? null);

  if (!user) return null;

  // ── Derived state ────────────────────────────────────────────────────────────
  const totalXP   = stats?.total_points  ?? 0;
  const monthXP   = stats?.month_points  ?? 0;
  const levelInfo = getLevelInfo(totalXP);
  const nextTitle = getNextTitle(totalXP);
  const streaks   = computeStreaks(history);

  const totalSessions  = achieve?.sessionCount      ?? 0;
  const rank           = achieve?.leaderboardRank   ?? null;
  const hasMembership  = achieve?.hasMembership     ?? false;

  const now       = new Date();
  const monthStart= new Date(now.getFullYear(), now.getMonth(), 1);
  const monthSessions = history.filter(r =>
    r.attended && r.sessions?.date && new Date(r.sessions.date + "T00:00:00") >= monthStart
  ).length;

  // Smart dashboard state
  const userState: "new" | "inactive" | "active" | "power" = (() => {
    if (totalSessions === 0)                           return "new";
    if (monthSessions === 0 && !streaks.isActive)      return "inactive";
    if (rank && rank <= 10)                            return "power";
    return "active";
  })();

  const todayPlanIdx  = todayIdx();
  const todayDay      = plan?.days[todayPlanIdx] ?? null;
  const isRestDay     = todayDay?.type.toLowerCase().includes("rest") ?? false;
  const nextSession   = sessions[0] ?? null;

  const nextMilestone = MILESTONES.find(m => totalSessions < m.target);

  const insights = generateInsights({
    monthXP, totalSessions, monthSessions,
    streak: streaks.sessions,
    rank, level: levelInfo.level,
  });

  const greeting = (() => {
    const h = now.getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const mem     = membership?.isActive ? membership : null;
  const memLeft = mem ? daysLeft(mem.expires_at) : 0;
  const memProg = mem ? Math.max(0.02, 1 - memLeft / planDur(mem.started_at, mem.expires_at)) : 0;

  const CHIPS = [
    { icon: "🏅", label: "First Session", earned: totalSessions >= 1,  target: 1  },
    { icon: "🏃", label: "5 Sessions",    earned: totalSessions >= 5,  target: 5  },
    { icon: "⭐", label: "10 Sessions",   earned: totalSessions >= 10, target: 10 },
    { icon: "🔥", label: "25 Sessions",   earned: totalSessions >= 25, target: 25 },
    { icon: "🏆", label: "50 Sessions",   earned: totalSessions >= 50, target: 50 },
    { icon: "💎", label: "Member",        earned: hasMembership,       target: 0  },
  ];

  return (
    <ScrollView
      style={S.root}
      contentContainerStyle={S.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.orange} />}
    >
      {/* ══════════════════════════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════════════════════════ */}
      <View style={[S.hero, { paddingTop: Math.max(insets.top + 12, 20) }]}>
        <View style={S.heroGlow} pointerEvents="none" />
        <View style={S.heroTop}>
          <View>
            <Text style={S.heroGreeting}>{greeting},</Text>
            <View style={S.heroNameRow}>
              <Text style={S.heroName}>{user.firstName}</Text>
              {!loading && <LevelBadge info={levelInfo} size="md" />}
            </View>
            {!loading && streaks.sessions > 0 && (
              <Text style={S.heroStreak}>{streakEmoji(streaks.sessions)} {streaks.sessions}-session streak</Text>
            )}
          </View>
          {user.photo ? (
            <Image source={{ uri: user.photo }} style={S.heroAvatar} />
          ) : (
            <View style={S.heroAvatarFallback}>
              <Text style={S.heroAvatarInitial}>{user.firstName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>

        {loading ? (
          <ActivityIndicator color={C.orange} style={{ alignSelf: "flex-start", marginTop: 12 }} />
        ) : (
          <View style={S.heroStats}>
            {[
              { label: "XP",       val: monthXP                                                     },
              { label: "Sessions", val: totalSessions                                               },
              { label: "Rank",     val: rank ? `#${rank}` : "—"                                    },
            ].map((s, i) => (
              <React.Fragment key={s.label}>
                {i > 0 && <View style={S.heroStatDiv} />}
                <View style={S.heroStat}>
                  <Text style={S.heroStatVal}>{s.val}</Text>
                  <Text style={S.heroStatLabel}>{s.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        )}
      </View>

      <View style={S.body}>

        {/* ══════════════════════════════════════════════════════════════
            SMART STATE BANNER
        ══════════════════════════════════════════════════════════════ */}
        {!loading && userState === "new" && (
          <View style={S.welcomeCard}>
            <Text style={S.welcomeTitle}>Welcome to Connected Steps! 🎉</Text>
            <Text style={S.welcomeBody}>
              Register for your first session to earn XP, unlock your First Session badge, and start climbing the leaderboard.
            </Text>
            <TouchableOpacity style={S.welcomeBtn} onPress={() => navigation.navigate("Community")}>
              <Text style={S.welcomeBtnText}>Browse Sessions  →</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && userState === "inactive" && (
          <View style={S.comebackCard}>
            <Text style={S.comebackEmoji}>👋</Text>
            <View style={{ flex: 1 }}>
              <Text style={S.comebackTitle}>Welcome back, {user.firstName}!</Text>
              <Text style={S.comebackBody}>You haven't attended this month. One session today restarts your streak and keeps your ranking alive.</Text>
              <TouchableOpacity style={S.comebackBtn} onPress={() => navigation.navigate("Community")}>
                <Text style={S.comebackBtnText}>Register Now  →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!loading && userState === "power" && (
          <View style={S.powerCard}>
            <Text style={S.powerText}>⚡ Top 10 athlete — keep attending to defend your rank!</Text>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TODAY'S MISSION  (most dominant card)
        ══════════════════════════════════════════════════════════════ */}
        {!loading ? (
          <View style={S.missionCard}>
            <View style={S.missionGlow} pointerEvents="none" />
            <View style={S.missionHeader}>
              <Text style={S.missionEyebrow}>TODAY'S MISSION</Text>
              {!isRestDay && (
                <View style={S.xpRewardBadge}>
                  <Text style={S.xpRewardText}>+XP on completion</Text>
                </View>
              )}
            </View>

            {todayDay ? (
              <View style={S.missionWorkout}>
                <Text style={S.missionEmoji}>{todayDay.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[S.missionType, isRestDay && { color: C.textMuted }]}>{todayDay.type}</Text>
                  {!isRestDay && todayDay.detail ? <Text style={S.missionDetail}>{todayDay.detail}</Text> : null}
                  {isRestDay && <Text style={S.missionRestNote}>Rest is training. Stretch for 10 minutes and stay hydrated.</Text>}
                </View>
              </View>
            ) : (
              <View style={S.missionWorkout}>
                <Text style={S.missionEmoji}>🏃</Text>
                <Text style={S.missionNoPlan}>Join a session to unlock your personalized training plan and daily missions.</Text>
              </View>
            )}

            {!isRestDay && (
              <TouchableOpacity style={S.missionCTA} activeOpacity={0.82} onPress={() => navigation.navigate("Community")}>
                <Text style={S.missionCTAText}>
                  {nextSession ? `Register: ${nextSession.title}  →` : "Browse Sessions  →"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={[S.missionCard, { height: 140, opacity: 0.25 }]} />
        )}

        {/* ══════════════════════════════════════════════════════════════
            EVENT COUNTDOWN
        ══════════════════════════════════════════════════════════════ */}
        {!loading && nextSession && cd && (
          <>
            <SectionLabel title="NEXT SESSION" />
            <View style={S.countdownCard}>
              <View style={S.countdownGlow} pointerEvents="none" />
              <Text style={S.countdownTitle} numberOfLines={1}>{nextSession.title}</Text>
              {nextSession.venue ? <Text style={S.countdownVenue} numberOfLines={1}>📍 {nextSession.venue}</Text> : null}
              <View style={S.countdownRow}>
                {cd.d > 0 ? (
                  <>
                    <CountBox value={cd.d} label="DAYS"  />
                    <Text style={S.countdownColon}>:</Text>
                    <CountBox value={cd.h} label="HRS"   />
                    <Text style={S.countdownColon}>:</Text>
                    <CountBox value={cd.m} label="MIN"   />
                  </>
                ) : (
                  <>
                    <CountBox value={cd.h} label="HRS"   />
                    <Text style={S.countdownColon}>:</Text>
                    <CountBox value={cd.m} label="MIN"   />
                  </>
                )}
              </View>
              <TouchableOpacity style={S.countdownBtn} onPress={() => navigation.navigate("Community")}>
                <Text style={S.countdownBtnText}>Register Before It Fills Up  →</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {!loading && nextSession && !cd && (
          <>
            <SectionLabel title="NEXT SESSION" />
            <View style={S.featuredCard}>
              <View style={S.featuredTop}>
                <View style={{ flex: 1 }}>
                  <Text style={S.featuredTitle} numberOfLines={2}>{nextSession.title}</Text>
                  <Text style={S.featuredMeta}>📅 {fmtDate(nextSession.date)}{nextSession.time ? `  ⏰ ${fmtTime(nextSession.time)}` : ""}</Text>
                  {nextSession.venue ? <Text style={S.featuredMeta} numberOfLines={1}>📍 {nextSession.venue}</Text> : null}
                </View>
                <View style={S.upcomingBadge}><Text style={S.upcomingBadgeText}>Upcoming</Text></View>
              </View>
              <TouchableOpacity style={S.featuredBtn} onPress={() => navigation.navigate("Community")}>
                <Text style={S.featuredBtnText}>Register Now  →</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STREAK CARD
        ══════════════════════════════════════════════════════════════ */}
        {!loading && streaks.sessions > 0 && (
          <>
            <SectionLabel title="STREAK" />
            <View style={S.streakCard}>
              <View style={S.streakCardGlow} pointerEvents="none" />
              <View style={S.streakRow}>
                <View style={S.streakItem}>
                  <Text style={S.streakNum}>{streaks.sessions}</Text>
                  <Text style={S.streakEmoji}>{streakEmoji(streaks.sessions)}</Text>
                  <Text style={S.streakItemLabel}>Sessions</Text>
                </View>
                <View style={S.streakDivider} />
                <View style={S.streakItem}>
                  <Text style={S.streakNum}>{streaks.weekly}</Text>
                  <Text style={S.streakEmoji}>📅</Text>
                  <Text style={S.streakItemLabel}>Weeks</Text>
                </View>
                <View style={S.streakDivider} />
                <View style={S.streakItem}>
                  <Text style={S.streakNum}>{streaks.monthly}</Text>
                  <Text style={S.streakEmoji}>🗓</Text>
                  <Text style={S.streakItemLabel}>Months</Text>
                </View>
              </View>
              <Text style={S.streakMotivation}>
                {streaks.sessions >= 10
                  ? "Elite consistency. You're unstoppable."
                  : streaks.sessions >= 5
                  ? "You're on fire. Keep showing up."
                  : "Your streak is alive. Don't break it now."}
              </Text>
            </View>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            XP LEVEL PROGRESS
        ══════════════════════════════════════════════════════════════ */}
        {!loading && (
          <>
            <SectionLabel title="XP & LEVEL" action="Leaderboard" onAction={() => navigation.navigate("Leaderboard")} />
            <View style={S.levelCard}>
              <View style={S.levelTop}>
                <View>
                  <Text style={S.levelTitle}>{levelInfo.title}</Text>
                  <Text style={S.levelSub}>Level {levelInfo.level}</Text>
                </View>
                <View style={S.levelXPBox}>
                  <Text style={S.levelXPVal}>{totalXP.toLocaleString()}</Text>
                  <Text style={S.levelXPLabel}>total XP</Text>
                </View>
              </View>
              <ProgressBar progress={levelInfo.progress} height={8} delay={300} color={C.orange} radius={6} />
              <View style={S.levelBarLabels}>
                <Text style={S.levelBarStart}>{levelInfo.levelXP} XP</Text>
                {!levelInfo.isMax ? (
                  <Text style={S.levelBarEnd}>{levelInfo.xpToNext} XP to Level {levelInfo.level + 1}</Text>
                ) : (
                  <Text style={S.levelBarEnd}>Max level 🏆</Text>
                )}
              </View>
              {!levelInfo.isMax && nextTitle && (
                <Text style={S.levelNextTitle}>Next: <Text style={{ color: C.orange }}>{nextTitle}</Text></Text>
              )}
            </View>
          </>
        )}
        {loading && <View style={[S.levelCard, { height: 100, opacity: 0.25 }]} />}

        {/* ══════════════════════════════════════════════════════════════
            MONTHLY GOALS
        ══════════════════════════════════════════════════════════════ */}
        {!loading && (
          <>
            <SectionLabel title="MONTHLY GOALS" />
            <View style={S.card}>
              {[
                { icon: "🏃", label: "Sessions",  val: monthSessions, target: SESSIONS_GOAL, color: C.orange, reward: `+${SESSIONS_GOAL * 25} XP`  },
                { icon: "⚡", label: "XP Earned", val: monthXP,       target: XP_GOAL,       color: "#4ade80", reward: "Level progress"             },
              ].map((g, i) => {
                const pct  = Math.min(1, g.val / g.target);
                const done = g.val >= g.target;
                return (
                  <View key={g.label} style={[S.goalRow, i > 0 && S.goalRowBorder]}>
                    <View style={S.goalTop}>
                      <Text style={S.goalIcon}>{g.icon}</Text>
                      <Text style={S.goalLabel}>{g.label}</Text>
                      <View style={{ flex: 1 }} />
                      {done
                        ? <Text style={S.goalDone}>✓ Done</Text>
                        : <Text style={S.goalPct}>{Math.round(pct * 100)}%</Text>}
                    </View>
                    <ProgressBar progress={pct} height={5} delay={i * 200 + 200} color={g.color} />
                    <View style={S.goalBottom}>
                      <Text style={S.goalCount}>{g.val} / {g.target}</Text>
                      {!done && <Text style={S.goalRemaining}>{g.target - g.val} remaining</Text>}
                      <View style={{ flex: 1 }} />
                      <Text style={S.goalReward}>🎯 {g.reward}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            NEXT MILESTONE
        ══════════════════════════════════════════════════════════════ */}
        {!loading && nextMilestone && (
          <>
            <SectionLabel title="NEXT MILESTONE" />
            <View style={S.milestoneCard}>
              <View style={S.milestoneGlow} pointerEvents="none" />
              <View style={S.milestoneTop}>
                <Text style={S.milestoneEmoji}>{nextMilestone.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={S.milestoneLabel}>{nextMilestone.label} Badge</Text>
                  <Text style={S.milestoneReward}>Reward: +{nextMilestone.xpReward} XP</Text>
                </View>
                <View style={S.milestoneProgressBox}>
                  <Text style={S.milestoneProgressVal}>{totalSessions}</Text>
                  <Text style={S.milestoneProgressDen}>/{nextMilestone.target}</Text>
                </View>
              </View>
              <ProgressBar progress={totalSessions / nextMilestone.target} height={6} delay={500} color="#f59e0b" />
              <Text style={S.milestoneHint}>
                {nextMilestone.target - totalSessions === 1
                  ? "1 more session to unlock  🔓"
                  : `${nextMilestone.target - totalSessions} sessions to unlock`}
              </Text>
            </View>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            COACH INSIGHTS
        ══════════════════════════════════════════════════════════════ */}
        {!loading && insights.length > 0 && (
          <>
            <SectionLabel title="COACH INSIGHTS" />
            <View style={S.insightsCard}>
              <View style={S.insightsIcon}><Text style={{ fontSize: 22 }}>💡</Text></View>
              <View style={{ flex: 1, gap: 10 }}>
                {insights.map((text, i) => (
                  <View key={i} style={i > 0 ? S.insightBorder : undefined}>
                    {i > 0 && <View style={{ height: 10 }} />}
                    <Text style={S.insightText}>"{text}"</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TRAINING PLAN
        ══════════════════════════════════════════════════════════════ */}
        <SectionLabel title="TRAINING PLAN" action="Full Plan" onAction={() => navigation.navigate("Training")} />
        {loading ? (
          <View style={[S.card, { height: 80, opacity: 0.25 }]} />
        ) : plan ? (
          <View style={S.card}>
            <TouchableOpacity style={S.planHeader} onPress={() => setPlanOpen(o => !o)} activeOpacity={0.7}>
              <View style={{ flex: 1 }}>
                <Text style={S.planTitle}>{plan.title}</Text>
                {plan.coach_name ? <Text style={S.planCoach}>by {plan.coach_name}</Text> : null}
              </View>
              <Text style={S.planPct}>{DAY_NAMES[todayPlanIdx]}: {todayDay?.type ?? "—"}</Text>
              <Text style={[S.chevron, planOpen && S.chevronUp]}>›</Text>
            </TouchableOpacity>
            {planOpen && (
              <View style={S.planDays}>
                {plan.days.map((day, i) => {
                  const isToday = i === todayPlanIdx;
                  const isRest  = day.type.toLowerCase().includes("rest");
                  return (
                    <View key={i} style={[S.dayRow, isToday && S.dayRowToday]}>
                      <Text style={[S.dayName, isToday && S.dayNameToday]}>{DAY_NAMES[i]}</Text>
                      <Text style={S.dayEmoji}>{day.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[S.dayType, isRest && S.dayTypeRest, isToday && S.dayTypeToday]}>{day.type}</Text>
                        {!isRest && day.detail ? <Text style={S.dayDetail} numberOfLines={1}>{day.detail}</Text> : null}
                      </View>
                      {isToday && <View style={S.todayDot} />}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ) : (
          <View style={[S.card, S.emptyCard]}>
            <Text style={S.emptyIcon}>📋</Text>
            <Text style={S.emptyTitle}>No plan assigned yet</Text>
            <Text style={S.emptyBody}>Attend a session and your coach will assign a personalized weekly plan.</Text>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════
            COMMUNITY PREVIEW
        ══════════════════════════════════════════════════════════════ */}
        <SectionLabel title="COMMUNITY" action="See all" onAction={() => navigation.navigate("Community")} />
        <View style={S.card}>
          <View style={S.commTabs}>
            {(["sessions", "stories"] as const).map(t => (
              <TouchableOpacity key={t} style={[S.commTab, communityTab === t && S.commTabActive]} onPress={() => setCommunityTab(t)}>
                <Text style={[S.commTabText, communityTab === t && S.commTabTextActive]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {loading ? <ActivityIndicator color={C.orange} style={{ padding: 20 }} /> :
          communityTab === "sessions" ? (
            sessions.length > 0 ? sessions.slice(0, 3).map((s, i) => (
              <View key={s.id} style={[S.commItem, i === 0 && { borderTopWidth: 0 }]}>
                <View style={S.commDatePill}>
                  <Text style={S.commDateText}>{fmtDate(s.date)}</Text>
                  {s.time ? <Text style={S.commTimeText}>{fmtTime(s.time)}</Text> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={S.commItemTitle} numberOfLines={1}>{s.title}</Text>
                  {s.venue ? <Text style={S.commItemSub} numberOfLines={1}>📍 {s.venue}</Text> : null}
                </View>
              </View>
            )) : (
              <View style={S.emptyCard}>
                <Text style={S.emptyBody}>No upcoming sessions. New runs are added every week.</Text>
              </View>
            )
          ) : (
            stories.length > 0 ? stories.slice(0, 2).map((s, i) => (
              <View key={s.id} style={[S.commItem, i === 0 && { borderTopWidth: 0 }]}>
                <View style={S.storyAvatar}><Text style={S.storyInitial}>{s.user_name.charAt(0).toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={S.commItemTitle} numberOfLines={1}>{s.user_name}</Text>
                  <Text style={S.storyAchievement} numberOfLines={1}>{s.achievement}</Text>
                  <Text style={S.storyQuote} numberOfLines={2}>"{s.quote}"</Text>
                </View>
              </View>
            )) : (
              <View style={S.emptyCard}>
                <Text style={S.emptyBody}>Be the first to share your running story.</Text>
              </View>
            )
          )}
        </View>

        {/* ══════════════════════════════════════════════════════════════
            ACHIEVEMENTS
        ══════════════════════════════════════════════════════════════ */}
        <SectionLabel title="ACHIEVEMENTS" action="All badges" onAction={() => navigation.navigate("Profile")} />
        {!loading && totalSessions === 0 ? (
          <View style={[S.card, S.emptyCard]}>
            <Text style={S.emptyIcon}>🏅</Text>
            <Text style={S.emptyTitle}>Badges locked</Text>
            <Text style={S.emptyBody}>Complete your first session to start unlocking achievement badges.</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.chipsScroll}>
            {CHIPS.map(c => (
              <View key={c.label} style={[S.chip, !c.earned && S.chipLocked]}>
                <Text style={S.chipEmoji}>{c.earned ? c.icon : "🔒"}</Text>
                <Text style={[S.chipLabel, !c.earned && S.chipLabelLocked]}>{c.label}</Text>
                {!c.earned && c.target > 0 && (
                  <Text style={S.chipProg}>{totalSessions}/{c.target}</Text>
                )}
              </View>
            ))}
          </ScrollView>
        )}

        {/* ══════════════════════════════════════════════════════════════
            MEMBERSHIP
        ══════════════════════════════════════════════════════════════ */}
        {!loading && (
          <View style={{ marginTop: 8 }}>
            <SectionLabel title="MEMBERSHIP" />
            {mem ? (
              <View style={[S.card, S.memberInner]}>
                <View style={S.memberRow}>
                  <View>
                    <Text style={S.memberPlan}>{mem.plan}</Text>
                    <Text style={S.memberLeft}>{memLeft} days left</Text>
                  </View>
                  <View style={S.memberActivePill}><Text style={S.memberActivePillText}>Active</Text></View>
                </View>
                <ProgressBar progress={memProg} height={5} delay={200} color="#4ade80" />
                {memLeft <= 7 && (
                  <View style={S.renewValueProp}>
                    <Text style={S.renewValueTitle}>Renew now to keep:</Text>
                    {["Training Plan", "Achievements & Badges", "Streak & Rankings", "Community Access"].map(item => (
                      <Text key={item} style={S.renewValueItem}>✅  {item}</Text>
                    ))}
                  </View>
                )}
                <TouchableOpacity style={S.renewBtn} onPress={() => Linking.openURL("https://www.connectedsteps.in/payments")}>
                  <Text style={S.renewBtnText}>Renew Membership  →</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[S.card, S.memberInner]}>
                <Text style={S.memberPlan}>No active membership</Text>
                <Text style={S.memberEmptyBody}>
                  Join to unlock your training plan, earn XP, track streaks, and climb the leaderboard.
                </Text>
                <TouchableOpacity style={[S.renewBtn, { marginTop: 14 }]} onPress={() => Linking.openURL("https://www.connectedsteps.in/pricing")}>
                  <Text style={S.renewBtnText}>View Plans  →</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

      </View>
    </ScrollView>
  );
}

// ── CountBox sub-component ─────────────────────────────────────────────────────
function CountBox({ value, label }: { value: number; label: string }) {
  return (
    <View style={S.countBox}>
      <Text style={S.countBoxNum}>{String(value).padStart(2, "0")}</Text>
      <Text style={S.countBoxLabel}>{label}</Text>
    </View>
  );
}

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  bg:       "#080808", heroBg: "#0f0a05",
  surface:  "#111111", surfaceHigh: "#181818",
  border:   "#222222",
  orange:   "#e8620a", orangeDim: "rgba(232,98,10,0.12)", orangeMid: "rgba(232,98,10,0.22)",
  white:    "#f5f5f5", text: "#f0f0f0", textSub: "#888888", textMuted: "#505050",
  green:    "#4ade80", greenDim: "rgba(74,222,128,0.12)",
  gold:     "#f59e0b",
};

const S = StyleSheet.create({
  root:  { flex: 1, backgroundColor: C.bg },
  scroll:{ paddingBottom: 48 },

  // ── Hero ──
  hero:               { backgroundColor: C.heroBg, paddingHorizontal: 20, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: "#1a1205", overflow: "hidden" },
  heroGlow:           { position: "absolute", top: -80, right: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: C.orange, opacity: 0.05 },
  heroTop:            { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 },
  heroGreeting:       { fontSize: 13, color: C.textSub, fontWeight: "500", marginBottom: 4 },
  heroNameRow:        { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  heroName:           { fontSize: 24, fontWeight: "800", color: C.white, letterSpacing: -0.4 },
  heroStreak:         { fontSize: 12, color: C.orange, fontWeight: "700" },
  heroAvatar:         { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: C.orange },
  heroAvatarFallback: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.orangeDim, borderWidth: 2, borderColor: C.orange, alignItems: "center", justifyContent: "center" },
  heroAvatarInitial:  { fontSize: 18, fontWeight: "700", color: C.orange },
  heroStats:          { flexDirection: "row", alignItems: "center" },
  heroStat:           { flex: 1, alignItems: "center" },
  heroStatVal:        { fontSize: 20, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  heroStatLabel:      { fontSize: 10, color: C.textSub, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 },
  heroStatDiv:        { width: 1, height: 32, backgroundColor: "#1e1e1e", marginHorizontal: 4 },

  body: { paddingHorizontal: 16, paddingTop: 20 },

  // ── Section labels ──
  sectionRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, marginTop: 4 },
  sectionLabel:  { fontSize: 11, fontWeight: "700", color: C.textMuted, letterSpacing: 0.8, textTransform: "uppercase" },
  sectionAction: { fontSize: 12, color: C.orange, fontWeight: "600" },

  // ── Smart state banners ──
  welcomeCard:    { backgroundColor: "#0a1a0d", borderRadius: 18, borderWidth: 1, borderColor: "rgba(74,222,128,0.2)", padding: 18, marginBottom: 20 },
  welcomeTitle:   { fontSize: 16, fontWeight: "800", color: C.white, marginBottom: 8 },
  welcomeBody:    { fontSize: 13, color: C.textSub, lineHeight: 20, marginBottom: 14 },
  welcomeBtn:     { backgroundColor: "#4ade80", borderRadius: 10, padding: 12, alignItems: "center" },
  welcomeBtnText: { color: "#0a1a0d", fontWeight: "800", fontSize: 13 },

  comebackCard:    { backgroundColor: "#130a00", borderRadius: 18, borderWidth: 1, borderColor: C.orangeMid, padding: 18, marginBottom: 20, flexDirection: "row", gap: 14, alignItems: "flex-start" },
  comebackEmoji:   { fontSize: 32 },
  comebackTitle:   { fontSize: 15, fontWeight: "700", color: C.white, marginBottom: 6 },
  comebackBody:    { fontSize: 13, color: C.textSub, lineHeight: 19, marginBottom: 12 },
  comebackBtn:     { backgroundColor: C.orange, borderRadius: 10, padding: 11, alignItems: "center" },
  comebackBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  powerCard:    { backgroundColor: "#0d0a02", borderRadius: 14, borderWidth: 1, borderColor: "rgba(245,158,11,0.3)", padding: 12, marginBottom: 16 },
  powerText:    { fontSize: 13, color: C.gold, fontWeight: "600", textAlign: "center" },

  // ── Today's Mission ──
  missionCard:      { backgroundColor: "#130d07", borderRadius: 22, borderWidth: 1, borderColor: "rgba(232,98,10,0.28)", padding: 20, marginBottom: 24, overflow: "hidden" },
  missionGlow:      { position: "absolute", top: -50, right: -50, width: 180, height: 180, borderRadius: 90, backgroundColor: C.orange, opacity: 0.06 },
  missionHeader:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  missionEyebrow:   { fontSize: 10, fontWeight: "800", color: C.orange, letterSpacing: 1.2, textTransform: "uppercase" },
  xpRewardBadge:    { backgroundColor: "rgba(232,98,10,0.15)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(232,98,10,0.3)" },
  xpRewardText:     { fontSize: 10, color: C.orange, fontWeight: "700" },
  missionWorkout:   { flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 18 },
  missionEmoji:     { fontSize: 40 },
  missionType:      { fontSize: 22, fontWeight: "800", color: C.white, letterSpacing: -0.3, marginBottom: 4 },
  missionDetail:    { fontSize: 14, color: C.textSub, lineHeight: 20 },
  missionRestNote:  { fontSize: 13, color: C.textMuted, lineHeight: 19, fontStyle: "italic" },
  missionNoPlan:    { flex: 1, fontSize: 14, color: C.textSub, lineHeight: 20, paddingTop: 4 },
  missionCTA:       { backgroundColor: C.orange, borderRadius: 14, padding: 16, alignItems: "center" },
  missionCTAText:   { color: "#fff", fontWeight: "800", fontSize: 15, letterSpacing: 0.1 },

  // ── Countdown ──
  countdownCard:    { backgroundColor: "#0d0714", borderRadius: 22, borderWidth: 1, borderColor: "rgba(139,92,246,0.25)", padding: 20, marginBottom: 24, overflow: "hidden" },
  countdownGlow:    { position: "absolute", top: -60, left: -60, width: 160, height: 160, borderRadius: 80, backgroundColor: "#8b5cf6", opacity: 0.06 },
  countdownTitle:   { fontSize: 16, fontWeight: "700", color: C.white, marginBottom: 4 },
  countdownVenue:   { fontSize: 12, color: C.textSub, marginBottom: 18 },
  countdownRow:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 18 },
  countdownColon:   { fontSize: 28, color: C.textMuted, fontWeight: "700", marginBottom: 16 },
  countBox:         { backgroundColor: "#1a1025", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: "rgba(139,92,246,0.2)", alignItems: "center", minWidth: 64 },
  countBoxNum:      { fontSize: 32, fontWeight: "800", color: "#a78bfa", letterSpacing: -1 },
  countBoxLabel:    { fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 2 },
  countdownBtn:     { backgroundColor: "rgba(139,92,246,0.15)", borderRadius: 12, padding: 13, alignItems: "center", borderWidth: 1, borderColor: "rgba(139,92,246,0.25)" },
  countdownBtnText: { color: "#a78bfa", fontWeight: "700", fontSize: 13 },

  // ── Featured session ──
  featuredCard:    { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.border, marginBottom: 24, overflow: "hidden" },
  featuredTop:     { padding: 18, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  featuredTitle:   { fontSize: 16, fontWeight: "700", color: C.text, marginBottom: 6 },
  featuredMeta:    { fontSize: 12, color: C.textSub, marginBottom: 3 },
  upcomingBadge:   { backgroundColor: C.orangeDim, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start" },
  upcomingBadgeText: { fontSize: 10, color: C.orange, fontWeight: "700" },
  featuredBtn:     { margin: 12, marginTop: 4, backgroundColor: C.orange, borderRadius: 12, padding: 14, alignItems: "center" },
  featuredBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // ── Streak ──
  streakCard:        { backgroundColor: "#0a0d14", borderRadius: 20, borderWidth: 1, borderColor: "rgba(232,98,10,0.2)", padding: 18, marginBottom: 24, overflow: "hidden" },
  streakCardGlow:    { position: "absolute", bottom: -60, left: -60, width: 160, height: 160, borderRadius: 80, backgroundColor: C.orange, opacity: 0.05 },
  streakRow:         { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  streakItem:        { flex: 1, alignItems: "center", gap: 4 },
  streakNum:         { fontSize: 28, fontWeight: "800", color: C.orange, letterSpacing: -0.5 },
  streakEmoji:       { fontSize: 20 },
  streakItemLabel:   { fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  streakDivider:     { width: 1, height: 50, backgroundColor: "#1e1e1e" },
  streakMotivation:  { fontSize: 12, color: C.orange, textAlign: "center", fontWeight: "600", fontStyle: "italic" },

  // ── Level card ──
  levelCard:       { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 18, marginBottom: 24 },
  levelTop:        { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 },
  levelTitle:      { fontSize: 17, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  levelSub:        { fontSize: 12, color: C.orange, marginTop: 3 },
  levelXPBox:      { alignItems: "flex-end" },
  levelXPVal:      { fontSize: 20, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  levelXPLabel:    { fontSize: 10, color: C.textSub, marginTop: 2 },
  levelBarLabels:  { flexDirection: "row", justifyContent: "space-between", marginTop: 8, marginBottom: 6 },
  levelBarStart:   { fontSize: 11, color: C.textMuted },
  levelBarEnd:     { fontSize: 11, color: C.orange },
  levelNextTitle:  { fontSize: 12, color: C.textSub, marginTop: 4 },

  // ── Generic card ──
  card:    { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.border, marginBottom: 24, overflow: "hidden" },

  // ── Empty states ──
  emptyCard:  { padding: 24, alignItems: "center" },
  emptyIcon:  { fontSize: 36, marginBottom: 10 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: C.text, marginBottom: 6, textAlign: "center" },
  emptyBody:  { fontSize: 13, color: C.textMuted, textAlign: "center", lineHeight: 19 },

  // ── Monthly goals ──
  goalRow:        { padding: 18, gap: 8 },
  goalRowBorder:  { borderTopWidth: 1, borderTopColor: C.border },
  goalTop:        { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  goalIcon:       { fontSize: 16 },
  goalLabel:      { fontSize: 14, color: C.text, fontWeight: "600" },
  goalPct:        { fontSize: 13, color: C.orange, fontWeight: "700" },
  goalDone:       { fontSize: 12, color: C.green, fontWeight: "700" },
  goalBottom:     { flexDirection: "row", alignItems: "center", marginTop: 6 },
  goalCount:      { fontSize: 12, color: C.textSub },
  goalRemaining:  { fontSize: 12, color: C.textMuted, marginLeft: 8 },
  goalReward:     { fontSize: 11, color: C.gold },

  // ── Milestone ──
  milestoneCard:       { backgroundColor: "#0d0d0a", borderRadius: 20, borderWidth: 1, borderColor: "rgba(245,158,11,0.22)", padding: 18, marginBottom: 24, overflow: "hidden" },
  milestoneGlow:       { position: "absolute", top: -50, right: -50, width: 140, height: 140, borderRadius: 70, backgroundColor: C.gold, opacity: 0.05 },
  milestoneTop:        { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 },
  milestoneEmoji:      { fontSize: 34 },
  milestoneLabel:      { fontSize: 15, fontWeight: "700", color: C.white },
  milestoneReward:     { fontSize: 12, color: C.gold, marginTop: 3 },
  milestoneProgressBox:{ alignItems: "center" },
  milestoneProgressVal:{ fontSize: 24, fontWeight: "800", color: C.gold, letterSpacing: -0.5 },
  milestoneProgressDen:{ fontSize: 12, color: C.textMuted },
  milestoneHint:       { fontSize: 12, color: C.textMuted, marginTop: 8, textAlign: "right" },

  // ── Coach insights ──
  insightsCard:   { backgroundColor: "#0a0d10", borderRadius: 20, borderWidth: 1, borderColor: "rgba(96,165,250,0.2)", padding: 18, marginBottom: 24, flexDirection: "row", gap: 14, alignItems: "flex-start" },
  insightsIcon:   { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(96,165,250,0.1)", borderWidth: 1, borderColor: "rgba(96,165,250,0.2)", alignItems: "center", justifyContent: "center" },
  insightText:    { fontSize: 14, color: "#93c5fd", lineHeight: 22, fontStyle: "italic" },
  insightBorder:  { borderTopWidth: 1, borderTopColor: "rgba(96,165,250,0.1)" },

  // ── Training plan ──
  planHeader:    { flexDirection: "row", alignItems: "center", padding: 18, gap: 12 },
  planTitle:     { fontSize: 15, fontWeight: "700", color: C.text, marginBottom: 3 },
  planCoach:     { fontSize: 12, color: C.textSub },
  planPct:       { fontSize: 12, color: C.orange, fontWeight: "600", textAlign: "right" },
  chevron:       { fontSize: 24, color: C.textMuted, transform: [{ rotate: "90deg" }] },
  chevronUp:     { transform: [{ rotate: "-90deg" }] },
  planDays:      { borderTopWidth: 1, borderTopColor: C.border, paddingBottom: 8 },
  dayRow:        { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 11, gap: 12 },
  dayRowToday:   { backgroundColor: C.orangeDim },
  dayName:       { fontSize: 12, color: C.textMuted, fontWeight: "600", width: 30, textTransform: "uppercase", letterSpacing: 0.3 },
  dayNameToday:  { color: C.orange },
  dayEmoji:      { fontSize: 16, width: 22 },
  dayType:       { fontSize: 13, fontWeight: "600", color: C.text },
  dayTypeRest:   { color: C.textMuted },
  dayTypeToday:  { color: C.orange },
  dayDetail:     { fontSize: 11, color: C.textSub, marginTop: 2 },
  todayDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: C.orange },

  // ── Community ──
  commTabs:       { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border },
  commTab:        { flex: 1, paddingVertical: 13, alignItems: "center" },
  commTabActive:  { borderBottomWidth: 2, borderBottomColor: C.orange },
  commTabText:    { fontSize: 13, color: C.textSub, fontWeight: "600" },
  commTabTextActive: { color: C.orange },
  commItem:       { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: 1, borderTopColor: C.border },
  commDatePill:   { alignItems: "center", minWidth: 52, backgroundColor: C.surfaceHigh, borderRadius: 10, padding: 8 },
  commDateText:   { fontSize: 10, fontWeight: "700", color: C.orange, textAlign: "center" },
  commTimeText:   { fontSize: 10, color: C.textSub, marginTop: 2, textAlign: "center" },
  commItemTitle:  { fontSize: 13, fontWeight: "700", color: C.text, marginBottom: 3 },
  commItemSub:    { fontSize: 11, color: C.textSub },
  storyAvatar:    { width: 36, height: 36, borderRadius: 18, backgroundColor: C.orangeDim, alignItems: "center", justifyContent: "center" },
  storyInitial:   { fontSize: 14, fontWeight: "700", color: C.orange },
  storyAchievement: { fontSize: 11, color: C.orange, fontWeight: "600", marginBottom: 3 },
  storyQuote:     { fontSize: 12, color: C.textSub, lineHeight: 17, fontStyle: "italic" },

  // ── Achievements ──
  chipsScroll:    { paddingBottom: 24, gap: 8 },
  chip:           { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.surfaceHigh, borderRadius: 24, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: C.border },
  chipLocked:     { opacity: 0.38 },
  chipEmoji:      { fontSize: 16 },
  chipLabel:      { fontSize: 13, color: C.text, fontWeight: "600" },
  chipLabelLocked:{ color: C.textMuted },
  chipProg:       { fontSize: 10, color: C.textMuted, marginLeft: 2 },

  // ── Membership ──
  memberInner:       { padding: 18 },
  memberRow:         { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 },
  memberPlan:        { fontSize: 15, fontWeight: "700", color: C.text, marginBottom: 3, textTransform: "capitalize" },
  memberLeft:        { fontSize: 12, color: C.textSub },
  memberActivePill:  { backgroundColor: C.greenDim, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(74,222,128,0.2)" },
  memberActivePillText:{ fontSize: 11, color: C.green, fontWeight: "700" },
  memberEmptyBody:   { fontSize: 13, color: C.textSub, lineHeight: 20, marginTop: 8 },
  renewValueProp:    { marginTop: 12, marginBottom: 4, gap: 4 },
  renewValueTitle:   { fontSize: 13, fontWeight: "700", color: C.white, marginBottom: 6 },
  renewValueItem:    { fontSize: 13, color: C.textSub, lineHeight: 22 },
  renewBtn:          { marginTop: 14, borderWidth: 1, borderColor: C.orange, borderRadius: 12, padding: 14, alignItems: "center" },
  renewBtnText:      { color: C.orange, fontWeight: "700", fontSize: 14 },

  greenDim:  "rgba(74,222,128,0.12)",
  orangeMid: "rgba(232,98,10,0.22)",
});
