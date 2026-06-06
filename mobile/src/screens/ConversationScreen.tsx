import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets }   from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import { useUser }             from "../context/UserContext";
import { getMessages, sendMessage, markConversationRead } from "../services/api";
import { supabase }            from "../lib/supabase";
import type { Message }        from "../types";
import type { RootStackParamList } from "../../App";

type Props = NativeStackScreenProps<RootStackParamList, "Conversation">;
type Nav   = NativeStackNavigationProp<RootStackParamList>;

function fmtMsgTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function fmtMsgDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
}

// Group messages by day for date separators
function groupByDay(messages: Message[]): Array<{ type: "date"; label: string } | { type: "msg"; item: Message }> {
  const out: Array<{ type: "date"; label: string } | { type: "msg"; item: Message }> = [];
  let lastDay = "";
  for (const msg of messages) {
    const day = new Date(msg.created_at).toDateString();
    if (day !== lastDay) {
      out.push({ type: "date", label: fmtMsgDate(msg.created_at) });
      lastDay = day;
    }
    out.push({ type: "msg", item: msg });
  }
  return out;
}

export default function ConversationScreen() {
  const { user }           = useUser();
  const navigation         = useNavigation<Nav>();
  const route              = useRoute<Props["route"]>();
  const insets             = useSafeAreaInsets();
  const { conversationId, coachName, senderType } = route.params;

  const [messages,  setMessages]  = useState<Message[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [sending,   setSending]   = useState(false);
  const [text,      setText]      = useState("");
  const [hasMore,   setHasMore]   = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const listRef = useRef<FlatList>(null);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const msgs = await getMessages(conversationId);
      setMessages(msgs);
      setHasMore(msgs.length >= 50);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    loadMessages();
    // Mark as read when opening
    if (user) markConversationRead(conversationId, senderType).catch(() => {});
  }, [loadMessages, conversationId, senderType, user]);

  // ── Supabase Realtime subscription ────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages(prev => {
            // Avoid duplicates (we optimistically add our own messages)
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          // Auto-mark as read if the incoming message is from the other party
          if (newMsg.sender_type !== senderType) {
            markConversationRead(conversationId, senderType).catch(() => {});
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, senderType]);

  async function handleSend() {
    if (!text.trim() || !user || sending) return;
    const body = text.trim();
    setText("");
    setSending(true);

    // Optimistic message
    const optimistic: Message = {
      id:           `opt-${Date.now()}`,
      sender_email: user.email,
      sender_type:  senderType,
      body,
      created_at:   new Date().toISOString(),
      read_at:      null,
    };
    setMessages(prev => [...prev, optimistic]);

    try {
      const sent = await sendMessage(conversationId, { sender_email: user.email, sender_type: senderType, body });
      // Replace optimistic with real
      setMessages(prev => prev.map(m => m.id === optimistic.id ? sent : m));
    } catch {
      // Remove optimistic on failure and restore text
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setText(body);
    } finally {
      setSending(false);
    }
  }

  async function loadMore() {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const older = await getMessages(conversationId, messages[0].created_at);
      if (older.length === 0) { setHasMore(false); return; }
      setMessages(prev => [...older, ...prev]);
      setHasMore(older.length >= 50);
    } finally {
      setLoadingMore(false);
    }
  }

  const grouped = groupByDay(messages);

  function renderItem({ item }: { item: typeof grouped[number] }) {
    if (item.type === "date") {
      return (
        <View style={S.dateSep}>
          <View style={S.dateLine} />
          <Text style={S.dateLabel}>{item.label}</Text>
          <View style={S.dateLine} />
        </View>
      );
    }
    const msg  = item.item;
    const mine = msg.sender_type === senderType;
    return (
      <View style={[S.msgRow, mine && S.msgRowMine]}>
        {!mine && (
          <View style={S.msgAvatar}>
            <Text style={S.msgAvatarText}>{coachName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ maxWidth: "75%", gap: 3 }}>
          <View style={[S.bubble, mine ? S.bubbleMine : S.bubbleTheirs]}>
            <Text style={[S.bubbleText, mine && S.bubbleTextMine]}>{msg.body}</Text>
          </View>
          <Text style={[S.msgTime, mine && S.msgTimeMine]}>
            {fmtMsgTime(msg.created_at)}
            {mine && msg.read_at ? "  ✓✓" : mine ? "  ✓" : ""}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={S.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[S.header, { paddingTop: Math.max(insets.top + 8, 16) }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={S.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={S.headerInfo}>
          <Text style={S.headerName}>{coachName}</Text>
          <Text style={S.headerSub}>{senderType === "user" ? "Coach" : "Athlete"}</Text>
        </View>
      </View>

      {/* Message list */}
      {loading ? (
        <View style={S.loadingCenter}>
          <ActivityIndicator color={C.orange} size="large" />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={grouped}
          keyExtractor={(item, i) => item.type === "date" ? `date-${i}` : item.item.id}
          renderItem={renderItem}
          contentContainerStyle={S.list}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.15}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListHeaderComponent={loadingMore ? <ActivityIndicator color={C.orange} style={{ padding: 12 }} /> : null}
          ListEmptyComponent={
            <View style={S.emptyCenter}>
              <Text style={S.emptyIcon}>💬</Text>
              <Text style={S.emptyText}>No messages yet. Say hello!</Text>
            </View>
          }
        />
      )}

      {/* Input bar */}
      <View style={[S.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          style={S.input}
          value={text}
          onChangeText={setText}
          placeholder="Type a message…"
          placeholderTextColor={C.textMuted}
          multiline
          maxLength={1000}
          returnKeyType="default"
        />
        <TouchableOpacity
          style={[S.sendBtn, (!text.trim() || sending) && S.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
          activeOpacity={0.8}
        >
          {sending
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={S.sendBtnText}>↑</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const C = {
  bg:       "#080808", surface: "#111111", border: "#222222",
  orange:   "#e8620a", orangeDim: "rgba(232,98,10,0.12)",
  white:    "#f5f5f5", text: "#f0f0f0", textSub: "#888888", textMuted: "#505050",
};

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  header:     { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.border, gap: 12 },
  backBtn:    { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  backIcon:   { fontSize: 28, color: C.white, fontWeight: "300", lineHeight: 32 },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 16, fontWeight: "700", color: C.white },
  headerSub:  { fontSize: 11, color: C.orange, marginTop: 1 },

  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center" },

  list: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },

  dateSep:   { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 16 },
  dateLine:  { flex: 1, height: 1, backgroundColor: "#1e1e1e" },
  dateLabel: { fontSize: 11, color: C.textMuted, fontWeight: "600", letterSpacing: 0.3 },

  msgRow:     { flexDirection: "row", alignItems: "flex-end", gap: 8, marginVertical: 3 },
  msgRowMine: { justifyContent: "flex-end" },

  msgAvatar:     { width: 28, height: 28, borderRadius: 14, backgroundColor: C.orangeDim, borderWidth: 1, borderColor: "rgba(232,98,10,0.3)", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  msgAvatarText: { fontSize: 11, fontWeight: "800", color: C.orange },

  bubble:       { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleTheirs: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderBottomLeftRadius: 4 },
  bubbleMine:   { backgroundColor: C.orange, borderBottomRightRadius: 4 },
  bubbleText:   { fontSize: 14, color: C.text, lineHeight: 20 },
  bubbleTextMine: { color: "#fff" },

  msgTime:     { fontSize: 10, color: C.textMuted, paddingHorizontal: 4 },
  msgTimeMine: { textAlign: "right" },

  emptyCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  emptyIcon:   { fontSize: 40, marginBottom: 12 },
  emptyText:   { fontSize: 14, color: C.textMuted },

  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: "#0d0d0d" },
  input:    { flex: 1, minHeight: 42, maxHeight: 120, backgroundColor: C.surface, borderRadius: 22, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: C.text },
  sendBtn:        { width: 42, height: 42, borderRadius: 21, backgroundColor: C.orange, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  sendBtnDisabled:{ backgroundColor: "#2a2a2a" },
  sendBtnText:    { fontSize: 20, color: "#fff", fontWeight: "700", lineHeight: 24 },
});
