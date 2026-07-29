"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { enqueueOfflineScan, getPendingScans, syncPendingScans } from "@/lib/offline-queue";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = "idle" | "looking_up" | "preview" | "confirming" | "done" | "scan_error" | "queued";
type CamState = "starting" | "active" | "needs-gesture" | "denied" | "no-device";

interface ParticipantInfo {
  id: string;
  name: string;
  registration_code?: string | null;
  distance_category: string | null;
  tshirt_size: string | null;
  bib_number: string | null;
  wave: string | null;
  gender?: string | null;
  payment_status?: string | null;
}

interface ApiResponse {
  valid: boolean;
  already_done?: boolean;
  message?: string;
  done_at?: string | null;
  done_by?: string | null;
  participant?: ParticipantInfo;
  error?: string;
  code?: string;
}

// Keep legacy ScanResult export so existing imports don't break
export interface ScanResult extends ApiResponse {}

interface Props {
  eventId: string;
  service: string;
  serviceLabel: string;
  accentColor?: string;
  onScanCount?: (count: number) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CONFIRM_LABELS: Record<string, string> = {
  checkin:   "Check In",
  tshirt:    "Issue T-Shirt",
  breakfast: "Issue Breakfast",
  medal:     "Issue Medal",
  bib:       "Confirm BIB Collected",
};

const ERROR_TITLES: Record<string, string> = {
  CANCELLED:       "Registration Cancelled",
  NOT_FOUND:       "Participant Not Found",
  WRONG_EVENT:     "Wrong Event",
  PENDING_PAYMENT: "Payment Incomplete",
  INVALID_QR:      "Invalid QR Code",
  NO_TSHIRT_SIZE:  "T-Shirt Not Recorded",
};

const FALLBACK_ERROR_MSG = "Unable to process this QR code. Please contact an event administrator.";

const DISPLAY_SECS = 10;

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function extractToken(raw: string): string {
  try { const u = new URL(raw); return u.searchParams.get("t") ?? raw; } catch { return raw; }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScannerModule({
  eventId, service, serviceLabel, accentColor = "#10b981", onScanCount,
}: Props) {
  const [phase,        setPhase]        = useState<Phase>("idle");
  const [camState,     setCamState]     = useState<CamState>("starting");
  const [manualInput,  setManualInput]  = useState("");
  const [scannedToken, setScannedToken] = useState("");
  const [lookupData,   setLookupData]   = useState<ApiResponse | null>(null);
  const [actionData,   setActionData]   = useState<ApiResponse | null>(null);
  const [countdown,    setCountdown]    = useState(DISPLAY_SECS);
  const [sessionCount, setSessionCount] = useState(0);
  const [queueCount,   setQueueCount]   = useState(0);
  const [syncing,      setSyncing]      = useState(false);

  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const rafRef      = useRef<number>(0);
  const jsQRRef     = useRef<((d: Uint8ClampedArray, w: number, h: number) => { data: string } | null) | null>(null);
  const manualRef   = useRef<HTMLInputElement>(null);
  const busyRef     = useRef(false);  // prevents double-processing
  const countRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Camera lifecycle ───────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(async () => {
    setCamState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      if (!jsQRRef.current) {
        const mod = await import("jsqr");
        jsQRRef.current = mod.default;
      }
      setCamState("active");

      const tick = () => {
        if (!streamRef.current) return; // camera stopped
        const video  = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) { rafRef.current = requestAnimationFrame(tick); return; }
        const ctx = canvas.getContext("2d");
        if (!ctx) { rafRef.current = requestAnimationFrame(tick); return; }
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const res = jsQRRef.current?.(img.data, img.width, img.height);
        if (res?.data) { void handleScan(extractToken(res.data)); return; }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err: unknown) {
      const name = (err as { name?: string }).name ?? "";
      if (name === "NotFoundError") setCamState("no-device");
      else if (name === "NotAllowedError" || name === "SecurityError") setCamState("needs-gesture");
      else setCamState("denied");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start/stop camera based on phase
  useEffect(() => {
    if (phase === "idle") {
      busyRef.current = false;
      void startCamera();
      setTimeout(() => manualRef.current?.focus(), 120);
      return () => { stopCamera(); };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Offline queue management ──────────────────────────────────────────────

  const refreshQueueCount = useCallback(() => {
    setQueueCount(getPendingScans().length);
  }, []);

  useEffect(() => {
    refreshQueueCount();
  }, [refreshQueueCount]);

  const handleSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const { synced } = await syncPendingScans();
      if (synced > 0) {
        setSessionCount(c => {
          const next = c + synced;
          onScanCount?.(next);
          return next;
        });
      }
    } finally {
      refreshQueueCount();
      setSyncing(false);
    }
  }, [syncing, onScanCount, refreshQueueCount]);

  // Auto-sync when browser reports online
  useEffect(() => {
    const onOnline = () => { void handleSync(); };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [handleSync]);

  // Countdown in done state
  useEffect(() => {
    if (phase !== "done") return;
    setCountdown(DISPLAY_SECS);
    let remaining = DISPLAY_SECS;
    countRef.current = setInterval(() => {
      remaining--;
      setCountdown(remaining);
      if (remaining <= 0) { clearInterval(countRef.current!); setPhase("idle"); }
    }, 1000);
    return () => { clearInterval(countRef.current!); };
  }, [phase]);

  // ── Scan / lookup / action ─────────────────────────────────────────────────

  async function handleScan(token: string) {
    if (!token.trim() || busyRef.current) return;
    busyRef.current = true;
    stopCamera();
    setManualInput("");
    setScannedToken(token.trim());
    setPhase("looking_up");

    try {
      const res  = await fetch(`/api/ops/events/${eventId}/scan`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service, qr_token: token.trim(), dry_run: true }),
      });
      const data = await res.json() as ApiResponse;

      if (!res.ok || !data.valid) {
        console.error("[Ops Scanner] QR validation failed — code:", data.code, "error:", data.error);
        setActionData(data);
        setPhase("scan_error");
        return;
      }
      if (data.already_done) {
        setActionData(data);
        setPhase("done");
        return;
      }
      setLookupData(data);
      setPhase("preview");
    } catch {
      setActionData({ valid: false, message: "Network error. Please try again." });
      setPhase("scan_error");
    }
  }

  async function handleConfirm() {
    setPhase("confirming");
    try {
      const res  = await fetch(`/api/ops/events/${eventId}/scan`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service, qr_token: scannedToken }),
      });
      const data = await res.json() as ApiResponse;
      setActionData(data);
      if (!res.ok || !data.valid) {
        console.error("[Ops Scanner] Confirm failed — code:", data.code, "error:", data.error);
        setPhase("scan_error");
        return;
      }
      if (!data.already_done) {
        setSessionCount(c => {
          const next = c + 1;
          onScanCount?.(next);
          return next;
        });
      }
      setPhase("done");
    } catch {
      // Network failure — save to offline queue instead of showing error
      const participantName = lookupData?.participant?.name ?? null;
      enqueueOfflineScan({
        event_id:         eventId,
        service,
        qr_token:         scannedToken,
        participant_name: participantName,
      });
      refreshQueueCount();
      setPhase("queued");
    }
  }

  function goIdle() {
    clearInterval(countRef.current!);
    setActionData(null);
    setLookupData(null);
    setScannedToken("");
    setPhase("idle");
  }

  // ── UI ─────────────────────────────────────────────────────────────────────

  const confirmLabel = CONFIRM_LABELS[service] ?? "Confirm";
  const isDone       = phase === "done";
  const isSuccess    = isDone && actionData?.valid && !actionData.already_done;
  const isAlready    = isDone && actionData?.already_done;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "clamp(0.75rem,3vw,1.25rem) 14px 80px", fontFamily: "'Inter',system-ui,sans-serif" }}>

      {/* Session count chip + offline queue badge */}
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {sessionCount > 0 && (
          <span style={{ fontSize: 13, fontWeight: 700, color: accentColor, background: `${accentColor}18`, padding: "4px 16px", borderRadius: 999 }}>
            {sessionCount} {serviceLabel.toLowerCase()} this session
          </span>
        )}
        {queueCount > 0 && (
          <button
            onClick={() => void handleSync()}
            disabled={syncing}
            style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", padding: "4px 14px", borderRadius: 999, cursor: syncing ? "wait" : "pointer", fontFamily: "inherit" }}
          >
            {syncing ? "Syncing…" : `⚡ ${queueCount} offline — tap to sync`}
          </button>
        )}
      </div>

      {/* ── IDLE / LOOKING-UP — camera + manual input ── */}
      {(phase === "idle" || phase === "looking_up") && (
        <div>
          {/* Camera viewfinder */}
          <div style={{
            position: "relative", width: "100%", aspectRatio: "4/3", maxHeight: 300,
            borderRadius: 16, overflow: "hidden", background: "#111",
            border: `2px solid ${camState === "active" ? accentColor + "60" : "rgba(255,255,255,0.08)"}`,
            marginBottom: 16,
          }}>
            <video ref={videoRef} muted playsInline
              style={{ width: "100%", height: "100%", objectFit: "cover",
                display: camState === "active" ? "block" : "none" }} />
            <canvas ref={canvasRef} style={{ display: "none" }} />

            {/* Scanning overlay with corner guides */}
            {camState === "active" && phase === "idle" && (
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                {/* dim edges */}
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, transparent 25%, transparent 75%, rgba(0,0,0,0.35) 100%)" }} />
                {/* corners */}
                {([["top","left"],["top","right"],["bottom","left"],["bottom","right"]] as const).map(([v,h], i) => (
                  <div key={i} style={{
                    position: "absolute", [v]: 18, [h]: 18, width: 32, height: 32,
                    borderTop:    (v === "top")    ? `3px solid ${accentColor}` : "none",
                    borderBottom: (v === "bottom") ? `3px solid ${accentColor}` : "none",
                    borderLeft:   (h === "left")   ? `3px solid ${accentColor}` : "none",
                    borderRight:  (h === "right")  ? `3px solid ${accentColor}` : "none",
                    borderRadius: i === 0 ? "4px 0 0 0" : i === 1 ? "0 4px 0 0" : i === 2 ? "0 0 0 4px" : "0 0 4px 0",
                  }} />
                ))}
                <p style={{ position: "absolute", bottom: 12, left: 0, right: 0, textAlign: "center",
                  fontSize: 12, color: "rgba(255,255,255,0.5)", margin: 0 }}>
                  Point at participant&apos;s QR code
                </p>
              </div>
            )}

            {/* Looking-up overlay */}
            {phase === "looking_up" && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 10, background: "rgba(0,0,0,0.75)" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", border: "3px solid #333", borderTopColor: accentColor, animation: "spin .7s linear infinite" }} />
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                <span style={{ fontSize: 13, color: "#aaa" }}>Looking up…</span>
              </div>
            )}

            {/* Starting spinner */}
            {camState === "starting" && phase === "idle" && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #222", borderTopColor: accentColor, animation: "spin .7s linear infinite" }} />
                <span style={{ fontSize: 13, color: "#555" }}>Starting camera…</span>
              </div>
            )}

            {/* Needs gesture */}
            {camState === "needs-gesture" && phase === "idle" && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 14, padding: 24 }}>
                <div style={{ fontSize: "2.5rem" }}>📷</div>
                <button
                  onClick={() => void startCamera()}
                  style={{ padding: "14px 32px", background: accentColor, border: "none", borderRadius: 12,
                    color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                  Enable Camera
                </button>
                <span style={{ fontSize: 12, color: "#555", textAlign: "center" }}>
                  Camera access needed for QR scanning
                </span>
              </div>
            )}

            {/* Denied / no device */}
            {(camState === "denied" || camState === "no-device") && phase === "idle" && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 10, padding: 24, textAlign: "center" }}>
                <div style={{ fontSize: "2rem" }}>{camState === "no-device" ? "📷" : "🚫"}</div>
                <div style={{ fontSize: 13, color: "#f87171", fontWeight: 600 }}>
                  {camState === "no-device" ? "No camera found" : "Camera access denied"}
                </div>
                <div style={{ fontSize: 12, color: "#555", lineHeight: 1.6 }}>
                  Use manual entry below
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
            <span style={{ fontSize: 11, color: "#444", textTransform: "uppercase", letterSpacing: ".06em" }}>or enter manually</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
          </div>

          {/* Manual / USB input */}
          <form onSubmit={e => { e.preventDefault(); void handleScan(manualInput); }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                ref={manualRef}
                value={manualInput}
                onChange={e => setManualInput(e.target.value)}
                placeholder="BIB number or registration code…"
                disabled={phase === "looking_up"}
                style={{
                  flex: 1, padding: "14px 16px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 12, color: "#fff", fontSize: 16,
                  fontFamily: "monospace", outline: "none", caretColor: accentColor,
                }}
              />
              <button
                type="submit"
                disabled={phase === "looking_up" || !manualInput.trim()}
                style={{
                  padding: "14px 22px", borderRadius: 12, border: "none",
                  background: manualInput.trim() ? accentColor : "rgba(255,255,255,0.08)",
                  color: "#fff", fontSize: 16, fontWeight: 800, cursor: manualInput.trim() ? "pointer" : "not-allowed",
                  fontFamily: "inherit", flexShrink: 0, transition: "background 0.15s",
                }}>
                Go
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── PREVIEW — participant details + confirm button ── */}
      {(phase === "preview" || phase === "confirming") && lookupData?.participant && (
        <ParticipantCard
          participant={lookupData.participant}
          service={service}
          accentColor={accentColor}
          confirmLabel={confirmLabel}
          confirming={phase === "confirming"}
          onConfirm={() => void handleConfirm()}
          onBack={goIdle}
        />
      )}

      {/* ── DONE — success or already-done with countdown ── */}
      {isDone && (
        <div style={{
          borderRadius: 20, overflow: "hidden",
          border: `1px solid ${isSuccess ? accentColor + "50" : isAlready ? "rgba(168,85,247,0.35)" : "rgba(239,68,68,0.3)"}`,
          background: isSuccess ? `${accentColor}0c` : isAlready ? "rgba(168,85,247,0.07)" : "rgba(239,68,68,0.07)",
          animation: "fadeUp .2s ease",
        }}>
          <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>

          {/* Colour bar */}
          <div style={{ height: 5, background: isSuccess ? accentColor : isAlready ? "#a855f7" : "#ef4444" }} />

          <div style={{ padding: "22px 20px 24px" }}>
            {/* Status header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
              <span style={{ fontSize: 36, lineHeight: 1 }}>
                {isSuccess ? "✅" : isAlready ? "ℹ️" : "❌"}
              </span>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: isSuccess ? accentColor : isAlready ? "#a855f7" : "#f87171", lineHeight: 1.2 }}>
                  {isSuccess ? "Success!"
                   : isAlready ? "Already Issued"
                   : "Error"}
                </div>
                <div style={{ fontSize: 13, color: "#aaa", marginTop: 3 }}>
                  {actionData?.message ?? actionData?.error ?? FALLBACK_ERROR_MSG}
                </div>
              </div>
            </div>

            {/* Participant summary */}
            {actionData?.participant && (
              <div style={{
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12, padding: "14px 16px", marginBottom: 16,
              }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 6 }}>
                  {actionData.participant.name}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {actionData.participant.tshirt_size && service === "tshirt" && (
                    <SizeChip size={actionData.participant.tshirt_size} color={accentColor} />
                  )}
                  {actionData.participant.distance_category && (
                    <Chip label={actionData.participant.distance_category} color="#60a5fa" />
                  )}
                  {actionData.participant.bib_number && (
                    <Chip label={`BIB #${actionData.participant.bib_number}`} color="#818cf8" />
                  )}
                </div>
                {isAlready && actionData.done_at && (
                  <div style={{ fontSize: 12, color: "#666", marginTop: 10 }}>
                    Issued at {fmtTime(actionData.done_at)}
                    {actionData.done_by ? ` · by ${actionData.done_by}` : ""}
                  </div>
                )}
              </div>
            )}

            {/* Countdown bar */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: "#555" }}>Next scan in</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#666" }}>{countdown}s</span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                <div style={{
                  height: "100%", borderRadius: 2,
                  background: isSuccess ? accentColor : isAlready ? "#a855f7" : "#ef4444",
                  width: `${(countdown / DISPLAY_SECS) * 100}%`,
                  transition: "width 0.9s linear",
                }} />
              </div>
            </div>

            {/* Next scan button */}
            <button
              onClick={goIdle}
              style={{
                width: "100%", padding: "14px", borderRadius: 12,
                background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
                color: "#ccc", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>
              Next Scan →
            </button>
          </div>
        </div>
      )}

      {/* ── QUEUED OFFLINE ── */}
      {phase === "queued" && (
        <div style={{
          borderRadius: 20, overflow: "hidden",
          border: "1px solid rgba(245,158,11,0.35)",
          background: "rgba(245,158,11,0.07)",
          animation: "fadeUp .2s ease",
        }}>
          <div style={{ height: 5, background: "#f59e0b" }} />
          <div style={{ padding: "22px 20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <span style={{ fontSize: 36, lineHeight: 1 }}>⚡</span>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#f59e0b" }}>Saved Offline</div>
                <div style={{ fontSize: 13, color: "#aaa", marginTop: 3 }}>
                  No internet — scan queued locally and will sync automatically when you&rsquo;re back online.
                </div>
              </div>
            </div>
            {lookupData?.participant?.name && (
              <div style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>
                Participant: <strong style={{ color: "#ccc" }}>{lookupData.participant.name}</strong>
              </div>
            )}
            <button onClick={goIdle}
              style={{ width: "100%", padding: "14px", borderRadius: 12, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", color: "#f59e0b", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Scan Next →
            </button>
          </div>
        </div>
      )}

      {/* ── SCAN ERROR ── */}
      {phase === "scan_error" && (
        <div style={{
          borderRadius: 20, overflow: "hidden",
          border: "1px solid rgba(239,68,68,0.3)",
          background: "rgba(239,68,68,0.07)",
          animation: "fadeUp .2s ease",
        }}>
          <div style={{ height: 5, background: "#ef4444" }} />
          <div style={{ padding: "22px 20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <span style={{ fontSize: 36, lineHeight: 1 }}>❌</span>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#f87171" }}>
                  {(actionData?.code && ERROR_TITLES[actionData.code]) ?? "Scan Failed"}
                </div>
                <div style={{ fontSize: 13, color: "#aaa", marginTop: 3 }}>
                  {actionData?.message ?? actionData?.error ?? FALLBACK_ERROR_MSG}
                </div>
              </div>
            </div>
            <button
              onClick={goIdle}
              style={{
                width: "100%", padding: "14px", borderRadius: 12,
                background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
                color: "#ccc", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>
              Try Again →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ParticipantCard({
  participant, service, accentColor, confirmLabel, confirming, onConfirm, onBack,
}: {
  participant: ParticipantInfo;
  service: string;
  accentColor: string;
  confirmLabel: string;
  confirming: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const paymentOk = !participant.payment_status
    || participant.payment_status === "paid"
    || participant.payment_status === "confirmed"
    || participant.payment_status === "free";

  return (
    <div style={{
      borderRadius: 20, overflow: "hidden",
      border: `1px solid ${accentColor}40`,
      background: `${accentColor}08`,
      animation: "fadeUp .2s ease",
    }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
      <div style={{ height: 4, background: accentColor }} />

      <div style={{ padding: "20px 18px 22px" }}>

        {/* Name */}
        <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", lineHeight: 1.1, marginBottom: 6 }}>
          {participant.name}
        </div>

        {/* Registration code */}
        {participant.registration_code && (
          <div style={{ fontSize: 12, color: "#666", fontFamily: "monospace", marginBottom: 14 }}>
            {participant.registration_code}
          </div>
        )}

        {/* T-Shirt size — super prominent for tshirt service */}
        {participant.tshirt_size && service === "tshirt" && (
          <div style={{
            background: `${accentColor}20`, border: `2px solid ${accentColor}60`,
            borderRadius: 14, padding: "14px 18px", marginBottom: 14,
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <span style={{ fontSize: 22 }}>👕</span>
            <div>
              <div style={{ fontSize: 10, color: accentColor, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" }}>T-Shirt Size</div>
              <div style={{ fontSize: 36, fontWeight: 900, color: accentColor, lineHeight: 1 }}>
                {participant.tshirt_size}
              </div>
            </div>
          </div>
        )}

        {/* Detail grid */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px",
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 12, padding: "14px 16px", marginBottom: 16,
        }}>
          {participant.distance_category && (
            <DetailField label="Category" value={participant.distance_category} />
          )}
          {participant.gender && (
            <DetailField label="Gender" value={participant.gender} />
          )}
          {participant.bib_number && (
            <DetailField label="BIB Number" value={`#${participant.bib_number}`} />
          )}
          {participant.wave && (
            <DetailField label="Wave" value={`Wave ${participant.wave}`} />
          )}
          <div>
            <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>Payment</div>
            <span style={{
              fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 999,
              background: paymentOk ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
              color: paymentOk ? "#4ade80" : "#f87171",
              border: `1px solid ${paymentOk ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
            }}>
              {participant.payment_status
                ? participant.payment_status.charAt(0).toUpperCase() + participant.payment_status.slice(1)
                : "Confirmed"}
            </span>
          </div>
          {/* T-shirt size compact when not tshirt service */}
          {participant.tshirt_size && service !== "tshirt" && (
            <DetailField label="T-Shirt" value={participant.tshirt_size} />
          )}
        </div>

        {/* Confirm button */}
        <button
          onClick={onConfirm}
          disabled={confirming}
          style={{
            width: "100%", padding: "17px", borderRadius: 14, border: "none",
            background: confirming ? "rgba(255,255,255,0.08)" : accentColor,
            color: "#fff", fontSize: 17, fontWeight: 800, cursor: confirming ? "not-allowed" : "pointer",
            fontFamily: "inherit", marginBottom: 10, letterSpacing: ".01em",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          }}>
          {confirming ? (
            <>
              <span style={{ width: 18, height: 18, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin .7s linear infinite", display: "inline-block" }} />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              Processing…
            </>
          ) : confirmLabel}
        </button>

        {/* Back link */}
        <button
          onClick={onBack}
          disabled={confirming}
          style={{
            width: "100%", padding: "10px", borderRadius: 10, border: "none",
            background: "transparent", color: "#555", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
          }}>
          ← Scan a different QR
        </button>
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#eee" }}>{value}</div>
    </div>
  );
}

function SizeChip({ size, color }: { size: string; color: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 5,
      background: `${color}18`, border: `1px solid ${color}50`,
      padding: "4px 12px", borderRadius: 999,
    }}>
      <span style={{ fontSize: 13 }}>👕</span>
      <span style={{ fontSize: 14, fontWeight: 800, color }}>{size}</span>
    </div>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 700, color,
      background: `${color}18`, border: `1px solid ${color}40`,
      padding: "3px 10px", borderRadius: 999,
    }}>
      {label}
    </div>
  );
}
