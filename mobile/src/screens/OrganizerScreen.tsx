/**
 * Phase 7 — Organizer Mobile Dashboard
 * Lightweight real-time ops view for event organizers.
 * Polls live stats (check-ins, revenue, volunteer status, queue health).
 * Reuses /api/ops/events/[id]/live-stats and /api/ops/events/[id]/registrations.
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUser }           from "../context/UserContext";
import { useNetwork }        from "../context/NetworkContext";
import { opsLiveStats, opsSearchParticipants } from "../services/api";

interface LiveStats {
  total_registrations: number;
  checkin_count:       number;
  tshirt_count:        number;
  breakfast_count:     number;
  bib_count:           number;
  revenue_paise?:      number;
  queue_depth?:        number;
  volunteers_active?:  number;
}

interface ParticipantResult {
  id:                  string;
  name:                string;
  registration_code:   string;
  distance_category:   string;
  checkin_done:        boolean;
  tshirt_done:         boolean;
  breakfast_done:      boolean;
  bib_done:            boolean;
}

function pct(num: number, denom: number): string {
  if (!denom) return "0%";
  return `${Math.round((num / denom) * 100)}%`;
}

function fmtRevenue(paise: number | undefined): string {
  if (paise === undefined || paise === null) return "—";
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

function StatCard({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent?: string;
}) {
  return (
    <View style={[SK.card, accent && { borderColor: accent + "44" }]}>
      <Text style={SK.label}>{label}</Text>
      <Text style={[SK.value, accent && { color: accent }]}>{String(value)}</Text>
      {sub ? <Text style={SK.sub}>{sub}</Text> : null}
    </View>
  );
}

function ProgressBar({ value, total, color }: { value: number; total: number; color: string }) {
  const pctNum = total > 0 ? (value / total) * 100 : 0;
  return (
    <View style={PB.wrap}>
      <View style={[PB.fill, { width: `${Math.min(pctNum, 100)}%`, backgroundColor: color }]} />
    </View>
  );
}

export default function OrganizerScreen() {
  const { opsSession }              = useUser();
  const { isConnected }             = useNetwork();
  const insets                      = useSafeAreaInsets();

  const [stats,       setStats]     = useState<LiveStats | null>(null);
  const [search,      setSearch]    = useState("");
  const [results,     setResults]   = useState<ParticipantResult[]>([]);
  const [searching,   setSearching] = useState(false);
  const [loading,     setLoading]   = useState(true);
  const [refreshing,  setRefreshing]= useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const loadStats = useCallback(async (silent = false) => {
    if (!opsSession?.token || !opsSession.event_id || !isConnected) {
      setLoading(false); return;
    }
    if (!silent) setLoading(true);
    try {
      const data = await opsLiveStats(opsSession.token, opsSession.event_id);
      setStats(data as LiveStats);
      setLastUpdated(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch { /* keep previous */ }
    finally   { setLoading(false); setRefreshing(false); }
  }, [opsSession?.token, opsSession?.event_id, isConnected]);

  useEffect(() => { loadStats(); }, [loadStats]);

  // Poll every 15 s
  useEffect(() => {
    if (!isConnected) return;
    const id = setInterval(() => loadStats(true), 15_000);
    return () => clearInterval(id);
  }, [isConnected, loadStats]);

  const onRefresh = useCallback(() => { setRefreshing(true); loadStats(true); }, [loadStats]);

  // Debounced participant search
  function handleSearchChange(text: string) {
    setSearch(text);
    if (searchTimer) clearTimeout(searchTimer);
    if (!text.trim() || text.length < 2) { setResults([]); return; }
    setSearchTimer(setTimeout(async () => {
      if (!opsSession?.token || !opsSession.event_id) return;
      setSearching(true);
      try {
        const res = await opsSearchParticipants(opsSession.token, opsSession.event_id, text.trim());
        setResults((res as { data?: ParticipantResult[] }).data ?? []);
      } catch { setResults([]); }
      finally   { setSearching(false); }
    }, 400));
  }

  if (!opsSession) {
    return (
      <View style={[S.center, { paddingTop: insets.top + 40 }]}>
        <Text style={S.emptyIcon}>🔒</Text>
        <Text style={S.emptyTitle}>Ops session required</Text>
        <Text style={S.emptyBody}>Sign in via the Scanner tab to access the organizer dashboard.</Text>
      </View>
    );
  }

  const total = stats?.total_registrations ?? 0;

  return (
    <ScrollView
      style={S.root}
      contentContainerStyle={S.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.orange} />}
    >
      {/* ── Header ── */}
      <View style={[S.header, { paddingTop: Math.max(insets.top + 12, 20) }]}>
        <View>
          <Text style={S.title}>Organizer Dashboard</Text>
          {lastUpdated && <Text style={S.updated}>Updated {lastUpdated}</Text>}
        </View>
        {loading && !refreshing && <ActivityIndicator color={C.orange} />}
      </View>

      {!isConnected && (
        <View style={S.offlineBanner}>
          <Text style={S.offlineBannerText}>Offline — real-time data unavailable</Text>
        </View>
      )}

      {/* ── Stats grid ── */}
      {stats && (
        <>
          <View style={S.statsRow}>
            <StatCard label="Checked In"   value={`${stats.checkin_count} / ${total}`}   sub={pct(stats.checkin_count, total)} accent={C.green} />
            <StatCard label="T-Shirts"     value={`${stats.tshirt_count} / ${total}`}    sub={pct(stats.tshirt_count, total)}  accent={C.blue} />
          </View>
          <View style={S.statsRow}>
            <StatCard label="Breakfast"    value={`${stats.breakfast_count} / ${total}`} sub={pct(stats.breakfast_count, total)} accent={C.amber} />
            <StatCard label="BIB Collect"  value={`${stats.bib_count} / ${total}`}       sub={pct(stats.bib_count, total)}      accent={C.purple} />
          </View>
          {stats.revenue_paise !== undefined && (
            <View style={S.statsRow}>
              <StatCard label="Revenue"           value={fmtRevenue(stats.revenue_paise)}    accent={C.green} />
              <StatCard label="Total Registrations" value={total} />
            </View>
          )}

          {/* ── Progress bars ── */}
          <View style={S.progressSection}>
            <Text style={S.progressTitle}>Service Progress</Text>
            {[
              { label: "Check-In",  value: stats.checkin_count,   color: C.green  },
              { label: "T-Shirt",   value: stats.tshirt_count,    color: C.blue   },
              { label: "Breakfast", value: stats.breakfast_count, color: C.amber  },
              { label: "BIB",       value: stats.bib_count,       color: C.purple },
            ].map(row => (
              <View key={row.label} style={S.progressRow}>
                <Text style={S.progressLabel}>{row.label}</Text>
                <ProgressBar value={row.value} total={total} color={row.color} />
                <Text style={[S.progressPct, { color: row.color }]}>{pct(row.value, total)}</Text>
              </View>
            ))}
          </View>

          {/* ── Queue & volunteers ── */}
          {(stats.queue_depth !== undefined || stats.volunteers_active !== undefined) && (
            <View style={S.statsRow}>
              {stats.queue_depth !== undefined && (
                <StatCard label="Queue Depth"       value={stats.queue_depth}       accent={stats.queue_depth > 20 ? C.red : C.green} />
              )}
              {stats.volunteers_active !== undefined && (
                <StatCard label="Volunteers Active" value={stats.volunteers_active} accent={C.blue} />
              )}
            </View>
          )}
        </>
      )}

      {!stats && !loading && (
        <View style={S.empty}>
          <Text style={S.emptyIcon}>📊</Text>
          <Text style={S.emptyTitle}>No data yet</Text>
          <Text style={S.emptyBody}>Stats appear once the event is active.</Text>
        </View>
      )}

      {/* ── Participant search ── */}
      <View style={S.searchSection}>
        <Text style={S.sectionTitle}>Search Participants</Text>
        <View style={S.searchRow}>
          <TextInput
            style={S.searchInput}
            placeholder="Name or registration code…"
            placeholderTextColor="#555"
            value={search}
            onChangeText={handleSearchChange}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searching && <ActivityIndicator color={C.orange} style={{ marginLeft: 10 }} />}
        </View>

        {results.map(p => (
          <View key={p.id} style={S.participantCard}>
            <View style={S.participantTop}>
              <Text style={S.participantName} numberOfLines={1}>{p.name}</Text>
              <Text style={S.participantCat}>{p.distance_category}</Text>
            </View>
            <Text style={S.participantCode}>{p.registration_code}</Text>
            <View style={S.serviceIcons}>
              {[
                { label: "✅ Check-In",  done: p.checkin_done },
                { label: "👕 T-Shirt",   done: p.tshirt_done },
                { label: "🥐 Breakfast", done: p.breakfast_done },
                { label: "🏷️ BIB",       done: p.bib_done },
              ].map(svc => (
                <View key={svc.label} style={[S.svcIcon, svc.done && S.svcIconDone]}>
                  <Text style={[S.svcIconText, !svc.done && S.svcIconTextUndone]}>{svc.label}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        {search.length > 1 && results.length === 0 && !searching && (
          <Text style={S.noResults}>No participants found for "{search}"</Text>
        )}
      </View>

      <View style={{ height: 48 }} />
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
  purple:  "#a78bfa",
  red:     "#ef4444",
};

const S = StyleSheet.create({
  root:  { flex: 1, backgroundColor: C.bg },
  scroll:{ paddingBottom: 24 },
  center:{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg, padding: 32 },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 18,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  title:   { fontSize: 22, fontWeight: "800", color: C.white, letterSpacing: -0.4 },
  updated: { fontSize: 11, color: C.textMuted, marginTop: 3 },

  offlineBanner:     { marginHorizontal: 16, marginTop: 12, backgroundColor: "#1a1004", borderRadius: 10, borderWidth: 1, borderColor: "rgba(245,158,11,0.25)", padding: 10, alignItems: "center" },
  offlineBannerText: { fontSize: 12, color: C.amber, fontWeight: "600" },

  statsRow: { flexDirection: "row", gap: 12, marginHorizontal: 16, marginTop: 14 },

  progressSection: { marginHorizontal: 16, marginTop: 20, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16 },
  progressTitle:   { fontSize: 13, fontWeight: "700", color: C.textSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 },
  progressRow:     { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  progressLabel:   { fontSize: 12, color: C.textSub, width: 68 },
  progressPct:     { fontSize: 12, fontWeight: "700", width: 38, textAlign: "right" },

  searchSection: { marginHorizontal: 16, marginTop: 24 },
  sectionTitle:  { fontSize: 13, fontWeight: "700", color: C.textSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
  searchRow:     { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  searchInput:   { flex: 1, backgroundColor: "#141414", borderRadius: 10, padding: 13, color: C.white, fontSize: 14, borderWidth: 1, borderColor: "#222" },

  participantCard: {
    backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    padding: 14, marginBottom: 10, gap: 6,
  },
  participantTop:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  participantName: { fontSize: 15, fontWeight: "700", color: C.white, flex: 1 },
  participantCat:  { fontSize: 12, color: C.textSub },
  participantCode: { fontSize: 10, color: C.textMuted },
  serviceIcons:    { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  svcIcon:         { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: "#1a1a1a", borderWidth: 1, borderColor: "#2a2a2a" },
  svcIconDone:     { backgroundColor: "#0a1208", borderColor: "rgba(74,222,128,0.2)" },
  svcIconText:     { fontSize: 11, color: "#4ade80" },
  svcIconTextUndone: { color: C.textMuted },
  noResults:       { fontSize: 13, color: C.textMuted, textAlign: "center", paddingVertical: 20 },

  emptyIcon:   { fontSize: 48, marginBottom: 12, textAlign: "center" },
  emptyTitle:  { fontSize: 18, fontWeight: "700", color: C.white, textAlign: "center", marginBottom: 6 },
  emptyBody:   { fontSize: 14, color: C.textSub, textAlign: "center", lineHeight: 21 },
  empty:       { alignItems: "center", paddingTop: 40, paddingHorizontal: 40, marginTop: 16, gap: 0 },
});

const SK = StyleSheet.create({
  card:  { flex: 1, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14 },
  label: { fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 4 },
  value: { fontSize: 20, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  sub:   { fontSize: 11, color: C.textSub, marginTop: 3 },
});

const PB = StyleSheet.create({
  wrap: { flex: 1, height: 6, backgroundColor: "#1a1a1a", borderRadius: 3, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
});
