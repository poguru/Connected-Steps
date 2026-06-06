import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  RefreshControl, TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation }     from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useUser }           from "../../context/UserContext";
import { adminGetMembers }   from "../../services/api";
import type { AdminMember }  from "../../services/api";
import type { RootStackParamList } from "../../../App";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function AdminMembersScreen() {
  const { user }   = useUser();
  const navigation = useNavigation<Nav>();
  const insets     = useSafeAreaInsets();
  const token      = user?.coachToken ?? "";

  const [members,    setMembers]    = useState<AdminMember[]>([]);
  const [stats,      setStats]      = useState<Record<string, number>>({});
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query,      setQuery]      = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await adminGetMembers(token);
      setMembers(res.users);
      setStats(res.stats);
    } catch { /* keep stale */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const filtered = members.filter(m =>
    !query || `${m.first_name} ${m.last_name} ${m.email}`.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <View style={S.root}>
      <View style={[S.header, { paddingTop: Math.max(insets.top + 12, 20) }]}>
        <Text style={S.backText} onPress={() => navigation.goBack()}>‹ Admin</Text>
        <Text style={S.title}>Members</Text>
        {!loading && (
          <View style={S.statsRow}>
            {[
              { label: "Total",   val: stats.total ?? 0      },
              { label: "Active",  val: stats.activeMembers ?? 0 },
            ].map(s => (
              <View key={s.label} style={S.statChip}>
                <Text style={S.statVal}>{s.val}</Text>
                <Text style={S.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={S.searchBar}>
        <TextInput
          style={S.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or email…"
          placeholderTextColor={C.textMuted}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={C.orange} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={m => m.email}
          contentContainerStyle={S.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.orange} />}
          renderItem={({ item: m }) => (
            <View style={S.row}>
              <View style={S.avatar}>
                <Text style={S.avatarText}>{m.first_name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={S.nameRow}>
                  <Text style={S.name}>{m.first_name} {m.last_name}</Text>
                  {m.isActiveMember && <View style={S.activePill}><Text style={S.activePillText}>Member</Text></View>}
                </View>
                <Text style={S.email} numberOfLines={1}>{m.email}</Text>
                <View style={S.metaRow}>
                  <Text style={S.meta}>🏅 {m.session_count} sessions</Text>
                  <Text style={S.meta}>⚡ {m.total_points} XP</Text>
                  {m.location ? <Text style={S.meta}>📍 {m.location}</Text> : null}
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={<View style={S.empty}><Text style={S.emptyText}>No members found.</Text></View>}
        />
      )}
    </View>
  );
}

const C = { bg:"#080808", surface:"#111111", border:"#222222", orange:"#e8620a", orangeDim:"rgba(232,98,10,0.12)", white:"#f5f5f5", text:"#f0f0f0", textSub:"#888", textMuted:"#505050", green:"#4ade80", greenDim:"rgba(74,222,128,0.12)" };
const S = StyleSheet.create({
  root:{ flex:1, backgroundColor:C.bg },
  header:{ paddingHorizontal:20, paddingBottom:16, borderBottomWidth:1, borderBottomColor:C.border },
  backText:{ fontSize:14, color:C.orange, fontWeight:"600", marginBottom:8 },
  title:{ fontSize:22, fontWeight:"800", color:C.white, marginBottom:8 },
  statsRow:{ flexDirection:"row", gap:8 },
  statChip:{ backgroundColor:C.surface, borderRadius:10, borderWidth:1, borderColor:C.border, paddingHorizontal:14, paddingVertical:8, alignItems:"center" },
  statVal:{ fontSize:18, fontWeight:"800", color:C.white },
  statLabel:{ fontSize:10, color:C.textSub, textTransform:"uppercase", letterSpacing:0.4 },
  searchBar:{ paddingHorizontal:16, paddingVertical:10 },
  searchInput:{ backgroundColor:C.surface, borderRadius:12, borderWidth:1, borderColor:C.border, padding:12, color:C.text, fontSize:14 },
  list:{ paddingHorizontal:16, paddingBottom:40, gap:8 },
  row:{ backgroundColor:C.surface, borderRadius:14, borderWidth:1, borderColor:C.border, padding:14, flexDirection:"row", alignItems:"flex-start", gap:12 },
  avatar:{ width:40, height:40, borderRadius:20, backgroundColor:C.orangeDim, borderWidth:1, borderColor:"rgba(232,98,10,0.25)", alignItems:"center", justifyContent:"center" },
  avatarText:{ fontSize:16, fontWeight:"800", color:C.orange },
  nameRow:{ flexDirection:"row", alignItems:"center", gap:8, marginBottom:2 },
  name:{ fontSize:14, fontWeight:"700", color:C.text },
  activePill:{ backgroundColor:C.greenDim, borderRadius:6, paddingHorizontal:7, paddingVertical:2, borderWidth:1, borderColor:"rgba(74,222,128,0.2)" },
  activePillText:{ fontSize:9, color:C.green, fontWeight:"700", textTransform:"uppercase" },
  email:{ fontSize:11, color:C.textSub, marginBottom:6 },
  metaRow:{ flexDirection:"row", flexWrap:"wrap", gap:8 },
  meta:{ fontSize:11, color:C.textMuted },
  empty:{ paddingTop:60, alignItems:"center" }, emptyText:{ fontSize:14, color:C.textMuted },
  greenDim:"rgba(74,222,128,0.12)", orangeDim:"rgba(232,98,10,0.12)",
});
