import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Image, Linking,
} from "react-native";
import { useSafeAreaInsets }   from "react-native-safe-area-context";
import { useNavigation }       from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useUser }             from "../context/UserContext";
import {
  getUserStats, getUserAchievements, getSessions,
  getTrainingPlan, getMembership, getStories,
} from "../services/api";
import type {
  UserStats, UserAchievements, Session,
  TrainingPlan, Membership, Story,
} from "../types";
import type { TabParamList }   from "../navigation/TabNavigator";
import ProgressBar             from "../components/ProgressBar";

type Nav = BottomTabNavigationProp<TabParamList>;

// ── Constants ─────────────────────────────────────────────────────────────────
const SESSIONS_GOAL = 8;
const POINTS_GOAL   = 1000;
const DAY_NAMES     = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MILESTONES    = [
  { target: 1,  icon: "🏅", label: "First Session",  reward: "Starter badge"  },
  { target: 5,  icon: "🏃", label: "5 Sessions",     reward: "+100 bonus pts" },
  { target: 10, icon: "⭐", label: "10 Sessions",    reward: "+200 bonus pts" },
  { target: 25, icon: "🔥", label: "25 Sessions",    reward: "+500 bonus pts" },
  { target: 50, icon: "🏆", label: "50 Sessions",    reward: "Legend badge"   },
];

