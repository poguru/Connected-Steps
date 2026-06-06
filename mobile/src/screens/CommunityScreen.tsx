import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, FlatList, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from "react-native";
import { getSessions, getCommunityPosts, getStories } from "../services/api";
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
        <View style={S.postCategoryPill}>
          <Text style={S.postCategory}>{item.category}</Text>
        </View>
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
        <View style={S.storyAvatar}>
          <Text style={S.storyInitial}>{item.user_name.charAt(0).toUpperCase()}</Text>
        </View>
        <View>
          <Text style={S.storyName}>{item.user_name}</Text>
          <Text style={S.storyAchievement}>{item.achievement}</Text>
        </View>
        {item.rating ? (
          <View style={S.ratingBadge}>
            <Text style={S.ratingText}>{"★".repeat(item.rating)}</Text>
          </View>
        ) : null}
      </View>
      <Text style={S.storyQuote}>"{item.quote}"</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function CommunityScreen() {
  const [tab,        setTab]        = useState<Tab>("sessions");
  const [sessions,   setSessions]   = useState<Session[]>([]);
  const [posts,      setPosts]      = useState<CommunityPost[]>([]);
  const [stories,    setStories]    = useState<Story[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [s, p, st] = await Promise.allSettled([getSessions(), getCommunityPosts(), getStories()]);
    if (s.status  === "fulfilled") setSessions(s.value);
    if (p.status  === "fulfilled") setPosts(p.value);
    if (st.status === "fulfilled") setStories(st.value);
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
      <View style={S.header}>
        <Text style={S.headerTitle}>Community</Text>
        <Text style={S.headerSub}>Upcoming runs, questions & member stories</Text>
      </View>

      {/* Tab bar */}
      <View style={S.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[S.tabItem, tab === t.key && S.tabItemActive]}
            onPress={() => setTab(t.key)}
          >
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
          ListEmptyComponent={<Text style={S.empty}>No upcoming sessions.</Text>}
          showsVerticalScrollIndicator={false}
        />
      ) : tab === "posts" ? (
        <FlatList
          data={posts}
          keyExtractor={i => i.id}
          renderItem={({ item }) => <PostCard item={item} />}
          contentContainerStyle={S.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.orange} />}
          ListEmptyComponent={<Text style={S.empty}>No community posts yet.</Text>}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={stories}
          keyExtractor={i => i.id}
          renderItem={({ item }) => <StoryCard item={item} />}
          contentContainerStyle={S.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.orange} />}
          ListEmptyComponent={<Text style={S.empty}>No stories yet.</Text>}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
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
  gold:     "#f59e0b",
};

const S = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  header:  { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { fontSize: 22, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  headerSub:   { fontSize: 12, color: C.textSub, marginTop: 4 },

  // Tab bar
  tabBar:         { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border },
  tabItem:        { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, gap: 5 },
  tabItemActive:  { borderBottomWidth: 2, borderBottomColor: C.orange },
  tabText:        { fontSize: 13, fontWeight: "600", color: C.textMuted },
  tabTextActive:  { color: C.orange },
  tabBadge:       { backgroundColor: C.border, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  tabBadgeActive: { backgroundColor: C.orangeDim },
  tabBadgeText:   { fontSize: 10, color: C.textSub, fontWeight: "700" },
  tabBadgeTextActive: { color: C.orange },

  list:  { padding: 16, paddingBottom: 40 },
  empty: { color: C.textMuted, textAlign: "center", marginTop: 48, fontSize: 14 },

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
