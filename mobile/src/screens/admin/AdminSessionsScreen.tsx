import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation }     from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useUser }           from "../../context/UserContext";
import { adminGetSessions, adminCreateSession } from "../../services/api";
import type { Session }      from "../../types";
import type { RootStackParamList } from "../../../App";

type Nav = NativeStackNavigationProp<RootStackParamList>;

function fmtDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

const EMPTY_FORM = { title: "", date: "", time: "", location: "", venue: "" };

export default function AdminSessionsScreen() {
  const { user }   = useUser();
  const navigation = useNavigation<Nav>();
  const insets     = useSafeAreaInsets();
  const token      = user?.coachToken ?? "";

  const [sessions,   setSessions]   = useState<Session[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm,   setShowForm]   = useState(false);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [saving,     setSaving]     = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { setSessions(await adminGetSessions(token)); } catch { /* keep stale */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!form.title.trim() || !form.date.trim() || !form.location.trim()) {
      Alert.alert("Missing fields", "Title, date (YYYY-MM-DD) and location are required.");
      return;
    }
    setSaving(true);
    try {
      await adminCreateSession(token, { ...form, title: form.title.trim(), location: form.location.trim() });
      setForm(EMPTY_FORM);
      setShowForm(false);
      load(true);
    } catch (e) {
      Alert.alert("Error", String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={S.root}
      contentContainerStyle={S.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.orange} />}
    >
      <View style={[S.header, { paddingTop: Math.max(insets.top + 12, 20) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.back}><Text style={S.backText}>‹ Admin</Text></TouchableOpacity>
        <View style={S.headerRow}>
          <Text style={S.title}>Sessions</Text>
          <TouchableOpacity style={S.addBtn} onPress={() => setShowForm(v => !v)}>
            <Text style={S.addBtnText}>{showForm ? "Cancel" : "+ New"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Create form */}
      {showForm && (
        <View style={S.formCard}>
          {[
            { key: "title",    label: "Title *",            placeholder: "e.g. Morning 5K Run"   },
            { key: "date",     label: "Date * (YYYY-MM-DD)", placeholder: "2025-07-20"            },
            { key: "time",     label: "Time (HH:MM)",        placeholder: "06:00"                 },
            { key: "location", label: "Location *",          placeholder: "Gachibowli Stadium"    },
            { key: "venue",    label: "Venue (display name)",placeholder: "Gate 3 Entrance"       },
          ].map(f => (
            <View key={f.key} style={S.fieldGroup}>
              <Text style={S.fieldLabel}>{f.label}</Text>
              <TextInput
                style={S.fieldInput}
                value={form[f.key as keyof typeof form]}
                onChangeText={v => setForm(prev => ({ ...prev, [f.key]: v }))}
                placeholder={f.placeholder}
                placeholderTextColor={C.textMuted}
              />
            </View>
          ))}
          <TouchableOpacity style={[S.saveBtn, saving && { opacity: 0.5 }]} onPress={handleCreate} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={S.saveBtnText}>Create Session</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Sessions list */}
      {loading ? (
        <ActivityIndicator color={C.orange} style={{ marginTop: 48 }} />
      ) : sessions.length === 0 ? (
        <View style={S.empty}><Text style={S.emptyText}>No sessions yet. Create one above.</Text></View>
      ) : (
        <View style={S.list}>
          {sessions.map(s => (
            <TouchableOpacity
              key={s.id}
              style={S.row}
              onPress={() => navigation.navigate("AdminAttendance", { sessionId: s.id, sessionTitle: s.title })}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <Text style={S.rowTitle} numberOfLines={1}>{s.title}</Text>
                <Text style={S.rowMeta}>{fmtDate(s.date)}{s.time ? `  ·  ${s.time}` : ""}</Text>
                {s.venue ? <Text style={S.rowVenue} numberOfLines={1}>📍 {s.venue}</Text> : null}
              </View>
              <Text style={S.rowChevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const C = { bg:"#080808", surface:"#111111", border:"#222222", orange:"#e8620a", orangeDim:"rgba(232,98,10,0.12)", white:"#f5f5f5", text:"#f0f0f0", textSub:"#888", textMuted:"#505050" };
const S = StyleSheet.create({
  root:{ flex:1, backgroundColor:C.bg }, scroll:{ paddingBottom:48 },
  header:{ paddingHorizontal:20, paddingBottom:16, borderBottomWidth:1, borderBottomColor:C.border },
  back:{ marginBottom:8 }, backText:{ fontSize:14, color:C.orange, fontWeight:"600" },
  headerRow:{ flexDirection:"row", alignItems:"center", justifyContent:"space-between" },
  title:{ fontSize:22, fontWeight:"800", color:C.white },
  addBtn:{ backgroundColor:C.orange, borderRadius:10, paddingHorizontal:14, paddingVertical:8 },
  addBtnText:{ color:"#fff", fontWeight:"700", fontSize:13 },
  formCard:{ margin:16, backgroundColor:C.surface, borderRadius:18, borderWidth:1, borderColor:C.border, padding:18, gap:14 },
  fieldGroup:{ gap:6 },
  fieldLabel:{ fontSize:11, color:C.textMuted, fontWeight:"600", textTransform:"uppercase", letterSpacing:0.5 },
  fieldInput:{ backgroundColor:"#181818", borderRadius:10, borderWidth:1, borderColor:C.border, padding:12, color:C.text, fontSize:14 },
  saveBtn:{ backgroundColor:C.orange, borderRadius:12, padding:14, alignItems:"center", marginTop:4 },
  saveBtnText:{ color:"#fff", fontWeight:"700", fontSize:14 },
  list:{ paddingHorizontal:16, paddingTop:16, gap:8 },
  row:{ backgroundColor:C.surface, borderRadius:14, borderWidth:1, borderColor:C.border, padding:16, flexDirection:"row", alignItems:"center" },
  rowTitle:{ fontSize:14, fontWeight:"700", color:C.text, marginBottom:4 },
  rowMeta:{ fontSize:12, color:C.orange },
  rowVenue:{ fontSize:11, color:C.textMuted, marginTop:2 },
  rowChevron:{ fontSize:22, color:C.textMuted, marginLeft:8 },
  empty:{ paddingTop:60, alignItems:"center" }, emptyText:{ fontSize:14, color:C.textMuted },
});
