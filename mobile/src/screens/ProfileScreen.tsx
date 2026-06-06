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
import { getMembership, getUserAchievements } from "../services/api";
import { STORAGE_KEY_USER }    from "../config";
import type { Membership, UserAchievements } from "../types";
import type { RootStackParamList } from "../../App";
import ProgressBar             from "../components/ProgressBar";

type Nav = NativeStackNavigationProp<RootStackParamList>;

function daysLeft(expiresAt: string) {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 86400000));
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
  const [loading,    setLoading]         = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const [mem, ach] = await Promise.allSettled([getMembership(user.email), getUserAchievements(user.email)]);
    if (mem.status === "fulfilled") setMembership(mem.value);
    if (ach.status === "fulfilled") setAchieve(ach.value);
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

  const initials     = `${user.firstName.charAt(0)}${user.lastName.charAt(0) || ""}`.toUpperCase();
  const mem          = membership?.isActive ? membership : null;
  const sessionCount = achieve?.sessionCount ?? 0;
  const hasMembership= achieve?.hasMembership ?? false;
  const rank         = achieve?.leaderboardRank;

  const earnedCount  = BADGES.filter(b =>
    b.target === 0 ? hasMembership : sessionCount >= b.target
  ).length;

  return (
    <ScrollView style={S.root} contentContainerStyle={S.scroll} showsVerticalScrollIndicator={false}>

      {/* Avatar block */}
      <View style={[S.avatarSection, { paddingTop: Math.max(insets.top + 20, 36) }]}>
        <View style={S.avatarRing}>
          <View style={S.avatar}><Text style={S.avatarInitials}>{initials}</Text></View>
        </View>
        <Text style={S.fullName}>{user.firstName} {user.lastName}</Text>
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
              <Text style={S.profileStatVal}>{rank ? `#${rank}` : "—"}</Text>
              <Text style={S.profileStatLabel}>Rank</Text>
            </View>
            <View style={S.profileStatDivider} />
            <View style={S.profileStat}>
              <Text style={S.profileStatVal}>{earnedCount}</Text>
              <Text style={S.profileStatLabel}>Badges</Text>
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
  orange:   "#e8620a", orangeDim: "rgba(232,98,10,0.12)",
  white:    "#f5f5f5", text: "#f0f0f0", textSub: "#888888", textMuted: "#505050",
  green:    "#4ade80", greenDim: "rgba(74,222,128,0.12)",
};

const S = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 48 },

  avatarSection: { alignItems: "center", paddingBottom: 28, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  avatarRing:    { width: 88, height: 88, borderRadius: 44, borderWidth: 2, borderColor: C.orange, padding: 3, marginBottom: 14 },
  avatar:        { flex: 1, borderRadius: 40, backgroundColor: C.orangeDim, alignItems: "center", justifyContent: "center" },
  avatarInitials:{ fontSize: 28, fontWeight: "800", color: C.orange },
  fullName:      { fontSize: 20, fontWeight: "700", color: C.white, letterSpacing: -0.3 },
  email:         { fontSize: 13, color: C.textSub, marginTop: 4, marginBottom: 16 },

  profileStats:     { flexDirection: "row", alignItems: "center", gap: 0, marginBottom: 16 },
  profileStat:      { alignItems: "center", paddingHorizontal: 20 },
  profileStatVal:   { fontSize: 20, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  profileStatLabel: { fontSize: 10, color: C.textSub, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 },
  profileStatDivider: { width: 1, height: 32, backgroundColor: C.border },

  memberBadge:     { backgroundColor: C.greenDim, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(74,222,128,0.2)" },
  memberBadgeText: { fontSize: 12, color: C.green, fontWeight: "700" },
  joinBadge:       { backgroundColor: C.orangeDim, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(232,98,10,0.2)" },
  joinBadgeText:   { fontSize: 12, color: C.orange, fontWeight: "700" },

  section:      { paddingHorizontal: 16, paddingTop: 24 },
  sectionHeader:{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingHorizontal: 4 },
  sectionLabel: { fontSize: 11, fontWeight: "700", color: C.textMuted, letterSpacing: 0.8, textTransform: "uppercase" },
  sectionCount: { fontSize: 11, color: C.orange, fontWeight: "700" },

  card:     { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, overflow: "hidden" },

  // Badge rows
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

  // Settings rows
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

  greenDim: "rgba(74,222,128,0.12)",
});
