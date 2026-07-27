/**
 * Phase 1 — Offline QR Wallet
 * Displays participant's event QR codes, bib number, and event details.
 * QR images are downloaded and cached locally for offline access.
 * Data is stored via the offline service (SQLite) for persistence between sessions.
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Image, RefreshControl, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as FileSystem        from "expo-file-system";
import { useUser }            from "../context/UserContext";
import { useNetwork }         from "../context/NetworkContext";
import { getMyRegistrations } from "../services/api";
import { saveWalletItem, getWalletItems, updateQrLocalPath, type WalletItem } from "../services/offline";
import { CS_API_BASE }        from "../config";
import type { MyRegistration } from "../types";

const QR_CACHE_DIR = (FileSystem.cacheDirectory ?? "") + "qr/";

async function cacheQr(qrToken: string, regCode: string): Promise<string | null> {
  try {
    await FileSystem.makeDirectoryAsync(QR_CACHE_DIR, { intermediates: true });
    const localPath = QR_CACHE_DIR + regCode.replace(/[^a-z0-9]/gi, "_") + ".png";
    const info      = await FileSystem.getInfoAsync(localPath);
    if (info.exists) return localPath;
    const url = `${CS_API_BASE}/api/events/qr/${encodeURIComponent(qrToken)}`;
    const res = await FileSystem.downloadAsync(url, localPath);
    return res.status === 200 ? localPath : null;
  } catch {
    return null;
  }
}

function fmtDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function StatusChip({ status }: { status: string }) {
  const isConfirmed = status === "confirmed" || status === "paid";
  return (
    <View style={[S.chip, isConfirmed ? S.chipGreen : S.chipAmber]}>
      <Text style={[S.chipText, isConfirmed ? S.chipTextGreen : S.chipTextAmber]}>
        {isConfirmed ? "✓ Confirmed" : status}
      </Text>
    </View>
  );
}

export default function EventWalletScreen() {
  const { user }                   = useUser();
  const { isConnected }            = useNetwork();
  const insets                     = useSafeAreaInsets();
  const [items,       setItems]    = useState<WalletItem[]>([]);
  const [loading,     setLoading]  = useState(true);
  const [refreshing,  setRefreshing] = useState(false);
  const [expanded,    setExpanded] = useState<string | null>(null);
  const [syncingQr,   setSyncingQr]= useState(false);

  const loadCached = useCallback(async () => {
    const cached = await getWalletItems();
    setItems(cached);
  }, []);

  const syncFromServer = useCallback(async (silent = false) => {
    if (!user?.userToken) return;
    if (!silent) setLoading(true);
    try {
      const registrations: MyRegistration[] = await getMyRegistrations(user.userToken);
      setSyncingQr(true);

      for (const reg of registrations) {
        const firstParticipant = reg.participants?.[0];
        if (!reg.qr_token && !firstParticipant?.qr_token) continue;
        const qrToken = reg.qr_token ?? firstParticipant?.qr_token ?? "";

        let localPath: string | null = null;
        if (qrToken) {
          localPath = await cacheQr(qrToken, reg.registration_code);
        }

        const item: WalletItem = {
          registration_code: reg.registration_code,
          event_id:          reg.event.id,
          event_title:       reg.event.title,
          event_date:        reg.event.date,
          qr_token:          qrToken,
          bib_number:        firstParticipant?.bib_number ?? null,
          category:          firstParticipant?.distance_category ?? "",
          status:            reg.payment_status,
          qr_local_path:     localPath,
          cached_at:         Date.now(),
        };
        await saveWalletItem(item);
      }
      setSyncingQr(false);
      await loadCached();
    } catch {
      await loadCached();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.userToken, loadCached]);

  useEffect(() => {
    if (isConnected && user?.userToken) {
      syncFromServer();
    } else {
      loadCached().finally(() => setLoading(false));
    }
  }, [isConnected, user?.userToken, syncFromServer, loadCached]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    syncFromServer(true);
  }, [syncFromServer]);

  if (!user) return null;

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
          <Text style={S.headerTitle}>Event Wallet</Text>
          <Text style={S.headerSub}>Your QR codes & event passes</Text>
        </View>
        {syncingQr && (
          <View style={S.syncBadge}>
            <ActivityIndicator size="small" color={C.orange} />
            <Text style={S.syncBadgeText}>Syncing</Text>
          </View>
        )}
      </View>

      {/* ── Offline banner ── */}
      {!isConnected && (
        <View style={S.offlineBanner}>
          <Text style={S.offlineBannerText}>Offline — showing cached passes</Text>
        </View>
      )}

      {/* ── No token ── */}
      {!user.userToken && (
        <View style={S.emptyState}>
          <Text style={S.emptyIcon}>🔑</Text>
          <Text style={S.emptyTitle}>Sign in required</Text>
          <Text style={S.emptyBody}>Please sign out and sign in again to enable your event wallet.</Text>
        </View>
      )}

      {/* ── Loading ── */}
      {loading && (
        <View style={S.center}>
          <ActivityIndicator color={C.orange} size="large" />
          <Text style={S.loadingText}>Loading your events…</Text>
        </View>
      )}

      {/* ── Empty state ── */}
      {!loading && items.length === 0 && user.userToken && (
        <View style={S.emptyState}>
          <Text style={S.emptyIcon}>🎟️</Text>
          <Text style={S.emptyTitle}>No registrations yet</Text>
          <Text style={S.emptyBody}>
            Register for a Connected Steps event and your QR pass will appear here.
          </Text>
        </View>
      )}

      {/* ── Event passes ── */}
      {!loading && items.map(item => {
        const isOpen  = expanded === item.registration_code;
        const hasQr   = !!(item.qr_local_path || item.qr_token);
        const qrSource= item.qr_local_path
          ? { uri: `file://${item.qr_local_path}` }
          : { uri: `${CS_API_BASE}/api/events/qr/${encodeURIComponent(item.qr_token)}` };

        return (
          <TouchableOpacity
            key={item.registration_code}
            style={S.passCard}
            activeOpacity={0.88}
            onPress={() => setExpanded(isOpen ? null : item.registration_code)}
          >
            <View style={S.passGlow} pointerEvents="none" />
            <View style={S.passHeader}>
              <View style={{ flex: 1 }}>
                <Text style={S.passTitle} numberOfLines={2}>{item.event_title}</Text>
                <Text style={S.passDate}>{item.event_date ? fmtDate(item.event_date) : ""}</Text>
              </View>
              <StatusChip status={item.status} />
            </View>

            <View style={S.passRow}>
              <View style={S.passField}>
                <Text style={S.passFieldLabel}>CATEGORY</Text>
                <Text style={S.passFieldValue}>{item.category || "—"}</Text>
              </View>
              {item.bib_number && (
                <View style={S.passField}>
                  <Text style={S.passFieldLabel}>BIB NO.</Text>
                  <Text style={S.passFieldValue}>{item.bib_number}</Text>
                </View>
              )}
              <View style={S.passField}>
                <Text style={S.passFieldLabel}>CODE</Text>
                <Text style={[S.passFieldValue, { fontSize: 10 }]}>
                  {item.registration_code}
                </Text>
              </View>
            </View>

            {/* QR section — always visible for easy access */}
            {hasQr && (
              <View style={S.qrContainer}>
                <View style={S.qrFrame}>
                  <Image
                    source={qrSource}
                    style={S.qrImage}
                    resizeMode="contain"
                    onError={() => {
                      if (item.qr_local_path) {
                        updateQrLocalPath(item.registration_code, "").catch(() => {});
                      }
                    }}
                  />
                </View>
                <Text style={S.qrHint}>
                  {item.qr_local_path ? "Available offline" : "Live QR"}
                </Text>
              </View>
            )}

            {/* Expanded: extra details */}
            {isOpen && (
              <View style={S.passExpanded}>
                <View style={S.passExpandedDivider} />
                <View style={S.passDetail}>
                  <Text style={S.passDetailLabel}>Registration Code</Text>
                  <Text style={S.passDetailValue}>{item.registration_code}</Text>
                </View>
                {item.bib_number && (
                  <View style={S.passDetail}>
                    <Text style={S.passDetailLabel}>BIB Number</Text>
                    <Text style={[S.passDetailValue, { color: C.orange }]}>{item.bib_number}</Text>
                  </View>
                )}
                <Text style={S.passDetailMeta}>
                  Last synced: {new Date(item.cached_at).toLocaleString("en-IN")}
                </Text>
              </View>
            )}

            <Text style={S.passExpander}>{isOpen ? "▲ Less" : "▼ More"}</Text>
          </TouchableOpacity>
        );
      })}

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const C = {
  bg:       "#080808",
  surface:  "#111111",
  border:   "#1e1e1e",
  orange:   "#e8620a",
  orangeDim:"rgba(232,98,10,0.10)",
  orangeMid:"rgba(232,98,10,0.22)",
  white:    "#f5f5f5",
  text:     "#f0f0f0",
  textSub:  "#888888",
  textMuted:"#505050",
  green:    "#4ade80",
  greenDim: "rgba(74,222,128,0.12)",
  amber:    "#f59e0b",
  amberDim: "rgba(245,158,11,0.12)",
};

