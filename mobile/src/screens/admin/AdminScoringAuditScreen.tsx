import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput, Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation }     from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useUser }           from "../../context/UserContext";
import { adminGetMembers }   from "../../services/api";
import type { AdminMember }  from "../../services/api";
import { CS_API_BASE }       from "../../config";
import type { RootStackParamList } from "../../../App";

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Breakdown {
  user_name:      string;
  session_points: number;
  weekly_bonus:   number;
  total_month:    number;
  total_alltime:  number;
  total_xp:       number;
  sessions: {
    date: string; title: string;
    base_pts: number; bonus_pts: number; total_pts: number;
  }[];
}

export default function AdminScoringAuditScreen() {
  const { user }   = useUser();
  const navigation = useNavigation<Nav>();
  const insets     = useSafeAreaInsets();
  const token      = user?.coachToken ?? "";

  const [members,   setMembers]   = useState<AdminMember[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [query,     setQuery]     = useState("");
  const [selected,  setSelected]  = useState<AdminMember | null>(null);
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [bdLoading, setBdLoading] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { setMembers((await adminGetMembers(token)).users); } catch { /* stale */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function openBreakdown(member: AdminMember) {
    setSelected(member);
    setBdLoading(true);
    try {
      const res  = await fetch(`${CS_API_BASE}/api/leaderboard/breakdown?email=${encodeURIComponent(member.email)}`);
      const data = await res.json();
      setBreakdown(data.breakdown);
    } catch { setBreakdown(null); }
    finally { setBdLoading(false); }
  }

  const filtered = members.filter(m =>
    !query || `${m.first_name} ${m.last_name} ${m.email}`.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <View style={S.root}>
      <View style={[S.header, { paddingTop: Math.max(insets.top + 12, 20) }]}>
        <Text style={S.backText} onPress={() => navigation.goBack()}>‹ Admin</Text>
        <Text style={S.title}>Scoring Audit</Text>
        <Text style={S.sub}>Tap any member to see their full score breakdown</Text>
      </View>

      <View style={S.searchBar}>
        <TextInput
          style={S.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search member…"
          placeholderTextColor={C.textMuted}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={C.orange} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={S.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.orange} />}
        >
          {/* Header row */}
          <View style={S.tableHead}>
            <Text style={[S.headCell, { flex: 2 }]}>Member</Text>
            <Text style={S.headCell}>Sessions</Text>
            <Text style={S.headCell}>Points</Text>
          </View>

          {filtered.map(m => (
            <TouchableOpacity key={m.email} style={S.tableRow} onPress={() => openBreakdown(m)} activeOpacity={0.8}>
              <View style={{ flex: 2 }}>
                <Text style={S.memberName}>{m.first_name} {m.last_name}</Text>
                <Text style={S.memberEmail} numberOfLines={1}>{m.email}</Text>
              </View>
              <Text style={S.cell}>{m.session_count}</Text>
              <Text style={[S.cell, { color: C.orange, fontWeight: "700" }]}>{m.total_points}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Breakdown modal */}
      {selected && (
        <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setSelected(null); setBreakdown(null); }}>
          <View style={S.modal}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>{selected.first_name} {selected.last_name}</Text>
              <TouchableOpacity onPress={() => { setSelected(null); setBreakdown(null); }} style={S.closeBtn}>
                <Text style={S.closeText}>Close</Text>
              </TouchableOpacity>
            </View>

            {bdLoading ? (
              <ActivityIndicator color={C.orange} style={{ marginTop: 40 }} />
            ) : !breakdown ? (
              <Text style={S.empty}>No data available.</Text>
            ) : (
              <ScrollView contentContainerStyle={S.modalScroll}>
                {/* Summary */}
                <View style={S.summaryGrid}>
                  {[
                    { label: "Session Pts",  val: breakdown.session_points, color: C.white  },
                    { label: "Weekly Bonus", val: breakdown.weekly_bonus,   color: C.orange },
                    { label: "Month Total",  val: breakdown.total_month,    color: C.white  },
                    { label: "Total XP",     val: breakdown.total_xp,       color: C.orange },
                  ].map(item => (
                    <View key={item.label} style={S.summaryItem}>
                      <Text style={[S.summaryVal, { color: item.color }]}>{item.val}</Text>
                      <Text style={S.summaryLabel}>{item.label}</Text>
                    </View>
                  ))}
                </View>

                {/* Expected vs actual */}
                <View style={S.verifyBox}>
                  <Text style={S.verifyTitle}>Verification</Text>
                  <Text style={S.verifyRow}>
                    Sessions: {breakdown.sessions.length} × 5 = {breakdown.sessions.length * 5} pts
                  </Text>
                  <Text style={S.verifyRow}>
                    Bonus points: +{breakdown.sessions.reduce((s, r) => s + r.bonus_pts, 0)} pts
                  </Text>
                  <Text style={S.verifyRow}>
                    Weekly bonus: +{breakdown.weekly_bonus} pts
                  </Text>
                  <View style={S.verifyDivider} />
                  <Text style={[S.verifyRow, { color: breakdown.total_month === (breakdown.sessions.length * 5 + breakdown.sessions.reduce((s, r) => s + r.bonus_pts, 0) + breakdown.weekly_bonus) ? C.green : "#f87171", fontWeight: "700" }]}>
                    Expected: {breakdown.sessions.length * 5 + breakdown.sessions.reduce((s, r) => s + r.bonus_pts, 0) + breakdown.weekly_bonus} pts
                    {" | "}
                    Stored: {breakdown.total_month} pts
                    {" "}
                    {breakdown.total_month === (breakdown.sessions.length * 5 + breakdown.sessions.reduce((s, r) => s + r.bonus_pts, 0) + breakdown.weekly_bonus) ? "✓ Match" : "⚠ Mismatch"}
                  </Text>
                </View>

                {/* Session list */}
                <Text style={S.listTitle}>SESSIONS THIS MONTH</Text>
                {breakdown.sessions.length === 0 ? (
                  <Text style={S.empty}>No attended sessions this month.</Text>
                ) : breakdown.sessions.map((s, i) => (
                  <View key={i} style={S.sessionRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={S.sessionTitle} numberOfLines={1}>{s.title}</Text>
                      <Text style={S.sessionDate}>{s.date}</Text>
                    </View>
                    <Text style={S.sessionBase}>{s.base_pts} pts</Text>
                    {s.bonus_pts > 0 && <Text style={S.sessionBonus}>+{s.bonus_pts}</Text>}
                    <Text style={S.sessionTotal}>{s.total_pts}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </Modal>
      )}
    </View>
  );
}

const C = { bg:"#080808", surface:"#111111", border:"#222222", orange:"#e8620a", orangeDim:"rgba(232,98,10,0.12)", white:"#f5f5f5", text:"#f0f0f0", textSub:"#888", textMuted:"#505050", green:"#4ade80" };
const S = StyleSheet.create({
  root:  { flex: 1, backgroundColor: C.bg },
  header:{ paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  backText:{ fontSize: 14, color: C.orange, fontWeight: "600", marginBottom: 8 },
  title: { fontSize: 22, fontWeight: "800", color: C.white },
  sub:   { fontSize: 12, color: C.textSub, marginTop: 4 },
  searchBar:{ paddingHorizontal: 16, paddingVertical: 10 },
  searchInput:{ backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 12, color: C.text, fontSize: 14 },
  list:  { paddingHorizontal: 16, paddingBottom: 40 },
  tableHead: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  headCell:  { flex: 1, fontSize: 10, fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "right" },
  tableRow:  { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#141414" },
  memberName:{ fontSize: 13, fontWeight: "700", color: C.text },
  memberEmail:{ fontSize: 11, color: C.textSub },
  cell:      { flex: 1, fontSize: 14, color: C.text, textAlign: "right" },
  modal:     { flex: 1, backgroundColor: C.bg },
  modalHeader:{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitle: { fontSize: 18, fontWeight: "800", color: C.white },
  closeBtn:   { backgroundColor: C.orangeDim, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: "rgba(232,98,10,0.3)" },
  closeText:  { fontSize: 13, color: C.orange, fontWeight: "700" },
  modalScroll:{ padding: 20, paddingBottom: 48 },
  empty:      { fontSize: 13, color: C.textMuted, textAlign: "center", marginTop: 24 },
  summaryGrid:{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  summaryItem:{ flex: 1, minWidth: "44%", backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14 },
  summaryVal: { fontSize: 24, fontWeight: "800", letterSpacing: -0.3 },
  summaryLabel:{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 },
  verifyBox:  { backgroundColor: "#0a0d0a", borderRadius: 14, borderWidth: 1, borderColor: "rgba(74,222,128,0.2)", padding: 16, marginBottom: 20 },
  verifyTitle:{ fontSize: 12, fontWeight: "700", color: C.green, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  verifyRow:  { fontSize: 13, color: C.textSub, lineHeight: 22 },
  verifyDivider:{ height: 1, backgroundColor: "rgba(74,222,128,0.1)", marginVertical: 8 },
  listTitle:  { fontSize: 10, fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 },
  sessionRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#141414", gap: 8 },
  sessionTitle:{ fontSize: 13, fontWeight: "600", color: C.text },
  sessionDate: { fontSize: 11, color: C.textSub, marginTop: 2 },
  sessionBase: { fontSize: 13, color: C.textSub },
  sessionBonus:{ fontSize: 13, color: C.orange, fontWeight: "700" },
  sessionTotal:{ fontSize: 14, fontWeight: "800", color: C.white, minWidth: 30, textAlign: "right" },
});
