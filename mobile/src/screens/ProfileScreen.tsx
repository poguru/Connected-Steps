import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Alert, Linking, ActivityIndicator,
} from "react-native";
import AsyncStorage            from "@react-native-async-storage/async-storage";
import { useNavigation }       from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets }   from "react-native-safe-area-context";
import { useUser }             from "../context/UserContext";
import {
  getMembership, getUserAchievements, getUserStats, getUserSessions,
} from "../services/api";
import { STORAGE_KEY_USER }    from "../config";
import type { Membership, UserAchievements, UserStats, UserSession } from "../types";
import type { RootStackParamList } from "../../App";
import ProgressBar             from "../components/ProgressBar";
import LevelBadge              from "../components/LevelBadge";
import { getLevelInfo, getNextTitle } from "../utils/xp";
import { computeStreaks, streakEmoji } from "../utils/streak";

type Nav = NativeStackNavigationProp<RootStackParamList>;

function daysLeft(expiresAt: string) {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 86400000));
}

function fmtDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

const BADGES = [
  { icon: "🏅", label: "First Session",  description: "Attended your first session",   target: 1  },
  { icon: "🏃", label: "5 Sessions",     description: "Attended 5 sessions",           target: 5  },
  { icon: "⭐", label: "10 Sessions",    description: "Attended 10 sessions",          target: 10 },
  { icon: "🔥", label: "25 Sessions",    description: "Attended 25 sessions",          target: 25 },
  { icon: "🏆", label: "50 Sessions",    description: "Community legend — 50 sessions",target: 50 },
  { icon: "💎", label: "Member",         description: "Active Connected Steps member", target: 0  },
];

function Row({ icon, label, value, onPress }: { icon: string; label: string; value?: string; onPress?: () => void }) {
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={S.row} onPress={onPress} activeOpacity={0.7}>
      <Text style={S.rowIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={S.rowLabel}>{label}</Text>
        {value ? <Text style={S.rowValue}>{value}</Text> : null}
      </View>
      {onPress ? <Text style={S.rowChevron}>›</Text> : null}
    </Wrap>
  );
}

