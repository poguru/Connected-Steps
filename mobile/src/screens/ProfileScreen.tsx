import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Alert, Linking, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useUser }         from "../context/UserContext";
import { getMembership }   from "../services/api";
import { STORAGE_KEY_USER } from "../config";
import type { Membership } from "../types";
import type { RootStackParamList } from "../../App";

type Nav = NativeStackNavigationProp<RootStackParamList>;

function daysLeft(expiresAt: string) {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 86400000));
}

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
  const insets                           = useSafeAreaInsets();
  const navigation                       = useNavigation<Nav>();
  const [membership, setMembership]      = useState<Membership | null>(null);
  const [loading,    setLoading]         = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try { setMembership(await getMembership(user.email)); } catch { /* no membership */ }
    finally { setLoading(false); }
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

  const initials = `${user.firstName.charAt(0)}${user.lastName.charAt(0) || ""}`.toUpperCase();
  const mem       = membership?.isActive ? membership : null;

  return (
    <ScrollView style={S.root} contentContainerStyle={S.scroll} showsVerticalScrollIndicator={false}>
      {/* Avatar block */}
      <View style={[S.avatarSection, { paddingTop: Math.max(insets.top + 20, 36) }]}>
        <View style={S.avatarRing}>
          <View style={S.avatar}>
            <Text style={S.avatarInitials}>{initials}</Text>
          </View>
        </View>
        <Text style={S.fullName}>{user.firstName} {user.lastName}</Text>
        <Text style={S.email}>{user.email}</Text>
        {loading ? (
          <ActivityIndicator color={C.orange} style={{ marginTop: 8 }} size="small" />
        ) : mem ? (
          <View style={S.memberBadge}>
            <Text style={S.memberBadgeText}>
              ✓ Member · {daysLeft(mem.expires_at)} days left
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={S.joinBadge}
            onPress={() => Linking.openURL("https://www.connectedsteps.in/pricing")}
          >
            <Text style={S.joinBadgeText}>Become a Member  →</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Profile details */}
      <View style={S.section}>
        <Text style={S.sectionLabel}>PROFILE</Text>
        <View style={S.card}>
          {user.location ? <Row icon="📍" label="Location" value={user.location} /> : null}
          {user.phone    ? <Row icon="📱" label="Phone"    value={user.phone}    /> : null}
          {user.goal     ? <Row icon="🎯" label="Goal"     value={user.goal}     /> : null}
        </View>
      </View>

      {/* Membership */}
      {!loading && (
        <View style={S.section}>
          <Text style={S.sectionLabel}>MEMBERSHIP</Text>
          <View style={S.card}>
            {mem ? (
              <>
                <Row icon="💳" label="Plan"    value={mem.plan} />
                <Row icon="📅" label="Expires" value={new Date(mem.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} />
                <Row
                  icon="🔄"
                  label="Renew Membership"
                  onPress={() => Linking.openURL("https://www.connectedsteps.in/payments")}
                />
              </>
            ) : (
              <Row
                icon="🏃"
                label="View Membership Plans"
                onPress={() => Linking.openURL("https://www.connectedsteps.in/pricing")}
              />
            )}
          </View>
        </View>
      )}

      {/* Account */}
      <View style={S.section}>
        <Text style={S.sectionLabel}>ACCOUNT</Text>
        <View style={S.card}>
          <Row
            icon="🌐"
            label="Open Dashboard"
            onPress={() => Linking.openURL("https://www.connectedsteps.in/dashboard")}
          />
          <Row
            icon="✉️"
            label="Contact Us"
            onPress={() => Linking.openURL("https://www.connectedsteps.in/contact")}
          />
          <Row
            icon="🔒"
            label="Privacy Policy"
            onPress={() => Linking.openURL("https://www.connectedsteps.in/privacy")}
          />
        </View>
      </View>

      {/* Sign out */}
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
  bg:       "#080808",
  surface:  "#111111",
  border:   "#222222",
  orange:   "#e8620a",
  orangeDim:"rgba(232,98,10,0.12)",
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

  // Avatar
  avatarSection: { alignItems: "center", paddingTop: 36, paddingBottom: 32, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  avatarRing:    { width: 88, height: 88, borderRadius: 44, borderWidth: 2, borderColor: C.orange, padding: 3, marginBottom: 14 },
  avatar:        { flex: 1, borderRadius: 40, backgroundColor: C.orangeDim, alignItems: "center", justifyContent: "center" },
  avatarInitials:{ fontSize: 28, fontWeight: "800", color: C.orange },
  fullName:      { fontSize: 20, fontWeight: "700", color: C.white, letterSpacing: -0.3 },
  email:         { fontSize: 13, color: C.textSub, marginTop: 4, marginBottom: 12 },
  memberBadge:   { backgroundColor: C.greenDim, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(74,222,128,0.2)" },
  memberBadgeText: { fontSize: 12, color: C.green, fontWeight: "700" },
  joinBadge:     { backgroundColor: C.orangeDim, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(232,98,10,0.2)" },
  joinBadgeText: { fontSize: 12, color: C.orange, fontWeight: "700" },

  // Sections
  section:      { paddingHorizontal: 16, paddingTop: 24 },
  sectionLabel: { fontSize: 11, fontWeight: "700", color: C.textMuted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10, paddingHorizontal: 4 },

  // Card + rows
  card:      { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, overflow: "hidden" },
  row:       { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: C.border },
  rowIcon:   { fontSize: 18, width: 24 },
  rowLabel:  { fontSize: 14, color: C.text, fontWeight: "500" },
  rowValue:  { fontSize: 12, color: C.textSub, marginTop: 2 },
  rowChevron:{ fontSize: 20, color: C.textMuted, marginLeft: "auto" as any },

  signOutBtn:  { backgroundColor: "transparent", borderWidth: 1, borderColor: "#3a1010", borderRadius: 16, padding: 15, alignItems: "center" },
  signOutText: { color: "#e05555", fontWeight: "700", fontSize: 15 },

  version: { fontSize: 11, color: C.textMuted, textAlign: "center", marginTop: 20, paddingBottom: 8 },

  // greenDim reference
  greenDim: "rgba(74,222,128,0.12)",
});
