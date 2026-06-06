import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation }     from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useUser }           from "../../context/UserContext";
import type { RootStackParamList } from "../../../App";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const TILES = [
  { screen: "AdminSessions"  as const, icon: "📅", label: "Sessions",       sub: "Create & manage"         },
  { screen: "AdminMembers"   as const, icon: "👥", label: "Members",         sub: "View all athletes"       },
  { screen: "AdminQuestions" as const, icon: "💬", label: "Coach Q&A",       sub: "Answer pending questions"},
  { screen: "AdminTraining"  as const, icon: "🏃", label: "Training Plans",  sub: "Assign to members"      },
];

export default function AdminHomeScreen() {
  const { user }   = useUser();
  const navigation = useNavigation<Nav>();
  const insets     = useSafeAreaInsets();

  return (
    <ScrollView style={S.root} contentContainerStyle={S.scroll} showsVerticalScrollIndicator={false}>
      <View style={[S.header, { paddingTop: Math.max(insets.top + 12, 20) }]}>
        <Text style={S.title}>Coach Admin</Text>
        <Text style={S.sub}>Welcome, {user?.firstName}</Text>
      </View>

      <View style={S.grid}>
        {TILES.map(t => (
          <TouchableOpacity
            key={t.screen}
            style={S.tile}
            onPress={() => navigation.navigate(t.screen)}
            activeOpacity={0.82}
          >
            <View style={S.tileGlow} pointerEvents="none" />
            <Text style={S.tileIcon}>{t.icon}</Text>
            <Text style={S.tileLabel}>{t.label}</Text>
            <Text style={S.tileSub}>{t.sub}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const C = {
  bg: "#080808", surface: "#111111", border: "#222222",
  orange: "#e8620a", orangeDim: "rgba(232,98,10,0.12)", orangeMid: "rgba(232,98,10,0.22)",
  white: "#f5f5f5", textSub: "#888888", textMuted: "#505050",
};

const S = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 48 },
  header: { paddingHorizontal: 20, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: C.border },
  title:  { fontSize: 22, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  sub:    { fontSize: 13, color: C.textSub, marginTop: 4 },
  grid:   { flexDirection: "row", flexWrap: "wrap", padding: 12, gap: 12 },
  tile:   { width: "47%", backgroundColor: "#130d07", borderRadius: 20, borderWidth: 1, borderColor: C.orangeMid, padding: 20, overflow: "hidden" },
  tileGlow: { position: "absolute", top: -30, right: -30, width: 90, height: 90, borderRadius: 45, backgroundColor: C.orange, opacity: 0.06 },
  tileIcon:  { fontSize: 32, marginBottom: 12 },
  tileLabel: { fontSize: 15, fontWeight: "700", color: C.white, marginBottom: 4 },
  tileSub:   { fontSize: 11, color: C.textMuted },
  orangeMid: "rgba(232,98,10,0.22)",
});
