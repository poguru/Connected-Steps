import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Switch, TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import { useUser }           from "../../context/UserContext";
import { adminGetAttendance, adminSaveAttendance } from "../../services/api";
import type { AttendanceUser } from "../../services/api";
import type { RootStackParamList } from "../../../App";

type Props = NativeStackScreenProps<RootStackParamList, "AdminAttendance">;
type Nav   = NativeStackNavigationProp<RootStackParamList>;

export default function AdminAttendanceScreen() {
  const { user }   = useUser();
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Props["route"]>();
  const insets     = useSafeAreaInsets();
  const { sessionId, sessionTitle } = route.params;
  const token = user?.coachToken ?? "";

  const [attendees, setAttendees] = useState<AttendanceUser[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { users } = await adminGetAttendance(token, sessionId);
      setAttendees(users);
    } catch (e) { Alert.alert("Error", String(e)); }
    finally { setLoading(false); }
  }, [token, sessionId]);

  useEffect(() => { load(); }, [load]);

  function toggle(email: string) {
    setAttendees(prev => prev.map(a => a.email === email ? { ...a, attended: !a.attended } : a));
  }

  function setBonus(email: string, pts: string) {
    setAttendees(prev => prev.map(a => a.email === email ? { ...a, bonus_points: Number(pts) || 0 } : a));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await adminSaveAttendance(token, sessionId, attendees);
      Alert.alert("Saved", "Attendance saved successfully.");
    } catch (e) { Alert.alert("Error", String(e)); }
    finally { setSaving(false); }
  }

  return (
    <View style={S.root}>
      <View style={[S.header, { paddingTop: Math.max(insets.top + 12, 20) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.back}><Text style={S.backText}>‹ Sessions</Text></TouchableOpacity>
        <Text style={S.title} numberOfLines={1}>{sessionTitle}</Text>
        <Text style={S.sub}>{attendees.length} registered · {attendees.filter(a => a.attended).length} attended</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={C.orange} style={{ marginTop: 48 }} />
      ) : attendees.length === 0 ? (
        <View style={S.empty}><Text style={S.emptyText}>No one registered for this session yet.</Text></View>
      ) : (
        <FlatList
          data={attendees}
          keyExtractor={a => a.email}
          contentContainerStyle={S.list}
          renderItem={({ item: a }) => (
            <View style={[S.row, a.attended && S.rowAttended]}>
              <View style={{ flex: 1 }}>
                <Text style={S.name}>{a.name}</Text>
                <Text style={S.email}>{a.email}</Text>
              </View>
              <TextInput
                style={S.bonusInput}
                value={String(a.bonus_points || "")}
                onChangeText={v => setBonus(a.email, v)}
                keyboardType="number-pad"
                placeholder="+pts"
                placeholderTextColor={C.textMuted}
              />
              <Switch
                value={a.attended}
                onValueChange={() => toggle(a.email)}
                trackColor={{ true: C.orange, false: "#2a2a2a" }}
                thumbColor={a.attended ? "#fff" : "#555"}
              />
            </View>
          )}
        />
      )}

      {!loading && attendees.length > 0 && (
        <View style={[S.footer, { paddingBottom: Math.max(insets.bottom + 8, 20) }]}>
          <TouchableOpacity style={[S.saveBtn, saving && { opacity: 0.5 }]} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={S.saveBtnText}>Save Attendance</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const C = { bg:"#080808", surface:"#111111", border:"#222222", orange:"#e8620a", white:"#f5f5f5", text:"#f0f0f0", textSub:"#888", textMuted:"#505050" };
const S = StyleSheet.create({
  root:{ flex:1, backgroundColor:C.bg },
  header:{ paddingHorizontal:20, paddingBottom:16, borderBottomWidth:1, borderBottomColor:C.border },
  back:{ marginBottom:8 }, backText:{ fontSize:14, color:C.orange, fontWeight:"600" },
  title:{ fontSize:18, fontWeight:"800", color:C.white, marginBottom:2 },
  sub:{ fontSize:12, color:C.textSub },
  list:{ paddingHorizontal:16, paddingTop:12, paddingBottom:100 },
  row:{ flexDirection:"row", alignItems:"center", backgroundColor:C.surface, borderRadius:14, borderWidth:1, borderColor:C.border, padding:14, marginBottom:8, gap:12 },
  rowAttended:{ borderColor:"rgba(232,98,10,0.3)", backgroundColor:"rgba(232,98,10,0.06)" },
  name:{ fontSize:14, fontWeight:"600", color:C.text, marginBottom:2 },
  email:{ fontSize:11, color:C.textSub },
  bonusInput:{ width:52, backgroundColor:"#181818", borderRadius:8, borderWidth:1, borderColor:C.border, padding:8, color:C.text, fontSize:13, textAlign:"center" },
  footer:{ position:"absolute", bottom:0, left:0, right:0, backgroundColor:"#0d0d0d", borderTopWidth:1, borderTopColor:C.border, padding:16 },
  saveBtn:{ backgroundColor:C.orange, borderRadius:12, padding:14, alignItems:"center" },
  saveBtnText:{ color:"#fff", fontWeight:"700", fontSize:15 },
  empty:{ paddingTop:60, alignItems:"center" }, emptyText:{ fontSize:14, color:C.textSub },
});