const todayIdx = () => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; };

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
function fmtTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
function daysLeft(expiresAt: string) {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 86400000));
}
function planDuration(startedAt: string, expiresAt: string) {
  return Math.max(1, Math.round((new Date(expiresAt).getTime() - new Date(startedAt).getTime()) / 86400000));
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionLabel({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={S.sectionRow}>
      <Text style={S.sectionLabel}>{title}</Text>
      {action ? <TouchableOpacity onPress={onAction}><Text style={S.sectionAction}>{action}</Text></TouchableOpacity> : null}
    </View>
  );
}

function StatBadge({ icon, value, label }: { icon: string; value: string | number; label: string }) {
  return (
    <View style={S.statBadge}>
      <Text style={S.statIcon}>{icon}</Text>
      <Text style={S.statValue}>{value}</Text>
      <Text style={S.statLabel}>{label}</Text>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { user }                        = useUser();
  const navigation                      = useNavigation<Nav>();
  const insets                          = useSafeAreaInsets();
  const [stats,      setStats]          = useState<UserStats | null>(null);
  const [achieve,    setAchieve]        = useState<UserAchievements | null>(null);
  const [nextSession, setNextSession]   = useState<Session | null>(null);
  const [plan,       setPlan]           = useState<TrainingPlan | null>(null);
  const [membership, setMembership]     = useState<Membership | null>(null);
  const [stories,    setStories]        = useState<Story[]>([]);
  const [sessions,   setSessions]       = useState<Session[]>([]);
  const [loading,    setLoading]        = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [planExpanded, setPlanExpanded] = useState(false);
  const [communityTab, setCommunityTab] = useState<"sessions" | "stories">("sessions");

  const load = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    const results = await Promise.allSettled([
      getUserStats(user.email),
      getUserAchievements(user.email),
      getSessions(),
      getTrainingPlan(user.email),
      getMembership(user.email),
      getStories(),
    ]);
    if (results[0].status === "fulfilled") setStats(results[0].value);
    if (results[1].status === "fulfilled") setAchieve(results[1].value);
    if (results[2].status === "fulfilled") {
      const s = results[2].value as Session[];
      setSessions(s);
      setNextSession(s[0] ?? null);
    }
    if (results[3].status === "fulfilled") setPlan(results[3].value);
    if (results[4].status === "fulfilled") setMembership(results[4].value);
    if (results[5].status === "fulfilled") setStories((results[5].value as Story[]).slice(0, 5));
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (!user) return null;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  // ── Derived data ─────────────────────────────────────────────────────────────
  const todayPlanIdx = todayIdx();
  const todayDay     = plan?.days[todayPlanIdx] ?? null;
  const isRestDay    = todayDay?.type.toLowerCase().includes("rest") ?? false;
  const totalAttended= achieve?.sessionCount ?? 0;
  const monthPts     = stats?.month_points ?? 0;
  const monthAttended= achieve?.sessionCount ?? 0; // approx - total sessions count

  const nextMilestone = MILESTONES.find(m => totalAttended < m.target);
  const milestoneProgress = nextMilestone
    ? Math.min(totalAttended / nextMilestone.target, 1)
    : 1;

  const ACHIEVEMENT_CHIPS = [
    { icon: "🏅", label: "First Session", earned: totalAttended >= 1,  target: 1  },
    { icon: "🏃", label: "5 Sessions",    earned: totalAttended >= 5,  target: 5  },
    { icon: "⭐", label: "10 Sessions",   earned: totalAttended >= 10, target: 10 },
    { icon: "🔥", label: "25 Sessions",   earned: totalAttended >= 25, target: 25 },
    { icon: "🏆", label: "50 Sessions",   earned: totalAttended >= 50, target: 50 },
  ];

  const mem      = membership?.isActive ? membership : null;
  const memLeft  = mem ? daysLeft(mem.expires_at) : 0;
  const memDur   = mem ? planDuration(mem.started_at, mem.expires_at) : 1;
  const memProg  = mem ? Math.max(0.02, Math.min(1, 1 - memLeft / memDur)) : 0;

  return (
    <ScrollView
      style={S.root}
      contentContainerStyle={S.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.orange} />
      }
    >
      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <View style={[S.hero, { paddingTop: Math.max(insets.top + 12, 20) }]}>
        <View style={S.heroGlow} pointerEvents="none" />
        <View style={S.heroTop}>
          <View>
            <Text style={S.heroGreeting}>{greeting},</Text>
            <Text style={S.heroName}>{user.firstName} 👋</Text>
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
          <ActivityIndicator color={C.orange} style={{ marginTop: 20, alignSelf: "flex-start" }} />
        ) : (
          <View style={S.heroBadges}>
            <StatBadge icon="🏃" value={totalAttended}                                                    label="Sessions"   />
            <View style={S.badgeDivider} />
            <StatBadge icon="🏆" value={monthPts}                                                         label="This Month" />
            <View style={S.badgeDivider} />
            <StatBadge icon="🎯" value={achieve?.leaderboardRank ? `#${achieve.leaderboardRank}` : "—"}   label="Rank"       />
          </View>
        )}
      </View>

      <View style={S.body}>

        {/* ── TODAY'S MISSION (most dominant card) ───────────────────────── */}
        {!loading && (
          <View style={S.missionCard}>
            <View style={S.missionCardGlow} pointerEvents="none" />
            <View style={S.missionTop}>
              <Text style={S.missionEyebrow}>TODAY'S MISSION</Text>
              {!isRestDay && <View style={S.streakBadge}><Text style={S.streakBadgeText}>🔥 Keep your streak</Text></View>}
            </View>

            {todayDay ? (
              <View style={S.missionWorkoutRow}>
                <Text style={S.missionEmoji}>{todayDay.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[S.missionType, isRestDay && { color: C.textMuted }]}>{todayDay.type}</Text>
                  {!isRestDay && todayDay.detail ? (
                    <Text style={S.missionDetail}>{todayDay.detail}</Text>
                  ) : null}
                </View>
                {isRestDay && <Text style={S.restLabel}>Rest day</Text>}
              </View>
            ) : (
              <View style={S.missionWorkoutRow}>
                <Text style={S.missionEmoji}>🏃</Text>
                <Text style={S.missionNoPlan}>Join a session to unlock your personalized training plan.</Text>
              </View>
            )}

            {!isRestDay && (
              <TouchableOpacity
                style={S.missionCTA}
                activeOpacity={0.82}
                onPress={() => navigation.navigate("Community")}
              >
                <Text style={S.missionCTAText}>
                  {nextSession ? `Join: ${nextSession.title}  →` : "Browse Sessions  →"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {loading && <View style={[S.missionCard, { height: 140, opacity: 0.3 }]} />}

        {/* ── NEXT SESSION ───────────────────────────────────────────────── */}
        <SectionLabel title="NEXT SESSION" />
        {loading ? (
          <View style={[S.card, S.skeletonCard]} />
        ) : nextSession ? (
          <View style={S.featuredCard}>
            <View style={S.featuredCardTop}>
              <View style={{ flex: 1 }}>
                <Text style={S.featuredTitle} numberOfLines={2}>{nextSession.title}</Text>
                <View style={S.featuredMeta}>
                  <Text style={S.metaText}>📅 {fmtDate(nextSession.date)}</Text>
                  {nextSession.time ? <><Text style={S.metaDot}>·</Text><Text style={S.metaText}>⏰ {fmtTime(nextSession.time)}</Text></> : null}
                </View>
                {nextSession.venue ? <Text style={S.metaText} numberOfLines={1}>📍 {nextSession.venue}</Text> : null}
              </View>
              <View style={S.featuredBadge}><Text style={S.featuredBadgeText}>Upcoming</Text></View>
            </View>
            <TouchableOpacity style={S.featuredBtn} activeOpacity={0.82} onPress={() => navigation.navigate("Community")}>
              <Text style={S.featuredBtnText}>Register Now  →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[S.card, S.emptyCard]}>
            <Text style={S.emptyIcon}>🗓</Text>
            <Text style={S.emptyTitle}>No sessions scheduled yet</Text>
            <Text style={S.emptyText}>Register for your next run and keep your streak alive.</Text>
            <TouchableOpacity style={S.emptyBtn} onPress={() => navigation.navigate("Community")}>
              <Text style={S.emptyBtnText}>Browse Community  →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── MONTHLY GOALS ──────────────────────────────────────────────── */}
        {!loading && (
          <>
            <SectionLabel title="MONTHLY GOALS" />
            <View style={S.card}>
              <View style={S.goalRow}>
                <View style={S.goalInfo}>
                  <Text style={S.goalText}>🏃 Sessions attended</Text>
                  <Text style={S.goalCount}>{monthAttended} / {SESSIONS_GOAL}</Text>
                </View>
                <ProgressBar progress={monthAttended / SESSIONS_GOAL} delay={200} />
                {monthAttended >= SESSIONS_GOAL && (
                  <Text style={S.goalComplete}>✓ Goal reached!</Text>
                )}
              </View>
              <View style={[S.goalRow, { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 14, marginTop: 2 }]}>
                <View style={S.goalInfo}>
                  <Text style={S.goalText}>🏆 Points earned</Text>
                  <Text style={S.goalCount}>{monthPts} / {POINTS_GOAL}</Text>
                </View>
                <ProgressBar progress={monthPts / POINTS_GOAL} delay={400} color="#4ade80" />
                {monthPts >= POINTS_GOAL && (
                  <Text style={[S.goalComplete, { color: "#4ade80" }]}>✓ Goal reached!</Text>
                )}
              </View>
            </View>
          </>
        )}

        {/* ── NEXT MILESTONE ─────────────────────────────────────────────── */}
        {!loading && nextMilestone && (
          <>
            <SectionLabel title="NEXT MILESTONE" />
            <View style={S.milestoneCard}>
              <View style={S.milestoneCardGlow} pointerEvents="none" />
              <View style={S.milestoneTop}>
                <Text style={S.milestoneIcon}>{nextMilestone.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={S.milestoneLabel}>{nextMilestone.label} Badge</Text>
                  <Text style={S.milestoneReward}>{nextMilestone.reward}</Text>
                </View>
                <View style={S.milestoneProgressBox}>
                  <Text style={S.milestoneProgressText}>{totalAttended}</Text>
                  <Text style={S.milestoneProgressDenom}>/{nextMilestone.target}</Text>
                </View>
              </View>
              <ProgressBar progress={milestoneProgress} height={6} delay={600} color="#f59e0b" />
              <Text style={S.milestoneHint}>
                {nextMilestone.target - totalAttended === 1
                  ? "1 more session to unlock"
                  : `${nextMilestone.target - totalAttended} more sessions to unlock`}
              </Text>
            </View>
          </>
        )}

        {/* ── TRAINING PLAN ──────────────────────────────────────────────── */}
        <SectionLabel title="TRAINING PLAN" action="Full Plan" onAction={() => navigation.navigate("Training")} />
        {loading ? (
          <View style={[S.card, S.skeletonCard]} />
        ) : plan ? (
          <View style={S.card}>
            <TouchableOpacity style={S.planHeader} onPress={() => setPlanExpanded(e => !e)} activeOpacity={0.7}>
              <View style={{ flex: 1 }}>
                <Text style={S.planTitle}>{plan.title}</Text>
                {plan.coach_name ? <Text style={S.planCoach}>by {plan.coach_name}</Text> : null}
              </View>
              <View style={S.planProgress}>
                <Text style={S.planProgressText}>{plan.days.filter(d => !d.type.toLowerCase().includes("rest")).length}/7</Text>
                <Text style={S.planProgressSub}>days</Text>
              </View>
              <Text style={[S.chevron, planExpanded && S.chevronUp]}>›</Text>
            </TouchableOpacity>
            {planExpanded && (
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
            <Text style={S.emptyText}>Join a session to unlock your personalized training plan.</Text>
          </View>
        )}

        {/* ── PROGRESS 2×2 GRID ──────────────────────────────────────────── */}
        <SectionLabel title="PROGRESS" />
        <View style={S.grid}>
          {[
            { label: "Month Points",   value: loading ? "—" : monthPts,                                                          hi: true  },
            { label: "All-Time Points",value: loading ? "—" : (stats?.total_points ?? 0),                                        hi: false },
            { label: "Leaderboard",    value: loading ? "—" : (achieve?.leaderboardRank ? `#${achieve.leaderboardRank}` : "—"),  hi: false },
            { label: "Total Sessions", value: loading ? "—" : totalAttended,                                                     hi: false },
          ].map(s => (
            <View key={s.label} style={[S.gridCell, s.hi && S.gridCellHi]}>
              <Text style={[S.gridVal, s.hi && { color: C.orange }]}>{s.value}</Text>
              <Text style={S.gridLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ── COMMUNITY ──────────────────────────────────────────────────── */}
        <SectionLabel title="COMMUNITY" action="See all" onAction={() => navigation.navigate("Community")} />
        <View style={S.card}>
          <View style={S.communityTabs}>
            <TouchableOpacity style={[S.communityTab, communityTab === "sessions" && S.communityTabActive]} onPress={() => setCommunityTab("sessions")}>
              <Text style={[S.communityTabText, communityTab === "sessions" && S.communityTabTextActive]}>Sessions</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[S.communityTab, communityTab === "stories" && S.communityTabActive]} onPress={() => setCommunityTab("stories")}>
              <Text style={[S.communityTabText, communityTab === "stories" && S.communityTabTextActive]}>Stories</Text>
            </TouchableOpacity>
          </View>
          {loading ? (
            <ActivityIndicator color={C.orange} style={{ padding: 20 }} />
          ) : communityTab === "sessions" ? (
            sessions.slice(0, 3).length > 0 ? (
              sessions.slice(0, 3).map((s, i) => (
                <View key={s.id} style={[S.communityItem, i === 0 && S.communityItemFirst]}>
                  <View style={S.communityDatePill}>
                    <Text style={S.communityDateText}>{fmtDate(s.date)}</Text>
                    {s.time ? <Text style={S.communityTimeText}>{fmtTime(s.time)}</Text> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.communityItemTitle} numberOfLines={1}>{s.title}</Text>
                    {s.venue ? <Text style={S.communityItemSub} numberOfLines={1}>📍 {s.venue}</Text> : null}
                  </View>
                </View>
              ))
            ) : (
              <View style={S.communityEmpty}>
                <Text style={S.emptyText}>No upcoming sessions right now.</Text>
                <Text style={[S.emptyText, { color: C.orange, marginTop: 4 }]}>Check back soon — new runs are added weekly.</Text>
              </View>
            )
          ) : (
            stories.slice(0, 2).length > 0 ? (
              stories.slice(0, 2).map((s, i) => (
                <View key={s.id} style={[S.communityItem, i === 0 && S.communityItemFirst]}>
                  <View style={S.storyAvatar}><Text style={S.storyInitial}>{s.user_name.charAt(0).toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.communityItemTitle} numberOfLines={1}>{s.user_name}</Text>
                    <Text style={S.storyAchievement} numberOfLines={1}>{s.achievement}</Text>
                    <Text style={S.storyQuote} numberOfLines={2}>"{s.quote}"</Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={S.communityEmpty}>
                <Text style={S.emptyText}>No stories yet — be the first to share yours.</Text>
              </View>
            )
          )}
        </View>

        {/* ── ACHIEVEMENTS ───────────────────────────────────────────────── */}
        <SectionLabel title="ACHIEVEMENTS" />
        {!loading && totalAttended === 0 ? (
          <View style={[S.card, S.emptyCard]}>
            <Text style={S.emptyIcon}>🏅</Text>
            <Text style={S.emptyTitle}>Badges locked</Text>
            <Text style={S.emptyText}>Complete your first session to start unlocking achievement badges.</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.chipsScroll}>
            {ACHIEVEMENT_CHIPS.map(chip => (
              <View key={chip.label} style={[S.chip, !chip.earned && S.chipLocked]}>
                <Text style={S.chipIcon}>{chip.earned ? chip.icon : "🔒"}</Text>
                <Text style={[S.chipLabel, !chip.earned && S.chipLabelLocked]}>{chip.label}</Text>
                {!chip.earned && (
                  <Text style={S.chipProgress}>{totalAttended}/{chip.target}</Text>
                )}
              </View>
            ))}
          </ScrollView>
        )}

        {/* ── MEMBERSHIP ─────────────────────────────────────────────────── */}
        {!loading && (
          <View style={{ marginTop: 8 }}>
            <SectionLabel title="MEMBERSHIP" />
            {mem ? (
              <View style={[S.card, S.memberCard]}>
                <View style={S.memberRow}>
                  <View>
                    <Text style={S.memberPlan}>{mem.plan}</Text>
                    <Text style={S.memberLeft}>{memLeft} days left</Text>
                  </View>
                  <View style={S.memberBadge}><Text style={S.memberBadgeText}>Active</Text></View>
                </View>
                <ProgressBar progress={memProg} height={5} delay={300} color="#4ade80" />
                {memLeft <= 7 && (
                  <Text style={S.memberWarning}>
                    ⚠️ Renew soon to keep your streak, points and training plan active.
                  </Text>
                )}
                <TouchableOpacity style={S.renewBtn} onPress={() => Linking.openURL("https://www.connectedsteps.in/payments")}>
                  <Text style={S.renewBtnText}>Renew Membership  →</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[S.card, S.memberCard]}>
                <Text style={S.memberPlan}>No active membership</Text>
                <Text style={S.emptyText}>Join to unlock your training plan, track sessions, and climb the leaderboard.</Text>
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

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  bg:       "#080808", heroBg: "#0f0a05", surface: "#111111", surfaceHigh: "#181818",
  border:   "#222222", borderSub: "#1a1a1a", orange: "#e8620a",
  orangeDim:"rgba(232,98,10,0.12)", orangeMid:"rgba(232,98,10,0.22)",
  white:    "#f5f5f5", text: "#f0f0f0", textSub: "#888888", textMuted: "#505050",
  green:    "#4ade80", gold: "#f59e0b",
};

const S = StyleSheet.create({
  root:  { flex: 1, backgroundColor: C.bg },
  scroll:{ paddingBottom: 48 },

  // Hero
  hero:              { backgroundColor: C.heroBg, paddingHorizontal: 20, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: "#1a1205", overflow: "hidden" },
  heroGlow:          { position: "absolute", top: -80, right: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: C.orange, opacity: 0.05 },
  heroTop:           { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 },
  heroGreeting:      { fontSize: 14, color: C.textSub, fontWeight: "500", marginBottom: 2 },
  heroName:          { fontSize: 26, fontWeight: "800", color: C.white, letterSpacing: -0.4 },
  heroAvatar:        { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: C.orange },
  heroAvatarFallback:{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.orangeDim, borderWidth: 2, borderColor: C.orange, alignItems: "center", justifyContent: "center" },
  heroAvatarInitial: { fontSize: 18, fontWeight: "700", color: C.orange },
  heroBadges:        { flexDirection: "row", alignItems: "center" },
  statBadge:         { flex: 1, alignItems: "center" },
  statIcon:          { fontSize: 18, marginBottom: 4 },
  statValue:         { fontSize: 20, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  statLabel:         { fontSize: 10, color: C.textSub, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.4 },
  badgeDivider:      { width: 1, height: 36, backgroundColor: "#1e1e1e", marginHorizontal: 4 },

  body: { paddingHorizontal: 16, paddingTop: 20 },

  // Section labels
  sectionRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, marginTop: 4 },
  sectionLabel:  { fontSize: 11, fontWeight: "700", color: C.textMuted, letterSpacing: 0.8, textTransform: "uppercase" },
  sectionAction: { fontSize: 12, color: C.orange, fontWeight: "600" },

  // Today's Mission card
  missionCard:       { backgroundColor: "#130d07", borderRadius: 20, borderWidth: 1, borderColor: "rgba(232,98,10,0.25)", padding: 20, marginBottom: 24, overflow: "hidden" },
  missionCardGlow:   { position: "absolute", top: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: C.orange, opacity: 0.07 },
  missionTop:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  missionEyebrow:    { fontSize: 10, fontWeight: "800", color: C.orange, letterSpacing: 1, textTransform: "uppercase" },
  streakBadge:       { backgroundColor: "rgba(232,98,10,0.15)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  streakBadgeText:   { fontSize: 11, color: C.orange, fontWeight: "700" },
  missionWorkoutRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 18 },
  missionEmoji:      { fontSize: 36 },
  missionType:       { fontSize: 20, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  missionDetail:     { fontSize: 13, color: C.textSub, marginTop: 3 },
  missionNoPlan:     { flex: 1, fontSize: 14, color: C.textSub, lineHeight: 20 },
  restLabel:         { fontSize: 12, color: C.textMuted, fontStyle: "italic" },
  missionCTA:        { backgroundColor: C.orange, borderRadius: 14, padding: 15, alignItems: "center" },
  missionCTAText:    { color: "#fff", fontWeight: "800", fontSize: 15, letterSpacing: 0.2 },

  // Cards
  card:        { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.border, marginBottom: 24, overflow: "hidden" },
  skeletonCard:{ height: 100, opacity: 0.3 },

  // Empty states
  emptyCard:  { padding: 24, alignItems: "center" },
  emptyIcon:  { fontSize: 36, marginBottom: 10 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: C.text, marginBottom: 6, textAlign: "center" },
  emptyText:  { fontSize: 13, color: C.textMuted, textAlign: "center", lineHeight: 19 },
  emptyBtn:   { marginTop: 14, borderWidth: 1, borderColor: C.orange, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  emptyBtnText: { fontSize: 13, color: C.orange, fontWeight: "700" },

  // Featured session card
  featuredCard:    { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.border, marginBottom: 24, overflow: "hidden" },
  featuredCardTop: { padding: 18, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  featuredTitle:   { fontSize: 17, fontWeight: "700", color: C.text, marginBottom: 8, lineHeight: 24 },
  featuredMeta:    { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" },
  metaText:        { fontSize: 12, color: C.textSub },
  metaDot:         { fontSize: 12, color: C.textMuted },
  featuredBadge:   { backgroundColor: C.orangeDim, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start" },
  featuredBadgeText: { fontSize: 10, color: C.orange, fontWeight: "700" },
  featuredBtn:     { margin: 12, marginTop: 4, backgroundColor: C.orange, borderRadius: 14, padding: 15, alignItems: "center" },
  featuredBtnText: { color: "#fff", fontWeight: "700", fontSize: 15, letterSpacing: 0.1 },

  // Monthly Goals
  goalRow:      { padding: 18, gap: 10 },
  goalInfo:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  goalText:     { fontSize: 14, color: C.text, fontWeight: "500" },
  goalCount:    { fontSize: 13, color: C.orange, fontWeight: "700" },
  goalComplete: { fontSize: 11, color: C.green, fontWeight: "700", marginTop: 6 },

  // Next Milestone
  milestoneCard:      { backgroundColor: "#0d0d0a", borderRadius: 20, borderWidth: 1, borderColor: "rgba(245,158,11,0.2)", padding: 18, marginBottom: 24, overflow: "hidden" },
  milestoneCardGlow:  { position: "absolute", top: -50, right: -50, width: 140, height: 140, borderRadius: 70, backgroundColor: C.gold, opacity: 0.05 },
  milestoneTop:       { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 },
  milestoneIcon:      { fontSize: 32 },
  milestoneLabel:     { fontSize: 15, fontWeight: "700", color: C.white },
  milestoneReward:    { fontSize: 12, color: C.gold, marginTop: 2 },
  milestoneProgressBox: { alignItems: "center" },
  milestoneProgressText:{ fontSize: 22, fontWeight: "800", color: C.gold, letterSpacing: -0.5 },
  milestoneProgressDenom:{ fontSize: 12, color: C.textMuted },
  milestoneHint:      { fontSize: 12, color: C.textMuted, marginTop: 8, textAlign: "right" },

  // Training plan
  planHeader:      { flexDirection: "row", alignItems: "center", padding: 18, gap: 12 },
  planTitle:       { fontSize: 15, fontWeight: "700", color: C.text, marginBottom: 3 },
  planCoach:       { fontSize: 12, color: C.textSub },
  planProgress:    { alignItems: "center", marginRight: 8 },
  planProgressText:{ fontSize: 20, fontWeight: "800", color: C.orange },
  planProgressSub: { fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.4 },
  chevron:         { fontSize: 24, color: C.textMuted, transform: [{ rotate: "90deg" }] },
  chevronUp:       { transform: [{ rotate: "-90deg" }] },
  planDays:        { borderTopWidth: 1, borderTopColor: C.border, paddingBottom: 8 },
  dayRow:          { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 11, gap: 12 },
  dayRowToday:     { backgroundColor: C.orangeDim },
  dayName:         { fontSize: 12, color: C.textMuted, fontWeight: "600", width: 30, textTransform: "uppercase", letterSpacing: 0.3 },
  dayNameToday:    { color: C.orange },
  dayEmoji:        { fontSize: 16, width: 22 },
  dayType:         { fontSize: 13, fontWeight: "600", color: C.text },
  dayTypeRest:     { color: C.textMuted },
  dayTypeToday:    { color: C.orange },
  dayDetail:       { fontSize: 11, color: C.textSub, marginTop: 2 },
  todayDot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: C.orange },

  // Progress 2×2 grid
  grid:         { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  gridCell:     { flex: 1, minWidth: "45%", backgroundColor: C.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: C.border },
  gridCellHi:   { borderColor: C.orangeMid, backgroundColor: "#130d07" } as any,
  gridVal:      { fontSize: 26, fontWeight: "800", color: C.white, letterSpacing: -0.5, marginBottom: 4 },
  gridLabel:    { fontSize: 11, color: C.textSub, textTransform: "uppercase", letterSpacing: 0.4 },

  // Community card
  communityTabs:         { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border },
  communityTab:          { flex: 1, paddingVertical: 13, alignItems: "center" },
  communityTabActive:    { borderBottomWidth: 2, borderBottomColor: C.orange },
  communityTabText:      { fontSize: 13, color: C.textSub, fontWeight: "600" },
  communityTabTextActive:{ color: C.orange },
  communityItem:         { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: 1, borderTopColor: C.border },
  communityItemFirst:    { borderTopWidth: 0 },
  communityItemTitle:    { fontSize: 13, fontWeight: "700", color: C.text, marginBottom: 3 },
  communityItemSub:      { fontSize: 11, color: C.textSub },
  communityDatePill:     { alignItems: "center", justifyContent: "center", minWidth: 52, backgroundColor: C.surfaceHigh, borderRadius: 10, padding: 8 },
  communityDateText:     { fontSize: 10, fontWeight: "700", color: C.orange, textAlign: "center" },
  communityTimeText:     { fontSize: 10, color: C.textSub, marginTop: 2, textAlign: "center" },
  communityEmpty:        { padding: 18, alignItems: "center", gap: 4 },
  storyAvatar:           { width: 36, height: 36, borderRadius: 18, backgroundColor: C.orangeDim, alignItems: "center", justifyContent: "center" },
  storyInitial:          { fontSize: 14, fontWeight: "700", color: C.orange },
  storyAchievement:      { fontSize: 11, color: C.orange, fontWeight: "600", marginBottom: 3 },
  storyQuote:            { fontSize: 12, color: C.textSub, lineHeight: 17, fontStyle: "italic" },

  // Achievement chips
  chipsScroll:    { paddingBottom: 24, gap: 8 },
  chip:           { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.surfaceHigh, borderRadius: 24, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: C.border },
  chipLocked:     { opacity: 0.4 },
  chipIcon:       { fontSize: 16 },
  chipLabel:      { fontSize: 13, color: C.text, fontWeight: "600" },
  chipLabelLocked:{ color: C.textMuted },
  chipProgress:   { fontSize: 10, color: C.textMuted, marginLeft: 2 },

  // Membership
  memberCard:      { padding: 18 },
  memberRow:       { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 },
  memberPlan:      { fontSize: 15, fontWeight: "700", color: C.text, marginBottom: 3, textTransform: "capitalize" },
  memberLeft:      { fontSize: 12, color: C.textSub },
  memberBadge:     { backgroundColor: "#0a2010", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(74,222,128,0.2)" },
  memberBadgeText: { fontSize: 11, color: C.green, fontWeight: "700" },
  memberWarning:   { fontSize: 12, color: "#f59e0b", lineHeight: 17, marginTop: 10, marginBottom: 4 },
  renewBtn:        { marginTop: 14, borderWidth: 1, borderColor: C.orange, borderRadius: 12, padding: 13, alignItems: "center" },
  renewBtnText:    { color: C.orange, fontWeight: "700", fontSize: 13 },

  orangeMid: "rgba(232,98,10,0.22)",
});

const orangeMid = "rgba(232,98,10,0.22)";
