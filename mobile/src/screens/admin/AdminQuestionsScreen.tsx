import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation }     from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useUser }           from "../../context/UserContext";
import { adminGetQuestions, adminAnswerQuestion } from "../../services/api";
import type { CoachQuestion } from "../../services/api";
import type { RootStackParamList } from "../../../App";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function AdminQuestionsScreen() {
  const { user }   = useUser();
  const navigation = useNavigation<Nav>();
  const insets     = useSafeAreaInsets();
  const token      = user?.coachToken ?? "";

  const [questions,  setQuestions]  = useState<CoachQuestion[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded,   setExpanded]   = useState<string | null>(null);
  const [answers,    setAnswers]    = useState<Record<string, string>>({});
  const [saving,     setSaving]     = useState<string | null>(null);
  const [tab,        setTab]        = useState<"pending" | "answered">("pending");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { setQuestions(await adminGetQuestions(token)); } catch { /* keep stale */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleAnswer(q: CoachQuestion) {
    const answer = answers[q.id]?.trim();
    if (!answer) { Alert.alert("Empty answer", "Please write an answer before saving."); return; }
    setSaving(q.id);
    try {
      await adminAnswerQuestion(token, q.id, answer);
      setQuestions(prev => prev.map(item => item.id === q.id ? { ...item, answer, status: "answered" } : item));
      setExpanded(null);
    } catch (e) { Alert.alert("Error", String(e)); }
    finally { setSaving(null); }
  }

  const filtered = questions.filter(q => q.status === tab);

  return (
    <ScrollView
      style={S.root}
      contentContainerStyle={S.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.orange} />}
    >
      <View style={[S.header, { paddingTop: Math.max(insets.top + 12, 20) }]}>
        <Text style={S.backText} onPress={() => navigation.goBack()}>‹ Admin</Text>
        <Text style={S.title}>Coach Q&A</Text>
      </View>

      <View style={S.tabs}>
        {(["pending", "answered"] as const).map(t => (
          <TouchableOpacity key={t} style={[S.tab, tab === t && S.tabActive]} onPress={() => setTab(t)}>
            <Text style={[S.tabText, tab === t && S.tabTextActive]}>
              {t === "pending" ? `Pending (${questions.filter(q => q.status === "pending").length})` : "Answered"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={C.orange} style={{ marginTop: 48 }} />
      ) : filtered.length === 0 ? (
        <View style={S.empty}><Text style={S.emptyText}>{tab === "pending" ? "No pending questions 🎉" : "No answered questions yet."}</Text></View>
      ) : (
        <View style={S.list}>
          {filtered.map(q => {
            const open = expanded === q.id;
            return (
              <View key={q.id} style={S.card}>
                <TouchableOpacity onPress={() => setExpanded(open ? null : q.id)} activeOpacity={0.8}>
                  <View style={S.cardHeader}>
                    <View style={S.categoryPill}><Text style={S.categoryText}>{q.category}</Text></View>
                    <Text style={S.cardChevron}>{open ? "∧" : "∨"}</Text>
                  </View>
                  <Text style={S.cardFrom} numberOfLines={1}>{q.user_name} · {q.user_email}</Text>
                  <Text style={S.cardQuestion}>{q.question}</Text>
                </TouchableOpacity>

                {open && (
                  <View style={S.replyBox}>
                    {q.answer ? (
                      <View>
                        <Text style={S.replyLabel}>Your answer</Text>
                        <Text style={S.replyText}>{q.answer}</Text>
                      </View>
                    ) : (
                      <>
                        <Text style={S.replyLabel}>Write your answer</Text>
                        <TextInput
                          style={S.replyInput}
                          value={answers[q.id] ?? ""}
                          onChangeText={v => setAnswers(prev => ({ ...prev, [q.id]: v }))}
                          placeholder="Type your reply…"
                          placeholderTextColor={C.textMuted}
                          multiline
                          numberOfLines={4}
                        />
                        <TouchableOpacity style={[S.answerBtn, saving === q.id && { opacity: 0.5 }]} onPress={() => handleAnswer(q)} disabled={saving === q.id}>
                          {saving === q.id ? <ActivityIndicator color="#fff" size="small" /> : <Text style={S.answerBtnText}>Send Answer</Text>}
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const C = { bg:"#080808", surface:"#111111", border:"#222222", orange:"#e8620a", orangeDim:"rgba(232,98,10,0.12)", white:"#f5f5f5", text:"#f0f0f0", textSub:"#888", textMuted:"#505050" };
const S = StyleSheet.create({
  root:{ flex:1, backgroundColor:C.bg }, scroll:{ paddingBottom:48 },
  header:{ paddingHorizontal:20, paddingBottom:16, borderBottomWidth:1, borderBottomColor:C.border },
  backText:{ fontSize:14, color:C.orange, fontWeight:"600", marginBottom:8 },
  title:{ fontSize:22, fontWeight:"800", color:C.white },
  tabs:{ flexDirection:"row", paddingHorizontal:16, paddingVertical:10, gap:8, borderBottomWidth:1, borderBottomColor:C.border },
  tab:{ flex:1, paddingVertical:8, borderRadius:10, alignItems:"center", backgroundColor:C.surface, borderWidth:1, borderColor:C.border },
  tabActive:{ backgroundColor:C.orangeDim, borderColor:"rgba(232,98,10,0.3)" },
  tabText:{ fontSize:13, fontWeight:"600", color:C.textSub },
  tabTextActive:{ color:C.orange },
  list:{ padding:16, gap:12 },
  card:{ backgroundColor:C.surface, borderRadius:16, borderWidth:1, borderColor:C.border, overflow:"hidden" },
  cardHeader:{ flexDirection:"row", alignItems:"center", justifyContent:"space-between", padding:14, paddingBottom:6 },
  categoryPill:{ backgroundColor:C.orangeDim, borderRadius:8, paddingHorizontal:10, paddingVertical:3 },
  categoryText:{ fontSize:10, color:C.orange, fontWeight:"700", textTransform:"uppercase" },
  cardChevron:{ fontSize:16, color:C.textSub },
  cardFrom:{ fontSize:11, color:C.textSub, paddingHorizontal:14, marginBottom:4 },
  cardQuestion:{ fontSize:14, color:C.text, lineHeight:20, paddingHorizontal:14, paddingBottom:14 },
  replyBox:{ borderTopWidth:1, borderTopColor:C.border, padding:14, gap:10, backgroundColor:"#0d0d0d" },
  replyLabel:{ fontSize:11, color:C.orange, fontWeight:"700", textTransform:"uppercase", letterSpacing:0.5 },
  replyText:{ fontSize:13, color:C.text, lineHeight:20 },
  replyInput:{ backgroundColor:"#181818", borderRadius:10, borderWidth:1, borderColor:C.border, padding:12, color:C.text, fontSize:14, minHeight:90, textAlignVertical:"top" },
  answerBtn:{ backgroundColor:C.orange, borderRadius:10, padding:12, alignItems:"center" },
  answerBtnText:{ color:"#fff", fontWeight:"700", fontSize:13 },
  empty:{ paddingTop:60, alignItems:"center" }, emptyText:{ fontSize:14, color:C.textSub },
  orangeDim:"rgba(232,98,10,0.12)",
});
