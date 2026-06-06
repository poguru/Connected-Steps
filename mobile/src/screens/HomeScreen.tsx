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
  getTrainingPlan, getMembership, getUserSessions,
  getSessionPhotos, getActivityFeed,
} from "../services/api";
import type {
  UserStats, UserAchievements, Session,
  TrainingPlan, Membership, UserSession,
  SessionPhoto, FeedEvent,
} from "../types";
import type { TabParamList }         from "../navigation/TabNavigator";
import ProgressBar                   from "../components/ProgressBar";
import LevelBadge                    from "../components/LevelBadge";
import { getLevelInfo }              from "../utils/xp";
import { computeStreaks, streakEmoji } from "../utils/streak";

type Nav = BottomTabNavigationProp<TabParamList>;

// ── Constants ─────────────────────────────────────────────────────────────────
const MILESTONES = [
  { target: 1,  icon: "🏅", label: "First Session",  xpReward: 50   },
  { target: 5,  icon: "🏃", label: "5 Sessions",     xpReward: 100  },
  { target: 10, icon: "⭐", label: "10 Sessions",    xpReward: 200  },
  { target: 25, icon: "🔥", label: "25 Sessions",    xpReward: 500  },
  { target: 50, icon: "🏆", label: "50 Sessions",    xpReward: 1000 },
];

function fmtDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
function fmtTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
function daysLeft(exp: string) {
  return Math.max(0, Math.round((new Date(exp).getTime() - Date.now()) / 86400000));
}
function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7)  return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}
const todayIdx = () => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; };

// ── Feed copy ─────────────────────────────────────────────────────────────────
function feedCopy(ev: FeedEvent): string {
  if (ev.event_type === "session_attended") {
    return `attended ${ev.payload.session_title as string}`;
  }
  if (ev.event_type === "photo_uploaded") return "uploaded a photo";
  if (ev.event_type === "badge_earned")   return `earned the ${ev.payload.badge as string} badge`;
  return "was active";
}

