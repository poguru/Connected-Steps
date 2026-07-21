"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import QRScannerModal from "@/components/ui/QRScannerModal";

interface TshirtResult {
  valid:          boolean;
  already_issued?: boolean;
  message:        string;
  error?:         string;
  registration?: {
    code:        string;
    name:        string;
    tshirt_size: string;
    event:       string;
    issued_at?:  string | null;
    issued_by?:  string | null;
  };
}

function TshirtContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const token        = searchParams.get("t") ?? "";

  const [status,     setStatus]     = useState<"loading" | "success" | "duplicate" | "error" | "auth" | "idle">("idle");
  const [result,     setResult]     = useState<TshirtResult | null>(null);
  const [manualTok,  setManualTok]  = useState("");
  const [checking,   setChecking]   = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const didAutoCheck = useRef(false);

  async function distribute(tok: string) {
    if (!tok.trim()) return;
    setChecking(true); setResult(null);
    try {
      const res  = await fetch("/api/events/tshirt-distribute", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token: tok.trim() }),
      });
      const data: TshirtResult = await res.json();
      setResult(data);
      if (res.status === 401) { setStatus("auth"); return; }
      if (!res.ok)            { setStatus("error"); return; }
      if (data.already_issued) { setStatus("duplicate"); return; }
      setStatus("success");
    } catch {
      setResult({ valid: false, message: "Network error. Please try again." });
      setStatus("error");
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    if (token && !didAutoCheck.current) {
      didAutoCheck.current = true;
      setStatus("loading");
      distribute(token);
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

      <header style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "14px 20px", display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/admin/events" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <Image src="/logo.png" alt="" width={28} height={28} style={{ borderRadius: "50%" }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>T-Shirt Distribution</span>
        </Link>
      </header>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem" }}>

        {/* Loading */}
        {(status === "loading" || checking) && (
          <div style={card}>
            <div style={{ textAlign: "center", padding: "2rem 0" }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #222", borderTopColor: "#60a5fa", animation: "spin .7s linear infinite", margin: "0 auto 16px" }} />
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
              <p style={{ fontSize: 13, color: "#777", marginBottom: 20 }}>Only admins and volunteers can issue T-shirts.</p>
              <a href={`/admin/login?redirect=${encodeURIComponent(window.location.href)}`}
                style={{ display: "inline-block", padding: "10px 24px", background: "#60a5fa", color: "#fff", borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none" }}>
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
              <div style={{ fontSize: 20, fontWeight: 800, color: "#4ade80" }}>T-Shirt Issued!</div>
            </div>
            {result.registration && (
              <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{result.registration.name}</div>
                <div style={{ fontSize: 13, color: "#aaa", marginBottom: 10 }}>{result.registration.event}</div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 900, color: "#60a5fa", background: "rgba(96,165,250,0.15)", border: "2px solid rgba(96,165,250,0.4)", padding: "8px 20px", borderRadius: 12, marginBottom: 10 }}>
                  👕 {result.registration.tshirt_size}
                </div>
                <div style={{ fontSize: 11, color: "#555", fontFamily: "monospace" }}>{result.registration.code}</div>
              </div>
            )}
            <button onClick={() => { setStatus("idle"); setResult(null); didAutoCheck.current = false; router.replace("/event-tshirt"); }}
              style={{ width: "100%", marginTop: 16, padding: "11px", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#888", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Scan next participant
            </button>
          </div>
        )}

        {/* Already issued */}
        {status === "duplicate" && result && !checking && (
          <div style={{ ...card, border: "1px solid rgba(234,179,8,0.3)", background: "rgba(234,179,8,0.04)" }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>⚠️</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#eab308" }}>T-Shirt Already Issued</div>
              {result.registration && (
                <div style={{ fontSize: 13, color: "#aaa", marginTop: 6 }}>
                  {result.registration.name} · 👕 {result.registration.tshirt_size}
                </div>
              )}
              {result.registration?.issued_at && (
                <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                  {new Date(result.registration.issued_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                  {result.registration.issued_by ? ` · by ${result.registration.issued_by}` : ""}
                </div>
              )}
            </div>
            <button onClick={() => { setStatus("idle"); setResult(null); didAutoCheck.current = false; router.replace("/event-tshirt"); }}
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
              <div style={{ fontSize: 18, fontWeight: 700, color: "#f87171" }}>Error</div>
              <div style={{ fontSize: 13, color: "#aaa", marginTop: 6 }}>{result.message || result.error}</div>
            </div>
            <button onClick={() => { setStatus("idle"); setResult(null); didAutoCheck.current = false; router.replace("/event-tshirt"); }}
              style={{ width: "100%", padding: "11px", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#888", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Try again
            </button>
          </div>
        )}

        {/* Idle */}
        {status === "idle" && !checking && (
          <div style={card}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>👕</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 6 }}>T-Shirt Distribution</div>
              <p style={{ fontSize: 13, color: "#666", margin: 0 }}>
                Scan a participant&apos;s QR code to verify and issue their T-shirt.
              </p>
            </div>

            <button onClick={() => setCameraOpen(true)}
              style={{ width: "100%", padding: "13px", background: "#60a5fa", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit", marginBottom: 16 }}>
              📷 Open Camera Scanner
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
              <span style={{ fontSize: 11, color: "#444" }}>OR</span>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
            </div>

            <form onSubmit={e => { e.preventDefault(); distribute(manualTok); }} style={{ display: "flex", gap: 8 }}>
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
              distribute(tok);
            }}
            onClose={() => setCameraOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

export default function EventTshirtPage() {
  return (
    <Suspense>
      <TshirtContent />
    </Suspense>
  );
}
