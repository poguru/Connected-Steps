/**
 * Phase 2 — Offline Volunteer Scanner
 * Volunteers scan event QR codes to issue services: check-in, T-shirt,
 * breakfast, BIB collection, medal, certificate.
 *
 * Offline behaviour: scan results are queued in SQLite and replayed
 * when connectivity returns. Idempotency keys prevent duplicate issuance.
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, TextInput, Vibration,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCameraPermissions, CameraView } from "expo-camera";
import { useUser }           from "../context/UserContext";
import { useNetwork }        from "../context/NetworkContext";
import {
  opsLogin, opsLogout, opsScan,
  opsLiveStats, opsSearchParticipants,
} from "../services/api";
import {
  enqueue, getPendingCount, getPendingQueue,
  markSynced, incrementRetry, writeScanLog, markScanSynced,
} from "../services/offline";
import type { OpsSession, ScanResult, ScanService } from "../types";
import * as SecureStore from "expo-secure-store";

const OPS_TOKEN_KEY    = "cs_ops_token";
const OPS_EVENT_KEY    = "cs_ops_event_id";
const OPS_ROLE_KEY     = "cs_ops_role";
const OPS_SESSION_KEY  = "cs_ops_session_json";

const SERVICES: { id: ScanService; label: string; icon: string }[] = [
  { id: "checkin",     label: "Check-In",   icon: "✅" },
  { id: "tshirt",      label: "T-Shirt",    icon: "👕" },
  { id: "breakfast",   label: "Breakfast",  icon: "🥐" },
  { id: "bib",         label: "BIB",        icon: "🏷️" },
  { id: "medal",       label: "Medal",      icon: "🏅" },
  { id: "certificate", label: "Cert",       icon: "📄" },
];

// ── helpers ──────────────────────────────────────────────────────────────────

function extractToken(data: string): string {
  // QR content format: https://www.connectedsteps.in/event-checkin?t=<token>
  // OR raw token OR registration code CS-EVT-...
  try {
    const url   = new URL(data);
    const t     = url.searchParams.get("t");
    if (t) return t;
  } catch { /* not a URL — use raw */ }
  return data.trim();
}

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Login panel ───────────────────────────────────────────────────────────────

