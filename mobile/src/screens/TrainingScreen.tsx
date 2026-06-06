import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { useSafeAreaInsets }  from "react-native-safe-area-context";
import { useUser }            from "../context/UserContext";
import {
  getTrainingPlan, getUserStats, getUserAchievements, getUserSessions,
} from "../services/api";
import type { TrainingPlan, UserStats, UserAchievements, UserSession } from "../types";
import ProgressBar            from "../components/ProgressBar";
import { getLevelInfo }       from "../utils/xp";
import { computeStreaks, streakEmoji } from "../utils/streak";
import { generateInsights }   from "../utils/insights";

const DAY_NAMES  = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SESSIONS_GOAL = 8;
const XP_GOAL       = 1000;
const todayIdx = () => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; };

function SectionLabel({ title }: { title: string }) {
  return <Text style={S.sectionLabel}>{title}</Text>;
}

export default function TrainingScreen() {
  const { user }   = useUser();
  const insets     = useSafeAreaInsets();

  const [plan,       setPlan]       = useState<TrainingPlan | null>(null);
  const [stats,      setStats]      = useState<UserStats | null>(null);
  const [achieve,    setAchieve]    = useState<UserAchievements | null>(null);
  const [history,    setHistory]    = useState<UserSession[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    const R = await Promise.allSettled([
      getTrainingPlan(user.email),
      getUserStats(user.email),
      getUserAchievements(user.email),
      getUserSessions(user.email),
    ]);
    if (R[0].status === "fulfilled") setPlan(R[0].value);
    if (R[1].status === "fulfilled") setStats(R[1].value);
    if (R[2].status === "fulfilled") setAchieve(R[2].value);
    if (R[3].status === "fulfilled") setHistory(R[3].value as UserSession[]);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const today       = todayIdx();
  const totalXP     = stats?.total_xp  ?? (stats?.total_points ?? 0) * 5;
  const monthXP     = stats?.month_xp  ?? (stats?.month_points ?? 0) * 5;
  const levelInfo   = getLevelInfo(totalXP);
  const streaks     = computeStreaks(history);
  const totalSess   = achieve?.sessionCount    ?? 0;
  const rank        = achieve?.leaderboardRank ?? null;

  const now         = new Date();
  const monthStart  = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthSessions = history.filter(r =>
    r.attended && r.sessions?.date && new Date(r.sessions.date + "T00:00:00") >= monthStart
  ).length;

  const insights = generateInsights({
    monthXP, totalSessions: totalSess, monthSessions,
    streak: streaks.sessions, rank, level: levelInfo.level,
  });

  return (
    <ScrollView
      style={S.root}
      contentContainerStyle={S.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.orange} />}
    >
      <View style={[S.header, { paddingTop: Math.max(insets.top + 12, 20) }]}>
        <Text style={S.headerTitle}>Training</Text>
        {plan && <Text style={S.headerSub}>by {plan.coach_name || "your coach"}</Text>}
      </View>

      {loading ? (
        <ActivityIndicator color={C.orange} style={{ marginTop: 48 }} />
      ) : (
        <View style={S.body}>

          {/* ── Streak Analytics ───────────────────────────────────────────── */}
          <SectionLabel title="STREAK ANALYTICS" />
          <View style={S.streakCard}>
            <View style={S.streakCardGlow} pointerEvents="none" />
            {streaks.sessions > 0 ? (
              <>
                <View style={S.streakRow}>
                  {[
                    { num: streaks.sessions, emoji: streakEmoji(streaks.sessions), label: "Sessions" },
                    { num: streaks.weekly,   emoji: "📅",                          label: "Weeks"    },
                    { num: streaks.monthly,  emoji: "🗓",                          label: "Months"   },
                  ].map((item, i) => (
                    <React.Fragment key={item.label}>
                      {i > 0 && <View style={S.streakDivider} />}
                      <View style={S.streakItem}>
                        <Text style={S.streakNum}>{item.num}</Text>
                        <Text style={S.streakEmoji}>{item.emoji}</Text>
                        <Text style={S.streakItemLabel}>{item.label}</Text>
                      </View>
                    </React.Fragment>
                  ))}
                </View>
                <Text style={S.streakMotivation}>
                  {streaks.sessions >= 10 ? "Elite consistency. You're unstoppable."
                   : streaks.sessions >= 5 ? "You're on fire. Keep showing up."
                   : "Your streak is alive. Don't break it now."}
                </Text>
              </>
            ) : (
              <Text style={S.streakEmpty}>Attend a session to start your streak.</Text>
            )}
          </View>

          {/* ── Monthly Goals ──────────────────────────────────────────────── */}
          <SectionLabel title="MONTHLY GOALS" />
          <View style={S.card}>
            {[
              { icon: "🏃", label: "Sessions",  val: monthSessions, target: SESSIONS_GOAL, color: C.orange },
              { icon: "⚡", label: "XP Earned", val: monthXP,       target: XP_GOAL,       color: C.green  },
            ].map((g, i) => {
              const pct  = Math.min(1, g.val / g.target);
              const done = g.val >= g.target;
              return (
                <View key={g.label} style={[S.goalRow, i > 0 && S.goalBorder]}>
                  <View style={S.goalTop}>
                    <Text style={S.goalIcon}>{g.icon}</Text>
                    <Text style={S.goalLabel}>{g.label}</Text>
                    <View style={{ flex: 1 }} />
                    {done
                      ? <Text style={S.goalDone}>✓ Done</Text>
                      : <Text style={S.goalPct}>{Math.round(pct * 100)}%</Text>}
                  </View>
                  <ProgressBar progress={pct} height={5} delay={i * 200 + 100} color={g.color} />
                  <View style={S.goalBottom}>
                    <Text style={S.goalCount}>{g.val} / {g.target}</Text>
                    {!done && <Text style={S.goalRemaining}>{g.target - g.val} to go</Text>}
                  </View>
                </View>
              );
            })}
          </View>

          {/* ── Coach Insights ─────────────────────────────────────────────── */}
          {insights.length > 0 && (
            <>
              <SectionLabel title="COACH INSIGHTS" />
              <View style={S.insightsCard}>
                <View style={S.insightsIconWrap}><Text style={{ fontSize: 20 }}>💡</Text></View>
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

          {/* ── Training Plan ──────────────────────────────────────────────── */}
          <SectionLabel title="THIS WEEK'S PLAN" />
          {!plan ? (
            <View style={[S.card, S.emptyCard]}>
              <Text style={S.emptyIcon}>🏋️</Text>
              <Text style={S.emptyTitle}>No plan yet</Text>
              <Text style={S.emptyText}>Your coach will assign a plan once you join a session.</Text>
            </View>
          ) : (
            <>
              <View style={S.planCard}>
                <Text style={S.planTitle}>{plan.title}</Text>
                {plan.coach_name ? <Text style={S.planCoach}>Coach · {plan.coach_name}</Text> : null}
              </View>
              <View style={S.timeline}>
                {plan.days.map((day, i) => {
                  const isToday = i === today;
                  const isDone  = i < today;
                  const isRest  = day.type.toLowerCase().includes("rest");
                  return (
                    <View key={i} style={S.timelineRow}>
                      <View style={S.timelineLeft}>
                        <View style={[S.dot, isToday && S.dotToday, isDone && S.dotDone, isRest && !isToday && S.dotRest]} />
                        {i < 6 && <View style={[S.line, isDone && S.lineDone]} />}
                      </View>
                      <View style={[S.dayCard, isToday && S.dayCardToday, isDone && S.dayCardDone]}>
                        <View style={S.dayCardTop}>
                          <View style={S.dayMeta}>
                            <Text style={[S.dayName, isToday && S.dayNameToday]}>{DAY_NAMES[i]}</Text>
                            {isToday && <View style={S.todayPill}><Text style={S.todayPillText}>Today</Text></View>}
                            {isDone && !isRest && <Text style={S.doneTick}>✓</Text>}
                          </View>
                          <Text style={S.dayEmoji}>{day.emoji}</Text>
                        </View>
                        <Text style={[S.dayType, isRest && S.dayTypeRest, isToday && S.dayTypeToday]}>{day.type}</Text>
                        {!isRest && day.detail ? <Text style={S.dayDetail}>{day.detail}</Text> : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}

        </View>
      )}
    </ScrollView>
  );
}

const C = {
  bg:"#080808", surface:"#111111", border:"#222222",
  orange:"#e8620a", orangeDim:"rgba(232,98,10,0.1)", orangeMid:"rgba(232,98,10,0.2)",
  white:"#f5f5f5", text:"#f0f0f0", textSub:"#888888", textMuted:"#505050",
  green:"#4ade80", greenDim:"rgba(74,222,128,0.12)",
};

const S = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 48 },
  header: { paddingHorizontal: 20, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { fontSize: 22, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  headerSub:   { fontSize: 13, color: C.orange, marginTop: 4 },
  body:        { padding: 16, gap: 12 },
  sectionLabel:{ fontSize: 10, fontWeight: "700", color: C.textMuted, letterSpacing: 0.8, textTransform: "uppercase", marginTop: 8, marginBottom: 4 },
  card:        { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, overflow: "hidden" },

  // Streaks
  streakCard:      { backgroundColor: "#0a0d14", borderRadius: 18, borderWidth: 1, borderColor: "rgba(232,98,10,0.18)", padding: 18, overflow: "hidden" },
  streakCardGlow:  { position: "absolute", bottom: -40, left: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: C.orange, opacity: 0.04 },
  streakRow:       { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  streakItem:      { flex: 1, alignItems: "center", gap: 4 },
  streakNum:       { fontSize: 28, fontWeight: "800", color: C.orange },
  streakEmoji:     { fontSize: 18 },
  streakItemLabel: { fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  streakDivider:   { width: 1, height: 50, backgroundColor: "#1e1e1e" },
  streakMotivation:{ fontSize: 12, color: C.orange, textAlign: "center", fontWeight: "600", fontStyle: "italic" },
  streakEmpty:     { fontSize: 13, color: C.textMuted, textAlign: "center", padding: 8 },

  // Goals
  goalRow:    { padding: 16, gap: 8 },
  goalBorder: { borderTopWidth: 1, borderTopColor: C.border },
  goalTop:    { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  goalIcon:   { fontSize: 16 },
  goalLabel:  { fontSize: 14, color: C.text, fontWeight: "600" },
  goalDone:   { fontSize: 12, color: C.green, fontWeight: "700" },
  goalPct:    { fontSize: 13, color: C.orange, fontWeight: "700" },
  goalBottom: { flexDirection: "row", gap: 8, marginTop: 6 },
  goalCount:  { fontSize: 12, color: C.textSub },
  goalRemaining: { fontSize: 12, color: C.textMuted },

  // Insights
  insightsCard:    { backgroundColor: "#0a0d10", borderRadius: 18, borderWidth: 1, borderColor: "rgba(96,165,250,0.2)", padding: 18, flexDirection: "row", gap: 14, alignItems: "flex-start" },
  insightsIconWrap:{ width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(96,165,250,0.1)", borderWidth: 1, borderColor: "rgba(96,165,250,0.2)", alignItems: "center", justifyContent: "center" },
  insightText:     { fontSize: 13, color: "#93c5fd", lineHeight: 20, fontStyle: "italic" },
  insightBorder:   { borderTopWidth: 1, borderTopColor: "rgba(96,165,250,0.1)" },

  // Plan
  planCard:   { backgroundColor: "#0f0a05", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#1a1205" },
  planTitle:  { fontSize: 15, fontWeight: "700", color: C.white, marginBottom: 4 },
  planCoach:  { fontSize: 12, color: C.orange },

  // Empty
  emptyCard:  { padding: 32, alignItems: "center" },
  emptyIcon:  { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: C.text, marginBottom: 6 },
  emptyText:  { fontSize: 13, color: C.textSub, textAlign: "center", lineHeight: 20 },

  // Timeline
  timeline:    {},
  timelineRow: { flexDirection: "row", gap: 14 },
  timelineLeft:{ width: 20, alignItems: "center" },
  dot:         { width: 12, height: 12, borderRadius: 6, backgroundColor: C.border, borderWidth: 2, borderColor: C.border, marginTop: 14 },
  dotToday:    { backgroundColor: C.orange, borderColor: C.orange, width: 14, height: 14, borderRadius: 7, marginTop: 13 },
  dotDone:     { backgroundColor: C.green, borderColor: C.green },
  dotRest:     { backgroundColor: "transparent", borderColor: C.textMuted },
  line:        { width: 2, flex: 1, backgroundColor: C.border, marginVertical: 2 },
  lineDone:    { backgroundColor: C.green },
  dayCard:      { flex: 1, backgroundColor: C.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  dayCardToday: { backgroundColor: "#130d07", borderColor: C.orangeMid },
  dayCardDone:  { backgroundColor: "#0a130d", borderColor: "rgba(74,222,128,0.15)" },
  dayCardTop:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  dayMeta:      { flexDirection: "row", alignItems: "center", gap: 8 },
  dayName:      { fontSize: 11, fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  dayNameToday: { color: C.orange },
  todayPill:    { backgroundColor: C.orange, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  todayPillText:{ fontSize: 10, color: "#fff", fontWeight: "700" },
  doneTick:     { fontSize: 13, color: C.green, fontWeight: "700" },
  dayEmoji:     { fontSize: 18 },
  dayType:      { fontSize: 14, fontWeight: "700", color: C.text, marginBottom: 3 },
  dayTypeRest:  { color: C.textMuted, fontWeight: "400" },
  dayTypeToday: { color: C.orange },
  dayDetail:    { fontSize: 11, color: C.textSub, lineHeight: 17 },
  orangeMid:    "rgba(232,98,10,0.2)",
});