function feedIcon(ev: FeedEvent): string {
  if (ev.event_type === "session_attended") return "🏃";
  if (ev.event_type === "photo_uploaded")   return "📸";
  if (ev.event_type === "badge_earned")     return "🏅";
  return "⚡";
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { user }       = useUser();
  const navigation     = useNavigation<Nav>();
  const insets         = useSafeAreaInsets();

  const [stats,      setStats]      = useState<UserStats | null>(null);
  const [achieve,    setAchieve]    = useState<UserAchievements | null>(null);
  const [sessions,   setSessions]   = useState<Session[]>([]);
  const [plan,       setPlan]       = useState<TrainingPlan | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [history,    setHistory]    = useState<UserSession[]>([]);
  const [photos,     setPhotos]     = useState<SessionPhoto[]>([]);
  const [feed,       setFeed]       = useState<FeedEvent[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    const R = await Promise.allSettled([
      getUserStats(user.email),
      getUserAchievements(user.email),
      getSessions(),
      getTrainingPlan(user.email),
      getMembership(user.email),
      getUserSessions(user.email),
      getActivityFeed(user.email),
    ]);
    if (R[0].status === "fulfilled") setStats(R[0].value);
    if (R[1].status === "fulfilled") setAchieve(R[1].value);
    if (R[2].status === "fulfilled") setSessions(R[2].value as Session[]);
    if (R[3].status === "fulfilled") setPlan(R[3].value);
    if (R[4].status === "fulfilled") setMembership(R[4].value);
    if (R[5].status === "fulfilled") setHistory(R[5].value as UserSession[]);
    if (R[6].status === "fulfilled") setFeed(R[6].value as FeedEvent[]);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Load photos for the last attended session
  const lastSession = history.filter(r => r.attended && r.sessions?.date).sort((a, b) => new Date(b.sessions.date).getTime() - new Date(a.sessions.date).getTime())[0] ?? null;

  useEffect(() => {
    if (lastSession?.sessions?.id) {
      getSessionPhotos(lastSession.sessions.id).then(setPhotos).catch(() => {});
    }
  }, [lastSession?.sessions?.id]);

  if (!user) return null;

  // ── Derived state ──────────────────────────────────────────────────────────
  const totalXP       = stats?.total_points ?? 0;
  const monthXP       = stats?.month_points ?? 0;
  const levelInfo     = getLevelInfo(totalXP);
  const streaks       = computeStreaks(history);
  const totalSessions = achieve?.sessionCount    ?? 0;
  const rank          = achieve?.leaderboardRank ?? null;
  const nextSession   = sessions[0] ?? null;

  const now         = new Date();
  const monthStart  = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthSessions = history.filter(r => r.attended && r.sessions?.date && new Date(r.sessions.date + "T00:00:00") >= monthStart).length;

  const todayDay    = plan?.days[todayIdx()] ?? null;
  const isRestDay   = todayDay?.type.toLowerCase().includes("rest") ?? false;
  const nextMilestone = MILESTONES.find(m => totalSessions < m.target);

  const mem     = membership?.isActive ? membership : null;
  const memLeft = mem ? daysLeft(mem.expires_at) : 0;

  const greeting = (() => {
    const h = now.getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <ScrollView
      style={S.root}
      contentContainerStyle={S.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.orange} />}
    >

      {/* ══════════════════════════════════════════════════════════════════
          1. HERO — compact, premium
      ══════════════════════════════════════════════════════════════════ */}
      <View style={[S.hero, { paddingTop: Math.max(insets.top + 14, 22) }]}>
        <View style={S.heroGlow} pointerEvents="none" />
        <View style={S.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={S.heroGreeting}>{greeting}</Text>
            <View style={S.heroNameRow}>
              <Text style={S.heroName}>{user.firstName}</Text>
              {!loading && <LevelBadge info={levelInfo} size="sm" />}
            </View>
            <View style={S.heroBadgeRow}>
              {!loading && streaks.sessions > 0 && (
                <View style={S.heroBadge}>
                  <Text style={S.heroBadgeText}>{streakEmoji(streaks.sessions)} {streaks.sessions} streak</Text>
                </View>
              )}
              {!loading && rank && (
                <View style={[S.heroBadge, S.heroBadgeRank]}>
                  <Text style={S.heroBadgeText}>#{rank} ranked</Text>
                </View>
              )}
            </View>
          </View>
          {user.photo ? (
            <Image source={{ uri: user.photo }} style={S.heroAvatar} />
          ) : (
            <View style={S.heroAvatarFallback}>
              <Text style={S.heroAvatarInitial}>{user.firstName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={S.body}>

        {/* ══════════════════════════════════════════════════════════════
            2. TODAY'S MISSION + NEXT SESSION — primary focus card
        ══════════════════════════════════════════════════════════════ */}
        {loading ? (
          <View style={[S.missionCard, { height: 180, opacity: 0.2 }]} />
        ) : (
          <View style={S.missionCard}>
            <View style={S.missionGlow} pointerEvents="none" />
            <View style={S.missionHeader}>
              <Text style={S.missionEyebrow}>TODAY'S MISSION</Text>
              {!isRestDay && <View style={S.xpPill}><Text style={S.xpPillText}>+XP on completion</Text></View>}
            </View>

            {/* Workout */}
            <View style={S.missionWorkout}>
              <Text style={S.missionEmoji}>{todayDay?.emoji ?? "🏃"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[S.missionType, isRestDay && { color: C.textMuted }]}>
                  {todayDay?.type ?? "No plan assigned"}
                </Text>
                {!isRestDay && todayDay?.detail
                  ? <Text style={S.missionDetail}>{todayDay.detail}</Text>
                  : isRestDay
                  ? <Text style={S.missionDetail}>Rest is training. Stretch for 10 min.</Text>
                  : <Text style={S.missionDetail}>Attend a session to get your plan.</Text>
                }
              </View>
            </View>

            {/* Next session */}
            {nextSession && (
              <View style={S.nextSessionRow}>
                <View style={S.nextSessionDivider} />
                <View style={S.nextSessionInfo}>
                  <View style={{ flex: 1 }}>
                    <Text style={S.nextSessionLabel}>NEXT SESSION</Text>
                    <Text style={S.nextSessionTitle} numberOfLines={1}>{nextSession.title}</Text>
                    <Text style={S.nextSessionMeta}>
                      📅 {fmtDate(nextSession.date)}{nextSession.time ? `  ⏰ ${fmtTime(nextSession.time)}` : ""}
                    </Text>
                    {nextSession.venue
                      ? <Text style={S.nextSessionMeta} numberOfLines={1}>📍 {nextSession.venue}</Text>
                      : null}
                  </View>
                </View>
              </View>
            )}

            {!isRestDay && (
              <TouchableOpacity style={S.missionCTA} onPress={() => navigation.navigate("Community")} activeOpacity={0.85}>
                <Text style={S.missionCTAText}>
                  {nextSession ? `Register: ${nextSession.title}  →` : "Browse Sessions  →"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════
            3. PROGRESS SNAPSHOT — XP + level + monthly all in one
        ══════════════════════════════════════════════════════════════ */}
        {!loading && (
          <TouchableOpacity style={S.progressCard} onPress={() => navigation.navigate("Leaderboard")} activeOpacity={0.9}>
            <View style={S.progressTop}>
              <View>
                <Text style={S.progressLevelTitle}>{levelInfo.title}</Text>
                <Text style={S.progressLevelSub}>Level {levelInfo.level}  ·  {totalXP.toLocaleString()} XP total</Text>
              </View>
              <View style={S.progressStatsCol}>
                <Text style={S.progressStatVal}>{monthXP}</Text>
                <Text style={S.progressStatLabel}>XP this month</Text>
              </View>
            </View>
            <ProgressBar progress={levelInfo.progress} height={6} delay={200} color={C.orange} radius={4} />
            <View style={S.progressFooter}>
              <Text style={S.progressFooterLeft}>{levelInfo.xpToNext > 0 ? `${levelInfo.xpToNext} XP to Level ${levelInfo.level + 1}` : "Max level 🏆"}</Text>
              <Text style={S.progressFooterRight}>🏃 {monthSessions} sessions this month</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ══════════════════════════════════════════════════════════════
            4. NEXT MILESTONE
        ══════════════════════════════════════════════════════════════ */}
        {!loading && nextMilestone && (
          <View style={S.milestoneCard}>
            <View style={S.milestoneLeft}>
              <Text style={S.milestoneEmoji}>{nextMilestone.icon}</Text>
              <View>
                <Text style={S.milestoneLabel}>{nextMilestone.label} Badge</Text>
                <Text style={S.milestoneReward}>Reward: +{nextMilestone.xpReward} XP</Text>
              </View>
            </View>
            <View style={S.milestoneRight}>
              <Text style={S.milestoneProgress}>{totalSessions}<Text style={S.milestoneDen}>/{nextMilestone.target}</Text></Text>
              <View style={{ width: 80 }}>
                <ProgressBar progress={totalSessions / nextMilestone.target} height={4} delay={400} color={C.gold} radius={3} />
              </View>
            </View>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════
            5. RECENT SESSION & MEMORIES
        ══════════════════════════════════════════════════════════════ */}
        {!loading && lastSession && (
          <>
            <View style={S.sectionRow}>
              <Text style={S.sectionLabel}>LAST SESSION</Text>
            </View>
            <View style={S.memoriesCard}>
              <View style={S.memoriesInfo}>
                <View style={{ flex: 1 }}>
                  <Text style={S.memoriesTitle} numberOfLines={1}>{lastSession.sessions.title}</Text>
                  <Text style={S.memoriesMeta}>{fmtDate(lastSession.sessions.date)}</Text>
                  {lastSession.sessions.venue
                    ? <Text style={S.memoriesMeta} numberOfLines={1}>📍 {lastSession.sessions.venue}</Text>
                    : null}
                </View>
                <View style={S.memoriesAttended}>
                  <Text style={S.memoriesAttendedText}>✓ Attended</Text>
                </View>
              </View>

              {/* Photo carousel */}
              {photos.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.photoScroll} contentContainerStyle={S.photoScrollContent}>
                  {photos.map(p => (
                    <View key={p.id} style={S.photoThumb}>
                      <Image source={{ uri: p.photo_url }} style={S.photoThumbImg} />
                      {p.likes > 0 && (
                        <View style={S.photoLikes}>
                          <Text style={S.photoLikesText}>❤️ {p.likes}</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <View style={S.photoEmpty}>
                  <Text style={S.photoEmptyText}>📸 No photos yet — be the first to upload!</Text>
                </View>
              )}

              <View style={S.memoriesActions}>
                <TouchableOpacity style={S.memoriesBtn} onPress={() => navigation.navigate("Community")}>
                  <Text style={S.memoriesBtnText}>📸  Upload Photo</Text>
                </TouchableOpacity>
                {photos.length > 0 && (
                  <Text style={S.photoCount}>{photos.length} photo{photos.length !== 1 ? "s" : ""}</Text>
                )}
              </View>
            </View>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            6. FOLLOWING FEED
        ══════════════════════════════════════════════════════════════ */}
        {!loading && (
          <>
            <View style={S.sectionRow}>
              <Text style={S.sectionLabel}>FOLLOWING</Text>
              <TouchableOpacity onPress={() => navigation.navigate("Community")}>
                <Text style={S.sectionAction}>View Feed →</Text>
              </TouchableOpacity>
            </View>
            {feed.length === 0 ? (
              <View style={S.feedEmpty}>
                <Text style={S.feedEmptyText}>Follow other runners to see their activity here.</Text>
              </View>
            ) : (
              <View style={S.feedCard}>
                {feed.slice(0, 5).map((ev, i) => (
                  <View key={ev.id} style={[S.feedItem, i > 0 && S.feedItemBorder]}>
                    <View style={S.feedAvatar}>
                      <Text style={S.feedAvatarText}>{ev.actor_name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={S.feedText}>
                        <Text style={S.feedName}>{ev.actor_name.split(" ")[0]}</Text>
                        {"  "}{feedCopy(ev)}
                      </Text>
                      <Text style={S.feedTime}>{timeAgo(ev.created_at)}</Text>
                    </View>
                    <Text style={S.feedEventIcon}>{feedIcon(ev)}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            MEMBERSHIP ALERT — only if expires ≤ 10 days
        ══════════════════════════════════════════════════════════════ */}
        {!loading && mem && memLeft <= 10 && (
          <TouchableOpacity
            style={S.renewAlert}
            onPress={() => Linking.openURL("https://www.connectedsteps.in/payments")}
            activeOpacity={0.88}
          >
            <Text style={S.renewAlertIcon}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={S.renewAlertTitle}>Membership expires in {memLeft} day{memLeft !== 1 ? "s" : ""}</Text>
              <Text style={S.renewAlertSub}>Renew to keep your XP, streak & ranking.</Text>
            </View>
            <Text style={S.renewAlertCTA}>Renew →</Text>
          </TouchableOpacity>
        )}

      </View>
    </ScrollView>
  );
}

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  bg:       "#080808",
  heroBg:   "#0b0804",
  surface:  "#111111",
  border:   "#1e1e1e",
  orange:   "#e8620a",
  orangeDim:"rgba(232,98,10,0.10)",
  orangeMid:"rgba(232,98,10,0.20)",
  white:    "#f5f5f5",
  text:     "#f0f0f0",
  textSub:  "#888888",
  textMuted:"#505050",
  gold:     "#f59e0b",
  green:    "#4ade80",
};

const S = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 48 },

  // ── Hero ──
  hero:              { backgroundColor: C.heroBg, paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: "#160e04", overflow: "hidden" },
  heroGlow:          { position: "absolute", top: -60, right: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: C.orange, opacity: 0.06 },
  heroTop:           { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  heroGreeting:      { fontSize: 12, color: C.textMuted, marginBottom: 4 },
  heroNameRow:       { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  heroName:          { fontSize: 26, fontWeight: "800", color: C.white, letterSpacing: -0.5 },
  heroBadgeRow:      { flexDirection: "row", gap: 6 },
  heroBadge:         { backgroundColor: C.orangeDim, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: C.orangeMid },
  heroBadgeRank:     { backgroundColor: "rgba(245,158,11,0.1)", borderColor: "rgba(245,158,11,0.25)" },
  heroBadgeText:     { fontSize: 11, color: C.orange, fontWeight: "700" },
  heroAvatar:        { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: C.orange },
  heroAvatarFallback:{ width: 48, height: 48, borderRadius: 24, backgroundColor: C.orangeDim, borderWidth: 2, borderColor: C.orange, alignItems: "center", justifyContent: "center" },
  heroAvatarInitial: { fontSize: 20, fontWeight: "700", color: C.orange },

  body: { paddingHorizontal: 16, paddingTop: 20, gap: 16 },

  // ── Section row ──
  sectionRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: -4 },
  sectionLabel:  { fontSize: 10, fontWeight: "700", color: C.textMuted, letterSpacing: 1, textTransform: "uppercase" },
  sectionAction: { fontSize: 12, color: C.orange, fontWeight: "600" },

  // ── Mission card ──
  missionCard:    { backgroundColor: "#130e07", borderRadius: 22, borderWidth: 1, borderColor: C.orangeMid, padding: 20, overflow: "hidden" },
  missionGlow:    { position: "absolute", top: -40, right: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: C.orange, opacity: 0.07 },
  missionHeader:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  missionEyebrow: { fontSize: 10, fontWeight: "800", color: C.orange, letterSpacing: 1.2, textTransform: "uppercase" },
  xpPill:         { backgroundColor: C.orangeDim, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: C.orangeMid },
  xpPillText:     { fontSize: 10, color: C.orange, fontWeight: "700" },
  missionWorkout: { flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 16 },
  missionEmoji:   { fontSize: 38 },
  missionType:    { fontSize: 20, fontWeight: "800", color: C.white, letterSpacing: -0.3, marginBottom: 4 },
  missionDetail:  { fontSize: 13, color: C.textSub, lineHeight: 19 },
  nextSessionRow:  { marginBottom: 16 },
  nextSessionDivider: { height: 1, backgroundColor: "rgba(232,98,10,0.15)", marginBottom: 14 },
  nextSessionInfo: { flexDirection: "row" },
  nextSessionLabel:{ fontSize: 9, fontWeight: "700", color: C.orange, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  nextSessionTitle:{ fontSize: 15, fontWeight: "700", color: C.white, marginBottom: 4 },
  nextSessionMeta: { fontSize: 12, color: C.textSub, marginBottom: 2 },
  missionCTA:     { backgroundColor: C.orange, borderRadius: 14, padding: 14, alignItems: "center" },
  missionCTAText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  // ── Progress snapshot ──
  progressCard:      { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16 },
  progressTop:       { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 },
  progressLevelTitle:{ fontSize: 16, fontWeight: "800", color: C.white },
  progressLevelSub:  { fontSize: 11, color: C.textSub, marginTop: 3 },
  progressStatsCol:  { alignItems: "flex-end" },
  progressStatVal:   { fontSize: 18, fontWeight: "800", color: C.orange, letterSpacing: -0.3 },
  progressStatLabel: { fontSize: 10, color: C.textMuted, marginTop: 2 },
  progressFooter:    { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  progressFooterLeft:{ fontSize: 11, color: C.orange },
  progressFooterRight:{ fontSize: 11, color: C.textMuted },

  // ── Milestone ──
  milestoneCard:    { backgroundColor: "#0c0a02", borderRadius: 16, borderWidth: 1, borderColor: "rgba(245,158,11,0.2)", padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  milestoneLeft:    { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  milestoneEmoji:   { fontSize: 30 },
  milestoneLabel:   { fontSize: 14, fontWeight: "700", color: C.white },
  milestoneReward:  { fontSize: 11, color: C.gold, marginTop: 2 },
  milestoneRight:   { alignItems: "flex-end", gap: 6 },
  milestoneProgress:{ fontSize: 18, fontWeight: "800", color: C.gold, letterSpacing: -0.3 },
  milestoneDen:     { fontSize: 12, color: C.textMuted, fontWeight: "400" },

  // ── Memories ──
  memoriesCard:    { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, overflow: "hidden" },
  memoriesInfo:    { flexDirection: "row", alignItems: "flex-start", padding: 16, paddingBottom: 12, gap: 12 },
  memoriesTitle:   { fontSize: 14, fontWeight: "700", color: C.text, marginBottom: 4 },
  memoriesMeta:    { fontSize: 11, color: C.textSub, marginBottom: 2 },
  memoriesAttended:{ backgroundColor: "rgba(74,222,128,0.1)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(74,222,128,0.2)" },
  memoriesAttendedText: { fontSize: 11, color: C.green, fontWeight: "700" },
  photoScroll:      { marginBottom: 4 },
  photoScrollContent:{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  photoThumb:       { width: 90, height: 90, borderRadius: 12, overflow: "hidden", backgroundColor: "#1a1a1a" },
  photoThumbImg:    { width: 90, height: 90 },
  photoLikes:       { position: "absolute", bottom: 4, right: 4, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2 },
  photoLikesText:   { fontSize: 10, color: "#fff" },
  photoEmpty:       { marginHorizontal: 16, marginBottom: 12, backgroundColor: "#0d0d0d", borderRadius: 10, padding: 14, alignItems: "center" },
  photoEmptyText:   { fontSize: 12, color: C.textMuted },
  memoriesActions:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14 },
  memoriesBtn:      { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  memoriesBtnText:  { fontSize: 12, color: C.textSub, fontWeight: "600" },
  photoCount:       { fontSize: 11, color: C.textMuted },

  // ── Feed ──
  feedEmpty:    { padding: 16, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, alignItems: "center" },
  feedEmptyText:{ fontSize: 13, color: C.textMuted, textAlign: "center" },
  feedCard:     { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, overflow: "hidden" },
  feedItem:     { flexDirection: "row", alignItems: "center", padding: 14, gap: 10 },
  feedItemBorder:{ borderTopWidth: 1, borderTopColor: C.border },
  feedAvatar:   { width: 34, height: 34, borderRadius: 17, backgroundColor: C.orangeDim, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.orangeMid },
  feedAvatarText:{ fontSize: 13, fontWeight: "800", color: C.orange },
  feedText:     { fontSize: 13, color: C.textSub, lineHeight: 18 },
  feedName:     { fontWeight: "700", color: C.text },
  feedTime:     { fontSize: 10, color: C.textMuted, marginTop: 2 },
  feedEventIcon:{ fontSize: 18 },

  // ── Membership alert ──
  renewAlert:     { backgroundColor: "#130808", borderRadius: 14, borderWidth: 1, borderColor: "rgba(220,50,50,0.3)", padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  renewAlertIcon: { fontSize: 20 },
  renewAlertTitle:{ fontSize: 13, fontWeight: "700", color: "#f87171" },
  renewAlertSub:  { fontSize: 11, color: C.textMuted, marginTop: 2 },
  renewAlertCTA:  { fontSize: 13, color: "#f87171", fontWeight: "700" },
});
