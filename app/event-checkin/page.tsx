"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import QRScannerModal from "@/components/ui/QRScannerModal";

interface CheckInResult {
  valid:              boolean;
  already_checked_in?: boolean;
  message:            string;
  error?:             string;
  registration?: {
    code:          string;
    name:          string;
    email?:        string;
    category:      string | null;
    tshirt_size:   string | null;
    bib_number?:   string | null;
    event:         string;
    checked_in_at: string;
  };
}

function CheckInContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const token        = searchParams.get("t") ?? "";

  const [status,    setStatus]    = useState<"loading" | "success" | "duplicate" | "error" | "auth" | "idle">("idle");
  const [result,    setResult]    = useState<CheckInResult | null>(null);
  const [manualTok, setManualTok] = useState("");
  const [checking,  setChecking]  = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const didAutoCheck = useRef(false);

  async function checkIn(tok: string) {
    if (!tok.trim()) return;
    setChecking(true); setResult(null);
    try {
      const res  = await fetch("/api/events/check-in", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token: tok.trim() }),
      });
      const data: CheckInResult = await res.json();
      setResult(data);
      if (res.status === 401) { setStatus("auth"); return; }
      if (!res.ok)            { setStatus("error"); return; }
      if (data.already_checked_in) { setStatus("duplicate"); return; }
      setStatus("success");
    } catch {
      setResult({ valid: false, message: "Network error. Please try again." });
      setStatus("error");
    } finally {
      setChecking(false);
    }
  }

  // Auto-check when token is in URL
  useEffect(() => {
    if (token && !didAutoCheck.current) {
      didAutoCheck.current = true;
      setStatus("loading");
      checkIn(token);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const card: React.CSSProperties = {
    maxWidth: 440, width: "100%", margin: "0 auto",
    padding: "2rem 1.5rem",
    background: "#111",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    fontFamily: "system-ui, sans-serif",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#f0f0f0", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <header style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "14px 20px", display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/admin/events/registrations" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <Image src="/logo.png" alt="" width={28} height={28} style={{ borderRadius: "50%" }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Event Check-In</span>
        </Link>
      </header>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem" }}>

        {/* Loading */}
        {(status === "loading" || checking) && (
          <div style={card}>
            <div style={{ textAlign: "center", padding: "2rem 0" }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #222", borderTopColor: "#e8620a", animation: "spin .7s linear infinite", margin: "0 auto 16px" }} />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>Validating QR…</div>
            </div>
          </div>
        )}

        {/* Auth error */}
        {status === "auth" && !checking && (
          <div style={card}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🔐</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#f87171", marginBottom: 8 }}>Admin login required</div>
              <p style={{ fontSize: 13, color: "#777", marginBottom: 20 }}>Only admins and coaches can check in participants.</p>
              <a href={`/admin/login?redirect=${encodeURIComponent(window.location.href)}`}
                style={{ display: "inline-block", padding: "10px 24px", background: "#e8620a", color: "#fff", borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none" }}>
                Sign in as Admin →
              </a>
            </div>
          </div>
        )}

        {/* Success */}
        {status === "success" && result && !checking && (
          <div style={{ ...card, border: "1px solid rgba(74,222,128,0.3)", background: "rgba(74,222,128,0.05)" }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: "3rem", marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#4ade80" }}>Checked In!</div>
            </div>
            {result.registration && (
              <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{result.registration.name}</div>
                <div style={{ fontSize: 13, color: "#aaa", marginBottom: 2 }}>{result.registration.event}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {result.registration.category && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#e8620a", background: "rgba(232,98,10,0.12)", border: "1px solid rgba(232,98,10,0.3)", padding: "2px 10px", borderRadius: 999 }}>
                      {result.registration.category}
                    </div>
                  )}
                  {result.registration.tshirt_size && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.3)", padding: "2px 10px", borderRadius: 999 }}>
                      👕 {result.registration.tshirt_size}
                    </div>
                  )}
                  {result.registration.bib_number && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.3)", padding: "2px 10px", borderRadius: 999 }}>
                      🏷️ BIB {result.registration.bib_number}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#555", fontFamily: "monospace" }}>{result.registration.code}</div>
              </div>
            )}
            <button onClick={() => { setStatus("idle"); setResult(null); didAutoCheck.current = false; router.replace("/event-checkin"); }}
              style={{ width: "100%", marginTop: 16, padding: "11px", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#888", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Scan next participant
            </button>
          </div>
        )}

        {/* Already checked in */}
        {status === "duplicate" && result && !checking && (
          <div style={{ ...card, border: "1px solid rgba(234,179,8,0.3)", background: "rgba(234,179,8,0.04)" }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>⚠️</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#eab308" }}>Already Checked In</div>
              {result.registration && <div style={{ fontSize: 13, color: "#aaa", marginTop: 6 }}>{result.registration.name} · {result.registration.event}</div>}
            </div>
            <button onClick={() => { setStatus("idle"); setResult(null); didAutoCheck.current = false; router.replace("/event-checkin"); }}
              style={{ width: "100%", padding: "11px", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#888", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Scan next participant
            </button>
          </div>
        )}

        {/* Error */}
        {status === "error" && result && !checking && (
          <div style={{ ...card, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.04)" }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>❌</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#f87171" }}>Invalid QR</div>
              <div style={{ fontSize: 13, color: "#aaa", marginTop: 6 }}>{result.message || result.error}</div>
            </div>
            <button onClick={() => { setStatus("idle"); setResult(null); didAutoCheck.current = false; router.replace("/event-checkin"); }}
              style={{ width: "100%", padding: "11px", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#888", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Try again
            </button>
          </div>
        )}

        {/* Idle — camera + manual */}
        {status === "idle" && !checking && (
          <div style={card}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: "2rem", marginBottom: 8 }}>📷</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 6 }}>Event Check-In</div>
              <p style={{ fontSize: 13, color: "#666", margin: 0 }}>
                Scan a participant&apos;s QR code to instantly verify and check them in.
              </p>
            </div>

            <button onClick={() => setCameraOpen(true)}
              style={{ width: "100%", padding: "13px", background: "#e8620a", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit", marginBottom: 16 }}>
              📷 Open Camera Scanner
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
              <span style={{ fontSize: 11, color: "#444" }}>OR</span>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
            </div>

            <form onSubmit={e => { e.preventDefault(); checkIn(manualTok); }} style={{ display: "flex", gap: 8 }}>
              <input
                value={manualTok} onChange={e => setManualTok(e.target.value)}
                placeholder="Paste QR token manually…"
                style={{ flex: 1, padding: "10px 12px", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 12, fontFamily: "monospace", outline: "none" }}
              />
              <button type="submit" disabled={!manualTok.trim()}
                style={{ padding: "10px 16px", background: "#333", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", opacity: manualTok.trim() ? 1 : 0.4 }}>
                Go
              </button>
            </form>
          </div>
        )}

        {cameraOpen && (
          <QRScannerModal
            title="Scan Participant QR"
            onScan={raw => {
              setCameraOpen(false);
              let tok = raw;
              try { const u = new URL(raw); tok = u.searchParams.get("t") ?? raw; } catch { /* raw */ }
              checkIn(tok);
            }}
            onClose={() => setCameraOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

export default function EventCheckInPage() {
  return (
    <Suspense>
      <CheckInContent />
    </Suspense>
  );
}
