import React, { useEffect, useState } from "react";
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl, Image,
} from "react-native";
import { useSafeAreaInsets }  from "react-native-safe-area-context";
import { useUser }            from "../context/UserContext";
import { getLeaderboard }     from "../services/api";
import type { LeaderboardEntry } from "../types";

const MEDAL = ["🥇", "🥈", "🥉"];

export default function LeaderboardScreen() {
  const { user }                     = useUser();
  const insets                       = useSafeAreaInsets();
  const [entries,    setEntries]     = useState<LeaderboardEntry[]>([]);
  const [loading,    setLoading]     = useState(true);
  const [refreshing, setRefreshing]  = useState(false);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try { setEntries(await getLeaderboard()); } catch { /* keep stale */ }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);

  // ── Rank context ──────────────────────────────────────────────────────────
  const myIdx      = user ? entries.findIndex(e => e.user_email === user.email) : -1;
  const myRank     = myIdx >= 0 ? myIdx + 1 : 0;
  const myEntry    = myIdx >= 0 ? entries[myIdx] : null;
  const entryAbove = myIdx > 0  ? entries[myIdx - 1] : null;
  const ptsToOvertake = entryAbove && myEntry
    ? Math.max(0, entryAbove.month_points - myEntry.month_points + 1)
    : 0;

  function renderItem({ item, index }: { item: LeaderboardEntry; index: number }) {
    const rank  = index + 1;
    const isMe  = item.user_email === user?.email;
    const medal = MEDAL[index] ?? null;

    return (
      <View style={[S.row, isMe && S.rowMe]}>
        <Text style={[S.rank, rank <= 3 && S.rankTop]}>{medal ?? rank}</Text>
        {item.photo ? (
          <Image source={{ uri: item.photo }} style={S.avatar} />
        ) : (
          <View style={S.avatarFallback}>
            <Text style={S.avatarInitial}>{item.user_name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[S.name, isMe && S.nameMe]} numberOfLines={1}>
            {item.user_name}{isMe ? " (you)" : ""}
          </Text>
          {item.location ? <Text style={S.location} numberOfLines={1}>{item.location}</Text> : null}
        </View>
        <Text style={[S.pts, isMe && S.ptsMe]}>{item.month_points}<Text style={S.ptsUnit}> pts</Text></Text>
      </View>
    );
  }

  return (
    <View style={S.container}>

      {/* Banner */}
      <View style={[S.banner, { paddingTop: Math.max(insets.top + 12, 20) }]}>
        <Text style={S.bannerTitle}>Monthly Leaderboard</Text>
        <Text style={S.bannerSub}>Points reset every month · Attend sessions to earn points</Text>
      </View>

      {/* Rank context card */}
      {!loading && myRank > 0 && (
        <View style={S.rankCard}>
          <View style={S.rankCardLeft}>
            <Text style={S.rankCardBig}>#{myRank}</Text>
            <Text style={S.rankCardLabel}>Your rank</Text>
          </View>
          <View style={S.rankCardDivider} />
          <View style={S.rankCardRight}>
            {entryAbove && ptsToOvertake > 0 ? (
              <>
                <Text style={S.rankCardMotivation}>
                  {ptsToOvertake} pt{ptsToOvertake !== 1 ? "s" : ""} away from #{myRank - 1}
                </Text>
                <Text style={S.rankCardCompetitor} numberOfLines={1}>
                  — {entryAbove.user_name}
                </Text>
              </>
            ) : myRank === 1 ? (
              <>
                <Text style={S.rankCardMotivation}>🏆 You're leading!</Text>
                <Text style={S.rankCardCompetitor}>Keep attending sessions to stay on top</Text>
              </>
            ) : (
              <Text style={S.rankCardMotivation}>Attend more sessions to climb the board</Text>
            )}
          </View>
        </View>
      )}

      {/* List */}
      {loading ? (
        <ActivityIndicator color={C.orange} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={S.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.orange} />
          }
          ListEmptyComponent={
            <View style={S.emptyState}>
              <Text style={S.emptyIcon}>🏃</Text>
              <Text style={S.emptyTitle}>No entries yet</Text>
              <Text style={S.emptyText}>Attend a session to appear on the leaderboard and start earning points.</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const C = {
  bg:       "#080808", surface: "#111111", border: "#222222",
  orange:   "#e8620a", orangeDim: "rgba(232,98,10,0.12)",
  white:    "#f5f5f5", text: "#f0f0f0", textSub: "#888888", textMuted: "#505050",
  green:    "#4ade80",
};

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  banner:      { paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  bannerTitle: { fontSize: 22, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  bannerSub:   { fontSize: 12, color: C.textSub, marginTop: 5 },

  // Rank context card
  rankCard:          { flexDirection: "row", alignItems: "center", margin: 16, marginBottom: 4, backgroundColor: "#130d07", borderRadius: 16, borderWidth: 1, borderColor: "rgba(232,98,10,0.2)", padding: 16, gap: 16 },
  rankCardLeft:      { alignItems: "center", minWidth: 60 },
  rankCardBig:       { fontSize: 28, fontWeight: "800", color: C.orange, letterSpacing: -0.5 },
  rankCardLabel:     { fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 },
  rankCardDivider:   { width: 1, height: 40, backgroundColor: "#222" },
  rankCardRight:     { flex: 1 },
  rankCardMotivation:{ fontSize: 14, fontWeight: "700", color: C.white, marginBottom: 4 },
  rankCardCompetitor:{ fontSize: 12, color: C.textSub },

  list: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 40 },

  row:          { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, marginVertical: 2 },
  rowMe:        { backgroundColor: "rgba(232,98,10,0.08)", borderWidth: 1, borderColor: "rgba(232,98,10,0.2)" },
  rank:         { width: 28, fontSize: 13, color: C.textSub, textAlign: "center", fontWeight: "600" },
  rankTop:      { fontSize: 18 },
  avatar:       { width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface },
  avatarFallback:{ width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  avatarInitial:{ fontSize: 15, fontWeight: "700", color: C.orange },
  name:         { fontSize: 14, fontWeight: "600", color: C.text },
  nameMe:       { color: C.orange },
  location:     { fontSize: 11, color: C.textSub, marginTop: 1 },
  pts:          { fontSize: 16, fontWeight: "700", color: C.text },
  ptsMe:        { color: C.orange },
  ptsUnit:      { fontSize: 11, color: C.textSub, fontWeight: "400" },

  emptyState: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon:  { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: C.white, marginBottom: 8 },
  emptyText:  { fontSize: 13, color: C.textSub, textAlign: "center", lineHeight: 20 },
});
