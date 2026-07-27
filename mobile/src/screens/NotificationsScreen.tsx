/**
 * Phase 3 — Push Notification Inbox
 * Lists in-app notifications with read/unread state.
 * Reuses /api/notifications (existing endpoint, existing data).
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUser }           from "../context/UserContext";
import { useNetwork }        from "../context/NetworkContext";
import { getNotifications, markNotificationsRead } from "../services/api";
import type { AppNotification } from "../types";

const ICON: Record<string, string> = {
  registration:      "🎟️",
  payment:           "💳",
  reminder:          "🔔",
  emergency:         "🚨",
  results:           "🏅",
  certificate:       "📄",
  membership:        "⭐",
  route_map:         "🗺️",
  announcement:      "📣",
  event_update:      "📅",
  default:           "🔔",
};

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m    = Math.floor(diff / 60_000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

export default function NotificationsScreen() {
  const { user }               = useUser();
  const { isConnected }        = useNetwork();
  const insets                 = useSafeAreaInsets();
  const [items,  setItems]     = useState<AppNotification[]>([]);
  const [loading, setLoading]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [marking,  setMarking] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!user?.userToken || !isConnected) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const data = await getNotifications(user.userToken);
      setItems(Array.isArray(data) ? data : []);
    } catch { /* keep stale */ }
    finally   { setLoading(false); setRefreshing(false); }
  }, [user?.userToken, isConnected]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(true); }, [load]);

  async function handleMarkAllRead() {
    if (!user?.userToken || marking) return;
    setMarking(true);
    try {
      await markNotificationsRead(user.userToken);
      setItems(prev => prev.map(n => ({ ...n, read: true })));
    } catch { /* ignore */ }
    finally { setMarking(false); }
  }

  const unread = items.filter(n => !n.read).length;

  return (
    <ScrollView
      style={S.root}
      contentContainerStyle={S.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.orange} />
      }
    >
      {/* ── Header ── */}
      <View style={[S.header, { paddingTop: Math.max(insets.top + 12, 20) }]}>
        <View>
          <Text style={S.title}>Notifications</Text>
          {unread > 0 && (
            <Text style={S.sub}>{unread} unread</Text>
          )}
        </View>
        {unread > 0 && !marking && (
          <TouchableOpacity onPress={handleMarkAllRead} style={S.markAllBtn}>
            <Text style={S.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
        {marking && <ActivityIndicator color={C.orange} />}
      </View>

      {!isConnected && (
        <View style={S.offlineBanner}>
          <Text style={S.offlineBannerText}>Offline — notifications not available</Text>
        </View>
      )}

      {loading && (
        <View style={S.center}>
          <ActivityIndicator color={C.orange} size="large" />
        </View>
      )}

      {!loading && !isConnected && items.length === 0 && (
        <View style={S.empty}>
          <Text style={S.emptyIcon}>📶</Text>
          <Text style={S.emptyTitle}>No cached notifications</Text>
          <Text style={S.emptyBody}>Connect to the internet to load notifications.</Text>
        </View>
      )}

      {!loading && isConnected && items.length === 0 && (
        <View style={S.empty}>
          <Text style={S.emptyIcon}>🔕</Text>
          <Text style={S.emptyTitle}>All caught up</Text>
          <Text style={S.emptyBody}>You have no notifications.</Text>
        </View>
      )}

      {!loading && items.map(notif => {
        const icon = ICON[notif.type] ?? ICON.default;
        return (
          <View
            key={notif.id}
            style={[S.notifCard, !notif.read && S.notifCardUnread]}
          >
            <View style={S.notifIconWrap}>
              <Text style={S.notifIcon}>{icon}</Text>
            </View>
            <View style={S.notifBody}>
              <View style={S.notifTop}>
                <Text style={S.notifTitle} numberOfLines={1}>{notif.title}</Text>
                {!notif.read && <View style={S.unreadDot} />}
              </View>
              <Text style={S.notifMessage} numberOfLines={3}>{notif.message}</Text>
              <Text style={S.notifTime}>{timeSince(notif.created_at)}</Text>
            </View>
          </View>
        );
      })}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const C = {
  bg:      "#080808",
  surface: "#111111",
  border:  "#1e1e1e",
  orange:  "#e8620a",
  orangeDim: "rgba(232,98,10,0.10)",
  white:   "#f5f5f5",
  textSub: "#888888",
  textMuted: "#505050",
  amber:   "#f59e0b",
};

const S = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 24 },

  header: {
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 18,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  title:       { fontSize: 22, fontWeight: "800", color: C.white, letterSpacing: -0.4 },
  sub:         { fontSize: 12, color: C.orange, marginTop: 3, fontWeight: "600" },
  markAllBtn:  { backgroundColor: C.orangeDim, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: "rgba(232,98,10,0.22)" },
  markAllText: { color: C.orange, fontWeight: "700", fontSize: 12 },

  offlineBanner:     { marginHorizontal: 16, marginTop: 12, backgroundColor: "#1a1004", borderRadius: 10, borderWidth: 1, borderColor: "rgba(245,158,11,0.25)", padding: 10, alignItems: "center" },
  offlineBannerText: { fontSize: 12, color: C.amber, fontWeight: "600" },

  center: { paddingTop: 80, alignItems: "center" },

  empty:      { alignItems: "center", paddingTop: 80, paddingHorizontal: 40, gap: 12 },
  emptyIcon:  { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: C.white, textAlign: "center" },
  emptyBody:  { fontSize: 14, color: C.textSub, textAlign: "center", lineHeight: 21 },

  notifCard: {
    flexDirection: "row", alignItems: "flex-start",
    marginHorizontal: 16, marginTop: 10,
    backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    padding: 14, gap: 12,
  },
  notifCardUnread: {
    borderColor: "rgba(232,98,10,0.25)", backgroundColor: "#140e08",
  },
  notifIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center",
  },
  notifIcon:    { fontSize: 18 },
  notifBody:    { flex: 1, gap: 4 },
  notifTop:     { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "space-between" },
  notifTitle:   { fontSize: 14, fontWeight: "700", color: C.white, flex: 1 },
  unreadDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: C.orange },
  notifMessage: { fontSize: 13, color: C.textSub, lineHeight: 19 },
  notifTime:    { fontSize: 11, color: C.textMuted },
});