function LoginPanel({ onLogin }: { onLogin: (session: OpsSession) => void }) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [eventId,  setEventId]  = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  async function handleLogin() {
    if (!email.trim() || !password.trim() || !eventId.trim()) {
      setError("All fields are required."); return;
    }
    setLoading(true); setError("");
    try {
      const session = await opsLogin({
        email:    email.trim().toLowerCase(),
        password: password.trim(),
        event_id: eventId.trim(),
      });
      // Persist for auto-restore
      await SecureStore.setItemAsync(OPS_SESSION_KEY, JSON.stringify(session));
      onLogin(session);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={L.root} contentContainerStyle={L.scroll}>
      <Text style={L.title}>Volunteer Scanner</Text>
      <Text style={L.sub}>Sign in with your ops credentials to scan participants.</Text>

      <Text style={L.label}>Email</Text>
      <TextInput style={L.input} placeholder="volunteer@example.com" placeholderTextColor="#555"
        value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />

      <Text style={L.label}>Password</Text>
      <TextInput style={L.input} placeholder="••••••••" placeholderTextColor="#555"
        value={password} onChangeText={setPassword} secureTextEntry />

      <Text style={L.label}>Event ID</Text>
      <TextInput style={L.input} placeholder="Paste event UUID here" placeholderTextColor="#555"
        value={eventId} onChangeText={setEventId} autoCapitalize="none" autoCorrect={false} />

      {!!error && <Text style={L.error}>{error}</Text>}

      <TouchableOpacity
        style={[L.btn, loading && { opacity: 0.5 }]}
        onPress={handleLogin} disabled={loading} activeOpacity={0.85}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={L.btnText}>Sign In →</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Result card ───────────────────────────────────────────────────────────────

interface ResultCardProps {
  result:  ScanResult | null;
  offline: boolean;
  onDismiss: () => void;
}

function ResultCard({ result, offline, onDismiss }: ResultCardProps) {
  if (!result && !offline) return null;

  const isAlreadyDone = result?.already_done;
  const isValid       = result?.valid;

  const bg    = offline       ? "#0d0e16" :
                isAlreadyDone ? "#0d0e00" :
                isValid       ? "#0a1008" : "#120808";
  const color = offline       ? C.blue   :
                isAlreadyDone ? C.amber   :
                isValid       ? C.green   : C.red;

  return (
    <TouchableOpacity style={[R.card, { backgroundColor: bg, borderColor: color + "44" }]}
      onPress={onDismiss} activeOpacity={0.9}>
      <Text style={[R.icon, { color }]}>
        {offline ? "📶" : isAlreadyDone ? "⚠️" : isValid ? "✅" : "❌"}
      </Text>
      {offline ? (
        <>
          <Text style={[R.status, { color }]}>Queued Offline</Text>
          <Text style={R.message}>Will sync when connected</Text>
        </>
      ) : result ? (
        <>
          <Text style={[R.status, { color }]}>
            {isAlreadyDone ? "Already Done" : isValid ? "Success" : "Failed"}
          </Text>
          {result.participant && (
            <Text style={R.name} numberOfLines={1}>{result.participant.name}</Text>
          )}
          <Text style={R.message} numberOfLines={2}>{result.message}</Text>
          {result.participant && (
            <View style={R.meta}>
              <Text style={R.metaText}>{result.participant.distance_category}</Text>
              {result.participant.tshirt_size ? (
                <Text style={R.metaText}>Size: {result.participant.tshirt_size}</Text>
              ) : null}
              {result.participant.bib_number ? (
                <Text style={R.metaText}>BIB: {result.participant.bib_number}</Text>
              ) : null}
            </View>
          )}
          {isAlreadyDone && result.done_at && (
            <Text style={R.doneAt}>
              Done at {new Date(result.done_at).toLocaleTimeString("en-IN")}
            </Text>
          )}
        </>
      ) : null}
      <Text style={R.dismiss}>Tap to scan again</Text>
    </TouchableOpacity>
  );
}

// ── Main volunteer screen ─────────────────────────────────────────────────────

export default function VolunteerScreen() {
  const { user, opsSession, setOpsSession, clearOpsSession } = useUser();
  const { isConnected }   = useNetwork();
  const insets             = useSafeAreaInsets();

  const [permission,  requestPermission] = useCameraPermissions();
  const [service,     setService]        = useState<ScanService>("checkin");
  const [scanning,    setScanning]       = useState(false);
  const [processing,  setProcessing]     = useState(false);
  const [scanResult,  setScanResult]     = useState<ScanResult | null>(null);
  const [queuedOffline, setQueuedOffline]= useState(false);
  const [pendingCount,  setPendingCount] = useState(0);
  const [stats,       setStats]          = useState<Record<string, unknown> | null>(null);
  const [manualInput, setManualInput]    = useState("");
  const [showManual,  setShowManual]     = useState(false);

  const lastScanned = useRef<string>("");
  const cooldown    = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Restore session from SecureStore ──────────────────────────────────────

  useEffect(() => {
    SecureStore.getItemAsync(OPS_SESSION_KEY).then(raw => {
      if (!raw) return;
      try {
        const s = JSON.parse(raw) as OpsSession;
        if (s.expires_at * 1000 > Date.now()) setOpsSession(s);
        else SecureStore.deleteItemAsync(OPS_SESSION_KEY).catch(() => {});
      } catch { /* corrupted */ }
    }).catch(() => {});
  }, [setOpsSession]);

  // ── Pending sync count ────────────────────────────────────────────────────

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const n = await getPendingCount();
      if (alive) setPendingCount(n);
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // ── Auto-sync when online ─────────────────────────────────────────────────

  useEffect(() => {
    if (!isConnected || !opsSession) return;
    let alive = true;

    async function flush() {
      const queue = await getPendingQueue();
      for (const item of queue) {
        if (!alive) return;
        try {
          const body = JSON.parse(item.body) as {
            service: string; qr_token: string; event_id: string;
          };
          await opsScan(opsSession!.token, body.event_id, {
            service:  body.service,
            qr_token: body.qr_token,
          });
          await markSynced(item.id);
          await markScanSynced(item.id);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "sync error";
          if (item.retry_count >= 5) {
            await markSynced(item.id); // give up after 5 retries
          } else {
            await incrementRetry(item.id, msg);
          }
        }
      }
      const n = await getPendingCount();
      if (alive) setPendingCount(n);
    }

    flush();
    const id = setInterval(flush, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, [isConnected, opsSession]);

  // ── Live stats polling ────────────────────────────────────────────────────

  useEffect(() => {
    if (!isConnected || !opsSession) return;
    let alive = true;

    async function poll() {
      try {
        const s = await opsLiveStats(opsSession!.token, opsSession!.event_id);
        if (alive) setStats(s);
      } catch { /* ignore */ }
    }
    poll();
    const id = setInterval(poll, 8000);
    return () => { alive = false; clearInterval(id); };
  }, [isConnected, opsSession]);

  // ── Scan handler ──────────────────────────────────────────────────────────

  const handleScan = useCallback(async (rawData: string) => {
    if (processing) return;
    if (!opsSession) return;

    const token = extractToken(rawData);
    if (!token || token === lastScanned.current) return;

    lastScanned.current = token;
    setProcessing(true);
    setScanResult(null);
    setQueuedOffline(false);
    Vibration.vibrate(100);

    const scanId         = uniqueId();
    const idempotencyKey = `${opsSession.event_id}:${service}:${token}`;

    if (!isConnected) {
      // Queue for later sync
      await enqueue({
        id:              scanId,
        endpoint:        `/api/ops/events/${opsSession.event_id}/scan`,
        body:            { service, qr_token: token, event_id: opsSession.event_id },
        idempotency_key: idempotencyKey,
      });
      await writeScanLog({
        id:     scanId,
        event_id: opsSession.event_id,
        service,
        qr_token: token,
        result: "queued_offline",
        synced: false,
      });
      setPendingCount(c => c + 1);
      setQueuedOffline(true);
      setProcessing(false);
    } else {
      try {
        const result = await opsScan(opsSession.token, opsSession.event_id, {
          service,
          qr_token: token,
        });
        setScanResult(result);
        await writeScanLog({
          id:               scanId,
          event_id:         opsSession.event_id,
          service,
          qr_token:         token,
          participant_id:   result.participant?.id,
          participant_name: result.participant?.name,
          result:           result.valid ? (result.already_done ? "already_done" : "success") : "failed",
          synced:           true,
        });
        if (result.valid && !result.already_done) Vibration.vibrate([0, 100, 100, 100]);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Scan error";
        setScanResult({ valid: false, already_done: false, done_at: null, done_by: null, message: msg, participant: null });
      } finally {
        setProcessing(false);
      }
    }

    // Cooldown before next scan
    cooldown.current = setTimeout(() => {
      lastScanned.current = "";
    }, 2000);
  }, [processing, opsSession, isConnected, service]);

  // ── Submit manual token ───────────────────────────────────────────────────

  async function submitManual() {
    if (!manualInput.trim()) return;
    setShowManual(false);
    await handleScan(manualInput.trim());
    setManualInput("");
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  async function handleLogout() {
    Alert.alert("Sign Out", "Clear ops session?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out", style: "destructive",
        onPress: async () => {
          if (opsSession) await opsLogout(opsSession.token).catch(() => {});
          await SecureStore.deleteItemAsync(OPS_SESSION_KEY).catch(() => {});
          clearOpsSession();
        },
      },
    ]);
  }

  // ── Not logged in ─────────────────────────────────────────────────────────

  if (!opsSession) {
    return <LoginPanel onLogin={setOpsSession} />;
  }

  // ── Camera permission not granted ─────────────────────────────────────────

  if (!permission?.granted) {
    return (
      <View style={[S.center, { paddingTop: insets.top + 20 }]}>
        <Text style={S.permTitle}>Camera Access Required</Text>
        <Text style={S.permSub}>The scanner needs camera permission to read QR codes.</Text>
        <TouchableOpacity style={S.permBtn} onPress={requestPermission}>
          <Text style={S.permBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Session expired ───────────────────────────────────────────────────────

  if (opsSession.expires_at * 1000 < Date.now()) {
    return (
      <View style={[S.center, { paddingTop: insets.top + 20 }]}>
        <Text style={S.permTitle}>Session Expired</Text>
        <Text style={S.permSub}>Your volunteer session has expired. Please sign in again.</Text>
        <TouchableOpacity style={S.permBtn} onPress={() => {
          SecureStore.deleteItemAsync(OPS_SESSION_KEY).catch(() => {});
          clearOpsSession();
        }}>
          <Text style={S.permBtnText}>Sign In Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const totalIn  = stats ? (stats.checkin_count as number ?? 0) : null;
  const totalReg = stats ? (stats.total_registrations as number ?? 0) : null;

  return (
    <View style={S.root}>
      {/* ── Status bar ── */}
      <View style={[S.statusBar, { paddingTop: insets.top + 8 }]}>
        <View style={{ flex: 1 }}>
          <Text style={S.statusName} numberOfLines={1}>{opsSession.name}</Text>
          <Text style={S.statusRole}>{opsSession.role.replace(/_/g, " ")}</Text>
        </View>
        <View style={S.statusRight}>
          {!isConnected && (
            <View style={S.offlinePill}>
              <Text style={S.offlinePillText}>Offline</Text>
            </View>
          )}
          {pendingCount > 0 && (
            <View style={S.queueBadge}>
              <Text style={S.queueBadgeText}>{pendingCount} queued</Text>
            </View>
          )}
          {totalIn !== null && (
            <Text style={S.statSummary}>{totalIn}/{totalReg ?? "?"} in</Text>
          )}
          <TouchableOpacity onPress={handleLogout}>
            <Text style={S.signOut}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Service selector ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.serviceScroll}
        contentContainerStyle={S.serviceScrollContent}>
        {SERVICES.map(svc => (
          <TouchableOpacity
            key={svc.id}
            style={[S.svcBtn, service === svc.id && S.svcBtnActive]}
            onPress={() => setService(svc.id)}
            activeOpacity={0.8}
          >
            <Text style={S.svcIcon}>{svc.icon}</Text>
            <Text style={[S.svcLabel, service === svc.id && S.svcLabelActive]}>{svc.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Camera ── */}
      <View style={S.camera}>
        {scanning ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            onBarcodeScanned={scanning && !processing ? ({ data }) => handleScan(data) : undefined}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          >
            {/* Viewfinder overlay */}
            <View style={S.overlay}>
              <View style={S.finder}>
                <View style={[S.corner, S.tl]} />
                <View style={[S.corner, S.tr]} />
                <View style={[S.corner, S.bl]} />
                <View style={[S.corner, S.br]} />
                {processing && (
                  <ActivityIndicator color={C.orange} size="large" style={S.processingSpinner} />
                )}
              </View>
              <Text style={S.scanHint}>
                {processing ? "Processing…" : `Scan ${service} QR`}
              </Text>
            </View>

            {/* Result overlay while camera is still open */}
            {(scanResult || queuedOffline) && (
              <View style={S.resultOverlay}>
                <ResultCard
                  result={scanResult}
                  offline={queuedOffline}
                  onDismiss={() => { setScanResult(null); setQueuedOffline(false); }}
                />
              </View>
            )}
          </CameraView>
        ) : (
          <View style={S.cameraOff}>
            <Text style={S.cameraOffIcon}>📷</Text>
            <Text style={S.cameraOffText}>Camera is off</Text>
          </View>
        )}
      </View>

      {/* ── Bottom controls ── */}
      <View style={[S.controls, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[S.scanBtn, scanning && S.scanBtnActive]}
          onPress={() => {
            setScanning(s => !s);
            setScanResult(null);
            setQueuedOffline(false);
          }}
          activeOpacity={0.85}
        >
          <Text style={S.scanBtnText}>{scanning ? "Stop Scanning" : "Start Scanning"}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={S.manualBtn} onPress={() => setShowManual(v => !v)}>
          <Text style={S.manualBtnText}>Manual Entry</Text>
        </TouchableOpacity>
      </View>

      {/* ── Manual entry panel ── */}
      {showManual && (
        <View style={[S.manualPanel, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={S.manualInput}
            placeholder="Paste registration code or QR token…"
            placeholderTextColor="#555"
            value={manualInput}
            onChangeText={setManualInput}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
          <TouchableOpacity style={S.manualSubmit} onPress={submitManual}>
            <Text style={S.manualSubmitText}>Submit</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg:      "#080808",
  surface: "#111111",
  border:  "#1e1e1e",
  orange:  "#e8620a",
  orangeDim:"rgba(232,98,10,0.12)",
  white:   "#f5f5f5",
  textSub: "#888888",
  textMuted:"#505050",
  green:   "#4ade80",
  amber:   "#f59e0b",
  red:     "#ef4444",
  blue:    "#60a5fa",
};

const S = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg, padding: 32 },

  statusBar:    { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  statusName:   { fontSize: 14, fontWeight: "700", color: C.white },
  statusRole:   { fontSize: 11, color: C.textSub, textTransform: "capitalize", marginTop: 1 },
  statusRight:  { flexDirection: "row", alignItems: "center", gap: 10 },
  offlinePill:  { backgroundColor: "rgba(245,158,11,0.15)", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: "rgba(245,158,11,0.3)" },
  offlinePillText: { fontSize: 10, color: C.amber, fontWeight: "700" },
  queueBadge:   { backgroundColor: "rgba(96,165,250,0.15)", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: "rgba(96,165,250,0.3)" },
  queueBadgeText: { fontSize: 10, color: C.blue, fontWeight: "700" },
  statSummary:  { fontSize: 12, color: C.textSub },
  signOut:      { fontSize: 12, color: C.textSub, textDecorationLine: "underline" },

  serviceScroll:       { maxHeight: 70, borderBottomWidth: 1, borderBottomColor: C.border },
  serviceScrollContent:{ paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: "row" },
  svcBtn:       { alignItems: "center", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  svcBtnActive: { borderColor: C.orange, backgroundColor: "rgba(232,98,10,0.12)" },
  svcIcon:      { fontSize: 18, marginBottom: 2 },
  svcLabel:     { fontSize: 10, fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.3 },
  svcLabelActive:{ color: C.orange },

  camera:   { flex: 1, backgroundColor: "#000" },
  cameraOff:{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  cameraOffIcon: { fontSize: 48 },
  cameraOffText: { fontSize: 14, color: C.textSub },

  overlay:          { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" },
  finder:           { width: 240, height: 240, borderRadius: 16, position: "relative", alignItems: "center", justifyContent: "center" },
  corner:           { position: "absolute", width: 28, height: 28, borderColor: C.orange, borderWidth: 3 },
  tl: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 8 },
  tr: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 8 },
  bl: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 8 },
  br: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 8 },
  processingSpinner: { position: "absolute" },
  scanHint:    { color: "#fff", fontSize: 13, fontWeight: "600", marginTop: 20, textAlign: "center" },
  resultOverlay:{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 16 },

  controls:    { paddingHorizontal: 16, paddingTop: 14, flexDirection: "row", gap: 12, borderTopWidth: 1, borderTopColor: C.border },
  scanBtn:     { flex: 1, backgroundColor: C.orange, borderRadius: 14, padding: 15, alignItems: "center" },
  scanBtnActive:{ backgroundColor: "#333" },
  scanBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  manualBtn:   { backgroundColor: C.surface, borderRadius: 14, padding: 15, paddingHorizontal: 18, alignItems: "center", borderWidth: 1, borderColor: C.border },
  manualBtnText:{ color: C.textSub, fontWeight: "600", fontSize: 13 },

  manualPanel:  { paddingHorizontal: 16, paddingTop: 12, flexDirection: "row", gap: 10, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface },
  manualInput:  { flex: 1, backgroundColor: "#1a1a1a", borderRadius: 10, padding: 12, color: C.white, fontSize: 14, borderWidth: 1, borderColor: C.border },
  manualSubmit: { backgroundColor: C.orange, borderRadius: 10, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  manualSubmitText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // Permission screen
  permTitle: { fontSize: 20, fontWeight: "700", color: C.white, textAlign: "center", marginBottom: 12 },
  permSub:   { fontSize: 14, color: C.textSub, textAlign: "center", lineHeight: 21, marginBottom: 24 },
  permBtn:   { backgroundColor: C.orange, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 14 },
  permBtnText:{ color: "#fff", fontWeight: "700", fontSize: 15 },
});

const L = StyleSheet.create({
  root:  { flex: 1, backgroundColor: C.bg },
  scroll:{ padding: 24, paddingTop: 60, gap: 4 },
  title: { fontSize: 22, fontWeight: "800", color: C.white, marginBottom: 6, letterSpacing: -0.4 },
  sub:   { fontSize: 13, color: C.textSub, marginBottom: 28, lineHeight: 20 },
  label: { fontSize: 11, color: C.textSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  input: { backgroundColor: "#141414", borderWidth: 1, borderColor: "#222", borderRadius: 10, padding: 14, color: C.white, fontSize: 15, marginBottom: 16 },
  error: { color: "#f09595", fontSize: 13, marginBottom: 14 },
  btn:   { backgroundColor: C.orange, borderRadius: 10, padding: 15, alignItems: "center", marginTop: 4 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});

const R = StyleSheet.create({
  card:    { borderRadius: 16, borderWidth: 1, padding: 16, gap: 6, alignItems: "center" },
  icon:    { fontSize: 36, marginBottom: 4 },
  status:  { fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  name:    { fontSize: 16, fontWeight: "700", color: "#fff", marginTop: 2 },
  message: { fontSize: 13, color: C.textSub, textAlign: "center", lineHeight: 18 },
  meta:    { flexDirection: "row", gap: 12, flexWrap: "wrap", justifyContent: "center", marginTop: 4 },
  metaText:{ fontSize: 12, color: C.textSub, backgroundColor: "#1a1a1a", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  doneAt:  { fontSize: 11, color: C.textMuted, marginTop: 2 },
  dismiss: { fontSize: 11, color: C.textMuted, marginTop: 8 },
});
