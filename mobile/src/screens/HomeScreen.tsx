import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Image, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation }    from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useUser }           from "../context/UserContext";
import {
  getUserStats, getUserAchievements, getSessions,
  getTrainingPlan, getMembership, getStories,
} from "../services/api";
import type {
  UserStats, UserAchievements, Session,
  TrainingPlan, Membership, Story,
} from "../types";
import type { TabParamList } from "../navigation/TabNavigator";

type Nav = BottomTabNavigationProp<TabParamList>;

const DAY_NAMES  = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// getDay() returns 0=Sun..6=Sat — map to 0=Mon..6=Sun
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

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={S.sectionRow}>
      <Text style={S.sectionLabel}>{title}</Text>
      {action ? (
        <TouchableOpacity onPress={onAction}>
          <Text style={S.sectionAction}>{action}</Text>
        </TouchableOpacity>
      ) : null}
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

// ── Main screen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { user }                          = useUser();
  const navigation                        = useNavigation<Nav>();
  const insets                            = useSafeAreaInsets();
  const [stats,      setStats]            = useState<UserStats | null>(null);
  const [achieve,    setAchieve]          = useState<UserAchievements | null>(null);
  const [nextSession, setNextSession]     = useState<Session | null>(null);
  const [plan,       setPlan]             = useState<TrainingPlan | null>(null);
  const [membership, setMembership]       = useState<Membership | null>(null);
  const [stories,    setStories]          = useState<Story[]>([]);
  const [loading,    setLoading]          = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [planExpanded, setPlanExpanded]   = useState(false);
  const [communityTab, setCommunityTab]   = useState<"sessions" | "stories">("sessions");
  const [sessions,   setSessions]         = useState<Session[]>([]);

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

  const todayPlanIdx = todayIdx();
  const completedDays = plan
    ? plan.days.filter((d) => d.type.toLowerCase() !== "rest").length
    : 0;

  // ── Achievements chips ────────────────────────────────────────────────────
  const count = achieve?.sessionCount ?? 0;
  const CHIPS = [
    { icon: "🏅", label: "First Session",  earned: count >= 1  },
    { icon: "🏃", label: "5 Sessions",     earned: count >= 5  },
    { icon: "⭐", label: "10 Sessions",    earned: count >= 10 },
    { icon: "🔥", label: "25 Sessions",    earned: count >= 25 },
    { icon: "🏆", label: "50 Sessions",    earned: count >= 50 },
    { icon: "💎", label: "Member",         earned: achieve?.hasMembership ?? false },
  ];

  // ── Membership ────────────────────────────────────────────────────────────
  const mem = membership?.isActive ? membership : null;
  const left     = mem ? daysLeft(mem.expires_at) : 0;
  const duration = mem ? planDuration(mem.started_at, mem.expires_at) : 1;
  const progress = mem ? Math.max(0.02, Math.min(1, 1 - left / duration)) : 0;

  return (
    <ScrollView
      style={S.root}
      contentContainerStyle={S.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(true); }}
          tintColor={C.orange}
        />
      }
    >
      {/* ── SECTION 1: HERO ─────────────────────────────────────────────── */}
      <View style={[S.hero, { paddingTop: Math.max(insets.top + 12, 20) }]}>
        {/* Warm glow accent */}
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
            <StatBadge icon="🏃" value={achieve?.sessionCount ?? 0}            label="Sessions" />
            <View style={S.badgeDivider} />
            <StatBadge icon="🏆" value={stats?.month_points ?? 0}              label="This Month" />
            <View style={S.badgeDivider} />
            <StatBadge icon="🎯" value={achieve?.leaderboardRank ? `#${achieve.leaderboardRank}` : "—"} label="Rank" />
          </View>
        )}
      </View>

      <View style={S.body}>

        {/* ── SECTION 2: NEXT SESSION ────────────────────────────────────── */}
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
                  {nextSession.time ? <Text style={S.metaDot}>·</Text> : null}
                  {nextSession.time ? <Text style={S.metaText}>⏰ {fmtTime(nextSession.time)}</Text> : null}
                </View>
                {nextSession.venue ? (
                  <Text style={S.metaText} numberOfLines={1}>📍 {nextSession.venue}</Text>
                ) : null}
              </View>
              <View style={S.featuredBadge}>
                <Text style={S.featuredBadgeText}>Upcoming</Text>
              </View>
            </View>
            <TouchableOpacity
              style={S.featuredBtn}
              activeOpacity={0.82}
              onPress={() => navigation.navigate("Community")}
            >
              <Text style={S.featuredBtnText}>View Session  →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[S.card, S.emptyCard]}>
            <Text style={S.emptyText}>No upcoming sessions right now.</Text>
          </View>
        )}

        {/* ── SECTION 3: TRAINING PLAN ───────────────────────────────────── */}
        <SectionLabel title="TRAINING PLAN" action="Full Plan" onAction={() => navigation.navigate("Training")} />
        {!loading && (
          plan ? (
            <View style={S.card}>
              <TouchableOpacity
                style={S.planHeader}
                onPress={() => setPlanExpanded(e => !e)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={S.planTitle}>{plan.title}</Text>
                  {plan.coach_name ? (
                    <Text style={S.planCoach}>by {plan.coach_name}</Text>
                  ) : null}
                </View>
                <View style={S.planProgress}>
                  <Text style={S.planProgressText}>{completedDays}/7</Text>
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
                        <Text style={[S.dayName, isToday && S.dayNameToday]}>
                          {DAY_NAMES[i]}
                        </Text>
                        <Text style={S.dayEmoji}>{day.emoji}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[S.dayType, isRest && S.dayTypeRest, isToday && S.dayTypeToday]}>
                            {day.type}
                          </Text>
                          {!isRest && day.detail ? (
                            <Text style={S.dayDetail} numberOfLines={1}>{day.detail}</Text>
                          ) : null}
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
              <Text style={S.emptyText}>No training plan assigned yet.</Text>
            </View>
          )
        )}
        {loading && <View style={[S.card, S.skeletonCard]} />}

        {/* ── SECTION 4: PROGRESS SNAPSHOT ──────────────────────────────── */}
        <SectionLabel title="PROGRESS" />
        <View style={S.grid}>
          <View style={[S.gridCell, S.gridCellHighlight]}>
            <Text style={S.gridVal}>{loading ? "—" : (stats?.month_points ?? 0)}</Text>
            <Text style={S.gridLabel}>Month Points</Text>
          </View>
          <View style={S.gridCell}>
            <Text style={S.gridVal}>{loading ? "—" : (stats?.total_points ?? 0)}</Text>
            <Text style={S.gridLabel}>All-Time Points</Text>
          </View>
          <View style={S.gridCell}>
            <Text style={S.gridVal}>
              {loading ? "—" : (achieve?.leaderboardRank ? `#${achieve.leaderboardRank}` : "—")}
            </Text>
            <Text style={S.gridLabel}>Leaderboard Rank</Text>
          </View>
          <View style={[S.gridCell, S.gridCellLast]}>
            <Text style={S.gridVal}>{loading ? "—" : (achieve?.sessionCount ?? 0)}</Text>
            <Text style={S.gridLabel}>Total Sessions</Text>
          </View>
        </View>

        {/* ── SECTION 5: COMMUNITY ACTIVITY ─────────────────────────────── */}
        <SectionLabel title="COMMUNITY" action="See all" onAction={() => navigation.navigate("Community")} />
        <View style={S.card}>
          {/* Tab switcher */}
          <View style={S.communityTabs}>
            <TouchableOpacity
              style={[S.communityTab, communityTab === "sessions" && S.communityTabActive]}
              onPress={() => setCommunityTab("sessions")}
            >
              <Text style={[S.communityTabText, communityTab === "sessions" && S.communityTabTextActive]}>
                Sessions
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.communityTab, communityTab === "stories" && S.communityTabActive]}
              onPress={() => setCommunityTab("stories")}
            >
              <Text style={[S.communityTabText, communityTab === "stories" && S.communityTabTextActive]}>
                Stories
              </Text>
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
            ) : <Text style={[S.emptyText, { padding: 16 }]}>No upcoming sessions.</Text>
          ) : (
            stories.slice(0, 2).length > 0 ? (
              stories.slice(0, 2).map((s, i) => (
                <View key={s.id} style={[S.communityItem, i === 0 && S.communityItemFirst]}>
                  <View style={S.storyAvatar}>
                    <Text style={S.storyInitial}>{s.user_name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.communityItemTitle} numberOfLines={1}>{s.user_name}</Text>
                    <Text style={S.storyAchievement} numberOfLines={1}>{s.achievement}</Text>
                    <Text style={S.storyQuote} numberOfLines={2}>"{s.quote}"</Text>
                  </View>
                </View>
              ))
            ) : <Text style={[S.emptyText, { padding: 16 }]}>No stories yet.</Text>
          )}
        </View>

        {/* ── SECTION 6: ACHIEVEMENTS ────────────────────────────────────── */}
        <SectionLabel title="ACHIEVEMENTS" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.chipsScroll}>
          {CHIPS.map((chip) => (
            <View key={chip.label} style={[S.chip, !chip.earned && S.chipLocked]}>
              <Text style={[S.chipIcon, !chip.earned && S.chipIconLocked]}>{chip.earned ? chip.icon : "🔒"}</Text>
              <Text style={[S.chipLabel, !chip.earned && S.chipLabelLocked]}>{chip.label}</Text>
            </View>
          ))}
        </ScrollView>

        {/* ── SECTION 7: MEMBERSHIP ──────────────────────────────────────── */}
        {!loading && (
          <View style={{ marginTop: 8 }}>
            <SectionLabel title="MEMBERSHIP" />
            {mem ? (
              <View style={[S.card, S.memberCard]}>
                <View style={S.memberRow}>
                  <View>
                    <Text style={S.memberPlan}>{mem.plan}</Text>
                    <Text style={S.memberLeft}>{left} days left</Text>
                  </View>
                  <View style={S.memberBadge}>
                    <Text style={S.memberBadgeText}>Active</Text>
                  </View>
                </View>
                <View style={S.memberBarBg}>
                  <View style={[S.memberBarFill, { width: `${Math.round(progress * 100)}%` }]} />
                </View>
                <TouchableOpacity
                  style={S.renewBtn}
                  onPress={() => Linking.openURL("https://www.connectedsteps.in/payments")}
                >
                  <Text style={S.renewBtnText}>Renew Membership  →</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[S.card, S.memberCard]}>
                <Text style={S.memberPlan}>No active membership</Text>
                <TouchableOpacity
                  style={[S.renewBtn, { marginTop: 12 }]}
                  onPress={() => Linking.openURL("https://www.connectedsteps.in/pricing")}
                >
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

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:          "#080808",
  heroBg:      "#0f0a05",
  surface:     "#111111",
  surfaceHigh: "#181818",
  border:      "#222222",
  borderSub:   "#1a1a1a",
  orange:      "#e8620a",
  orangeDim:   "rgba(232,98,10,0.12)",
  orangeMid:   "rgba(232,98,10,0.22)",
  white:       "#f5f5f5",
  text:        "#f0f0f0",
  textSub:     "#888888",
  textMuted:   "#505050",
  green:       "#4ade80",
  gold:        "#f59e0b",
};

const S = StyleSheet.create({
  root:  { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 48 },

  // Hero
  hero:             { backgroundColor: C.heroBg, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: "#1a1205", overflow: "hidden" },
  heroGlow:         { position: "absolute", top: -80, right: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: C.orange, opacity: 0.05 },
  heroTop:          { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 },
  heroGreeting:     { fontSize: 14, color: C.textSub, fontWeight: "500", marginBottom: 2 },
  heroName:         { fontSize: 26, fontWeight: "800", color: C.white, letterSpacing: -0.4 },
  heroAvatar:       { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: C.orange },
  heroAvatarFallback:{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.orangeDim, borderWidth: 2, borderColor: C.orange, alignItems: "center", justifyContent: "center" },
  heroAvatarInitial: { fontSize: 18, fontWeight: "700", color: C.orange },
  heroBadges:       { flexDirection: "row", alignItems: "center" },
  statBadge:        { flex: 1, alignItems: "center" },
  statIcon:         { fontSize: 18, marginBottom: 4 },
  statValue:        { fontSize: 20, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  statLabel:        { fontSize: 10, color: C.textSub, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.4 },
  badgeDivider:     { width: 1, height: 36, backgroundColor: "#1e1e1e", marginHorizontal: 4 },

  // Body wrapper
  body: { paddingHorizontal: 16, paddingTop: 24 },

  // Section labels
  sectionRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionLabel:  { fontSize: 11, fontWeight: "700", color: C.textMuted, letterSpacing: 0.8, textTransform: "uppercase" },
  sectionAction: { fontSize: 12, color: C.orange, fontWeight: "600" },

  // Cards
  card:         { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.border, marginBottom: 24, overflow: "hidden" },
  skeletonCard: { height: 110, opacity: 0.4 },
  emptyCard:    { padding: 20 },
  emptyText:    { fontSize: 13, color: C.textMuted, textAlign: "center" },

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

  // Progress 2x2 grid
  grid:         { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  gridCell:     { flex: 1, minWidth: "45%", backgroundColor: C.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: C.border },
  gridCellHighlight: { borderColor: C.orangeMid, backgroundColor: "#130d07" },
  gridCellLast: {},
  gridVal:      { fontSize: 26, fontWeight: "800", color: C.white, letterSpacing: -0.5, marginBottom: 4 },
  gridLabel:    { fontSize: 11, color: C.textSub, textTransform: "uppercase", letterSpacing: 0.4 },

  // Community card
  communityTabs:      { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border },
  communityTab:       { flex: 1, paddingVertical: 13, alignItems: "center" },
  communityTabActive: { borderBottomWidth: 2, borderBottomColor: C.orange },
  communityTabText:   { fontSize: 13, color: C.textSub, fontWeight: "600" },
  communityTabTextActive: { color: C.orange },
  communityItem:      { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: 1, borderTopColor: C.border },
  communityItemFirst: { borderTopWidth: 0 },
  communityItemTitle: { fontSize: 13, fontWeight: "700", color: C.text, marginBottom: 3 },
  communityItemSub:   { fontSize: 11, color: C.textSub },
  communityDatePill:  { alignItems: "center", justifyContent: "center", minWidth: 52, backgroundColor: C.surfaceHigh, borderRadius: 10, padding: 8 },
  communityDateText:  { fontSize: 10, fontWeight: "700", color: C.orange, textAlign: "center" },
  communityTimeText:  { fontSize: 10, color: C.textSub, marginTop: 2, textAlign: "center" },
  storyAvatar:        { width: 36, height: 36, borderRadius: 18, backgroundColor: C.orangeDim, alignItems: "center", justifyContent: "center" },
  storyInitial:       { fontSize: 14, fontWeight: "700", color: C.orange },
  storyAchievement:   { fontSize: 11, color: C.orange, fontWeight: "600", marginBottom: 3 },
  storyQuote:         { fontSize: 12, color: C.textSub, lineHeight: 17, fontStyle: "italic" },

  // Achievement chips
  chipsScroll: { paddingBottom: 24, gap: 8 },
  chip:        { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.surfaceHigh, borderRadius: 24, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: C.border },
  chipLocked:  { opacity: 0.4 },
  chipIcon:    { fontSize: 16 },
  chipIconLocked: {},
  chipLabel:   { fontSize: 13, color: C.text, fontWeight: "600" },
  chipLabelLocked: { color: C.textMuted },

  // Membership
  memberCard:    { padding: 18 },
  memberRow:     { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 },
  memberPlan:    { fontSize: 15, fontWeight: "700", color: C.text, marginBottom: 3, textTransform: "capitalize" },
  memberLeft:    { fontSize: 12, color: C.textSub },
  memberBadge:   { backgroundColor: "#0a2010", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(74,222,128,0.2)" },
  memberBadgeText: { fontSize: 11, color: C.green, fontWeight: "700" },
  memberBarBg:   { height: 5, backgroundColor: C.border, borderRadius: 4, marginBottom: 16, overflow: "hidden" },
  memberBarFill: { height: "100%", backgroundColor: C.green, borderRadius: 4 },
  renewBtn:      { backgroundColor: "transparent", borderWidth: 1, borderColor: C.orange, borderRadius: 12, padding: 13, alignItems: "center" },
  renewBtnText:  { color: C.orange, fontWeight: "700", fontSize: 13 },

  // Orange mid used in featuredCard/gridCell
  orangeMid: C.orangeMid,
});

const orangeMid = "rgba(232,98,10,0.22)";
