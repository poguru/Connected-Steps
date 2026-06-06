import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Image,
} from "react-native";
import { useSafeAreaInsets }   from "react-native-safe-area-context";
import { useNavigation }        from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useUser }              from "../context/UserContext";
import {
  getCoaches, getConversations, getCoachConversations, startConversation,
} from "../services/api";
import type { Coach, Conversation } from "../types";
import type { RootStackParamList }  from "../../App";

type Nav = NativeStackNavigationProp<RootStackParamList>;

function fmtTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 60000)     return "just now";
  if (diffMs < 3600000)   return `${Math.floor(diffMs / 60000)}m`;
  if (diffMs < 86400000)  return `${Math.floor(diffMs / 3600000)}h`;
  if (diffMs < 604800000) return d.toLocaleDateString("en-IN", { weekday: "short" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function MessagesScreen() {
  const { user }                        = useUser();
  const navigation                      = useNavigation<Nav>();
  const insets                          = useSafeAreaInsets();
  const [coaches,       setCoaches]     = useState<Coach[]>([]);
  const [conversations, setConvos]      = useState<Conversation[]>([]);
  const [loading,       setLoading]     = useState(true);
  const [refreshing,    setRefreshing]  = useState(false);
  const [starting,      setStarting]    = useState<string | null>(null); // coachId being opened

  // Coaches whose email matches the logged-in user are shown a coach inbox
  const [isCoach,       setIsCoach]     = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    try {
      const [coachList, convList] = await Promise.allSettled([
        getCoaches(),
        getConversations(user.email),
      ]);
      const coaches = coachList.status === "fulfilled" ? coachList.value : [];
      setCoaches(coaches);

      const isCoachAccount = coaches.some(c => c.email === user.email);
      setIsCoach(isCoachAccount);

      if (isCoachAccount) {
        const coachConvs = await getCoachConversations(user.email);
        setConvos(coachConvs);
      } else if (convList.status === "fulfilled") {
        setConvos(convList.value);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function openOrStartConversation(coach: Coach) {
    if (!user) return;
    setStarting(coach.id);
    try {
      const existing = conversations.find(c => c.coaches?.id === coach.id);
      let convId: string;
      if (existing) {
        convId = existing.id;
      } else {
        const conv = await startConversation(user.email, coach.id);
        convId = conv.id;
      }
      navigation.navigate("Conversation", {
        conversationId: convId,
        coachName:      coach.name,
        senderType:     "user",
      });
    } catch { /* ignore */ }
    finally { setStarting(null); }
  }

  function openConversation(conv: Conversation) {
    const name = isCoach ? conv.user_email.split("@")[0] : (conv.coaches?.name ?? "Coach");
    navigation.navigate("Conversation", {
      conversationId: conv.id,
      coachName:      name,
      senderType:     isCoach ? "coach" : "user",
    });
  }

  if (!user) return null;

  return (
    <ScrollView
      style={S.root}
      contentContainerStyle={S.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.orange} />}
    >
      <View style={[S.header, { paddingTop: Math.max(insets.top + 12, 20) }]}>
        <Text style={S.headerTitle}>Messages</Text>
        <Text style={S.headerSub}>{isCoach ? "Your athlete inbox" : "Chat with your coaches"}</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={C.orange} style={{ marginTop: 48 }} />
      ) : (
        <>
          {/* ── Existing conversations ── */}
          {conversations.length > 0 && (
            <View style={S.section}>
              <Text style={S.sectionLabel}>RECENT</Text>
              <View style={S.card}>
                {conversations.map((conv, i) => {
                  const name    = isCoach
                    ? conv.user_email.split("@")[0]
                    : (conv.coaches?.name ?? "Coach");
                  const spec    = isCoach ? "Athlete" : (conv.coaches?.specialization ?? "");
                  const unread  = isCoach ? conv.coach_unread : conv.user_unread;
                  const initial = name.charAt(0).toUpperCase();

                  return (
                    <TouchableOpacity
                      key={conv.id}
                      style={[S.convRow, i > 0 && S.convRowBorder]}
                      onPress={() => openConversation(conv)}
                      activeOpacity={0.75}
                    >
                      <View style={S.convAvatar}>
                        <Text style={S.convAvatarInitial}>{initial}</Text>
                        {unread > 0 && <View style={S.unreadBadge}><Text style={S.unreadBadgeText}>{unread}</Text></View>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={S.convNameRow}>
                          <Text style={[S.convName, unread > 0 && S.convNameUnread]} numberOfLines={1}>{name}</Text>
                          <Text style={S.convTime}>{fmtTime(conv.last_message_at)}</Text>
                        </View>
                        {spec ? <Text style={S.convSpec} numberOfLines={1}>{spec}</Text> : null}
                        {conv.last_message_preview ? (
                          <Text style={[S.convPreview, unread > 0 && S.convPreviewUnread]} numberOfLines={1}>
                            {conv.last_message_preview}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── Coach directory (users only) ── */}
          {!isCoach && (
            <View style={S.section}>
              <Text style={S.sectionLabel}>OUR COACHES</Text>
              {coaches.map(coach => {
                const hasConv   = conversations.some(c => c.coaches?.id === coach.id);
                const isLoading = starting === coach.id;
                return (
                  <TouchableOpacity
                    key={coach.id}
                    style={S.coachCard}
                    onPress={() => openOrStartConversation(coach)}
                    activeOpacity={0.82}
                    disabled={isLoading}
                  >
                    <View style={S.coachGlow} pointerEvents="none" />
                    <View style={S.coachAvatarLg}>
                      {coach.avatar_url
                        ? <Image source={{ uri: coach.avatar_url }} style={S.coachAvatarImg} />
                        : <Text style={S.coachAvatarInitial}>{coach.name.charAt(0).toUpperCase()}</Text>
                      }
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={S.coachName}>{coach.name}</Text>
                      {coach.specialization
                        ? <Text style={S.coachSpec} numberOfLines={1}>{coach.specialization}</Text>
                        : null}
                      {coach.bio
                        ? <Text style={S.coachBio} numberOfLines={2}>{coach.bio}</Text>
                        : null}
                    </View>
                    <View style={[S.coachBtn, isLoading && { opacity: 0.5 }]}>
                      {isLoading
                        ? <ActivityIndicator color={C.orange} size="small" />
                        : <Text style={S.coachBtnText}>{hasConv ? "Open →" : "Message →"}</Text>
                      }
                    </View>
                  </TouchableOpacity>
                );
              })}
              {coaches.length === 0 && (
                <View style={S.emptyCard}>
                  <Text style={S.emptyIcon}>🏃</Text>
                  <Text style={S.emptyBody}>Coach directory coming soon.</Text>
                </View>
              )}
            </View>
          )}

          {/* Empty state for coach with no conversations */}
          {isCoach && conversations.length === 0 && (
            <View style={S.emptyFull}>
              <Text style={S.emptyFullIcon}>💬</Text>
              <Text style={S.emptyFullTitle}>No messages yet</Text>
              <Text style={S.emptyFullBody}>When athletes message you, their conversations will appear here.</Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const C = {
  bg:       "#080808", surface: "#111111", border: "#222222",
  orange:   "#e8620a", orangeDim: "rgba(232,98,10,0.12)", orangeMid: "rgba(232,98,10,0.22)",
  white:    "#f5f5f5", text: "#f0f0f0", textSub: "#888888", textMuted: "#505050",
};

const S = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 48 },

  header:      { paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { fontSize: 22, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  headerSub:   { fontSize: 12, color: C.textSub, marginTop: 4 },

  section:      { paddingHorizontal: 16, paddingTop: 24 },
  sectionLabel: { fontSize: 11, fontWeight: "700", color: C.textMuted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 },

  card: { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, overflow: "hidden" },

  // Conversation rows
  convRow:        { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  convRowBorder:  { borderTopWidth: 1, borderTopColor: C.border },
  convAvatar:     { width: 46, height: 46, borderRadius: 23, backgroundColor: C.orangeDim, borderWidth: 1, borderColor: "rgba(232,98,10,0.25)", alignItems: "center", justifyContent: "center" },
  convAvatarInitial: { fontSize: 18, fontWeight: "800", color: C.orange },
  unreadBadge:    { position: "absolute", top: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: C.orange, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: C.surface },
  unreadBadgeText:{ fontSize: 9, fontWeight: "800", color: "#fff" },
  convNameRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  convName:       { fontSize: 14, fontWeight: "600", color: C.text, flex: 1 },
  convNameUnread: { fontWeight: "800", color: C.white },
  convTime:       { fontSize: 11, color: C.textMuted },
  convSpec:       { fontSize: 11, color: C.orange, marginBottom: 3 },
  convPreview:    { fontSize: 12, color: C.textMuted },
  convPreviewUnread: { color: C.textSub },

  // Coach cards
  coachCard:         { backgroundColor: "#130d07", borderRadius: 18, borderWidth: 1, borderColor: C.orangeMid, padding: 16, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 14, overflow: "hidden" },
  coachGlow:         { position: "absolute", top: -40, right: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: C.orange, opacity: 0.04 },
  coachAvatarLg:     { width: 52, height: 52, borderRadius: 26, backgroundColor: C.orangeDim, borderWidth: 2, borderColor: "rgba(232,98,10,0.35)", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 },
  coachAvatarImg:    { width: 52, height: 52, borderRadius: 26 },
  coachAvatarInitial:{ fontSize: 20, fontWeight: "800", color: C.orange },
  coachName:         { fontSize: 15, fontWeight: "700", color: C.white, marginBottom: 3 },
  coachSpec:         { fontSize: 11, color: C.orange, fontWeight: "600", marginBottom: 4 },
  coachBio:          { fontSize: 12, color: C.textSub, lineHeight: 18 },
  coachBtn:          { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.orange, alignItems: "center", justifyContent: "center", minWidth: 80 },
  coachBtnText:      { fontSize: 12, color: C.orange, fontWeight: "700" },

  // Empty states
  emptyCard:      { padding: 20, alignItems: "center" },
  emptyIcon:      { fontSize: 30, marginBottom: 8 },
  emptyBody:      { fontSize: 13, color: C.textMuted, textAlign: "center" },
  emptyFull:      { alignItems: "center", paddingTop: 80, paddingHorizontal: 40 },
  emptyFullIcon:  { fontSize: 48, marginBottom: 16 },
  emptyFullTitle: { fontSize: 18, fontWeight: "700", color: C.white, marginBottom: 8 },
  emptyFullBody:  { fontSize: 14, color: C.textSub, textAlign: "center", lineHeight: 22 },

  orangeMid: "rgba(232,98,10,0.22)",
  orangeDim: "rgba(232,98,10,0.12)",
});
