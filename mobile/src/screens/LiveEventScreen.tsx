/**
 * Phase 5 — Live Event Experience
 * Race-day view: countdown to start, live announcements, schedule,
 * aid station map, and weather summary. Polls every 30 s for updates.
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUser }           from "../context/UserContext";
import { useNetwork }        from "../context/NetworkContext";
import { getMyEvent }        from "../services/api";

interface Announcement { id: string; title: string; body: string; severity?: "info" | "warning" | "emergency"; created_at: string }
interface AidStation   { name: string; km: number; services: string[] }
interface LiveEventScreenProps {
  route:      { params: { registrationCode: string } };
  navigation: { goBack: () => void };
}

function countdown(targetIso: string): string {
  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) return "Event started!";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const SEVERITY_COLOR: Record<string, string> = {
  emergency: "#ef4444",
  warning:   "#f59e0b",
  info:      "#60a5fa",
};

export default function LiveEventScreen({ route, navigation }: LiveEventScreenProps) {
  const { registrationCode }           = route.params;
  const { user }                       = useUser();
  const { isConnected }                = useNetwork();
  const insets                         = useSafeAreaInsets();

  const [eventData,     setEventData]     = useState<Record<string, unknown> | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [aidStations,   setAidStations]   = useState<AidStation[]>([]);
  const [countdown_str, setCountdown]     = useState<string>("—");
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!user?.userToken) return;
    if (!silent) setLoading(true);
    try {
      const data = await getMyEvent(user.userToken, registrationCode);
      const d    = data as Record<string, unknown>;
      setEventData(d);
      setAnnouncements((d.announcements as Announcement[]) ?? []);
      setAidStations((d.aid_stations as AidStation[]) ?? []);
    } catch { /* keep previous */ }
    finally   { setLoading(false); setRefreshing(false); }
  }, [user?.userToken, registrationCode]);

  useEffect(() => { load(); }, [load]);

  // Poll every 30 s when online
  useEffect(() => {
    if (!isConnected) return;
    const id = setInterval(() => load(true), 30_000);
    return () => clearInterval(id);
  }, [isConnected, load]);

  // Countdown timer — ticks every second
  useEffect(() => {
    const startIso = eventData?.start_time_iso as string | undefined;
    if (!startIso) return;
    const tick = () => setCountdown(countdown(startIso));
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [eventData?.start_time_iso]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(true); }, [load]);

  const schedule = (eventData?.schedule as { time: string; label: string }[]) ?? [];
  const weather  = eventData?.weather  as { temp_c?: number; condition?: string; humidity?: number } | undefined;
  const started  = eventData?.start_time_iso
    ? new Date(eventData.start_time_iso as string).getTime() <= Date.now()
    : false;

  return (
    <ScrollView
      style={S.root}
      contentContainerStyle={[S.scroll, { paddingTop: insets.top + 16 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.orange} />}
    >
      <TouchableOpacity onPress={navigation.goBack}>
        <Text style={S.back}>← Back</Text>
      </TouchableOpacity>

      <Text style={S.pageTitle}>{(eventData?.title as string) ?? "Live Event"}</Text>

      {!isConnected && (
        <View style={S.offlineBanner}>
          <Text style={S.offlineBannerText}>Offline — showing last known data</Text>
        </View>
      )}

      {loading && (
        <View style={S.center}><ActivityIndicator color={C.orange} size="large" /></View>
      )}

      {!loading && (
        <>
          {/* ── Countdown ── */}
          {eventData?.start_time_iso && (
            <View style={[S.countdownCard, started && S.countdownCardStarted]}>
              <Text style={S.countdownLabel}>{started ? "Time Elapsed" : "Starts in"}</Text>
              <Text style={S.countdownValue}>{countdown_str}</Text>
              {eventData.start_time_iso && (
                <Text style={S.countdownDate}>
                  {new Date(eventData.start_time_iso as string).toLocaleTimeString("en-IN", {
                    hour: "2-digit", minute: "2-digit", hour12: true,
                  })}
                </Text>
              )}
            </View>
          )}

          {/* ── Weather ── */}
          {weather && (
            <View style={S.weatherCard}>
              <Text style={S.weatherIcon}>🌤️</Text>
              <View>
                <Text style={S.weatherTemp}>{weather.temp_c !== undefined ? `${weather.temp_c}°C` : "—"}</Text>
                <Text style={S.weatherCond}>{weather.condition ?? ""}</Text>
              </View>
              {weather.humidity !== undefined && (
                <View style={S.weatherRight}>
                  <Text style={S.weatherLabel}>HUMIDITY</Text>
                  <Text style={S.weatherValue}>{weather.humidity}%</Text>
                </View>
              )}
            </View>
          )}

          {/* ── Announcements ── */}
          {announcements.length > 0 && (
            <View style={S.section}>
              <Text style={S.sectionTitle}>📣 Announcements</Text>
              {announcements.map(a => (
                <View key={a.id} style={[
                  S.announcementCard,
                  { borderColor: (SEVERITY_COLOR[a.severity ?? "info"] ?? C.blue) + "44" },
                  a.severity === "emergency" && S.announcementEmergency,
                ]}>
                  {a.severity === "emergency" && (
                    <Text style={S.emergencyTag}>🚨 EMERGENCY</Text>
                  )}
                  <Text style={[S.announcementTitle, { color: SEVERITY_COLOR[a.severity ?? "info"] ?? C.blue }]}>
                    {a.title}
                  </Text>
                  <Text style={S.announcementBody}>{a.body}</Text>
                  <Text style={S.announcementTime}>
                    {new Date(a.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* ── Schedule ── */}
          {schedule.length > 0 && (
            <View style={S.section}>
              <Text style={S.sectionTitle}>🗓 Schedule</Text>
              {schedule.map((item, i) => (
                <View key={i} style={S.scheduleRow}>
                  <Text style={S.scheduleTime}>{item.time}</Text>
                  <View style={S.scheduleTrack}>
                    <View style={S.scheduleDot} />
                    {i < schedule.length - 1 && <View style={S.scheduleLine} />}
                  </View>
                  <Text style={S.scheduleLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ── Aid stations ── */}
          {aidStations.length > 0 && (
            <View style={S.section}>
              <Text style={S.sectionTitle}>💧 Aid Stations</Text>
              {aidStations.map((station, i) => (
                <View key={i} style={S.aidCard}>
                  <View style={S.aidLeft}>
                    <Text style={S.aidKm}>{station.km} km</Text>
                  </View>
                  <View style={S.aidRight}>
                    <Text style={S.aidName}>{station.name}</Text>
                    <View style={S.aidServices}>
                      {station.services.map((svc, j) => (
                        <View key={j} style={S.aidServiceChip}>
                          <Text style={S.aidServiceText}>{svc}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {!announcements.length && !schedule.length && !aidStations.length && !eventData?.start_time_iso && (
            <View style={S.empty}>
              <Text style={S.emptyIcon}>🏃</Text>
              <Text style={S.emptyTitle}>Event details loading</Text>
              <Text style={S.emptyBody}>Pull to refresh once the event goes live.</Text>
            </View>
          )}
        </>
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
  blue:    "#60a5fa",
};

const S = StyleSheet.create({
  root:  { flex: 1, backgroundColor: C.bg },
  scroll:{ paddingHorizontal: 20, paddingBottom: 24 },
  center:{ paddingTop: 80, alignItems: "center" },

  back:      { color: C.textSub, fontSize: 14, marginBottom: 16 },
  pageTitle: { fontSize: 22, fontWeight: "800", color: C.white, letterSpacing: -0.4, marginBottom: 16 },

  offlineBanner:     { backgroundColor: "#1a1004", borderRadius: 10, borderWidth: 1, borderColor: "rgba(245,158,11,0.25)", padding: 10, alignItems: "center", marginBottom: 16 },
  offlineBannerText: { fontSize: 12, color: C.amber, fontWeight: "600" },

  countdownCard: {
    alignItems: "center", backgroundColor: "#080d0a",
    borderRadius: 20, borderWidth: 1, borderColor: "rgba(74,222,128,0.25)",
    padding: 24, marginBottom: 16,
  },
  countdownCardStarted: { borderColor: "rgba(232,98,10,0.35)", backgroundColor: "#0d0802" },
  countdownLabel: { fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  countdownValue: { fontSize: 48, fontWeight: "900", color: C.white, letterSpacing: -2, fontVariant: ["tabular-nums"] },
  countdownDate:  { fontSize: 13, color: C.textSub, marginTop: 6 },

  weatherCard:  { flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 20 },
  weatherIcon:  { fontSize: 32 },
  weatherTemp:  { fontSize: 22, fontWeight: "800", color: C.white },
  weatherCond:  { fontSize: 13, color: C.textSub },
  weatherRight: { marginLeft: "auto" },
  weatherLabel: { fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8 },
  weatherValue: { fontSize: 16, fontWeight: "700", color: C.white },

  section:      { marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: C.textSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },

  announcementCard: {
    backgroundColor: "#0e0e14", borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10,
  },
  announcementEmergency: { backgroundColor: "#120808" },
  emergencyTag:     { fontSize: 11, fontWeight: "800", color: "#ef4444", marginBottom: 6, letterSpacing: 0.5 },
  announcementTitle:{ fontSize: 15, fontWeight: "700", marginBottom: 5 },
  announcementBody: { fontSize: 13, color: C.textSub, lineHeight: 19 },
  announcementTime: { fontSize: 10, color: C.textMuted, marginTop: 6 },

  scheduleRow:  { flexDirection: "row", gap: 0, marginBottom: 0, alignItems: "flex-start" },
  scheduleTime: { fontSize: 12, fontWeight: "700", color: C.orange, width: 56, paddingTop: 4 },
  scheduleTrack:{ width: 20, alignItems: "center", gap: 0 },
  scheduleDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: C.orange, marginTop: 6 },
  scheduleLine: { width: 2, flex: 1, minHeight: 28, backgroundColor: "#2a2a2a" },
  scheduleLabel:{ fontSize: 13, color: C.white, flex: 1, paddingTop: 4, paddingBottom: 16, paddingLeft: 10, lineHeight: 19 },

  aidCard:    { flexDirection: "row", gap: 14, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 10 },
  aidLeft:    { width: 52, alignItems: "center", justifyContent: "center" },
  aidKm:      { fontSize: 18, fontWeight: "800", color: C.blue, textAlign: "center" },
  aidRight:   { flex: 1 },
  aidName:    { fontSize: 14, fontWeight: "700", color: C.white, marginBottom: 6 },
  aidServices:{ flexDirection: "row", flexWrap: "wrap", gap: 6 },
  aidServiceChip: { backgroundColor: "#1a2030", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "rgba(96,165,250,0.2)" },
  aidServiceText: { fontSize: 11, color: C.blue },

  empty:      { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyIcon:  { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: C.white, textAlign: "center" },
  emptyBody:  { fontSize: 14, color: C.textSub, textAlign: "center", lineHeight: 21 },
});
