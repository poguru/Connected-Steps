import React, { useState, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView, Image,
} from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { login }            from "../services/api";
import AsyncStorage         from "@react-native-async-storage/async-storage";
import { useUser }          from "../context/UserContext";
import { STORAGE_KEY_USER } from "../config";
import type { RootStackParamList } from "../../App";

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "https://www.connectedsteps.in";

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, "Login"> };
type Mode    = "password" | "otp";
type OtpStep = "identifier" | "code";

// ── 6-digit OTP input boxes ──────────────────────────────────────────────────
function OtpBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = useRef<(TextInput | null)[]>(Array(6).fill(null));
  const digits = Array(6).fill("").map((_, i) => value[i] ?? "");

  function handleChange(index: number, char: string) {
    const digit = char.replace(/\D/g, "").slice(-1);
    const next  = [...digits]; next[index] = digit;
    onChange(next.join(""));
    if (digit && index < 5) refs.current[index + 1]?.focus();
  }

  function handleKeyPress(index: number, key: string) {
    if (key === "Backspace" && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  }

  return (
    <View style={{ flexDirection: "row", gap: 8, justifyContent: "center", marginVertical: 8 }}>
      {digits.map((d, i) => (
        <TextInput
          key={i}
          ref={el => { refs.current[i] = el; }}
          style={[styles.otpBox, d ? styles.otpBoxFilled : null]}
          value={d}
          onChangeText={text => handleChange(i, text)}
          onKeyPress={({ nativeEvent }) => handleKeyPress(i, nativeEvent.key)}
          keyboardType="numeric"
          maxLength={1}
          secureTextEntry
          textAlign="center"
          selectTextOnFocus
          caretHidden
        />
      ))}
    </View>
  );
}