export default function ProfileScreen() {
  const { user, setUser }                = useUser();
  const navigation                       = useNavigation<Nav>();
  const insets                           = useSafeAreaInsets();
  const [membership, setMembership]      = useState<Membership | null>(null);
  const [achieve,    setAchieve]         = useState<UserAchievements | null>(null);
  const [stats,      setStats]           = useState<UserStats | null>(null);
  const [history,    setHistory]         = useState<UserSession[]>([]);
  const [loading,    setLoading]         = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const results = await Promise.allSettled([
      getMembership(user.email),
      getUserAchievements(user.email),
      getUserStats(user.email),
      getUserSessions(user.email),
    ]);
    if (results[0].status === "fulfilled") setMembership(results[0].value);
    if (results[1].status === "fulfilled") setAchieve(results[1].value);
    if (results[2].status === "fulfilled") setStats(results[2].value);
    if (results[3].status === "fulfilled") setHistory(results[3].value as UserSession[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function handleSignOut() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out", style: "destructive",
        onPress: async () => {
          await AsyncStorage.removeItem(STORAGE_KEY_USER);
          setUser(null);
          navigation.replace("Login");
        },
      },
    ]);
  }

  if (!user) return null;

  const initials      = `${user.firstName.charAt(0)}${user.lastName.charAt(0) || ""}`.toUpperCase();
  const mem           = membership?.isActive ? membership : null;
  const sessionCount  = achieve?.sessionCount ?? 0;
  const hasMembership = achieve?.hasMembership ?? false;
  const rank          = achieve?.leaderboardRank;
  const totalXP       = stats?.total_xp  ?? (stats?.total_points ?? 0) * 5;
  const monthXP       = stats?.month_xp  ?? (stats?.month_points ?? 0) * 5;

  const levelInfo  = getLevelInfo(totalXP);
  const nextTitle  = getNextTitle(totalXP);
  const streaks    = computeStreaks(history);

  const earnedCount = BADGES.filter(b =>
    b.target === 0 ? hasMembership : sessionCount >= b.target
  ).length;

  // Journey: last 8 attended sessions, newest first
  const attended = history
    .filter(r => r.attended && r.sessions?.date)
    .sort((a, b) => new Date(b.sessions.date).getTime() - new Date(a.sessions.date).getTime())
    .slice(0, 8);

  return (
    <ScrollView style={S.root} contentContainerStyle={S.scroll} showsVerticalScrollIndicator={false}>

      {/* ── AVATAR HERO ──────────────────────────────────────────────────── */}
      <View style={[S.avatarSection, { paddingTop: Math.max(insets.top + 20, 36) }]}>
        <View style={S.avatarRing}>
          <View style={S.avatar}><Text style={S.avatarInitials}>{initials}</Text></View>
        </View>
        <Text style={S.fullName}>{user.firstName} {user.lastName}</Text>
        {!loading && <LevelBadge info={levelInfo} size="md" />}
        <Text style={S.levelTitle}>{levelInfo.title}</Text>
        <Text style={S.email}>{user.email}</Text>

        {loading ? (
          <ActivityIndicator color={C.orange} style={{ marginTop: 8 }} size="small" />
        ) : (
          <View style={S.profileStats}>
            <View style={S.profileStat}>
              <Text style={S.profileStatVal}>{sessionCount}</Text>
              <Text style={S.profileStatLabel}>Sessions</Text>
            </View>
            <View style={S.profileStatDivider} />
            <View style={S.profileStat}>
              <Text style={S.profileStatVal}>{totalXP.toLocaleString()}</Text>
              <Text style={S.profileStatLabel}>Total XP</Text>
            </View>
            <View style={S.profileStatDivider} />
            <View style={S.profileStat}>
              <Text style={S.profileStatVal}>{rank ? `#${rank}` : "—"}</Text>
              <Text style={S.profileStatLabel}>Rank</Text>
            </View>
          </View>
        )}

        {mem ? (
          <View style={S.memberBadge}>
            <Text style={S.memberBadgeText}>✓ Member · {daysLeft(mem.expires_at)} days left</Text>
          </View>
        ) : (
          <TouchableOpacity style={S.joinBadge} onPress={() => Linking.openURL("https://www.connectedsteps.in/pricing")}>
            <Text style={S.joinBadgeText}>Become a Member  →</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── LEVEL & XP ───────────────────────────────────────────────────── */}
      {!loading && (
        <View style={S.section}>
          <View style={S.sectionHeader}>
            <Text style={S.sectionLabel}>LEVEL & XP</Text>
            <Text style={S.sectionCount}>Level {levelInfo.level}/10</Text>
          </View>
          <View style={S.levelCard}>
            <View style={S.levelCardGlow} pointerEvents="none" />
            <View style={S.levelTop}>
              <View>
                <Text style={S.levelName}>{levelInfo.title}</Text>
                <Text style={S.levelSub}>Level {levelInfo.level}</Text>
              </View>
              <View style={S.xpBox}>
                <Text style={S.xpVal}>{totalXP.toLocaleString()}</Text>
                <Text style={S.xpLabel}>Total XP</Text>
              </View>
            </View>
            <ProgressBar progress={levelInfo.progress} height={8} delay={200} color={C.orange} radius={6} />
            <View style={S.levelBarRow}>
              <Text style={S.levelBarStart}>{levelInfo.levelXP} XP this level</Text>
              {levelInfo.isMax
                ? <Text style={S.levelBarEnd}>Max level 🏆</Text>
                : <Text style={S.levelBarEnd}>{levelInfo.xpToNext} XP to Level {levelInfo.level + 1}</Text>
              }
            </View>
            {!levelInfo.isMax && nextTitle && (
              <Text style={S.nextTitle}>Next: <Text style={{ color: C.orange }}>{nextTitle}</Text></Text>
            )}
            <View style={S.xpMonthRow}>
              <Text style={S.xpMonthLabel}>This month</Text>
              <Text style={S.xpMonthVal}>+{monthXP.toLocaleString()} XP</Text>
            </View>
          </View>
        </View>
      )}
      {loading && <View style={[S.section, { paddingTop: 24 }]}><View style={[S.levelCard, { height: 110, opacity: 0.2 }]} /></View>}

      {/* ── STREAK ───────────────────────────────────────────────────────── */}
      {!loading && streaks.sessions > 0 && (
        <View style={S.section}>
          <Text style={S.sectionLabel}>STREAK</Text>
          <View style={S.streakCard}>
            <View style={S.streakCardGlow} pointerEvents="none" />
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
                    <Text style={S.streakLabel}>{item.label}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
            <Text style={S.streakQuote}>
              {streaks.sessions >= 10
                ? "Elite consistency. You're unstoppable."
                : streaks.sessions >= 5
                ? "You're on fire. Keep showing up."
                : "Your streak is alive. Don't break it now."}
            </Text>
          </View>
        </View>
      )}

      {/* ── JOURNEY ──────────────────────────────────────────────────────── */}
      {!loading && (
        <View style={S.section}>
          <View style={S.sectionHeader}>
            <Text style={S.sectionLabel}>JOURNEY</Text>
            <Text style={S.sectionCount}>{sessionCount} sessions total</Text>
          </View>
          {attended.length === 0 ? (
            <View style={[S.card, S.emptyCard]}>
              <Text style={S.emptyIcon}>🏃</Text>
              <Text style={S.emptyTitle}>No sessions yet</Text>
              <Text style={S.emptyBody}>Attend your first session to start building your journey.</Text>
            </View>
          ) : (
            <View style={S.card}>
              {attended.map((r, i) => {
                const isLast = i === attended.length - 1;
                const xp = r.bonus_points ?? 25;
                return (
                  <View key={`${r.sessions.id}-${i}`} style={[S.journeyRow, !isLast && S.journeyRowBorder]}>
                    <View style={S.journeyLine}>
                      <View style={[S.journeyDot, i === 0 && S.journeyDotLatest]} />
                      {!isLast && <View style={S.journeyConnector} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={S.journeyTitle} numberOfLines={1}>{r.sessions.title}</Text>
                      <Text style={S.journeyDate}>{fmtDate(r.sessions.date)}</Text>
                      {r.sessions.venue ? <Text style={S.journeyVenue} numberOfLines={1}>📍 {r.sessions.venue}</Text> : null}
                    </View>
                    <View style={S.journeyXP}>
                      <Text style={S.journeyXPVal}>+{xp}</Text>
                      <Text style={S.journeyXPLabel}>XP</Text>
                    </View>
                  </View>
                );
              })}
              {sessionCount > 8 && (
                <View style={S.journeyMore}>
                  <Text style={S.journeyMoreText}>+{sessionCount - 8} more sessions in your history</Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* ── ACHIEVEMENTS ──────────────────────────────────────────────────── */}
      <View style={S.section}>
        <View style={S.sectionHeader}>
          <Text style={S.sectionLabel}>ACHIEVEMENTS</Text>
          <Text style={S.sectionCount}>{earnedCount}/{BADGES.length} earned</Text>
        </View>
        {loading ? (
          <View style={[S.card, { height: 80, opacity: 0.3 }]} />
        ) : (
          <View style={S.card}>
            {BADGES.map((badge, i) => {
              const earned   = badge.target === 0 ? hasMembership : sessionCount >= badge.target;
              const progress = badge.target === 0
                ? (hasMembership ? 1 : 0)
                : Math.min(sessionCount / badge.target, 1);
              const isLast   = i === BADGES.length - 1;

              return (
                <View key={badge.label} style={[S.badgeRow, !isLast && S.badgeRowBorder]}>
                  <View style={[S.badgeIcon, !earned && S.badgeIconLocked]}>
                    <Text style={S.badgeEmoji}>{earned ? badge.icon : "🔒"}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={S.badgeLabelRow}>
                      <Text style={[S.badgeLabel, !earned && S.badgeLabelLocked]}>{badge.label}</Text>
                      {earned && <View style={S.earnedPill}><Text style={S.earnedPillText}>Earned</Text></View>}
                    </View>
                    <Text style={S.badgeDesc} numberOfLines={1}>{badge.description}</Text>
                    {!earned && badge.target > 0 && (
                      <View style={{ marginTop: 7 }}>
                        <ProgressBar progress={progress} height={3} delay={i * 100} color={C.orange} />
                        <Text style={S.badgeProgressText}>{sessionCount}/{badge.target} sessions</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* ── PROFILE DETAILS ───────────────────────────────────────────────── */}
      <View style={S.section}>
        <Text style={S.sectionLabel}>PROFILE</Text>
        <View style={S.card}>
          {user.location ? <Row icon="📍" label="Location" value={user.location} /> : null}
          {user.phone    ? <Row icon="📱" label="Phone"    value={user.phone}    /> : null}
          {user.goal     ? <Row icon="🎯" label="Goal"     value={user.goal}     /> : null}
        </View>
      </View>

      {/* ── MEMBERSHIP ────────────────────────────────────────────────────── */}
      {!loading && (
        <View style={S.section}>
          <Text style={S.sectionLabel}>MEMBERSHIP</Text>
          <View style={S.card}>
            {mem ? (
              <>
                <Row icon="💳" label="Plan"    value={mem.plan} />
                <Row icon="📅" label="Expires" value={new Date(mem.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} />
                <Row icon="🔄" label="Renew Membership" onPress={() => Linking.openURL("https://www.connectedsteps.in/payments")} />
              </>
            ) : (
              <>
                <View style={S.membershipEmpty}>
                  <Text style={S.membershipEmptyText}>
                    Join to unlock your training plan, track sessions, and climb the leaderboard.
                  </Text>
                </View>
                <Row icon="🏃" label="View Membership Plans" onPress={() => Linking.openURL("https://www.connectedsteps.in/pricing")} />
              </>
            )}
          </View>
        </View>
      )}

      {/* ── ACCOUNT ───────────────────────────────────────────────────────── */}
      <View style={S.section}>
        <Text style={S.sectionLabel}>ACCOUNT</Text>
        <View style={S.card}>
          <Row icon="🌐" label="Open Dashboard"  onPress={() => Linking.openURL("https://www.connectedsteps.in/dashboard")} />
          <Row icon="✉️" label="Contact Us"      onPress={() => Linking.openURL("https://www.connectedsteps.in/contact")} />
          <Row icon="🔒" label="Privacy Policy"  onPress={() => Linking.openURL("https://www.connectedsteps.in/privacy")} />
        </View>
      </View>

      <View style={S.section}>
        <TouchableOpacity style={S.signOutBtn} onPress={handleSignOut} activeOpacity={0.85}>
          <Text style={S.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <Text style={S.version}>Connected Steps · v1.0</Text>
    </ScrollView>
  );
}

const C = {
  bg:       "#080808", surface: "#111111", border: "#222222",
  orange:   "#e8620a", orangeDim: "rgba(232,98,10,0.12)", orangeMid: "rgba(232,98,10,0.22)",
  white:    "#f5f5f5", text: "#f0f0f0", textSub: "#888888", textMuted: "#505050",
  green:    "#4ade80", greenDim: "rgba(74,222,128,0.12)",
};

const S = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 48 },

  // ── Avatar hero ──
  avatarSection: { alignItems: "center", paddingBottom: 28, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  avatarRing:    { width: 88, height: 88, borderRadius: 44, borderWidth: 2, borderColor: C.orange, padding: 3, marginBottom: 14 },
  avatar:        { flex: 1, borderRadius: 40, backgroundColor: C.orangeDim, alignItems: "center", justifyContent: "center" },
  avatarInitials:{ fontSize: 28, fontWeight: "800", color: C.orange },
  fullName:      { fontSize: 20, fontWeight: "700", color: C.white, letterSpacing: -0.3, marginBottom: 6 },
  levelTitle:    { fontSize: 12, color: C.textSub, marginTop: 6, marginBottom: 4 },
  email:         { fontSize: 12, color: C.textMuted, marginBottom: 16 },

  profileStats:      { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  profileStat:       { alignItems: "center", paddingHorizontal: 20 },
  profileStatVal:    { fontSize: 20, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  profileStatLabel:  { fontSize: 10, color: C.textSub, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 },
  profileStatDivider:{ width: 1, height: 32, backgroundColor: C.border },

  memberBadge:     { backgroundColor: C.greenDim, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(74,222,128,0.2)" },
  memberBadgeText: { fontSize: 12, color: C.green, fontWeight: "700" },
  joinBadge:       { backgroundColor: C.orangeDim, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(232,98,10,0.2)" },
  joinBadgeText:   { fontSize: 12, color: C.orange, fontWeight: "700" },

  section:       { paddingHorizontal: 16, paddingTop: 24 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingHorizontal: 4 },
  sectionLabel:  { fontSize: 11, fontWeight: "700", color: C.textMuted, letterSpacing: 0.8, textTransform: "uppercase" },
  sectionCount:  { fontSize: 11, color: C.orange, fontWeight: "700" },

  card: { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, overflow: "hidden" },

  // ── Level card ──
  levelCard:     { backgroundColor: "#130d07", borderRadius: 20, borderWidth: 1, borderColor: C.orangeMid, padding: 18, overflow: "hidden" },
  levelCardGlow: { position: "absolute", top: -50, right: -50, width: 160, height: 160, borderRadius: 80, backgroundColor: C.orange, opacity: 0.06 },
  levelTop:      { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 },
  levelName:     { fontSize: 17, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  levelSub:      { fontSize: 12, color: C.orange, marginTop: 3 },
  xpBox:         { alignItems: "flex-end" },
  xpVal:         { fontSize: 20, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  xpLabel:       { fontSize: 10, color: C.textSub, marginTop: 2 },
  levelBarRow:   { flexDirection: "row", justifyContent: "space-between", marginTop: 8, marginBottom: 4 },
  levelBarStart: { fontSize: 11, color: C.textMuted },
  levelBarEnd:   { fontSize: 11, color: C.orange },
  nextTitle:     { fontSize: 12, color: C.textSub, marginTop: 2 },
  xpMonthRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(232,98,10,0.15)" },
  xpMonthLabel:  { fontSize: 12, color: C.textMuted },
  xpMonthVal:    { fontSize: 13, fontWeight: "700", color: C.orange },

  // ── Streak card ──
  streakCard:     { backgroundColor: "#0a0d14", borderRadius: 18, borderWidth: 1, borderColor: "rgba(232,98,10,0.18)", padding: 18, overflow: "hidden" },
  streakCardGlow: { position: "absolute", bottom: -50, left: -50, width: 140, height: 140, borderRadius: 70, backgroundColor: C.orange, opacity: 0.04 },
  streakRow:      { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  streakItem:     { flex: 1, alignItems: "center", gap: 4 },
  streakNum:      { fontSize: 28, fontWeight: "800", color: C.orange, letterSpacing: -0.5 },
  streakEmoji:    { fontSize: 18 },
  streakLabel:    { fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  streakDivider:  { width: 1, height: 50, backgroundColor: "#1e1e1e" },
  streakQuote:    { fontSize: 12, color: C.orange, textAlign: "center", fontWeight: "600", fontStyle: "italic" },

  // ── Journey ──
  journeyRow:       { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, paddingVertical: 14 },
  journeyRowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  journeyLine:      { alignItems: "center", marginRight: 14, paddingTop: 2, width: 14 },
  journeyDot:       { width: 10, height: 10, borderRadius: 5, backgroundColor: C.textMuted, borderWidth: 1, borderColor: "#333" },
  journeyDotLatest: { backgroundColor: C.orange, borderColor: C.orange },
  journeyConnector: { width: 1, flex: 1, minHeight: 24, backgroundColor: "#2a2a2a", marginTop: 4 },
  journeyTitle:     { fontSize: 13, fontWeight: "700", color: C.text, marginBottom: 3 },
  journeyDate:      { fontSize: 11, color: C.textSub, marginBottom: 2 },
  journeyVenue:     { fontSize: 11, color: C.textMuted },
  journeyXP:        { alignItems: "flex-end", paddingTop: 2 },
  journeyXPVal:     { fontSize: 14, fontWeight: "800", color: C.orange, letterSpacing: -0.3 },
  journeyXPLabel:   { fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.4 },
  journeyMore:      { padding: 14, alignItems: "center", borderTopWidth: 1, borderTopColor: C.border },
  journeyMoreText:  { fontSize: 12, color: C.textMuted },

  // ── Empty ──
  emptyCard:  { padding: 24, alignItems: "center" },
  emptyIcon:  { fontSize: 32, marginBottom: 10 },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: C.text, marginBottom: 6, textAlign: "center" },
  emptyBody:  { fontSize: 13, color: C.textMuted, textAlign: "center", lineHeight: 19 },

  // ── Badges ──
  badgeRow:        { flexDirection: "row", alignItems: "flex-start", gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  badgeRowBorder:  { borderBottomWidth: 1, borderBottomColor: C.border },
  badgeIcon:       { width: 42, height: 42, borderRadius: 21, backgroundColor: C.orangeDim, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(232,98,10,0.2)" },
  badgeIconLocked: { backgroundColor: "#1a1a1a", borderColor: "#2a2a2a", opacity: 0.5 },
  badgeEmoji:      { fontSize: 20 },
  badgeLabelRow:   { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  badgeLabel:      { fontSize: 14, fontWeight: "700", color: C.text },
  badgeLabelLocked:{ color: C.textMuted },
  earnedPill:      { backgroundColor: C.greenDim, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: "rgba(74,222,128,0.2)" },
  earnedPillText:  { fontSize: 9, color: C.green, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  badgeDesc:       { fontSize: 12, color: C.textSub },
  badgeProgressText: { fontSize: 10, color: C.textMuted, marginTop: 4, textAlign: "right" },

  // ── Settings rows ──
  row:       { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: C.border },
  rowIcon:   { fontSize: 18, width: 24 },
  rowLabel:  { fontSize: 14, color: C.text, fontWeight: "500" },
  rowValue:  { fontSize: 12, color: C.textSub, marginTop: 2 },
  rowChevron:{ fontSize: 20, color: C.textMuted, marginLeft: "auto" as any },

  membershipEmpty:     { padding: 16, paddingBottom: 4 },
  membershipEmptyText: { fontSize: 13, color: C.textSub, lineHeight: 20 },

  signOutBtn:  { backgroundColor: "transparent", borderWidth: 1, borderColor: "#3a1010", borderRadius: 16, padding: 15, alignItems: "center" },
  signOutText: { color: "#e05555", fontWeight: "700", fontSize: 15 },
  version:     { fontSize: 11, color: C.textMuted, textAlign: "center", marginTop: 20, paddingBottom: 8 },

  orangeMid: "rgba(232,98,10,0.22)",
  greenDim:  "rgba(74,222,128,0.12)",
});
