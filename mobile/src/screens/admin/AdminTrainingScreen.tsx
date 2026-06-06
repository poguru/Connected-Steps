import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation }     from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useUser }           from "../../context/UserContext";
import { adminGetMembers, adminAssignPlan } from "../../services/api";
import type { AdminMember }  from "../../services/api";
import type { RootStackParamList } from "../../../App";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const EMOJI_OPTIONS = ["🏃","💪","🚴","🧘","😴","⚡","🔥"];
const EMPTY_DAY = () => ({ type: "", detail: "", emoji: "🏃" });

export default function AdminTrainingScreen() {
  const { user }   = useUser();
  const navigation = useNavigation<Nav>();
  const insets     = useSafeAreaInsets();
  const token      = user?.coachToken ?? "";

  const [members,   setMembers]   = useState<AdminMember[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [query,     setQuery]     = useState("");
  const [selected,  setSelected]  = useState<AdminMember | null>(null);
  const [planTitle, setPlanTitle] = useState("");
  const [days,      setDays]      = useState(Array.from({ length: 7 }, EMPTY_DAY));
  const [saving,    setSaving]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setMembers((await adminGetMembers(token)).users); } catch { /* keep stale */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function updateDay(i: number, field: "type" | "detail" | "emoji", val: string) {
    setDays(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: val } : d));
  }

  async function handleAssign() {
    if (!selected) return;
    if (!planTitle.trim()) { Alert.alert("Missing", "Enter a plan title."); return; }
    if (days.some(d => !d.type.trim())) { Alert.alert("Missing", "Fill in the type for every day (e.g. Rest, Easy Run)."); return; }
    setSaving(true);
    try {
      await adminAssignPlan(token, {
        user_email: selected.email,
        title:      planTitle.trim(),
        coach_name: `${user?.firstName} ${user?.lastName}`.trim(),
        days,
      });
      Alert.alert("Assigned!", `Training plan sent to ${selected.first_name}.`);
      setSelected(null);
      setPlanTitle("");
      setDays(Array.from({ length: 7 }, EMPTY_DAY));
    } catch (e) { Alert.alert("Error", String(e)); }
    finally { setSaving(false); }
  }

  const filtered = members.filter(m =>
    !query || `${m.first_name} ${m.last_name} ${m.email}`.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <ScrollView style={S.root} contentContainerStyle={S.scroll} showsVerticalScrollIndicator={false}>
      <View style={[S.header, { paddingTop: Math.max(insets.top + 12, 20) }]}>
        <Text style={S.backText} onPress={() => navigation.goBack()}>‹ Admin</Text>
        <Text style={S.title}>Training Plans</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={C.orange} style={{ marginTop: 48 }} />
      ) : !selected ? (
        /* Step 1: pick member */
        <View style={S.section}>
          <Text style={S.sectionLabel}>SELECT MEMBER</Text>
          <TextInput
            style={S.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or email…"
            placeholderTextColor={C.textMuted}
          />
          {filtered.map(m => (
            <TouchableOpacity key={m.email} style={S.memberRow} onPress={() => setSelected(m)} activeOpacity={0.8}>
              <View style={S.memberAvatar}><Text style={S.memberAvatarText}>{m.first_name.charAt(0)}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={S.memberName}>{m.first_name} {m.last_name}</Text>
                <Text style={S.memberEmail}>{m.email}</Text>
              </View>
              <Text style={S.selectBtn}>Select →</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        /* Step 2: build plan */
        <View style={S.section}>
          <TouchableOpacity onPress={() => setSelected(null)} style={S.changeMember}>
            <Text style={S.changeMemberText}>← Change member</Text>
          </TouchableOpacity>
          <View style={S.selectedCard}>
            <Text style={S.selectedName}>{selected.first_name} {selected.last_name}</Text>
            <Text style={S.selectedEmail}>{selected.email}</Text>
          </View>

          <Text style={S.sectionLabel}>PLAN TITLE</Text>
          <TextInput
            style={S.fieldInput}
            value={planTitle}
            onChangeText={setPlanTitle}
            placeholder="e.g. 8-Week Marathon Prep"
            placeholderTextColor={C.textMuted}
          />

          <Text style={[S.sectionLabel, { marginTop: 20 }]}>WEEKLY SCHEDULE</Text>
          {days.map((day, i) => (
            <View key={i} style={S.dayCard}>
              <Text style={S.dayName}>{DAY_NAMES[i]}</Text>
              <View style={S.emojiRow}>
                {EMOJI_OPTIONS.map(e => (
                  <TouchableOpacity key={e} onPress={() => updateDay(i, "emoji", e)} style={[S.emojiBtn, day.emoji === e && S.emojiBtnActive]}>
                    <Text style={{ fontSize: 18 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput style={S.fieldInput} value={day.type} onChangeText={v => updateDay(i, "type", v)} placeholder="Type (e.g. Easy Run, Rest)" placeholderTextColor={C.textMuted} />
              <TextInput style={[S.fieldInput, { marginTop: 6 }]} value={day.detail} onChangeText={v => updateDay(i, "detail", v)} placeholder="Detail (e.g. 5km easy pace)" placeholderTextColor={C.textMuted} />
            </View>
          ))}

          <TouchableOpacity style={[S.assignBtn, saving && { opacity: 0.5 }]} onPress={handleAssign} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={S.assignBtnText}>Assign Plan to {selected.first_name}</Text>}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const C = { bg:"#080808", surface:"#111111", border:"#222222", orange:"#e8620a", orangeDim:"rgba(232,98,10,0.12)", white:"#f5f5f5", text:"#f0f0f0", textSub:"#888", textMuted:"#505050" };
const S = StyleSheet.create({
  root:{ flex:1, backgroundColor:C.bg }, scroll:{ paddingBottom:60 },
  header:{ paddingHorizontal:20, paddingBottom:16, borderBottomWidth:1, borderBottomColor:C.border },
  backText:{ fontSize:14, color:C.orange, fontWeight:"600", marginBottom:8 },
  title:{ fontSize:22, fontWeight:"800", color:C.white },
  section:{ padding:16, gap:10 },
  sectionLabel:{ fontSize:11, color:C.textSub, fontWeight:"700", textTransform:"uppercase", letterSpacing:0.6 },
  searchInput:{ backgroundColor:C.surface, borderRadius:12, borderWidth:1, borderColor:C.border, padding:12, color:C.text, fontSize:14 },
  memberRow:{ backgroundColor:C.surface, borderRadius:14, borderWidth:1, borderColor:C.border, padding:14, flexDirection:"row", alignItems:"center", gap:12 },
  memberAvatar:{ width:36, height:36, borderRadius:18, backgroundColor:C.orangeDim, alignItems:"center", justifyContent:"center" },
  memberAvatarText:{ fontSize:15, fontWeight:"800", color:C.orange },
  memberName:{ fontSize:14, fontWeight:"600", color:C.text },
  memberEmail:{ fontSize:11, color:C.textSub },
  selectBtn:{ fontSize:13, color:C.orange, fontWeight:"600" },
  changeMember:{ marginBottom:4 }, changeMemberText:{ fontSize:14, color:C.orange, fontWeight:"600" },
  selectedCard:{ backgroundColor:"rgba(232,98,10,0.08)", borderRadius:12, borderWidth:1, borderColor:"rgba(232,98,10,0.25)", padding:14, marginBottom:8 },
  selectedName:{ fontSize:15, fontWeight:"700", color:C.white },
  selectedEmail:{ fontSize:12, color:C.textSub, marginTop:2 },
  fieldInput:{ backgroundColor:C.surface, borderRadius:10, borderWidth:1, borderColor:C.border, padding:12, color:C.text, fontSize:14 },
  dayCard:{ backgroundColor:C.surface, borderRadius:14, borderWidth:1, borderColor:C.border, padding:14, gap:8 },
  dayName:{ fontSize:12, fontWeight:"700", color:C.orange, textTransform:"uppercase", letterSpacing:0.5 },
  emojiRow:{ flexDirection:"row", gap:6, flexWrap:"wrap" },
  emojiBtn:{ width:36, height:36, borderRadius:8, alignItems:"center", justifyContent:"center", backgroundColor:"#181818", borderWidth:1, borderColor:C.border },
  emojiBtnActive:{ borderColor:C.orange, backgroundColor:C.orangeDim },
  assignBtn:{ backgroundColor:C.orange, borderRadius:14, padding:16, alignItems:"center", marginTop:8 },
  assignBtnText:{ color:"#fff", fontWeight:"700", fontSize:15 },
  orangeDim:"rgba(232,98,10,0.12)",
});
