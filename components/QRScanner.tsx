"use client";

import { useEffect, useRef, useState } from "react";
import { decodeQr } from "@/lib/qr-decode";

// Shared scanner for the IT Run staff screens (check-in, BIB, T-shirt, breakfast, goodies, medal, certificate).
// The camera reads QR codes in the browser with jsQR and reports the first code it finds, once. Manual entry stays
// available. The decoded text is only a candidate: the server verifies it. The camera is released on unmount.

interface QRScannerProps {
  onScan: (data: string) => Promise<void>;
  onError?: (error: string) => void;
  placeholder?: string;
}

// Read at full camera resolution: a QR shown on another screen is small in the frame, and shrinking it loses detail
const MAX_SIDE = 1280;

function cameraMessage(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera permission denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera found on this device";
  if (name === "NotReadableError") return "The camera is in use by another app";
  return "Camera unavailable";
}

export default function QRScanner({ onScan, onError, placeholder = "Scan QR, BIB, or registration code…" }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  const [scanning, setScanning] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [permError, setPermError] = useState<string | null>(null);
  // Each finished lookup starts the camera again, so the next code can be read
  const [round, setRound] = useState(0);

  // Keep the latest callbacks without restarting the camera
  useEffect(() => {
    onScanRef.current = onScan;
    onErrorRef.current = onError;
  }, [onScan, onError]);

  useEffect(() => {
    let cancelled = false;

    function stopCamera() {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    }

    function scan() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || doneRef.current) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const text = decodeQr(image.data, image.width, image.height);
          if (text && !doneRef.current) {
            doneRef.current = true;
            stopCamera();
            setCameraActive(false);
            setScanning(true);
            void onScanRef.current(text).finally(() => {
              // Allow the next scan only after this one has finished, then read again
              setScanning(false);
              setRound(r => r + 1);
            });
            return;
          }
        }
      }
      frameRef.current = requestAnimationFrame(scan);
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPermError("This browser can't use the camera. Use manual entry below.");
        onErrorRef.current?.("This browser can't use the camera");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        doneRef.current = false;
        setCameraActive(true);
        setPermError(null);
        scan();
      } catch (err) {
        if (cancelled) return;
        const msg = cameraMessage(err);
        setPermError(msg);
        onErrorRef.current?.(msg);
      }
    }

    start();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [round]);

  async function handleManualSubmit(value: string) {
    if (!value.trim()) return;

    setScanning(true);
    try {
      await onScan(value.trim());
      setManualInput("");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Camera View */}
      {!permError && (
        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#000", aspectRatio: "4/3" }}>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          <canvas ref={canvasRef} style={{ display: "none" }} />
          {/* QR Frame Overlay */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: "18% 14%",
              border: "2px solid #e8620a",
              borderRadius: 12,
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 12,
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: 12,
              color: "#fff",
              background: "rgba(0,0,0,0.6)",
              padding: "6px 12px",
              borderRadius: 6,
              whiteSpace: "nowrap",
            }}
          >
            {cameraActive ? "Point at QR code" : "Starting camera…"}
          </div>
        </div>
      )}

      {/* Permission Error */}
      {permError && (
        <div
          role="alert"
          style={{
            padding: 16,
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 10,
            color: "#f87171",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          ⚠️ {permError}
        </div>
      )}

      {/* Manual Input Fallback */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={manualInput}
          onChange={e => setManualInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleManualSubmit(manualInput)}
          placeholder={placeholder}
          disabled={scanning}
          style={{
            flex: 1,
            padding: "14px 16px",
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10,
            color: "#fff",
            fontSize: 14,
            fontFamily: "inherit",
            outline: "none",
          }}
        />
        <button
          onClick={() => handleManualSubmit(manualInput)}
          disabled={scanning || !manualInput.trim()}
          style={{
            padding: "14px 20px",
            background: scanning || !manualInput.trim() ? "rgba(255,255,255,0.05)" : "#e8620a",
            border: "none",
            borderRadius: 10,
            color: "#fff",
            fontWeight: 700,
            cursor: scanning || !manualInput.trim() ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
          }}
        >
          {scanning ? "…" : "Search"}
        </button>
      </div>
    </div>
  );
}
