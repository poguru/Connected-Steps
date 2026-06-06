import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from "react-native";
import { useSafeAreaInsets }   from "react-native-safe-area-context";
import { getSessions, getCommunityPosts, getStories, getLeaderboard } from "../services/api";
import type { Session, CommunityPost, Story } from "../types";

type Tab = "sessions" | "posts" | "stories";

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
function fmtTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7)  return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

// ── Sub-renders ───────────────────────────────────────────────────────────────

function SessionCard({ item }: { item: Session }) {
  return (
    <View style={S.sessionCard}>
      <View style={S.sessionDate}>
        <Text style={S.sessionDateText}>{fmtDate(item.date)}</Text>
        {item.time ? <Text style={S.sessionTimeText}>{fmtTime(item.time)}</Text> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={S.sessionTitle} numberOfLines={2}>{item.title}</Text>
        {item.venue    ? <Text style={S.sessionMeta} numberOfLines={1}>📍 {item.venue}</Text>    : null}
        {item.location ? <Text style={S.sessionMeta} numberOfLines={1}>🗺 {item.location}</Text> : null}
      </View>
    </View>
  );
}

function PostCard({ item }: { item: CommunityPost }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <TouchableOpacity style={S.postCard} onPress={() => setExpanded(e => !e)} activeOpacity={0.85}>
      <View style={S.postTop}>
        <View style={S.postCategoryPill}><Text style={S.postCategory}>{item.category}</Text></View>
        <Text style={S.postAge}>{timeAgo(item.created_at)}</Text>
      </View>
      <Text style={S.postTitle}>{item.title}</Text>
      {expanded && <Text style={S.postBody}>{item.body}</Text>}
      <Text style={S.postAuthor}>— {item.user_name}</Text>
    </TouchableOpacity>
  );
}