const S = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 24 },

  header: {
    flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 20,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: C.white, letterSpacing: -0.4 },
  headerSub:   { fontSize: 12, color: C.textMuted, marginTop: 3 },

  syncBadge:     { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.orangeDim, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: C.orangeMid },
  syncBadgeText: { fontSize: 11, color: C.orange, fontWeight: "600" },

  offlineBanner:     { marginHorizontal: 16, marginTop: 12, backgroundColor: "#1a1004", borderRadius: 10, borderWidth: 1, borderColor: "rgba(245,158,11,0.25)", padding: 10, alignItems: "center" },
  offlineBannerText: { fontSize: 12, color: C.amber, fontWeight: "600" },

  center:      { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 14 },
  loadingText: { fontSize: 14, color: C.textMuted },

  emptyState: { alignItems: "center", paddingTop: 80, paddingHorizontal: 40, gap: 12 },
  emptyIcon:  { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: C.white, textAlign: "center" },
  emptyBody:  { fontSize: 14, color: C.textSub, textAlign: "center", lineHeight: 21 },

  passCard: {
    marginHorizontal: 16, marginTop: 16,
    backgroundColor: "#130d07",
    borderRadius: 22, borderWidth: 1, borderColor: C.orangeMid,
    padding: 20, overflow: "hidden",
  },
  passGlow:  { position: "absolute", top: -40, right: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: C.orange, opacity: 0.06 },
  passHeader:{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14, gap: 12 },
  passTitle: { fontSize: 16, fontWeight: "700", color: C.white, letterSpacing: -0.2, flex: 1 },
  passDate:  { fontSize: 12, color: C.textSub, marginTop: 4 },

  chip:          { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  chipGreen:     { backgroundColor: C.greenDim, borderColor: "rgba(74,222,128,0.25)" },
  chipAmber:     { backgroundColor: C.amberDim, borderColor: "rgba(245,158,11,0.25)" },
  chipText:      { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  chipTextGreen: { color: C.green },
  chipTextAmber: { color: C.amber },

  passRow:       { flexDirection: "row", gap: 20, marginBottom: 16 },
  passField:     { flex: 1 },
  passFieldLabel:{ fontSize: 9, fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  passFieldValue:{ fontSize: 14, fontWeight: "700", color: C.white },

  qrContainer: { alignItems: "center", marginBottom: 12 },
  qrFrame:     { backgroundColor: "#ffffff", borderRadius: 12, padding: 12, width: 200, height: 200, alignItems: "center", justifyContent: "center" },
  qrImage:     { width: 176, height: 176 },
  qrHint:      { fontSize: 10, color: C.textMuted, marginTop: 8 },

  passExpanded:       { marginTop: 4 },
  passExpandedDivider:{ height: 1, backgroundColor: "rgba(232,98,10,0.15)", marginVertical: 14 },
  passDetail:         { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  passDetailLabel:    { fontSize: 12, color: C.textSub },
  passDetailValue:    { fontSize: 13, fontWeight: "700", color: C.white },
  passDetailMeta:     { fontSize: 10, color: C.textMuted, marginTop: 8, textAlign: "center" },

  passExpander: { fontSize: 11, color: C.textMuted, textAlign: "center", marginTop: 10 },
});
