"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

type ScanState = "idle" | "requesting-perm" | "processing" | "success" | "error" | "scanning";
type PermDeniedType = "denied" | "permanent" | null;

function isNativePlatform(): boolean {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return !!cap?.isNativePlatform?.();
  } catch { return false; }
}

function getUserToken(): string | null {
  try { return localStorage.getItem("cs_user_token") ?? null; } catch { return null; }
}

// Request camera permission via Capacitor (native) or Web Permissions API (browser).
// Returns: 'granted' | 'denied' | 'permanent' | 'unknown'
async function ensureCameraPermission(): Promise<"granted" | "denied" | "permanent" | "unknown"> {
  if (isNativePlatform()) {
    try {
      const { Camera } = await import("@capacitor/camera");
      const status = await Camera.checkPermissions();

      if (status.camera === "granted" || status.camera === "limited") return "granted";

      // "denied" in Capacitor means permanently denied (user clicked Deny on system dialog before)
      if (status.camera === "denied") return "permanent";

      // "prompt" or "prompt-with-rationale" — safe to request
      const requested = await Camera.requestPermissions({ permissions: ["camera"] });
      if (requested.camera === "granted" || requested.camera === "limited") return "granted";
      if (requested.camera === "denied") return "permanent";
      return "denied";
    } catch {
      // Plugin call failed — fall through to getUserMedia which may still work
      return "unknown";
    }
  }

  // Web browser: use Permissions API if available
  try {
    const result = await navigator.permissions.query({ name: "camera" as PermissionName });
    if (result.state === "denied") return "permanent";
    if (result.state === "granted") return "granted";
    return "unknown"; // 'prompt' — getUserMedia will ask
  } catch {
    return "unknown";
  }
}