function StoryCard({ item }: { item: Story }) {
  return (
    <View style={S.storyCard}>
      <View style={S.storyHeader}>
        <View style={S.storyAvatar}><Text style={S.storyInitial}>{item.user_name.charAt(0).toUpperCase()}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={S.storyName}>{item.user_name}</Text>
          <Text style={S.storyAchievement}>{item.achievement}</Text>
        </View>
        {item.rating ? (
          <View style={S.ratingBadge}><Text style={S.ratingText}>{"★".repeat(item.rating)}</Text></View>
        ) : null}
      </View>
      <Text style={S.storyQuote}>"{item.quote}"</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function CommunityScreen() {
  const insets                          = useSafeAreaInsets();
  const [tab,         setTab]           = useState<Tab>("sessions");
  const [sessions,    setSessions]      = useState<Session[]>([]);
  const [posts,       setPosts]         = useState<CommunityPost[]>([]);
  const [stories,     setStories]       = useState<Story[]>([]);
  const [activeCount, setActiveCount]   = useState(0);
  const [loading,     setLoading]       = useState(true);
  const [refreshing,  setRefreshing]    = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [s, p, st, lb] = await Promise.allSettled([
      getSessions(), getCommunityPosts(), getStories(), getLeaderboard(),
    ]);
    if (s.status  === "fulfilled") setSessions(s.value);
    if (p.status  === "fulfilled") setPosts(p.value);
    if (st.status === "fulfilled") setStories(st.value);
    if (lb.status === "fulfilled") {
      const active = (lb.value as any[]).filter((e: any) => e.month_points > 0).length;
      setActiveCount(active);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "sessions", label: "Sessions", count: sessions.length },
    { key: "posts",    label: "Q&A",      count: posts.length    },
    { key: "stories",  label: "Stories",  count: stories.length  },
  ];

  return (
    <View style={S.root}>

      {/* Header */}
      <View style={[S.header, { paddingTop: Math.max(insets.top + 12, 20) }]}>
        <Text style={S.headerTitle}>Community</Text>
        <Text style={S.headerSub}>Upcoming runs, questions & member stories</Text>
      </View>

      {/* Weekly activity summary — always visible */}
      <View style={S.summaryBar}>
        <View style={S.summaryItem}>
          <Text style={S.summaryVal}>{loading ? "—" : activeCount}</Text>
          <Text style={S.summaryLabel}>Active runners</Text>
        </View>
        <View style={S.summarySep} />
        <View style={S.summaryItem}>
          <Text style={S.summaryVal}>{loading ? "—" : sessions.length}</Text>
          <Text style={S.summaryLabel}>Upcoming sessions</Text>
        </View>
        <View style={S.summarySep} />
        <View style={S.summaryItem}>
          <Text style={S.summaryVal}>{loading ? "—" : posts.length}</Text>
          <Text style={S.summaryLabel}>Questions</Text>
        </View>
        <View style={S.summarySep} />
        <View style={S.summaryItem}>
          <Text style={S.summaryVal}>{loading ? "—" : stories.length}</Text>
          <Text style={S.summaryLabel}>Stories</Text>
        </View>
      </View>

      {/* Tab bar */}
      <View style={S.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[S.tabItem, tab === t.key && S.tabItemActive]} onPress={() => setTab(t.key)}>
            <Text style={[S.tabText, tab === t.key && S.tabTextActive]}>{t.label}</Text>
            {!loading && t.count > 0 ? (
              <View style={[S.tabBadge, tab === t.key && S.tabBadgeActive]}>
                <Text style={[S.tabBadgeText, tab === t.key && S.tabBadgeTextActive]}>{t.count}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {loading ? (
        <ActivityIndicator color={C.orange} style={{ marginTop: 60 }} />
      ) : tab === "sessions" ? (
        <FlatList
          data={sessions}
          keyExtractor={i => i.id}
          renderItem={({ item }) => <SessionCard item={item} />}
          contentContainerStyle={S.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.orange} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={S.emptyState}>
              <Text style={S.emptyIcon}>🗓</Text>
              <Text style={S.emptyTitle}>No sessions scheduled yet</Text>
              <Text style={S.emptyText}>New runs are added every week. Check back soon to register for your next session.</Text>
            </View>
          }
        />
      ) : tab === "posts" ? (
        <FlatList
          data={posts}
          keyExtractor={i => i.id}
          renderItem={({ item }) => <PostCard item={item} />}
          contentContainerStyle={S.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.orange} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={S.emptyState}>
              <Text style={S.emptyIcon}>💬</Text>
              <Text style={S.emptyTitle}>No questions yet</Text>
              <Text style={S.emptyText}>Be the first to ask a question. The community and coaches are here to help.</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={stories}
          keyExtractor={i => i.id}
          renderItem={({ item }) => <StoryCard item={item} />}
          contentContainerStyle={S.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.orange} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={S.emptyState}>
              <Text style={S.emptyIcon}>⭐</Text>
              <Text style={S.emptyTitle}>No stories yet</Text>
              <Text style={S.emptyText}>Every runner has a story. Share yours and inspire the community.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const C = {
  bg:       "#080808", surface: "#111111", border: "#222222",
  orange:   "#e8620a", orangeDim: "rgba(232,98,10,0.12)",
  white:    "#f5f5f5", text: "#f0f0f0", textSub: "#888888", textMuted: "#505050",
  gold:     "#f59e0b",
};

const S = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  header:  { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { fontSize: 22, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  headerSub:   { fontSize: 12, color: C.textSub, marginTop: 4 },

  // Activity summary bar
  summaryBar:  { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: "#0d0d0d" },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryVal:  { fontSize: 16, fontWeight: "800", color: C.orange, letterSpacing: -0.3 },
  summaryLabel:{ fontSize: 9, color: C.textSub, textTransform: "uppercase", letterSpacing: 0.3, marginTop: 2, textAlign: "center" },
  summarySep:  { width: 1, height: 28, backgroundColor: C.border },

  // Tab bar
  tabBar:         { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border },
  tabItem:        { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 13, gap: 5 },
  tabItemActive:  { borderBottomWidth: 2, borderBottomColor: C.orange },
  tabText:        { fontSize: 13, fontWeight: "600", color: C.textMuted },
  tabTextActive:  { color: C.orange },
  tabBadge:       { backgroundColor: C.border, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  tabBadgeActive: { backgroundColor: C.orangeDim },
  tabBadgeText:   { fontSize: 10, color: C.textSub, fontWeight: "700" },
  tabBadgeTextActive: { color: C.orange },

  list:  { padding: 16, paddingBottom: 40 },

  // Empty states
  emptyState: { alignItems: "center", paddingTop: 56, paddingHorizontal: 32 },
  emptyIcon:  { fontSize: 48, marginBottom: 14 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: C.white, marginBottom: 8 },
  emptyText:  { fontSize: 13, color: C.textSub, textAlign: "center", lineHeight: 20 },

  // Session card
  sessionCard:     { flexDirection: "row", gap: 14, backgroundColor: C.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 10 },
  sessionDate:     { alignItems: "center", justifyContent: "center", minWidth: 58, backgroundColor: "#0f0f0f", borderRadius: 12, padding: 10 },
  sessionDateText: { fontSize: 11, fontWeight: "700", color: C.orange, textAlign: "center" },
  sessionTimeText: { fontSize: 11, color: C.textSub, marginTop: 3, textAlign: "center" },
  sessionTitle:    { fontSize: 14, fontWeight: "700", color: C.text, marginBottom: 6, lineHeight: 20 },
  sessionMeta:     { fontSize: 12, color: C.textSub, marginTop: 2 },

  // Post card
  postCard:    { backgroundColor: C.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 10 },
  postTop:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  postCategoryPill: { backgroundColor: C.orangeDim, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  postCategory:{ fontSize: 10, color: C.orange, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  postAge:     { fontSize: 11, color: C.textMuted },
  postTitle:   { fontSize: 14, fontWeight: "700", color: C.text, lineHeight: 20, marginBottom: 6 },
  postBody:    { fontSize: 13, color: C.textSub, lineHeight: 20, marginBottom: 10 },
  postAuthor:  { fontSize: 12, color: C.textMuted, fontStyle: "italic" },

  // Story card
  storyCard:     { backgroundColor: C.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: C.border, marginBottom: 10 },
  storyHeader:   { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  storyAvatar:   { width: 40, height: 40, borderRadius: 20, backgroundColor: C.orangeDim, alignItems: "center", justifyContent: "center" },
  storyInitial:  { fontSize: 16, fontWeight: "700", color: C.orange },
  storyName:     { fontSize: 14, fontWeight: "700", color: C.text },
  storyAchievement: { fontSize: 11, color: C.orange, marginTop: 2 },
  ratingBadge:   { marginLeft: "auto" as any, backgroundColor: "rgba(245,158,11,0.1)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  ratingText:    { fontSize: 12, color: C.gold },
  storyQuote:    { fontSize: 14, color: C.textSub, lineHeight: 22, fontStyle: "italic" },
});
