/**
 * Phase 4 — Digital Event Pass
 * Full-screen event pass: QR code, BIB, category, emergency contact,
 * schedule, venue map link, and sponsor branding.
 * Designed to be shown at the start line — full-brightness, large QR.
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Image, Linking, Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Brightness        from "expo-brightness";
import { useUser }            from "../context/UserContext";
import { useNetwork }         from "../context/NetworkContext";
import { getMyEvent }         from "../services/api";
import { getWalletItems }     from "../services/offline";
import { CS_API_BASE }        from "../config";
import type { WalletItem }    from "../services/offline";

const { width: SCREEN_W } = Dimensions.get("window");
const QR_SIZE = SCREEN_W - 80;

interface EventPassScreenProps {
  route: { params: { registrationCode: string } };
  navigation: { goBack: () => void };
}

interface EventDetail {
  title:     string;
  date:      string;
  venue:     string;
  start_time?: string;
  map_url?:  string;
  schedule?: { time: string; label: string }[];
  sponsors?: { name: string; logo_url?: string }[];
  emergency_contact?: { name: string; phone: string };
}

export default function EventPassScreen({ route, navigation }: EventPassScreenProps) {
  const { registrationCode }     = route.params;
  const { user }                 = useUser();
  const { isConnected }          = useNetwork();
  const insets                   = useSafeAreaInsets();

  const [walletItem, setWalletItem] = useState<WalletItem | null>(null);
  const [eventDetail, setEventDetail] = useState<EventDetail | null>(null);
  const [loading,    setLoading]  = useState(true);
  const [brightened, setBrightened] = useState(false);

  const load = useCallback(async () => {
    // Always load from wallet cache first (offline-safe)
    const items = await getWalletItems();
    const found = items.find(i => i.registration_code === registrationCode) ?? null;
    setWalletItem(found);

    // Fetch richer event detail if online
    if (isConnected && user?.userToken) {
      try {
        const detail = await getMyEvent(user.userToken, registrationCode);
        setEventDetail(detail as EventDetail);
      } catch { /* fall back to wallet cache */ }
    }
    setLoading(false);
  }, [registrationCode, isConnected, user?.userToken]);

  useEffect(() => { load(); }, [load]);

  // Boost screen brightness for QR scan
  async function toggleBrightness() {
    try {
      const { granted } = await Brightness.requestPermissionsAsync();
      if (!granted) return;
      if (brightened) {
        await Brightness.useSystemBrightnessAsync();
      } else {
        await Brightness.setBrightnessAsync(1.0);
      }
      setBrightened(b => !b);
    } catch { /* expo-brightness not installed — ignore */ }
  }

  // Restore brightness on unmount
  useEffect(() => {
    return () => {
      Brightness.useSystemBrightnessAsync().catch(() => {});
    };
  }, []);

  if (loading) {
    return (
      <View style={[S.center, { paddingTop: insets.top + 40 }]}>
        <ActivityIndicator color={C.orange} size="large" />
        <Text style={S.loadingText}>Loading your pass…</Text>
      </View>
    );
  }

  if (!walletItem) {
    return (
      <View style={[S.center, { paddingTop: insets.top + 40 }]}>
        <Text style={S.emptyIcon}>🎟️</Text>
        <Text style={S.emptyTitle}>Pass not found</Text>
        <Text style={S.emptyBody}>Pull to refresh your Event Wallet.</Text>
        <TouchableOpacity style={S.backBtn} onPress={navigation.goBack}>
          <Text style={S.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const qrUri = walletItem.qr_local_path
    ? `file://${walletItem.qr_local_path}`
    : walletItem.qr_token
      ? `${CS_API_BASE}/api/events/qr/${encodeURIComponent(walletItem.qr_token)}`
      : null;

  const schedule   = eventDetail?.schedule ?? [];
  const sponsors   = eventDetail?.sponsors ?? [];
  const emergency  = eventDetail?.emergency_contact;

  return (
    <ScrollView
      style={S.root}
      contentContainerStyle={[S.scroll, { paddingTop: insets.top + 12 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Nav ── */}
      <TouchableOpacity style={S.back} onPress={navigation.goBack}>
        <Text style={S.backText}>← Back</Text>
      </TouchableOpacity>

      {/* ── Event name ── */}
      <Text style={S.eventTitle} numberOfLines={2}>{walletItem.event_title}</Text>
      {walletItem.event_date && (
        <Text style={S.eventDate}>
          {new Date(walletItem.event_date + "T00:00:00").toLocaleDateString("en-IN", {
            weekday: "long", day: "numeric", month: "long", year: "numeric",
          })}
        </Text>
      )}
      {(eventDetail?.venue || eventDetail?.start_time) && (
        <Text style={S.eventVenue} numberOfLines={1}>
          {[eventDetail.start_time, eventDetail.venue].filter(Boolean).join(" · ")}
        </Text>
      )}

      {/* ── QR code ── */}
      {qrUri && (
        <TouchableOpacity
          style={S.qrWrap}
          onPress={toggleBrightness}
          activeOpacity={0.92}
        >
          <View style={S.qrFrame}>
            <Image source={{ uri: qrUri }} style={{ width: QR_SIZE - 32, height: QR_SIZE - 32 }} resizeMode="contain" />
          </View>
          <Text style={S.qrHint}>
            {brightened ? "🔆 Tap to restore brightness" : "🔅 Tap for max brightness"}
          </Text>
          <Text style={S.qrOfflineHint}>
            {walletItem.qr_local_path ? "✓ Available offline" : "Live QR"}
          </Text>
        </TouchableOpacity>
      )}

      {/* ── Participant info grid ── */}
      <View style={S.infoGrid}>
        <View style={S.infoCell}>
          <Text style={S.infoCellLabel}>CATEGORY</Text>
          <Text style={S.infoCellValue}>{walletItem.category || "—"}</Text>
        </View>
        {walletItem.bib_number ? (
          <View style={S.infoCell}>
            <Text style={S.infoCellLabel}>BIB NO.</Text>
            <Text style={[S.infoCellValue, { color: C.orange }]}>{walletItem.bib_number}</Text>
          </View>
        ) : null}
        <View style={S.infoCell}>
          <Text style={S.infoCellLabel}>STATUS</Text>
          <Text style={[S.infoCellValue, {
            color: walletItem.status === "confirmed" || walletItem.status === "paid" ? C.green : C.amber,
          }]}>
            {walletItem.status === "confirmed" || walletItem.status === "paid" ? "✓ Confirmed" : walletItem.status}
          </Text>
        </View>
        <View style={S.infoCell}>
          <Text style={S.infoCellLabel}>REG CODE</Text>
          <Text style={[S.infoCellValue, { fontSize: 11 }]}>{walletItem.registration_code}</Text>
        </View>
      </View>

      {/* ── Emergency contact ── */}
      {emergency && (
        <View style={S.section}>
          <Text style={S.sectionTitle}>🚑 Emergency Contact</Text>
          <View style={S.emergencyCard}>
            <Text style={S.emergencyName}>{emergency.name}</Text>
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${emergency.phone}`)}>
              <Text style={S.emergencyPhone}>{emergency.phone}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Event schedule ── */}
      {schedule.length > 0 && (
        <View style={S.section}>
          <Text style={S.sectionTitle}>🗓 Schedule</Text>
          {schedule.map((item, i) => (
            <View key={i} style={S.scheduleRow}>
              <Text style={S.scheduleTime}>{item.time}</Text>
              <Text style={S.scheduleLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Venue map link ── */}
      {eventDetail?.map_url && (
        <TouchableOpacity
          style={S.mapBtn}
          onPress={() => Linking.openURL(eventDetail.map_url!)}
        >
          <Text style={S.mapBtnText}>📍 Open Venue Map</Text>
        </TouchableOpacity>
      )}

      {/* ── Sponsors ── */}
      {sponsors.length > 0 && (
        <View style={S.section}>
          <Text style={S.sectionTitle}>Our Sponsors</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.sponsorScroll}>
            {sponsors.map((s, i) => (
              <View key={i} style={S.sponsorChip}>
                {s.logo_url ? (
                  <Image source={{ uri: s.logo_url }} style={S.sponsorLogo} resizeMode="contain" />
                ) : (
                  <Text style={S.sponsorName}>{s.name}</Text>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={{ height: Math.max(insets.bottom + 32, 48) }} />
    </ScrollView>
  );
}

const C = {
  bg:      "#080808",
  surface: "#111111",
  border:  "#1e1e1e",
  orange:  "#e8620a",
  white:   "#f5f5f5",
  textSub: "#888888",
  textMuted: "#505050",
  green:   "#4ade80",
  amber:   "#f59e0b",
};

const S = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg, padding: 32 },

  back:     { marginBottom: 20 },
  backText: { color: C.textSub, fontSize: 14 },

  eventTitle: { fontSize: 24, fontWeight: "800", color: C.white, letterSpacing: -0.5, lineHeight: 30, marginBottom: 6 },
  eventDate:  { fontSize: 14, color: C.orange, fontWeight: "600", marginBottom: 3 },
  eventVenue: { fontSize: 13, color: C.textSub, marginBottom: 20 },

  qrWrap:       { alignItems: "center", marginBottom: 24 },
  qrFrame:      { backgroundColor: "#fff", borderRadius: 20, padding: 16, alignItems: "center", justifyContent: "center" },
  qrHint:       { fontSize: 12, color: C.textSub, marginTop: 10 },
  qrOfflineHint:{ fontSize: 10, color: C.textMuted, marginTop: 4 },

  infoGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 12,
    backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border,
    padding: 16, marginBottom: 20,
  },
  infoCell:       { minWidth: "40%", flex: 1 },
  infoCellLabel:  { fontSize: 9, fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  infoCellValue:  { fontSize: 15, fontWeight: "700", color: C.white },

  section:      { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: C.textSub, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 },

  emergencyCard:  { backgroundColor: "#130808", borderRadius: 14, borderWidth: 1, borderColor: "rgba(239,68,68,0.25)", padding: 16 },
  emergencyName:  { fontSize: 16, fontWeight: "700", color: C.white, marginBottom: 6 },
  emergencyPhone: { fontSize: 18, fontWeight: "800", color: "#ef4444", textDecorationLine: "underline" },

  scheduleRow:   { flexDirection: "row", alignItems: "flex-start", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border, gap: 14 },
  scheduleTime:  { fontSize: 13, fontWeight: "700", color: C.orange, width: 64 },
  scheduleLabel: { fontSize: 13, color: C.white, flex: 1, lineHeight: 19 },

  mapBtn:     { backgroundColor: "#0e1310", borderRadius: 14, borderWidth: 1, borderColor: "rgba(74,222,128,0.2)", padding: 14, alignItems: "center", marginBottom: 20 },
  mapBtnText: { color: C.green, fontWeight: "700", fontSize: 14 },

  sponsorScroll: { marginTop: 4 },
  sponsorChip:   { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 12, marginRight: 10, alignItems: "center", justifyContent: "center" },
  sponsorLogo:   { width: 80, height: 40 },
  sponsorName:   { fontSize: 13, fontWeight: "700", color: C.white },

  loadingText: { color: C.textMuted, fontSize: 14, marginTop: 14 },
  emptyIcon:   { fontSize: 48, marginBottom: 12 },
  emptyTitle:  { fontSize: 18, fontWeight: "700", color: C.white, textAlign: "center", marginBottom: 6 },
  emptyBody:   { fontSize: 14, color: C.textSub, textAlign: "center", lineHeight: 21, marginBottom: 20 },
  backBtn:     { backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12, borderWidth: 1, borderColor: C.border },
  backBtnText: { color: C.white, fontWeight: "700", fontSize: 14 },
});