export default function LoginScreen({ navigation }: Props) {
  const { setUser } = useUser();

  // Password mode
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError,   setPwError]   = useState("");

  // OTP mode
  const [mode,       setMode]       = useState<Mode>("password");
  const [otpStep,    setOtpStep]    = useState<OtpStep>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [otpCode,    setOtpCode]    = useState("");
  const [sending,    setSending]    = useState(false);
  const [verifying,  setVerifying]  = useState(false);
  const [otpError,   setOtpError]   = useState("");

  async function handlePasswordLogin() {
    if (!email.trim() || !password.trim()) { setPwError("Please enter your email and password."); return; }
    setPwLoading(true); setPwError("");
    try {
      const user = await login(email.trim().toLowerCase(), password);
      await AsyncStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
      setUser(user);
      navigation.replace("MainTabs");
    } catch (e: unknown) {
      setPwError(e instanceof Error ? e.message : "Login failed. Please try again.");
    } finally { setPwLoading(false); }
  }

  async function sendOtp() {
    if (!identifier.trim()) { setOtpError("Please enter your email or phone."); return; }
    setSending(true); setOtpError("");
    try {
      const isEmail = identifier.includes("@");
      const res  = await fetch(`${API_BASE}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: isEmail ? "email" : "phone", value: identifier.trim(), purpose: "login" }),
      });
      const data = await res.json();
      if (!res.ok) { setOtpError(data.error ?? "Failed to send OTP."); return; }
      setOtpStep("code"); setOtpCode("");
    } catch { setOtpError("Network error. Please try again."); }
    finally { setSending(false); }
  }

  async function verifyOtp() {
    if (otpCode.length !== 6) { setOtpError("Please enter all 6 digits."); return; }
    setVerifying(true); setOtpError("");
    try {
      const res  = await fetch(`${API_BASE}/api/auth/login-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok) { setOtpError(data.error ?? "Verification failed."); return; }
      await AsyncStorage.setItem(STORAGE_KEY_USER, JSON.stringify(data.user));
      setUser(data.user);
      navigation.replace("MainTabs");
    } catch { setOtpError("Network error. Please try again."); }
    finally { setVerifying(false); }
  }

  function switchMode(m: Mode) {
    setMode(m); setOtpStep("identifier");
    setOtpCode(""); setOtpError(""); setPwError("");
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Logo */}
        <View style={styles.header}>
          <View style={styles.logoRing}>
            <Text style={styles.logoEmoji}>🏃</Text>
          </View>
          <Text style={styles.brand}>Connected Steps</Text>
          <Text style={styles.tagline}>Your Goal, Our Plan</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Sign in</Text>

          {/* Mode toggle */}
          <View style={styles.toggle}>
            {(["password", "otp"] as Mode[]).map(m => (
              <TouchableOpacity key={m} onPress={() => switchMode(m)}
                style={[styles.toggleBtn, mode === m && styles.toggleBtnActive]}>
                <Text style={[styles.toggleText, mode === m && styles.toggleTextActive]}>
                  {m === "password" ? "Password" : "Sign in with OTP"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Password mode ── */}
          {mode === "password" && (
            <>
              <Text style={styles.label}>Email or phone</Text>
              <TextInput style={styles.input} placeholder="you@example.com" placeholderTextColor="#555"
                value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />

              <Text style={styles.label}>Password</Text>
              <TextInput style={styles.input} placeholder="••••••••" placeholderTextColor="#555"
                value={password} onChangeText={setPassword} secureTextEntry />

              {!!pwError && <Text style={styles.error}>{pwError}</Text>}

              <TouchableOpacity style={[styles.btn, pwLoading && styles.btnDisabled]} onPress={handlePasswordLogin} disabled={pwLoading} activeOpacity={0.85}>
                {pwLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Sign in →</Text>}
              </TouchableOpacity>
            </>
          )}

          {/* ── OTP mode: identifier step ── */}
          {mode === "otp" && otpStep === "identifier" && (
            <>
              <Text style={styles.label}>Email or WhatsApp number</Text>
              <TextInput style={styles.input} placeholder="you@example.com or 9876543210"
                placeholderTextColor="#555" value={identifier} onChangeText={t => { setIdentifier(t); setOtpError(""); }}
                autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />

              {!!otpError && <Text style={styles.error}>{otpError}</Text>}

              <TouchableOpacity style={[styles.btn, sending && styles.btnDisabled]} onPress={sendOtp} disabled={sending} activeOpacity={0.85}>
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Send OTP →</Text>}
              </TouchableOpacity>
            </>
          )}

          {/* ── OTP mode: code step ── */}
          {mode === "otp" && otpStep === "code" && (
            <>
              <Text style={[styles.subtitle, { marginBottom: 8 }]}>
                OTP sent to {identifier}.{identifier.includes("@") ? " Check your inbox." : " Check your WhatsApp."}
              </Text>

              <OtpBoxes value={otpCode} onChange={v => { setOtpCode(v); setOtpError(""); }} />

              {!!otpError && <Text style={styles.error}>{otpError}</Text>}

              <TouchableOpacity style={[styles.btn, (verifying || otpCode.length !== 6) && styles.btnDisabled]}
                onPress={verifyOtp} disabled={verifying || otpCode.length !== 6} activeOpacity={0.85}>
                {verifying ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Verify & Sign in →</Text>}
              </TouchableOpacity>

              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12 }}>
                <TouchableOpacity onPress={() => { setOtpStep("identifier"); setOtpCode(""); setOtpError(""); }}>
                  <Text style={styles.link}>← Change</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={sendOtp} disabled={sending}>
                  <Text style={styles.link}>{sending ? "Sending…" : "Resend OTP"}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <Text style={styles.hint}>Use the same credentials as the Connected Steps website.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const C = {
  bg: "#0a0a0a", surface: "#141414", border: "#222",
  orange: "#e8620a", muted: "#666", text: "#f0f0f0",
};

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: C.bg },
  scroll:          { flexGrow: 1, padding: 24, justifyContent: "center" },
  header:          { alignItems: "center", marginBottom: 36 },
  logoRing:        { width: 72, height: 72, borderRadius: 36, backgroundColor: C.surface, borderWidth: 2, borderColor: C.orange, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  logoEmoji:       { fontSize: 32 },
  brand:           { fontSize: 22, fontWeight: "700", color: C.text, letterSpacing: -0.3 },
  tagline:         { fontSize: 12, color: C.muted, marginTop: 4, letterSpacing: 0.5 },
  card:            { backgroundColor: C.surface, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: C.border },
  title:           { fontSize: 18, fontWeight: "700", color: C.text, marginBottom: 16 },
  subtitle:        { fontSize: 13, color: C.muted, lineHeight: 18, marginBottom: 24 },
  label:           { fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  input:           { backgroundColor: "#1a1a1a", borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 14, color: C.text, fontSize: 15, marginBottom: 16 },
  error:           { color: "#f09595", fontSize: 13, marginBottom: 12 },
  btn:             { backgroundColor: C.orange, borderRadius: 10, padding: 15, alignItems: "center", marginTop: 4 },
  btnDisabled:     { opacity: 0.5 },
  btnText:         { color: "#fff", fontWeight: "700", fontSize: 15 },
  hint:            { fontSize: 12, color: C.muted, textAlign: "center", marginTop: 16, lineHeight: 17 },
  link:            { fontSize: 13, color: C.muted, textDecorationLine: "underline" },
  toggle:          { flexDirection: "row", backgroundColor: "#1a1a1a", borderRadius: 999, padding: 4, marginBottom: 20 },
  toggleBtn:       { flex: 1, paddingVertical: 9, borderRadius: 999, alignItems: "center" },
  toggleBtnActive: { backgroundColor: C.orange },
  toggleText:      { fontSize: 13, fontWeight: "600", color: C.muted },
  toggleTextActive:{ color: "#fff" },
  otpBox:          { width: 44, height: 54, borderRadius: 10, borderWidth: 1.5, borderColor: C.border, backgroundColor: "#1a1a1a", fontSize: 20, fontWeight: "700", color: C.text },
  otpBoxFilled:    { borderColor: C.orange, backgroundColor: "rgba(232,98,10,0.1)" },
});
