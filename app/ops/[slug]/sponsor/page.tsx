"use client";

import { useState, useEffect, use, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import OpsHeader from "@/components/ops/OpsHeader";
import type { OpsRole } from "@/lib/ops-auth";

const ACCENT = "#f97316";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Session { uid: string; eid: string; role: OpsRole; email: string; name: string; }
interface ParticipantInfo {
  id: string; first_name: string; last_name: string | null;
  email: string | null; phone: string | null; distance_category: string | null;
  checked_in: boolean;
}
interface Lead {
  id: string; first_name: string | null; last_name: string | null;
  email: string | null; phone: string | null;
  distance_category: string | null; notes: string | null; scanned_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractToken(raw: string): string {
  try { const u = new URL(raw); return u.searchParams.get("t") ?? raw; }
  catch { return raw; }
}

function csvRow(values: (string | null | undefined)[]) {
  return values.map(v => `"${(v ?? "").replace(/"/g, '""')}"`).join(",");
}

function exportCSV(leads: Lead[], sponsorName: string) {
  const header = csvRow(["Name", "Email", "Phone", "Distance", "Notes", "Scanned At"]);
  const rows   = leads.map(l => csvRow([
    [l.first_name, l.last_name].filter(Boolean).join(" "),
    l.email, l.phone, l.distance_category, l.notes,
    new Date(l.scanned_at).toLocaleString("en-IN"),
  ]));
  const csv  = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `leads_${sponsorName.replace(/\s+/g, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SponsorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router   = useRouter();

  const [session,     setSession]     = useState<Session | null>(null);
  const [eventTitle,  setEventTitle]  = useState("");
  const [sponsorName, setSponsorName] = useState("");
  const [leads,       setLeads]       = useState<Lead[]>([]);
  const [leadsLoaded, setLeadsLoaded] = useState(false);

  // Scanner state
  type ScanPhase = "idle" | "scanning" | "found" | "error";
  const [scanPhase,   setScanPhase]   = useState<ScanPhase>("idle");
  const [scanResult,  setScanResult]  = useState<ParticipantInfo | null>(null);
  const [scanError,   setScanError]   = useState("");
  const [scanNotes,   setNotesDraft]  = useState("");
  const [saving,      setSaving]      = useState(false);
  const [manualToken, setManualToken] = useState("");

  type CamState = "starting" | "active" | "denied" | "no-device";
  const [camState,    setCamState]    = useState<CamState>("starting");

  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef    = useRef<number>(0);
  const jsQRRef   = useRef<((d: Uint8ClampedArray, w: number, h: number) => { data: string } | null) | null>(null);
  const busyRef   = useRef(false);

  // ── Auth ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/ops/auth")
      .then(r => r.ok ? r.json() : null)
      .then((s: Session | null) => {
        if (!s || s.role !== "sponsor") { router.replace(`/ops/${slug}/login`); return; }
        setSession(s);
      })
      .catch(() => router.replace(`/ops/${slug}/login`));
    fetch(`/api/events/by-slug?slug=${encodeURIComponent(slug)}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { event?: { title: string } } | null) => { if (d?.event?.title) setEventTitle(d.event.title); })
      .catch(() => {});
  }, [slug, router]);

  // ── Load leads ────────────────────────────────────────────────────────────

  const loadLeads = useCallback(async () => {
    const r = await fetch("/api/ops/leads");
    if (!r.ok) return;
    const d = await r.json() as { leads: Lead[]; sponsor: { name?: string } | null };
    setLeads(d.leads);
    setSponsorName(d.sponsor?.name ?? "");
    setLeadsLoaded(true);
  }, []);

  useEffect(() => { if (session) void loadLeads(); }, [session, loadLeads]);

  // ── Camera ────────────────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const handleScan = useCallback(async (raw: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    stopCamera();
    setScanPhase("scanning");
    const token = extractToken(raw);
    try {
      const r = await fetch("/api/ops/lead-scan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr_token: token }),
      });
      const d = await r.json() as { participant?: ParticipantInfo; error?: string; code?: string };
      if (r.ok && d.participant) {
        setScanResult(d.participant);
        setNotesDraft("");
        setScanPhase("found");
      } else {
        setScanError(d.error ?? "Participant not found");
        setScanPhase("error");
      }
    } catch {
      setScanError("Network error");
      setScanPhase("error");
    }
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    setCamState("starting");
    busyRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      if (!jsQRRef.current) {
        const mod = await import("jsqr");
        jsQRRef.current = mod.default;
      }
      setCamState("active");
      const tick = () => {
        if (!streamRef.current) return;
        const video = videoRef.current; const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) { rafRef.current = requestAnimationFrame(tick); return; }
        const ctx = canvas.getContext("2d");
        if (!ctx) { rafRef.current = requestAnimationFrame(tick); return; }
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const res = jsQRRef.current?.(img.data, img.width, img.height);
        if (res?.data) { void handleScan(res.data); return; }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err: unknown) {
      const name = (err as { name?: string }).name ?? "";
      setCamState(name === "NotFoundError" ? "no-device" : "denied");
    }
  }, [handleScan]);

  useEffect(() => {
    if (scanPhase === "idle" && session) { void startCamera(); return () => stopCamera(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanPhase, session]);

  // ── Save notes + reload leads ─────────────────────────────────────────────

  async function saveLead() {
    if (!scanResult) return;
    setSaving(true);
    await fetch("/api/ops/lead-scan", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qr_token: scanResult.id, notes: scanNotes || null }),
    });
    setSaving(false);
    await loadLeads();
    setScanPhase("idle");
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!session) return <FullSpinner />;

  const fullName = (p: ParticipantInfo) => [p.first_name, p.last_name].filter(Boolean).join(" ");

  return (
    <div style={{ minHeight: "100dvh", background: "#080808", color: "#fff", fontFamily: "'Inter',system-ui,sans-serif" }}>
      <OpsHeader
        slug={slug} eventTitle={eventTitle}
        role={session.role} volunteerName={session.name}
        countLabel={leadsLoaded ? `${leads.length} lead${leads.length !== 1 ? "s" : ""}` : undefined}
        accentColor={ACCENT}
      />

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "16px 16px 80px" }}>

        {/* Sponsor name banner */}
        {sponsorName && (
          <div style={{ padding: "8px 14px", marginBottom: 16, borderRadius: 8, background: `${ACCENT}10`, border: `1px solid ${ACCENT}30`, fontSize: 12, fontWeight: 700, color: ACCENT }}>
            🏢 {sponsorName}
          </div>
        )}

        {/* ── Scanner section ───────────────────────────────────────────────── */}
        <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, overflow: "hidden", marginBottom: 20 }}>

          {/* Camera viewfinder */}
          {scanPhase === "idle" && (
            <>
              <div style={{ position: "relative", background: "#000", aspectRatio: "4/3", overflow: "hidden" }}>
                <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: camState === "active" ? "block" : "none" }} />
                <canvas ref={canvasRef} style={{ display: "none" }} />
                {camState !== "active" && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "#555" }}>
                    {camState === "starting" && <SpinRing />}
                    {camState === "denied"    && <p style={{ fontSize: 13, textAlign: "center", padding: "0 24px" }}>Camera access denied. Use manual input below.</p>}
                    {camState === "no-device" && <p style={{ fontSize: 13 }}>No camera found.</p>}
                  </div>
                )}
                {/* Scan target overlay */}
                {camState === "active" && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                    <div style={{ width: 180, height: 180, border: `2px solid ${ACCENT}`, borderRadius: 8, boxShadow: `0 0 0 2000px rgba(0,0,0,0.35)` }} />
                  </div>
                )}
              </div>
              <div style={{ padding: "12px 14px" }}>
                <p style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700, marginBottom: 8 }}>Or paste QR URL / token</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={manualToken}
                    onChange={e => setManualToken(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && manualToken.trim()) void handleScan(manualToken.trim()); }}
                    placeholder="https://…?t=TOKEN or raw token"
                    style={{ flex: 1, padding: "8px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontSize: 12, outline: "none", fontFamily: "inherit" }}
                  />
                  <button
                    onClick={() => { if (manualToken.trim()) void handleScan(manualToken.trim()); }}
                    style={{ padding: "8px 14px", background: ACCENT, border: "none", borderRadius: 7, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                  >
                    Look up
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Scanning spinner */}
          {scanPhase === "scanning" && (
            <div style={{ padding: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <SpinRing color={ACCENT} />
              <p style={{ color: "#888", fontSize: 13 }}>Looking up participant…</p>
            </div>
          )}

          {/* Found: participant card + notes */}
          {scanPhase === "found" && scanResult && (
            <div style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: `${ACCENT}20`, border: `2px solid ${ACCENT}50`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                  {scanResult.first_name?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>{fullName(scanResult)}</p>
                  {scanResult.distance_category && <span style={{ fontSize: 11, background: `${ACCENT}18`, border: `1px solid ${ACCENT}30`, color: ACCENT, padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>{scanResult.distance_category}</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                {scanResult.email && <InfoChip label="✉" value={scanResult.email} />}
                {scanResult.phone && <InfoChip label="📱" value={scanResult.phone} />}
                <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 20, background: scanResult.checked_in ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${scanResult.checked_in ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.1)"}`, color: scanResult.checked_in ? "#22c55e" : "#555", fontWeight: 600 }}>
                  {scanResult.checked_in ? "✓ Checked in" : "Not yet checked in"}
                </span>
              </div>
              <textarea
                value={scanNotes}
                onChange={e => setNotesDraft(e.target.value)}
                placeholder="Notes about this lead (optional)…"
                rows={2}
                style={{ width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#ccc", fontSize: 12, fontFamily: "inherit", resize: "vertical" as const, outline: "none", boxSizing: "border-box" as const, marginBottom: 12 }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => void saveLead()}
                  disabled={saving}
                  style={{ flex: 1, padding: "9px 0", background: saving ? `${ACCENT}80` : ACCENT, border: "none", borderRadius: 7, color: "#fff", fontWeight: 700, fontSize: 13, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}
                >
                  {saving ? "Saving…" : "✓ Save Lead"}
                </button>
                <button
                  onClick={() => { setScanPhase("idle"); setManualToken(""); }}
                  style={{ padding: "9px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#666", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}
                >
                  Skip
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {scanPhase === "error" && (
            <div style={{ padding: 28, textAlign: "center" }}>
              <p style={{ fontSize: 32, marginBottom: 8 }}>⚠</p>
              <p style={{ color: "#f87171", fontSize: 13, marginBottom: 16 }}>{scanError}</p>
              <button
                onClick={() => { setScanPhase("idle"); setManualToken(""); }}
                style={{ padding: "8px 20px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, color: "#ccc", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}
              >
                Try again
              </button>
            </div>
          )}
        </div>

        {/* ── Leads list ────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <p style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700 }}>
            Captured Leads ({leads.length})
          </p>
          {leads.length > 0 && (
            <button
              onClick={() => exportCSV(leads, sponsorName || "sponsor")}
              style={{ padding: "5px 12px", background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.25)", borderRadius: 6, color: ACCENT, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
            >
              ↓ Export CSV
            </button>
          )}
        </div>

        {!leadsLoaded && <p style={{ color: "#444", fontSize: 13, textAlign: "center", padding: "20px 0" }}>Loading leads…</p>}
        {leadsLoaded && leads.length === 0 && (
          <p style={{ color: "#333", fontSize: 13, textAlign: "center", padding: "28px 0" }}>No leads yet — scan a participant QR code above</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {leads.map((l, i) => {
            const name = [l.first_name, l.last_name].filter(Boolean).join(" ");
            return (
              <div key={l.id} style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: "#444", fontVariantNumeric: "tabular-nums", minWidth: 20 }}>{leads.length - i}</span>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#e8e9eb", flex: 1 }}>{name || "—"}</p>
                  {l.distance_category && <span style={{ fontSize: 10, background: `${ACCENT}18`, border: `1px solid ${ACCENT}28`, color: ACCENT, padding: "1px 6px", borderRadius: 20, fontWeight: 700 }}>{l.distance_category}</span>}
                </div>
                {(l.email || l.phone) && (
                  <div style={{ display: "flex", gap: 10, marginBottom: l.notes ? 6 : 0, flexWrap: "wrap" }}>
                    {l.email && <span style={{ fontSize: 11, color: "#666" }}>{l.email}</span>}
                    {l.phone && <span style={{ fontSize: 11, color: "#666" }}>{l.phone}</span>}
                  </div>
                )}
                {l.notes && <p style={{ fontSize: 11, color: "#888", fontStyle: "italic", margin: 0 }}>{l.notes}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Atoms ─────────────────────────────────────────────────────────────────────

function SpinRing({ color = "#444" }: { color?: string }) {
  return (
    <>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: `3px solid ${color}30`, borderTop: `3px solid ${color}`, animation: "spin .7s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

function FullSpinner() {
  return (
    <div style={{ minHeight: "100dvh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <SpinRing color={ACCENT} />
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#888" }}>
      {label} {value}
    </span>
  );
}
