import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUser }        from "../context/UserContext";
import { getTrainingPlan } from "../services/api";
import type { TrainingPlan } from "../types";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const todayIdx = () => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; };

export default function TrainingScreen() {
  const { user }                         = useUser();
  const insets                           = useSafeAreaInsets();
  const [plan,       setPlan]            = useState<TrainingPlan | null>(null);
  const [loading,    setLoading]         = useState(true);
  const [refreshing, setRefreshing]      = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    try { setPlan(await getTrainingPlan(user.email)); } catch { /* keep stale */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const today = todayIdx();

  return (
    <ScrollView
      style={S.root}
      contentContainerStyle={S.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.orange} />}
    >
      <View style={[S.header, { paddingTop: Math.max(insets.top + 12, 20) }]}>
        <Text style={S.headerTitle}>Training Plan</Text>
        {plan && <Text style={S.headerSub}>by {plan.coach_name || "your coach"}</Text>}
      </View>

      {loading ? (
        <ActivityIndicator color={C.orange} style={{ marginTop: 48 }} />
      ) : !plan ? (
        <View style={S.empty}>
          <Text style={S.emptyIcon}>🏋️</Text>
          <Text style={S.emptyTitle}>No Plan Yet</Text>
          <Text style={S.emptyText}>Your coach will assign a training plan once you join a session.</Text>
        </View>
      ) : (
        <View style={S.body}>
          {/* Plan card */}
          <View style={S.planCard}>
            <Text style={S.planTitle}>{plan.title}</Text>
            {plan.coach_name ? <Text style={S.planCoach}>Coach · {plan.coach_name}</Text> : null}
          </View>

          {/* Days timeline */}
          <Text style={S.weekLabel}>THIS WEEK</Text>
          <View style={S.timeline}>
            {plan.days.map((day, i) => {
              const isToday = i === today;
              const isDone  = i < today;
              const isRest  = day.type.toLowerCase().includes("rest");

              return (
                <View key={i} style={S.timelineRow}>
                  {/* Connector line */}
                  <View style={S.timelineLeft}>
                    <View style={[S.dot, isToday && S.dotToday, isDone && S.dotDone, isRest && !isToday && S.dotRest]} />
                    {i < 6 && <View style={[S.line, isDone && S.lineDone]} />}
                  </View>

                  {/* Day card */}
                  <View style={[S.dayCard, isToday && S.dayCardToday, isDone && S.dayCardDone]}>
                    <View style={S.dayCardTop}>
                      <View style={S.dayMeta}>
                        <Text style={[S.dayName, isToday && S.dayNameToday]}>{DAY_NAMES[i]}</Text>
                        {isToday && <View style={S.todayPill}><Text style={S.todayPillText}>Today</Text></View>}
                        {isDone && !isRest && <Text style={S.doneTick}>✓</Text>}
                      </View>
                      <Text style={S.dayEmoji}>{day.emoji}</Text>
                    </View>
                    <Text style={[S.dayType, isRest && S.dayTypeRest, isToday && S.dayTypeToday]}>
                      {day.type}
                    </Text>
                    {!isRest && day.detail ? (
                      <Text style={S.dayDetail}>{day.detail}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const C = {
  bg:       "#080808",
  surface:  "#111111",
  border:   "#222222",
  orange:   "#e8620a",
  orangeDim:"rgba(232,98,10,0.1)",
  orangeMid:"rgba(232,98,10,0.2)",
  white:    "#f5f5f5",
  text:     "#f0f0f0",
  textSub:  "#888888",
  textMuted:"#505050",
  green:    "#4ade80",
  greenDim: "rgba(74,222,128,0.12)",
};

const S = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 48 },

  header:     { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle:{ fontSize: 22, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  headerSub:  { fontSize: 13, color: C.orange, marginTop: 4 },

  empty:      { alignItems: "center", paddingTop: 80, paddingHorizontal: 40 },
  emptyIcon:  { fontSize: 52, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: C.text, marginBottom: 10 },
  emptyText:  { fontSize: 14, color: C.textSub, textAlign: "center", lineHeight: 22 },

  body:       { padding: 20 },
  planCard:   { backgroundColor: "#0f0a05", borderRadius: 18, padding: 18, borderWidth: 1, borderColor: "#1a1205", marginBottom: 28 },
  planTitle:  { fontSize: 17, fontWeight: "700", color: C.white, marginBottom: 4 },
  planCoach:  { fontSize: 12, color: C.orange },
  weekLabel:  { fontSize: 10, fontWeight: "700", color: C.textMuted, letterSpacing: 0.8, marginBottom: 16, textTransform: "uppercase" },

  // Timeline
  timeline:    {},
  timelineRow: { flexDirection: "row", gap: 14, marginBottom: 0 },
  timelineLeft:{ width: 20, alignItems: "center" },
  dot:         { width: 12, height: 12, borderRadius: 6, backgroundColor: C.border, borderWidth: 2, borderColor: C.border, marginTop: 14 },
  dotToday:    { backgroundColor: C.orange, borderColor: C.orange, width: 14, height: 14, borderRadius: 7, marginTop: 13 },
  dotDone:     { backgroundColor: C.green, borderColor: C.green },
  dotRest:     { backgroundColor: "transparent", borderColor: C.textMuted },
  line:        { width: 2, flex: 1, backgroundColor: C.border, marginVertical: 2 },
  lineDone:    { backgroundColor: C.green },

  dayCard:      { flex: 1, backgroundColor: C.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 10 },
  dayCardToday: { backgroundColor: "#130d07", borderColor: C.orangeMid },
  dayCardDone:  { backgroundColor: "#0a130d", borderColor: "rgba(74,222,128,0.15)" },
  dayCardTop:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  dayMeta:      { flexDirection: "row", alignItems: "center", gap: 8 },
  dayName:      { fontSize: 12, fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  dayNameToday: { color: C.orange },
  todayPill:    { backgroundColor: C.orange, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  todayPillText:{ fontSize: 10, color: "#fff", fontWeight: "700" },
  doneTick:     { fontSize: 13, color: C.green, fontWeight: "700" },
  dayEmoji:     { fontSize: 20 },
  dayType:      { fontSize: 15, fontWeight: "700", color: C.text, marginBottom: 4 },
  dayTypeRest:  { color: C.textMuted, fontWeight: "400" },
  dayTypeToday: { color: C.orange },
  dayDetail:    { fontSize: 12, color: C.textSub, lineHeight: 18 },

  // orangeMid reference
  orangeMid: "rgba(232,98,10,0.2)",
});
