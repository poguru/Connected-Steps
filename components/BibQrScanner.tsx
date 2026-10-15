"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

// Camera QR scanner for volunteers' phones and tablets. It reads frames in the browser with jsQR and reports the first
// code it finds, once. The camera starts only when this component mounts (the volunteer opened it), and it is released
// on close, on a successful read, and on unmount. The decoded text is only a candidate: the server verifies it.

interface Props {
  onDetected: (text: string) => void;
  onClose: () => void;
}

// Read at full camera resolution. A QR shown on another screen is small in the frame, and shrinking it first
// removes the detail the decoder needs.
const MAX_SIDE = 1280;

function cameraMessage(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera permission was denied. Allow camera access in the browser settings, or search by registration code instead.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found on this device. Search by registration code instead.";
  if (name === "NotReadableError") return "The camera is in use by another app. Close it and try again.";
  return "The camera could not be started. Search by registration code instead.";
}

export default function BibQrScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cameraCount, setCameraCount] = useState(0);
  const [deviceIndex, setDeviceIndex] = useState(0);
  const [supported, setSupported] = useState(true);

  function stopCamera() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser capability is only known on the client
      setSupported(false);
      return;
    }
    let cancelled = false;

    async function start() {
      try {
        const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput");
        if (!cancelled) setCameraCount(devices.length);
        // Rear camera first on phones: "environment" is preferred, and the switch button picks a specific camera
        const constraints: MediaStreamConstraints = devices.length > 1 && devices[deviceIndex % devices.length]
          ? { video: { deviceId: { exact: devices[deviceIndex % devices.length].deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } }
          : { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setMessage(null);
        scan();
      } catch (err) {
        if (!cancelled) setMessage(cameraMessage(err));
      }
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
          const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
          if (code?.data && !doneRef.current) {
            doneRef.current = true;
            stopCamera();
            onDetected(code.data);
            return;
          }
        }
      }
      frameRef.current = requestAnimationFrame(scan);
    }

    doneRef.current = false;
    start();
    return () => {
      cancelled = true;
      stopCamera();
    };
    // The camera restarts only when the volunteer switches cameras (deviceIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceIndex]);

  function close() {
    doneRef.current = true;
    stopCamera();
    onClose();
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Scan participant QR code" style={{
      position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.92)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{ color: "#fff", fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Scan participant QR</div>
      <div style={{ color: "#aaa", fontSize: 12, marginBottom: 12, textAlign: "center", maxWidth: 360 }}>
        Hold the QR code inside the frame. It is read on this device and checked by the server before anything is shown.
      </div>

      {!supported ? (
        <div role="alert" style={{ color: "#f87171", fontSize: 13, textAlign: "center", maxWidth: 360, marginBottom: 16 }}>
          This browser can&apos;t use the camera. Open the site in Chrome or Safari over HTTPS, or search by registration code.
        </div>
      ) : (
        <div style={{ position: "relative", width: "min(88vw, 420px)", aspectRatio: "3 / 4", borderRadius: 12, overflow: "hidden", background: "#000" }}>
          <video ref={videoRef} playsInline muted autoPlay style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          {/* Scanning frame */}
          <div aria-hidden="true" style={{
            position: "absolute", inset: "18% 14%", border: "2px solid #e8620a", borderRadius: 12,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
          }} />
          <canvas ref={canvasRef} style={{ display: "none" }} />
        </div>
      )}

      {message && (
        <div role="alert" style={{ color: "#f87171", fontSize: 13, textAlign: "center", maxWidth: 360, marginTop: 12 }}>{message}</div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap", justifyContent: "center" }}>
        {cameraCount > 1 && (
          <button type="button" onClick={() => setDeviceIndex(i => i + 1)} style={{
            minHeight: 44, padding: "10px 16px", borderRadius: 10, background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}>Switch camera</button>
        )}
        <button type="button" onClick={close} style={{
          minHeight: 44, padding: "10px 20px", borderRadius: 10, background: "#e8620a", border: "none",
          color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
        }}>Close</button>
      </div>
    </div>
  );
}
