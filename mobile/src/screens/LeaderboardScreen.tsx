import React, { useEffect, useState } from "react";
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Image,
} from "react-native";
import { useSafeAreaInsets }  from "react-native-safe-area-context";
import { useUser }            from "../context/UserContext";
import { getLeaderboard }     from "../services/api";
import type { LeaderboardEntry } from "../types";
import LevelBadge             from "../components/LevelBadge";
import { getLevelInfo }       from "../utils/xp";

type Period = "monthly" | "alltime";

const MEDAL  = ["🥇", "🥈", "🥉"];
const PODIUM_BG = ["rgba(245,158,11,0.12)", "rgba(180,180,180,0.10)", "rgba(180,100,30,0.10)"];
const PODIUM_BORDER = ["rgba(245,158,11,0.35)", "rgba(180,180,180,0.25)", "rgba(180,100,30,0.25)"];

export default function LeaderboardScreen() {
  const { user }                       = useUser();
  const insets                         = useSafeAreaInsets();
  const [period,     setPeriod]        = useState<Period>("monthly");
  const [entries,    setEntries]       = useState<LeaderboardEntry[]>([]);
  const [loading,    setLoading]       = useState(true);
  const [refreshing, setRefreshing]    = useState(false);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try { setEntries(await getLeaderboard()); } catch { /* keep stale */ }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);

  const sorted = [...entries].sort((a, b) =>
    period === "monthly"
      ? b.month_points - a.month_points
      : b.total_points - a.total_points
  );

  const myIdx      = user ? sorted.findIndex(e => e.user_email === user.email) : -1;
  const myRank     = myIdx >= 0 ? myIdx + 1 : 0;
  const myEntry    = myIdx >= 0 ? sorted[myIdx] : null;
  const entryAbove = myIdx > 0  ? sorted[myIdx - 1] : null;
  const myPts      = period === "monthly" ? (myEntry?.month_points ?? 0) : (myEntry?.total_points ?? 0);
  const abovePts   = period === "monthly" ? (entryAbove?.month_points ?? 0) : (entryAbove?.total_points ?? 0);
  const ptsGap     = entryAbove ? Math.max(0, abovePts - myPts + 1) : 0;

  const top3 = sorted.slice(0, 3);

  function renderItem({ item, index }: { item: LeaderboardEntry; index: number }) {
    const rank  = index + 1;
    const isMe  = item.user_email === user?.email;
    const pts   = period === "monthly" ? item.month_points : item.total_points;
    const lvl   = getLevelInfo(item.total_points);

    return (
      <View style={[S.row, isMe && S.rowMe]}>
        <Text style={[S.rank, rank <= 3 && S.rankTop]}>{MEDAL[index] ?? rank}</Text>
        {item.photo ? (
          <Image source={{ uri: item.photo }} style={S.avatar} />
        ) : (
          <View style={S.avatarFallback}>
            <Text style={S.avatarInitial}>{item.user_name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={S.nameRow}>
            <Text style={[S.name, isMe && S.nameMe]} numberOfLines={1}>
              {item.user_name}{isMe ? " (you)" : ""}
            </Text>
            <LevelBadge info={lvl} size="sm" />
          </View>
          {item.location ? <Text style={S.location} numberOfLines={1}>{item.location}</Text> : null}
        </View>
        <View style={S.ptsCol}>
          <Text style={[S.pts, isMe && S.ptsMe]}>{pts.toLocaleString()}</Text>
          <Text style={S.ptsLabel}>XP</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={S.container}>

      {/* Header */}
      <View style={[S.header, { paddingTop: Math.max(insets.top + 12, 20) }]}>
        <Text style={S.headerTitle}>⚡ Leaderboard</Text>
        <Text style={S.headerSub}>XP earned by attending sessions · Level up to climb</Text>
      </View>

      {/* Period tabs */}
      <View style={S.periodTabs}>
        {([
          { id: "monthly" as Period, label: "Monthly" },
          { id: "alltime" as Period, label: "All-Time" },
        ]).map(({ id, label }) => (
          <TouchableOpacity
            key={id}
            style={[S.periodTab, period === id && S.periodTabActive]}
            onPress={() => setPeriod(id)}
          >
            <Text style={[S.periodTabText, period === id && S.periodTabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={C.orange} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={S.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.orange} />
          }
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {/* Podium (top 3) */}
              {top3.length >= 3 && (
                <View style={S.podium}>
                  {[top3[1], top3[0], top3[2]].map((entry, podIdx) => {
                    const realRank = podIdx === 0 ? 1 : podIdx === 1 ? 0 : 2;
                    const pts = period === "monthly" ? entry.month_points : entry.total_points;
                    const isMe = entry.user_email === user?.email;
                    return (
                      <View
                        key={entry.id}
                        style={[
                          S.podiumSlot,
                          realRank === 0 && S.podiumFirst,
                          { backgroundColor: PODIUM_BG[realRank], borderColor: PODIUM_BORDER[realRank] },
                          isMe && { borderColor: C.orange, borderWidth: 2 },
                        ]}
                      >
                        <Text style={S.podiumMedal}>{MEDAL[realRank]}</Text>
                        <View style={S.podiumAvatar}>
                          {entry.photo
                            ? <Image source={{ uri: entry.photo }} style={S.podiumAvatarImg} />
                            : <Text style={S.podiumAvatarInitial}>{entry.user_name.charAt(0).toUpperCase()}</Text>
                          }
                        </View>
                        <Text style={S.podiumName} numberOfLines={1}>{entry.user_name.split(" ")[0]}</Text>
                        <Text style={S.podiumXP}>{pts.toLocaleString()} XP</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Rank context card */}
              {myRank > 0 && (
                <View style={S.rankCard}>
                  <View style={S.rankLeft}>
                    <Text style={S.rankNum}>#{myRank}</Text>
                    <Text style={S.rankLabel}>Your Rank</Text>
                    <Text style={S.rankXP}>{myPts.toLocaleString()} XP</Text>
                  </View>
                  <View style={S.rankDiv} />
                  <View style={S.rankRight}>
                    {entryAbove && ptsGap > 0 ? (
                      <>
                        <Text style={S.rankMotivation}>{ptsGap} XP from #{myRank - 1}</Text>
                        <Text style={S.rankCompetitor} numberOfLines={1}>— {entryAbove.user_name}</Text>
                        <Text style={S.rankTip}>Attend sessions to earn more XP</Text>
                      </>
                    ) : myRank === 1 ? (
                      <>
                        <Text style={S.rankMotivation}>🏆 You're leading!</Text>
                        <Text style={S.rankTip}>Keep attending to stay on top</Text>
                      </>
                    ) : (
                      <Text style={S.rankMotivation}>Attend sessions to climb</Text>
                    )}
                  </View>
                </View>
              )}

              <Text style={S.listHeader}>ALL RUNNERS</Text>
            </>
          }
          ListEmptyComponent={
            <View style={S.empty}>
              <Text style={S.emptyIcon}>🏃</Text>
              <Text style={S.emptyTitle}>No entries yet</Text>
              <Text style={S.emptyText}>Attend a session to earn XP and appear on the leaderboard.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const C = {
  bg:      "#080808", surface: "#111111", border: "#222222",
  orange:  "#e8620a", orangeDim: "rgba(232,98,10,0.12)",
  white:   "#f5f5f5", text: "#f0f0f0", textSub: "#888888", textMuted: "#505050",
  gold:    "#f59e0b",
};

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  header:      { paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { fontSize: 22, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  headerSub:   { fontSize: 12, color: C.textSub, marginTop: 4 },

  periodTabs:          { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  periodTab:           { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center", backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  periodTabActive:     { backgroundColor: C.orangeDim, borderColor: "rgba(232,98,10,0.3)" },
  periodTabText:       { fontSize: 13, fontWeight: "600", color: C.textSub },
  periodTabTextActive: { color: C.orange },

  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },

  listHeader: { fontSize: 10, fontWeight: "700", color: C.textMuted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8, marginTop: 4 },

  // Podium
  podium:        { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 8, marginBottom: 16, marginTop: 8 },
  podiumSlot:    { flex: 1, alignItems: "center", borderRadius: 16, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 6, gap: 6 },
  podiumFirst:   { paddingVertical: 16 },
  podiumMedal:   { fontSize: 22 },
  podiumAvatar:  { width: 44, height: 44, borderRadius: 22, backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  podiumAvatarImg:    { width: 44, height: 44, borderRadius: 22 },
  podiumAvatarInitial:{ fontSize: 16, fontWeight: "800", color: C.orange },
  podiumName:    { fontSize: 11, fontWeight: "700", color: C.white, textAlign: "center" },
  podiumXP:      { fontSize: 10, color: C.textSub, fontWeight: "600" },

  // Rank context
  rankCard:    { flexDirection: "row", alignItems: "center", backgroundColor: "#130d07", borderRadius: 18, borderWidth: 1, borderColor: "rgba(232,98,10,0.22)", padding: 16, gap: 16, marginBottom: 16 },
  rankLeft:    { alignItems: "center", minWidth: 72 },
  rankNum:     { fontSize: 30, fontWeight: "800", color: C.orange, letterSpacing: -0.5 },
  rankLabel:   { fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 1 },
  rankXP:      { fontSize: 11, color: C.orange, fontWeight: "700", marginTop: 4 },
  rankDiv:     { width: 1, height: 52, backgroundColor: "#222" },
  rankRight:   { flex: 1, gap: 3 },
  rankMotivation: { fontSize: 15, fontWeight: "700", color: C.white },
  rankCompetitor: { fontSize: 13, color: C.textSub },
  rankTip:     { fontSize: 11, color: C.textMuted },

  row:          { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, marginVertical: 2 },
  rowMe:        { backgroundColor: "rgba(232,98,10,0.08)", borderWidth: 1, borderColor: "rgba(232,98,10,0.2)" },
  rank:         { width: 28, fontSize: 13, color: C.textSub, textAlign: "center", fontWeight: "600" },
  rankTop:      { fontSize: 18 },
  avatar:       { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface },
  avatarFallback: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  avatarInitial:{ fontSize: 15, fontWeight: "700", color: C.orange },
  nameRow:      { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  name:         { fontSize: 14, fontWeight: "600", color: C.text },
  nameMe:       { color: C.orange },
  location:     { fontSize: 11, color: C.textSub },
  ptsCol:       { alignItems: "flex-end" },
  pts:          { fontSize: 16, fontWeight: "800", color: C.text, letterSpacing: -0.3 },
  ptsMe:        { color: C.orange },
  ptsLabel:     { fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.4 },

  empty:      { alignItems: "center", paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon:  { fontSize: 48, marginBottom: 14 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: C.white, marginBottom: 8 },
  emptyText:  { fontSize: 13, color: C.textSub, textAlign: "center", lineHeight: 20 },
});
