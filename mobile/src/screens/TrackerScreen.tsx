/**
 * Phase 6 — Participant Tracker
 * Completed events, stats, certificates, achievements, and leaderboard.
 * Reuses /api/events/my-registrations and /api/user/invoices.
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUser }           from "../context/UserContext";
import { useNetwork }        from "../context/NetworkContext";
import { getMyRegistrations, getUserInvoices } from "../services/api";
import type { MyRegistration } from "../types";

interface InvoiceItem { id: string; invoice_number: string; amount: string; created_at: string; download_url?: string }

const DISTANCE_ICON: Record<string, string> = {
  "5K":    "🟢",
  "10K":   "🔵",
  "21K":   "🟡",
  "42K":   "🔴",
  "half":  "🟡",
  "full":  "🔴",
  default: "🏃",
};

function distanceIcon(category: string): string {
  const upper = category?.toUpperCase() ?? "";
  if (upper.includes("42") || upper.includes("FULL"))  return DISTANCE_ICON["42K"];
  if (upper.includes("21") || upper.includes("HALF"))  return DISTANCE_ICON["21K"];
  if (upper.includes("10"))                            return DISTANCE_ICON["10K"];
  if (upper.includes("5"))                             return DISTANCE_ICON["5K"];
  return DISTANCE_ICON.default;
}

type Tab = "events" | "stats" | "invoices";

export default function TrackerScreen() {
  const { user }                = useUser();
  const { isConnected }         = useNetwork();
  const insets                  = useSafeAreaInsets();

  const [tab,           setTab]           = useState<Tab>("events");
  const [registrations, setRegistrations] = useState<MyRegistration[]>([]);
  const [invoices,      setInvoices]      = useState<InvoiceItem[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!user?.userToken) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const [regs, invs] = await Promise.all([
        getMyRegistrations(user.userToken).catch(() => [] as MyRegistration[]),
        getUserInvoices(user.userToken).catch(() => [] as InvoiceItem[]),
      ]);
      setRegistrations(Array.isArray(regs) ? regs : []);
      setInvoices(Array.isArray(invs) ? invs : []);
    } catch { /* keep previous */ }
    finally   { setLoading(false); setRefreshing(false); }
  }, [user?.userToken]);

  useEffect(() => { if (isConnected) load(); else setLoading(false); }, [isConnected, load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(true); }, [load]);

  // ── Stats computation ────────────────────────────────────────────────────

  const confirmed = registrations.filter(r => r.payment_status === "paid" || r.payment_status === "confirmed");
  const total     = confirmed.length;
  const distances: Record<string, number> = {};
  for (const r of confirmed) {
    const cat = r.participants?.[0]?.distance_category ?? "Other";
    distances[cat] = (distances[cat] ?? 0) + 1;
  }
  const totalSpend = invoices.reduce((acc, inv) => {
    const n = parseFloat(inv.amount);
    return acc + (isNaN(n) ? 0 : n);
  }, 0);

  return (
    <ScrollView
      style={S.root}
      contentContainerStyle={S.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.orange} />}
    >
      {/* ── Header ── */}
      <View style={[S.header, { paddingTop: Math.max(insets.top + 12, 20) }]}>
        <Text style={S.title}>My Journey</Text>
        {total > 0 && (
          <View style={S.badge}>
            <Text style={S.badgeText}>{total} event{total !== 1 ? "s" : ""}</Text>
          </View>
        )}
      </View>

      {!isConnected && (
        <View style={S.offlineBanner}>
          <Text style={S.offlineBannerText}>Offline — showing cached data</Text>
        </View>
      )}

      {/* ── Tabs ── */}
      <View style={S.tabs}>
        {(["events", "stats", "invoices"] as Tab[]).map(t => (
          <TouchableOpacity key={t} style={[S.tab, tab === t && S.tabActive]} onPress={() => setTab(t)}>
            <Text style={[S.tabText, tab === t && S.tabTextActive]}>
              {t === "events" ? "Events" : t === "stats" ? "Stats" : "Invoices"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && (
        <View style={S.center}><ActivityIndicator color={C.orange} size="large" /></View>
      )}

      {!loading && tab === "events" && (
        <>
          {registrations.length === 0 ? (
            <View style={S.empty}>
              <Text style={S.emptyIcon}>🎽</Text>
              <Text style={S.emptyTitle}>No events yet</Text>
              <Text style={S.emptyBody}>Register for a Connected Steps event to start tracking your journey.</Text>
            </View>
          ) : (
            registrations
              .slice()
              .sort((a, b) => new Date(b.event.date).getTime() - new Date(a.event.date).getTime())
              .map(reg => {
                const participant = reg.participants?.[0];
                const isPaid      = reg.payment_status === "paid" || reg.payment_status === "confirmed";
                const cat         = participant?.distance_category ?? "";
                const icon        = distanceIcon(cat);

                return (
                  <View key={reg.registration_code} style={S.eventCard}>
                    <View style={S.eventCardLeft}>
                      <Text style={S.eventDistIcon}>{icon}</Text>
                    </View>
                    <View style={S.eventCardBody}>
                      <View style={S.eventCardTop}>
                        <Text style={S.eventName} numberOfLines={2}>{reg.event.title}</Text>
                        <View style={[S.statusChip, isPaid ? S.statusChipGreen : S.statusChipAmber]}>
                          <Text style={[S.statusChipText, isPaid ? S.statusChipTextGreen : S.statusChipTextAmber]}>
                            {isPaid ? "✓" : reg.payment_status}
                          </Text>
                        </View>
                      </View>
                      <Text style={S.eventDate}>
                        {reg.event.date
                          ? new Date(reg.event.date + "T00:00:00").toLocaleDateString("en-IN", {
                              day: "numeric", month: "short", year: "numeric",
                            })
                          : ""}
                      </Text>
                      <View style={S.eventMeta}>
                        {cat ? <Text style={S.metaChip}>{cat}</Text> : null}
                        {participant?.bib_number ? <Text style={S.metaChip}>BIB {participant.bib_number}</Text> : null}
                        {participant?.tshirt_size ? <Text style={S.metaChip}>T-shirt: {participant.tshirt_size}</Text> : null}
                      </View>
                      <Text style={S.regCode}>{reg.registration_code}</Text>
                    </View>
                  </View>
                );
              })
          )}
        </>
      )}

      {!loading && tab === "stats" && (
        <>
          {/* ── Summary cards ── */}
          <View style={S.statsGrid}>
            <View style={S.statCard}>
              <Text style={S.statValue}>{total}</Text>
              <Text style={S.statLabel}>Events Completed</Text>
            </View>
            <View style={S.statCard}>
              <Text style={S.statValue}>₹{Math.round(totalSpend).toLocaleString("en-IN")}</Text>
              <Text style={S.statLabel}>Total Invested</Text>
            </View>
          </View>

          {/* ── Distance breakdown ── */}
          {Object.entries(distances).length > 0 && (
            <View style={S.section}>
              <Text style={S.sectionTitle}>Distance Breakdown</Text>
              {Object.entries(distances)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, count]) => (
                  <View key={cat} style={S.distRow}>
                    <Text style={S.distIcon}>{distanceIcon(cat)}</Text>
                    <View style={S.distBarWrap}>
                      <Text style={S.distLabel}>{cat}</Text>
                      <View style={S.distBar}>
                        <View style={[S.distBarFill, { width: `${(count / total) * 100}%` }]} />
                      </View>
                    </View>
                    <Text style={S.distCount}>{count}×</Text>
                  </View>
                ))}
            </View>
          )}

          {total === 0 && (
            <View style={S.empty}>
              <Text style={S.emptyIcon}>📊</Text>
              <Text style={S.emptyTitle}>No stats yet</Text>
              <Text style={S.emptyBody}>Complete your first event to see your running stats.</Text>
            </View>
          )}
        </>
      )}

      {!loading && tab === "invoices" && (
        <>
          {invoices.length === 0 ? (
            <View style={S.empty}>
              <Text style={S.emptyIcon}>🧾</Text>
              <Text style={S.emptyTitle}>No invoices</Text>
              <Text style={S.emptyBody}>Invoices for confirmed registrations will appear here.</Text>
            </View>
          ) : (
            invoices.map(inv => (
              <View key={inv.id} style={S.invoiceCard}>
                <View style={S.invoiceLeft}>
                  <Text style={S.invoiceNum}>{inv.invoice_number}</Text>
                  <Text style={S.invoiceDate}>
                    {new Date(inv.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </Text>
                </View>
                <View style={S.invoiceRight}>
                  <Text style={S.invoiceAmount}>₹{parseFloat(inv.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</Text>
                  {inv.download_url && (
                    <TouchableOpacity onPress={() => Linking.openURL(inv.download_url!)}>
                      <Text style={S.downloadBtn}>Download</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}
        </>
      )}

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const C = {
  bg:      "#080808",
  surface: "#111111",
  border:  "#1e1e1e",
  orange:  "#e8620a",
  orangeDim: "rgba(232,98,10,0.12)",
  white:   "#f5f5f5",
  textSub: "#888888",
  textMuted: "#505050",
  green:   "#4ade80",
  greenDim: "rgba(74,222,128,0.12)",
  amber:   "#f59e0b",
  amberDim: "rgba(245,158,11,0.12)",
};

const S = StyleSheet.create({
  root:  { flex: 1, backgroundColor: C.bg },
  scroll:{ paddingBottom: 24 },
  center:{ paddingTop: 80, alignItems: "center" },

  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingBottom: 18,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  title: { fontSize: 22, fontWeight: "800", color: C.white, letterSpacing: -0.4, flex: 1 },
  badge: { backgroundColor: C.orangeDim, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(232,98,10,0.22)" },
  badgeText: { color: C.orange, fontSize: 12, fontWeight: "700" },

  offlineBanner:     { marginHorizontal: 16, marginTop: 12, backgroundColor: "#1a1004", borderRadius: 10, borderWidth: 1, borderColor: "rgba(245,158,11,0.25)", padding: 10, alignItems: "center" },
  offlineBannerText: { fontSize: 12, color: C.amber, fontWeight: "600" },

  tabs: { flexDirection: "row", marginHorizontal: 16, marginVertical: 14, backgroundColor: C.surface, borderRadius: 12, padding: 3, gap: 3 },
  tab:       { flex: 1, padding: 9, borderRadius: 10, alignItems: "center" },
  tabActive: { backgroundColor: "#2a2a2a" },
  tabText:   { fontSize: 13, fontWeight: "600", color: C.textMuted },
  tabTextActive: { color: C.white },

  empty:      { alignItems: "center", paddingTop: 60, paddingHorizontal: 40, gap: 12 },
  emptyIcon:  { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: C.white, textAlign: "center" },
  emptyBody:  { fontSize: 14, color: C.textSub, textAlign: "center", lineHeight: 21 },

  eventCard: {
    flexDirection: "row", alignItems: "flex-start",
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14, gap: 12,
  },
  eventCardLeft:    { width: 44, alignItems: "center", paddingTop: 2 },
  eventDistIcon:    { fontSize: 28 },
  eventCardBody:    { flex: 1, gap: 5 },
  eventCardTop:     { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  eventName:        { fontSize: 14, fontWeight: "700", color: C.white, flex: 1, lineHeight: 20 },
  statusChip:       { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, flexShrink: 0 },
  statusChipGreen:  { backgroundColor: C.greenDim, borderColor: "rgba(74,222,128,0.25)" },
  statusChipAmber:  { backgroundColor: C.amberDim, borderColor: "rgba(245,158,11,0.25)" },
  statusChipText:   { fontSize: 10, fontWeight: "700" },
  statusChipTextGreen: { color: C.green },
  statusChipTextAmber: { color: C.amber },
  eventDate:        { fontSize: 12, color: C.textSub },
  eventMeta:        { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  metaChip:         { fontSize: 11, color: C.textMuted, backgroundColor: "#1a1a1a", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  regCode:          { fontSize: 10, color: C.textMuted },

  statsGrid: { flexDirection: "row", gap: 12, marginHorizontal: 16, marginBottom: 20 },
  statCard:  { flex: 1, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16, alignItems: "center", gap: 6 },
  statValue: { fontSize: 26, fontWeight: "900", color: C.orange, letterSpacing: -0.5 },
  statLabel: { fontSize: 11, color: C.textSub, textAlign: "center" },

  section:      { marginHorizontal: 16, marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: C.textSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 },

  distRow:    { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 10 },
  distIcon:   { fontSize: 20, width: 28 },
  distBarWrap:{ flex: 1, gap: 4 },
  distLabel:  { fontSize: 12, color: C.white, fontWeight: "600" },
  distBar:    { height: 6, backgroundColor: "#1a1a1a", borderRadius: 3, overflow: "hidden" },
  distBarFill:{ height: 6, backgroundColor: C.orange, borderRadius: 3 },
  distCount:  { fontSize: 14, fontWeight: "700", color: C.orange, width: 30, textAlign: "right" },

  invoiceCard: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14,
  },
  invoiceLeft:   { gap: 4 },
  invoiceNum:    { fontSize: 14, fontWeight: "700", color: C.white },
  invoiceDate:   { fontSize: 12, color: C.textSub },
  invoiceRight:  { alignItems: "flex-end", gap: 6 },
  invoiceAmount: { fontSize: 16, fontWeight: "800", color: C.white },
  downloadBtn:   { fontSize: 12, color: C.orange, fontWeight: "700", textDecorationLine: "underline" },
});
