import React, { useEffect, useState } from "react";
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl, Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUser }            from "../context/UserContext";
import { getLeaderboard }    from "../services/api";
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
    try {
      const data = await getLeaderboard();
      setEntries(data);
    } catch { /* keep stale */ }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);

  const myRank = user
    ? entries.findIndex(e => e.user_email === user.email) + 1
    : 0;

  function renderItem({ item, index }: { item: LeaderboardEntry; index: number }) {
    const rank    = index + 1;
    const isMe    = item.user_email === user?.email;
    const medal   = MEDAL[index] ?? null;

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
        <Text style={S.pts}>{item.month_points}<Text style={S.ptsUnit}> pts</Text></Text>
      </View>
    );
  }

  return (
    <View style={S.container}>
      {/* Banner */}
      <View style={[S.banner, { paddingTop: Math.max(insets.top + 12, 20) }]}>
        <Text style={S.bannerTitle}>Monthly Leaderboard</Text>
        {myRank > 0 && (
          <Text style={S.bannerSub}>You're ranked #{myRank}</Text>
        )}
      </View>

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
          ListEmptyComponent={<Text style={S.empty}>No entries yet.</Text>}
        />
      )}
    </View>
  );
}

const C = { bg: "#0a0a0a", surface: "#141414", border: "#1e1e1e", orange: "#e8620a", muted: "#555", text: "#f0f0f0", gold: "#f5c518" };

const S = StyleSheet.create({
  container:     { flex: 1, backgroundColor: C.bg },
  banner:        { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  bannerTitle:   { fontSize: 18, fontWeight: "700", color: C.text },
  bannerSub:     { fontSize: 13, color: C.orange, marginTop: 3 },
  list:          { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  row:           { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, marginVertical: 2 },
  rowMe:         { backgroundColor: "rgba(232,98,10,0.08)", borderWidth: 1, borderColor: "rgba(232,98,10,0.2)" },
  rank:          { width: 28, fontSize: 13, color: C.muted, textAlign: "center", fontWeight: "600" },
  rankTop:       { fontSize: 18 },
  avatar:        { width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface },
  avatarFallback:{ width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 15, fontWeight: "700", color: C.orange },
  name:          { fontSize: 14, fontWeight: "600", color: C.text },
  nameMe:        { color: C.orange },
  location:      { fontSize: 11, color: C.muted, marginTop: 1 },
  pts:           { fontSize: 16, fontWeight: "700", color: C.text },
  ptsUnit:       { fontSize: 11, color: C.muted, fontWeight: "400" },
  empty:         { color: C.muted, textAlign: "center", marginTop: 48, fontSize: 14 },
});
