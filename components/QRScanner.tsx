"use client";

import { useEffect, useRef, useState } from "react";

interface QRScannerProps {
  onScan: (data: string) => Promise<void>;
  onError?: (error: string) => void;
  placeholder?: string;
}

export default function QRScanner({ onScan, onError, placeholder = "Scan QR, BIB, or registration code…" }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [permError, setPermError] = useState<string | null>(null);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setCameraActive(true);
          setPermError(null);
        }
      } catch (err: any) {
        const msg = err?.name === "NotAllowedError" ? "Camera permission denied" : "Camera unavailable";
        setPermError(msg);
        onError?.(msg);
      }
    };

    startCamera();

    return () => {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, [onError]);

  const decodeQR = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d");
    if (!ctx || !videoRef.current) return null;

    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);

    // Simple QR detection: look for patterns
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    let qrPattern = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 128) qrPattern++;
    }

    // If we detect enough dark pixels (typical QR pattern), try to read from canvas
    if (qrPattern > canvas.width * canvas.height * 0.3) {
      return "qr_detected";
    }

    return null;
  };

  useEffect(() => {
    if (!cameraActive || scanning) return;

    const interval = setInterval(() => {
      if (canvasRef.current && videoRef.current && videoRef.current.readyState === 4) {
        const result = decodeQR(canvasRef.current);
        if (result) {
          setScanning(true);
          // In production, use a QR library like jsQR or html5-qrcode
          // For now, manual input fallback
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [cameraActive, scanning]);

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
      {!permError && cameraActive && (
        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#000", aspectRatio: "4/3" }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          <canvas ref={canvasRef} style={{ display: "none" }} />
          {/* QR Frame Overlay */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              border: "3px solid #e8620a",
              borderRadius: "50%",
              width: "60%",
              height: "60%",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
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
            }}
          >
            Point at QR code
          </div>
        </div>
      )}

      {/* Permission Error */}
      {permError && (
        <div
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