function ScanPageInner() {
  const params   = useSearchParams();
  const router   = useRouter();
  const urlToken = params.get("token");

  const [state,      setState]      = useState<ScanState>("idle");
  const [message,    setMessage]    = useState("");
  const [session,    setSession]    = useState<{ title?: string; date?: string } | null>(null);
  const [alreadyIn,  setAlreadyIn]  = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [permDenied, setPermDenied] = useState<PermDeniedType>(null);

  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef    = useRef<number>(0);
  const jsQRRef   = useRef<((data: Uint8ClampedArray, width: number, height: number) => { data: string } | null) | null>(null);

  useEffect(() => {
    setIsLoggedIn(!!getUserToken());
  }, []);

  async function processToken(token: string) {
    setState("processing");
    const userToken = getUserToken();
    if (!userToken) {
      setMessage("Please log in to record your attendance.");
      setState("error");
      return;
    }
    try {
      const res  = await fetch("/api/attendance/scan", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-user-token": userToken },
        body:    JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!res.ok) { setMessage(json.error ?? "Failed to record attendance"); setState("error"); return; }
      setMessage(json.message);
      setSession(json.session ?? null);
      setAlreadyIn(json.already_checked_in ?? false);
      setState("success");
    } catch {
      setMessage("Network error — please try again.");
      setState("error");
    }
  }

  useEffect(() => {
    if (urlToken) processToken(urlToken);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlToken]);

  async function startCamera() {
    setPermDenied(null);
    setState("requesting-perm");

    const permResult = await ensureCameraPermission();

    if (permResult === "permanent") {
      setPermDenied("permanent");
      setState("error");
      setMessage("Camera permission is permanently disabled.");
      return;
    }

    if (permResult === "denied") {
      setPermDenied("denied");
      setState("error");
      setMessage("Camera permission was denied.");
      return;
    }

    // 'granted' or 'unknown' — attempt getUserMedia
    setState("scanning");
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

      const tick = () => {
        const video  = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) { rafRef.current = requestAnimationFrame(tick); return; }
        const ctx = canvas.getContext("2d");
        if (!ctx) { rafRef.current = requestAnimationFrame(tick); return; }
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result    = jsQRRef.current?.(imageData.data, imageData.width, imageData.height);
        if (result?.data) {
          stopCamera();
          try {
            const u = new URL(result.data);
            const t = u.searchParams.get("token");
            if (t) { processToken(t); return; }
          } catch { /* raw token */ }
          processToken(result.data);
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

    } catch (err: unknown) {
      const name = (err as { name?: string }).name ?? "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setPermDenied("denied");
        setMessage("Camera access was denied.");
      } else if (name === "NotFoundError") {
        setMessage("No camera found on this device.");
      } else if (name === "NotReadableError") {
        setMessage("Camera is in use by another app. Close it and try again.");
      } else {
        setMessage("Could not access camera. Please try again.");
      }
      setState("error");
    }
  }

  function openAppSettings() {
    try {
      // iOS: opens this app's Settings page via the app-settings: URL scheme.
      // Android has no universal URL scheme for app settings; the instructional
      // text already tells the user the manual path to follow.
      window.open("app-settings:", "_system");
    } catch { /* ignore */ }
  }

  function stopCamera() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  useEffect(() => () => stopCamera(), []);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>

      {/* Header */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, padding: "1rem 1.5rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <button onClick={() => { stopCamera(); router.back(); }} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: "1.2rem", lineHeight: 1 }}>←</button>
        <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#fff" }}>Scan Attendance</span>
      </div>

      <div style={{ width: "100%", maxWidth: "380px", display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5rem" }}>

        {/* Requesting permission spinner */}
        {state === "requesting-perm" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>📷</div>
            <p style={{ color: "#aaa", fontSize: "0.9rem" }}>Requesting camera permission…</p>
          </div>
        )}

        {/* Processing */}
        {state === "processing" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>⏳</div>
            <p style={{ color: "#888" }}>Recording attendance…</p>
          </div>
        )}

        {/* Success */}
        {state === "success" && (
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: alreadyIn ? "rgba(96,165,250,0.15)" : "rgba(74,222,128,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.2rem" }}>
              {alreadyIn ? "✓" : "🎉"}
            </div>
            <div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.4rem" }}>
                {alreadyIn ? "Already checked in" : "Attendance recorded!"}
              </div>
              {session?.title && <div style={{ fontSize: "0.95rem", color: "#e8620a", fontWeight: 600 }}>{session.title}</div>}
              {session?.date  && <div style={{ fontSize: "0.8rem", color: "#888", marginTop: "2px" }}>{session.date}</div>}
              <div style={{ fontSize: "0.85rem", color: "#aaa", marginTop: "0.75rem" }}>{message}</div>
            </div>
            <Link href="/dashboard" style={{ marginTop: "0.5rem", padding: "12px 32px", background: "#e8620a", color: "#fff", borderRadius: "10px", fontWeight: 700, textDecoration: "none", fontSize: "0.9rem" }}>
              Back to Home
            </Link>
          </div>
        )}

        {/* Error */}
        {state === "error" && (
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.2rem" }}>
              {permDenied ? "🔒" : "✗"}
            </div>
            <div>
              {permDenied === "permanent" ? (
                <>
                  <div style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: "0.5rem" }}>Camera permission disabled</div>
                  <div style={{ fontSize: "0.82rem", color: "#aaa", lineHeight: 1.5 }}>
                    Go to <strong style={{ color: "#fff" }}>Settings → Apps → Connected Steps → Permissions → Camera</strong> and set it to Allow.
                  </div>
                </>
              ) : permDenied === "denied" ? (
                <>
                  <div style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: "0.5rem" }}>Camera access denied</div>
                  <div style={{ fontSize: "0.82rem", color: "#aaa", lineHeight: 1.5 }}>
                    Tap <strong style={{ color: "#fff" }}>Try Again</strong> and allow camera access when prompted.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: "0.5rem", color: "#f09595" }}>Scan failed</div>
                  <div style={{ fontSize: "0.82rem", color: "#aaa" }}>{message}</div>
                </>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%" }}>
              {permDenied === "permanent" ? (
                <button onClick={openAppSettings}
                  style={{ padding: "13px 24px", background: "#e8620a", color: "#fff", border: "none", borderRadius: "10px", fontWeight: 700, cursor: "pointer", fontSize: "0.9rem", fontFamily: "inherit" }}>
                  Open Settings
                </button>
              ) : (
                <button onClick={startCamera}
                  style={{ padding: "13px 24px", background: "#e8620a", color: "#fff", border: "none", borderRadius: "10px", fontWeight: 700, cursor: "pointer", fontSize: "0.9rem", fontFamily: "inherit" }}>
                  {permDenied ? "Grant Permission" : "Try Again"}
                </button>
              )}
              {!isLoggedIn && (
                <Link href="/auth?redirect=/scan" style={{ padding: "12px 24px", background: "rgba(255,255,255,0.08)", color: "#fff", borderRadius: "10px", fontWeight: 700, textDecoration: "none", fontSize: "0.9rem", textAlign: "center" }}>
                  Log in
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Camera scanner */}
        {state === "scanning" && (
          <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
            <div style={{ fontSize: "0.8rem", color: "#888" }}>Point your camera at the session QR code</div>
            <div style={{ position: "relative", width: "100%", maxWidth: "320px", aspectRatio: "1", borderRadius: "16px", overflow: "hidden", border: "2px solid #e8620a" }}>
              <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", top: 16, left: 16, width: 28, height: 28, borderTop: "3px solid #e8620a", borderLeft: "3px solid #e8620a" }} />
              <div style={{ position: "absolute", top: 16, right: 16, width: 28, height: 28, borderTop: "3px solid #e8620a", borderRight: "3px solid #e8620a" }} />
              <div style={{ position: "absolute", bottom: 16, left: 16, width: 28, height: 28, borderBottom: "3px solid #e8620a", borderLeft: "3px solid #e8620a" }} />
              <div style={{ position: "absolute", bottom: 16, right: 16, width: 28, height: 28, borderBottom: "3px solid #e8620a", borderRight: "3px solid #e8620a" }} />
            </div>
            <canvas ref={canvasRef} style={{ display: "none" }} />
            <button onClick={() => { stopCamera(); setState("idle"); }}
              style={{ padding: "10px 24px", background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "8px", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
              Cancel
            </button>
          </div>
        )}

        {/* Idle */}
        {state === "idle" && !urlToken && (
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "1.25rem" }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(232,98,10,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.5rem" }}>📱</div>
            <div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.4rem" }}>Scan Attendance QR</div>
              <div style={{ fontSize: "0.85rem", color: "#888" }}>
                Point your camera at the QR code displayed at your session to record attendance automatically.
              </div>
            </div>
            {isLoggedIn ? (
              <button onClick={startCamera}
                style={{ padding: "14px 36px", background: "#e8620a", color: "#fff", borderRadius: "12px", fontWeight: 700, border: "none", cursor: "pointer", fontSize: "0.95rem", width: "100%", fontFamily: "inherit" }}>
                Open Camera
              </button>
            ) : (
              <Link href="/auth?redirect=/scan"
                style={{ padding: "14px 36px", background: "#e8620a", color: "#fff", borderRadius: "12px", fontWeight: 700, textDecoration: "none", fontSize: "0.95rem", display: "block", width: "100%", boxSizing: "border-box" }}>
                Log in to scan
              </Link>
            )}
            <div style={{ fontSize: "0.75rem", color: "#555" }}>
              Or use your phone camera to scan — it opens this page automatically.
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense>
      <ScanPageInner />
    </Suspense>
  );
}
