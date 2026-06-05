import React, { useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Platform, Alert,
} from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp }                 from "@react-navigation/native";
import AsyncStorage                        from "@react-native-async-storage/async-storage";
import { useHealthSync }                   from "../hooks/useHealthSync";
import { STORAGE_KEY_USER, STORAGE_KEY_LAST_SYNC } from "../config";
import type { CSUser }                     from "../types";
import type { RootStackParamList }         from "../../App";

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, "HealthSync">;
  route:      RouteProp<RootStackParamList, "HealthSync">;
};

export default function HealthSyncScreen({ navigation, route }: Props) {
  const { user } = route.params;
  const { state, source, sync, reset } = useHealthSync(user.email);

  const platformName = Platform.OS === "ios" ? "Apple Health" : "Health Connect";
  const platformIcon = Platform.OS === "ios" ? "🍎" : "🤖";

  async function handleSignOut() {
    await AsyncStorage.multiRemove([
      STORAGE_KEY_USER,
      `${STORAGE_KEY_LAST_SYNC}:${source}`,
    ]);
    navigation.replace("Login");
  }

  function confirmSignOut() {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: handleSignOut },
    ]);
  }

  const statusIcon = {
    idle:      "⚡",
    requesting:"🔐",
    fetching:  "📡",
    uploading: "☁️",
    done:      state.imported > 0 ? "🎉" : "✅",
    error:     "⚠️",
  }[state.status];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.greeting}>
          Hey, {user.firstName} 👋
        </Text>
        <TouchableOpacity onPress={confirmSignOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {/* Integration card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardIcon}>{platformIcon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{platformName}</Text>
            <Text style={styles.cardSub}>
              {Platform.OS === "ios"
                ? "Sync runs and workouts from Apple Health and Apple Watch"
                : "Sync runs and workouts from Health Connect and Wear OS"
              }
            </Text>
          </View>
        </View>

        {/* Data that will be synced */}
        <View style={styles.permissions}>
          <Text style={styles.permLabel}>Data we sync</Text>
          {["🏃 Running activities", "🚶 Walking & hiking", "🚴 Cycling", "💪 Strength training",
            "📍 Distance & pace", "🔥 Active calories", "❤️ Heart rate", "👟 Step count"
          ].map(p => (
            <View key={p} style={styles.permRow}>
              <Text style={styles.permText}>{p}</Text>
              <Text style={styles.permCheck}>✓</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Status card */}
      <View style={[styles.card, state.status === "error" && styles.cardError]}>
        <View style={styles.statusRow}>
          <Text style={styles.statusIcon}>{statusIcon}</Text>
          <View style={{ flex: 1 }}>
            {state.status === "idle" && (
              <>
                <Text style={styles.statusTitle}>Ready to sync</Text>
                <Text style={styles.statusSub}>
                  First sync imports the last 30 days. After that, only new activities are imported.
                </Text>
              </>
            )}
            {(state.status === "requesting" || state.status === "fetching" || state.status === "uploading") && (
              <>
                <Text style={styles.statusTitle}>{state.message}</Text>
                <ActivityIndicator color="#e8620a" size="small" style={{ marginTop: 8, alignSelf: "flex-start" }} />
              </>
            )}
            {state.status === "done" && (
              <>
                <Text style={styles.statusTitle}>
                  {state.imported > 0
                    ? `🎉 ${state.imported} ${state.imported === 1 ? "activity" : "activities"} imported`
                    : "Already up to date"
                  }
                </Text>
                <Text style={styles.statusSub}>{state.message}</Text>
              </>
            )}
            {state.status === "error" && (
              <>
                <Text style={[styles.statusTitle, { color: "#f09595" }]}>Sync failed</Text>
                <Text style={styles.statusSub}>{state.error}</Text>
              </>
            )}
          </View>
        </View>
      </View>

      {/* CTA */}
      {state.status === "idle" || state.status === "done" || state.status === "error" ? (
        <TouchableOpacity
          style={styles.syncBtn}
          onPress={state.status === "done" || state.status === "error" ? reset : sync}
          activeOpacity={0.85}
        >
          <Text style={styles.syncBtnText}>
            {state.status === "done"   ? "Sync again" :
             state.status === "error"  ? "Try again"  :
             `Sync with ${platformName}`}
          </Text>
        </TouchableOpacity>
      ) : null}

      {state.status === "idle" && (
        <TouchableOpacity
          style={[styles.syncBtn, styles.syncBtnPrimary]}
          onPress={sync}
          activeOpacity={0.85}
        >
          <Text style={styles.syncBtnText}>Start sync →</Text>
        </TouchableOpacity>
      )}

      {/* Privacy note */}
      <Text style={styles.privacy}>
        🔒 Your health data is sent directly to your Connected Steps profile and is never shared with third parties.
      </Text>
    </ScrollView>
  );
}

const C = {
  bg:      "#0a0a0a",
  surface: "#141414",
  border:  "#222",
  orange:  "#e8620a",
  muted:   "#555",
  text:    "#f0f0f0",
  green:   "#4ade80",
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content:   { padding: 20, paddingBottom: 48 },

  header:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24, marginTop: 8 },
  greeting:    { fontSize: 20, fontWeight: "700", color: C.text },
  signOutBtn:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: C.border },
  signOutText: { fontSize: 12, color: C.muted },

  card:      { backgroundColor: C.surface, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  cardError: { borderColor: "rgba(240,149,149,0.3)" },

  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 16 },
  cardIcon:   { fontSize: 32 },
  cardTitle:  { fontSize: 16, fontWeight: "700", color: C.text, marginBottom: 4 },
  cardSub:    { fontSize: 12, color: C.muted, lineHeight: 17 },

  permissions: { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 14 },
  permLabel:   { fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  permRow:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5 },
  permText:    { fontSize: 13, color: C.text },
  permCheck:   { fontSize: 12, color: C.green, fontWeight: "700" },

  statusRow:   { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  statusIcon:  { fontSize: 28 },
  statusTitle: { fontSize: 15, fontWeight: "700", color: C.text, marginBottom: 4 },
  statusSub:   { fontSize: 13, color: C.muted, lineHeight: 18 },

  syncBtn:        { backgroundColor: "#1a1a1a", borderWidth: 1, borderColor: C.orange, borderRadius: 12, padding: 16, alignItems: "center", marginBottom: 12 },
  syncBtnPrimary: { backgroundColor: C.orange, borderColor: C.orange },
  syncBtnText:    { color: "#fff", fontWeight: "700", fontSize: 15 },

  privacy: { fontSize: 11, color: C.muted, textAlign: "center", lineHeight: 17, marginTop: 8 },
});
