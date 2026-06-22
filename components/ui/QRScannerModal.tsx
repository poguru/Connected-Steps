"use client";

/**
 * QRScannerModal — reusable camera QR scanner.
 * Uses jsqr (already installed) + getUserMedia.
 * Works on desktop webcam, Android browser, and Capacitor WebView.
 *
 * Props:
 *   onScan(raw: string)  — called once with the raw string decoded from the QR.
 *                          The caller is responsible for parsing URLs/tokens.
 *   onClose()            — called when the user dismisses the modal.
 *   title                — optional heading shown inside the modal.
 */

import { useEffect, useRef, useState } from "react";

interface Props {
  onScan:  (raw: string) => void;
  onClose: () => void;
  title?:  string;
}

function isNative(): boolean {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return !!cap?.isNativePlatform?.();
  } catch { return false; }
}

async function ensureCamera(): Promise<"granted" | "denied" | "permanent" | "unknown"> {
  if (isNative()) {
    try {
      const { Camera } = await import("@capacitor/camera");
      const status = await Camera.checkPermissions();
      if (status.camera === "granted" || status.camera === "limited") return "granted";
      if (status.camera === "denied") return "permanent";
      const req = await Camera.requestPermissions({ permissions: ["camera"] });
      if (req.camera === "granted" || req.camera === "limited") return "granted";
      return "permanent";
    } catch { return "unknown"; }
  }
  try {
    const r = await navigator.permissions.query({ name: "camera" as PermissionName });
    if (r.state === "denied") return "permanent";
    if (r.state === "granted") return "granted";
    return "unknown";
  } catch { return "unknown"; }
}

type Phase = "starting" | "scanning" | "perm-denied" | "no-camera" | "in-use";

export default function QRScannerModal({ onScan, onClose, title = "Scan QR Code" }: Props) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef    = useRef<number>(0);
  const jsQRRef   = useRef<((data: Uint8ClampedArray, w: number, h: number) => { data: string } | null) | null>(null);
  const firedRef  = useRef(false);

  const [phase, setPhase] = useState<Phase>("starting");

  function stop() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  useEffect(() => {
    let cancelled = false;

    async function start() {
      const perm = await ensureCamera();
      if (cancelled) return;
      if (perm === "permanent") { setPhase("perm-denied"); return; }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (!jsQRRef.current) {
          const mod = await import("jsqr");
          jsQRRef.current = mod.default;
        }
        setPhase("scanning");

        const tick = () => {
          if (cancelled) return;
          const video  = videoRef.current;
          const canvas = canvasRef.current;
          if (!video || !canvas || video.readyState < 2) { rafRef.current = requestAnimationFrame(tick); return; }
          const ctx = canvas.getContext("2d");
          if (!ctx) { rafRef.current = requestAnimationFrame(tick); return; }
          canvas.width  = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const res = jsQRRef.current?.(img.data, img.width, img.height);
          if (res?.data && !firedRef.current) {
            firedRef.current = true;
            stop();
            onScan(res.data);
            return;
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);

      } catch (err: unknown) {
        if (cancelled) return;
        const name = (err as { name?: string }).name ?? "";
        if (name === "NotFoundError")     { setPhase("no-camera"); return; }
        if (name === "NotReadableError")  { setPhase("in-use"); return; }
        setPhase("perm-denied");
      }
    }

    start();
    return () => { cancelled = true; stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overlay: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 200,
    background: "rgba(0,0,0,0.92)",
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
  };

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) { stop(); onClose(); } }}>
      <div style={{ width: "100%", maxWidth: 420, padding: "0 1rem", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>

        {/* Header */}
        <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{title}</span>
          <button onClick={() => { stop(); onClose(); }}
            style={{ background: "none", border: "none", color: "#888", fontSize: 22, cursor: "pointer", padding: 4, lineHeight: 1 }}>×</button>
        </div>

        {/* Camera viewfinder */}
        <div style={{ position: "relative", width: "100%", aspectRatio: "1", borderRadius: 16, overflow: "hidden", background: "#111" }}>
          <video ref={videoRef} muted playsInline
            style={{ width: "100%", height: "100%", objectFit: "cover", display: phase === "scanning" ? "block" : "none" }} />
          <canvas ref={canvasRef} style={{ display: "none" }} />

          {/* Corner guides */}
          {phase === "scanning" && (
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              {[["0%","0%","0%","0%"],["0%","auto","auto","0%"],["auto","0%","0%","auto"],["auto","auto","auto","auto"]].map(([t,r,b,l], i) => (
                <div key={i} style={{ position: "absolute", top: t === "auto" ? "auto" : 20, right: r === "auto" ? "auto" : 20, bottom: b === "auto" ? "auto" : 20, left: l === "auto" ? "auto" : 20, width: 28, height: 28,
                  borderTop: (i === 0 || i === 1) ? "3px solid #e8620a" : "none",
                  borderBottom: (i === 2 || i === 3) ? "3px solid #e8620a" : "none",
                  borderLeft: (i === 0 || i === 2) ? "3px solid #e8620a" : "none",
                  borderRight: (i === 1 || i === 3) ? "3px solid #e8620a" : "none",
                  borderRadius: i === 0 ? "4px 0 0 0" : i === 1 ? "0 4px 0 0" : i === 2 ? "0 0 0 4px" : "0 0 4px 0",
                }} />
              ))}
            </div>
          )}

          {/* Starting spinner */}
          {phase === "starting" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #222", borderTopColor: "#e8620a", animation: "spin .7s linear infinite" }} />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              <span style={{ fontSize: 13, color: "#666" }}>Starting camera…</span>
            </div>
          )}

          {/* Error states */}
          {(phase === "perm-denied" || phase === "no-camera" || phase === "in-use") && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: "2rem" }}>
                {phase === "perm-denied" ? "🚫" : phase === "no-camera" ? "📷" : "⚠️"}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#f87171" }}>
                {phase === "perm-denied" ? "Camera access denied"
                 : phase === "no-camera" ? "No camera found"
                 : "Camera in use by another app"}
              </div>
              <div style={{ fontSize: 12, color: "#666", lineHeight: 1.6 }}>
                {phase === "perm-denied"
                  ? "Allow camera access in your browser/device settings, then try again."
                  : phase === "no-camera"
                  ? "This device has no camera. Use manual token entry below."
                  : "Close other apps using the camera, then try again."}
              </div>
            </div>
          )}
        </div>

        <p style={{ fontSize: 12, color: "#555", textAlign: "center", margin: 0 }}>
          Point the camera at the participant&apos;s QR code
        </p>
      </div>
    </div>
  );
}
