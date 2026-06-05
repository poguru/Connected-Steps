import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView, Image,
} from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { login }        from "../services/api";
import AsyncStorage     from "@react-native-async-storage/async-storage";
import { STORAGE_KEY_USER } from "../config";
import type { CSUser }  from "../types";
import type { RootStackParamList } from "../../App";

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, "Login"> };

export default function LoginScreen({ navigation }: Props) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true); setError("");
    try {
      const user: CSUser = await login(email.trim().toLowerCase(), password);
      await AsyncStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
      navigation.replace("HealthSync", { user });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Logo */}
        <View style={styles.header}>
          <View style={styles.logoRing}>
            <Text style={styles.logoEmoji}>🏃</Text>
          </View>
          <Text style={styles.brand}>Connected Steps</Text>
          <Text style={styles.tagline}>Your Goal, Our Plan</Text>
        </View>

        {/* Form */}
        <View style={styles.card}>
          <Text style={styles.title}>Sign in to sync</Text>
          <Text style={styles.subtitle}>Connect your fitness data with your Connected Steps profile</Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#555"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#555"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Sign in →</Text>
            }
          </TouchableOpacity>

          <Text style={styles.hint}>
            Use the same credentials as the Connected Steps website.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const C = {
  bg:      "#0a0a0a",
  surface: "#141414",
  border:  "#222",
  orange:  "#e8620a",
  muted:   "#666",
  text:    "#f0f0f0",
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll:    { flexGrow: 1, padding: 24, justifyContent: "center" },
  header:    { alignItems: "center", marginBottom: 36 },
  logoRing:  { width: 72, height: 72, borderRadius: 36, backgroundColor: C.surface, borderWidth: 2, borderColor: C.orange, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  logoEmoji: { fontSize: 32 },
  brand:     { fontSize: 22, fontWeight: "700", color: C.text, letterSpacing: -0.3 },
  tagline:   { fontSize: 12, color: C.muted, marginTop: 4, letterSpacing: 0.5 },
  card:      { backgroundColor: C.surface, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: C.border },
  title:     { fontSize: 18, fontWeight: "700", color: C.text, marginBottom: 6 },
  subtitle:  { fontSize: 13, color: C.muted, lineHeight: 18, marginBottom: 24 },
  label:     { fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  input:     { backgroundColor: "#1a1a1a", borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 14, color: C.text, fontSize: 15, marginBottom: 16 },
  error:     { color: "#f09595", fontSize: 13, marginBottom: 12 },
  btn:       { backgroundColor: C.orange, borderRadius: 10, padding: 15, alignItems: "center", marginTop: 4 },
  btnDisabled: { opacity: 0.6 },
  btnText:   { color: "#fff", fontWeight: "700", fontSize: 15 },
  hint:      { fontSize: 12, color: C.muted, textAlign: "center", marginTop: 16, lineHeight: 17 },
});
