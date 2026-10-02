"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface Participant {
  id: string; first_name: string; last_name: string;
  email: string | null; mobile: string;
  company_name: string | null; employee_id: string | null;
  // company_id_url is only used server-side (to drive has_company_id).
  // The frontend never renders it as an img src — it fetches a signed URL instead.
  company_id_url: string | null; verification_status: string;
  it_run_registrations: {
    registration_code: string; payment_status: string;
    it_run_categories: { name: string } | null;
  };
}

interface CompanyIdMeta {
  available:  boolean;
  reason?:    "NO_DOCUMENT" | "STORAGE_FILE_NOT_FOUND" | "UNRESOLVABLE_PATH" | "ERROR";
  url?:       string;
  mimeType?:  string;
  isPdf?:     boolean;
  fileName?:  string;
  expiresAt?: number;
}

const ACCENT = "#e8620a";
const STATUS_OPTS = [
  { value: "pending",            label: "Pending Review",      color: "#f59e0b" },
  { value: "verified",           label: "Verified",            color: "#10b981" },
  { value: "rejected",           label: "Rejected",            color: "#ef4444" },
  { value: "need_clarification", label: "Needs Clarification", color: "#6366f1" },
];

// ── CompanyIdViewer ────────────────────────────────────────────────────────────
// Manages the full lifecycle of fetching a signed URL and rendering the document.

interface ViewerState {
  phase: "idle" | "loading" | "loaded" | "error" | "no_document";
  meta?: CompanyIdMeta;
  errorMsg?: string;
}

function CompanyIdThumbnail({
  participantId,
  hasDocument,
  onOpenViewer,
}: {
  participantId: string;
  hasDocument:   boolean;
  onOpenViewer:  (meta: CompanyIdMeta) => void;
}) {
  const [state, setState] = useState<ViewerState>({ phase: "idle" });

  const fetchSignedUrl = useCallback(async () => {
    setState({ phase: "loading" });
    try {
      const res  = await fetch(`/api/it-run/admin/company-id-url?participantId=${participantId}`);
      const data = await res.json() as CompanyIdMeta & { error?: string };

      if (!res.ok) {
        setState({ phase: "error", errorMsg: data.error ?? "Failed to load" });
        return;
      }
      if (!data.available) {
        const reason = data.reason ?? "NO_DOCUMENT";
        setState({ phase: reason === "NO_DOCUMENT" ? "no_document" : "error", meta: data,
          errorMsg: reason === "STORAGE_FILE_NOT_FOUND" ? "File missing from storage" :
                    reason === "UNRESOLVABLE_PATH"       ? "Invalid document path" :
                    "Document unavailable" });
        return;
      }

      setState({ phase: "loaded", meta: data });
    } catch {
      setState({ phase: "error", errorMsg: "Network error" });
    }
  }, [participantId]);

  if (!hasDocument) {
    return (
      <div style={{
        width: 100, height: 80, background: "rgba(255,255,255,0.03)",
        border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 10,
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 2, flexShrink: 0,
      }}>
        <span style={{ fontSize: 18, opacity: 0.3 }}>📄</span>
        <span style={{ fontSize: 10, color: "#444" }}>No ID</span>
      </div>
    );
  }

  if (state.phase === "idle") {
    return (
      <button
        onClick={fetchSignedUrl}
        style={{
          width: 100, height: 80, background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10,
          cursor: "pointer", flexShrink: 0, display: "flex",
          flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
        }}
        title="Click to load document"
      >
        <span style={{ fontSize: 20 }}>👁</span>
        <span style={{ fontSize: 10, color: "#888" }}>Load ID</span>
      </button>
    );
  }

  if (state.phase === "loading") {
    return (
      <div style={{
        width: 100, height: 80, background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, color: "#666", animation: "pulse 1s infinite" }}>
          Loading…
        </span>
      </div>
    );
  }

  if (state.phase === "no_document") {
    return (
      <div style={{
        width: 100, height: 80, background: "rgba(255,255,255,0.03)",
        border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 10,
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 2, flexShrink: 0,
      }}>
        <span style={{ fontSize: 18, opacity: 0.3 }}>📄</span>
        <span style={{ fontSize: 10, color: "#444" }}>No ID</span>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <button
        onClick={fetchSignedUrl}
        style={{
          width: 100, height: 80, background: "rgba(248,113,113,0.06)",
          border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10,
          cursor: "pointer", flexShrink: 0, display: "flex",
          flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
          padding: 4,
        }}
        title={state.errorMsg}
      >
        <span style={{ fontSize: 14 }}>⚠️</span>
        <span style={{ fontSize: 9, color: "#f87171", textAlign: "center", lineHeight: 1.3 }}>
          {state.errorMsg ?? "Error"}
        </span>
        <span style={{ fontSize: 9, color: "#ef4444" }}>Retry</span>
      </button>
    );
  }

  // Loaded — show thumbnail with click-to-open
  const meta = state.meta!;
  return (
    <button
      onClick={() => {
        // Check if URL has expired — if so, re-fetch
        if (meta.expiresAt && Date.now() > meta.expiresAt - 60_000) {
          fetchSignedUrl();
        } else {
          onOpenViewer(meta);
        }
      }}
      style={{
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 10, padding: 0, cursor: "pointer", overflow: "hidden",
        flexShrink: 0, width: 100, height: 80, position: "relative",
      }}
      title="Click to view full size"
    >
      {meta.isPdf ? (
        <div style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 4,
        }}>
          <span style={{ fontSize: 24 }}>📄</span>
          <span style={{ fontSize: 10, color: "#888" }}>PDF</span>
        </div>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={meta.url}
            alt="Company ID thumbnail"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={() => {
              // Signed URL expired or file deleted — reset to idle for retry
              setState({ phase: "idle" });
            }}
          />
          <div style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,0)",
            transition: "background 0.15s",
          }} />
        </>
      )}
      <div style={{
        position: "absolute", bottom: 2, right: 3,
        fontSize: 9, color: "rgba(255,255,255,0.5)", lineHeight: 1,
      }}>🔍</div>
    </button>
  );
}

// ── Full-screen document viewer modal ─────────────────────────────────────────

function DocumentViewer({
  meta,
  onClose,
}: {
  meta:    CompanyIdMeta;
  onClose: () => void;
}) {
  const [zoom,   setZoom]   = useState(1);
  const [rotate, setRotate] = useState(0);
  const [imgErr, setImgErr] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Keyboard: Escape to close, +/- to zoom, r to rotate
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape")    { onClose(); return; }
      if (e.key === "+" || e.key === "=") setZoom(z => Math.min(z + 0.25, 4));
      if (e.key === "-")         setZoom(z => Math.max(z - 0.25, 0.25));
      if (e.key === "r" || e.key === "R") setRotate(r => (r + 90) % 360);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const zoomIn  = () => setZoom(z => Math.min(z + 0.25, 4));
  const zoomOut = () => setZoom(z => Math.max(z - 0.25, 0.25));
  const fitPage = () => setZoom(1);
  const rotateRight = () => setRotate(r => (r + 90) % 360);

  const CTRL: React.CSSProperties = {
    padding: "7px 12px", background: "rgba(255,255,255,0.1)",
    border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8,
    color: "#ccc", cursor: "pointer", fontSize: 13, fontFamily: "inherit",
    userSelect: "none",
  };

  return (
    <div
      ref={backdropRef}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)",
        zIndex: 300, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "flex-start",
        padding: "16px",
      }}
      onClick={e => { if (e.target === backdropRef.current) onClose(); }}
    >
      {/* Controls bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
        background: "rgba(0,0,0,0.6)", borderRadius: 12, padding: "8px 12px",
        flexWrap: "wrap", justifyContent: "center", maxWidth: "100%",
      }}>
        <button onClick={zoomIn}     style={CTRL} title="Zoom in (+)">+</button>
        <button onClick={zoomOut}    style={CTRL} title="Zoom out (-)">−</button>
        <button onClick={fitPage}    style={CTRL} title="Fit to screen">Fit</button>
        {!meta.isPdf && (
          <button onClick={rotateRight} style={CTRL} title="Rotate (R)">↻</button>
        )}
        <span style={{ fontSize: 11, color: "#666", padding: "0 4px" }}>
          {Math.round(zoom * 100)}%
        </span>
        <span style={{ flex: 1, minWidth: 8 }} />
        <button
          onClick={onClose}
          style={{ ...CTRL, background: "rgba(232,98,10,0.15)", borderColor: `${ACCENT}40`, color: ACCENT }}
          title="Close (Esc)"
        >
          ✕ Close
        </button>
      </div>

      {/* Document area */}
      <div style={{
        flex: 1, overflow: "auto", width: "100%",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "0 4px 16px",
      }}
        onClick={e => e.stopPropagation()}
      >
        {meta.isPdf ? (
          <iframe
            src={meta.url}
            style={{
              width: "min(700px, 100%)", height: "calc(100vh - 120px)",
              borderRadius: 12, border: "none", background: "#fff",
            }}
            title="Company ID Document"
          />
        ) : imgErr ? (
          <div style={{
            padding: 40, textAlign: "center", color: "#888",
            background: "rgba(255,255,255,0.04)", borderRadius: 12,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 14, marginBottom: 8 }}>Company ID could not be loaded.</div>
            <div style={{ fontSize: 12, color: "#555" }}>
              The signed link may have expired. Close and reopen the document.
            </div>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={meta.url}
            alt="Company ID Document"
            style={{
              maxWidth: "100%",
              transform: `scale(${zoom}) rotate(${rotate}deg)`,
              transformOrigin: "top center",
              borderRadius: 8,
              transition: "transform 0.15s",
              // For zoom > 1, allow the image to overflow so it's scrollable
              display: "block",
            }}
            onError={() => setImgErr(true)}
          />
        )}
      </div>
    </div>
  );
}

// ── Main verification page ─────────────────────────────────────────────────────

export default function VerificationPage() {
  const [tab,      setTab]      = useState("pending");
  const [data,     setData]     = useState<Participant[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [notes,    setNotes]    = useState<Record<string, string>>({});
  const [updating, setUpdating] = useState<string | null>(null);
  const [viewer,   setViewer]   = useState<CompanyIdMeta | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/it-run/admin/verification?status=${tab}&page=${page}&limit=20`);
      const d    = await res.json();
      setData(d.data ?? []);
      setTotal(d.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  useEffect(() => { void load(); }, [load]);

  async function updateStatus(id: string, status: string) {
    setUpdating(id);
    try {
      await fetch("/api/it-run/admin/verification", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ participantId: id, status, notes: notes[id] ?? "" }),
      });
      await load();
    } finally {
      setUpdating(null);
    }
  }

  const CARD: React.CSSProperties = {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14, overflow: "hidden",
  };
  const BTN = (color: string): React.CSSProperties => ({
    padding: "7px 14px",
    background: `${color}15`, border: `1px solid ${color}40`,
    borderRadius: 8, color, fontSize: 12, fontWeight: 700,
    cursor: "pointer", fontFamily: "inherit",
  });

  return (
    <div style={{ maxWidth: 900 }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: "clamp(18px,3vw,24px)", fontWeight: 800, color: "#fff", margin: 0 }}>
          Company ID Verification
        </h1>
        <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
          Review uploaded company IDs from participants
        </div>
      </div>

      {/* Status tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {STATUS_OPTS.map(s => (
          <button key={s.value} onClick={() => { setTab(s.value); setPage(0); }}
            style={{
              padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
              background: tab === s.value ? `${s.color}15` : "rgba(255,255,255,0.03)",
              border: `1px solid ${tab === s.value ? s.color : "rgba(255,255,255,0.1)"}`,
              color:  tab === s.value ? s.color : "#888",
            }}>
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: "#888", padding: 40, textAlign: "center" }}>Loading…</div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>
            {total} participant(s) with this status
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.length === 0 && (
              <div style={{ color: "#888", padding: 20, textAlign: "center" }}>
                No participants in this status
              </div>
            )}

            {data.map(p => (
              <div key={p.id} style={CARD}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 16, padding: 20, alignItems: "start",
                }}>
                  {/* Left: participant info + actions */}
                  <div>
                    <div style={{
                      display: "flex", gap: 8, alignItems: "center",
                      flexWrap: "wrap", marginBottom: 8,
                    }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>
                        {p.first_name} {p.last_name}
                      </span>
                      <span style={{
                        fontSize: 11, color: "#888",
                        background: "rgba(255,255,255,0.06)",
                        padding: "2px 8px", borderRadius: 6,
                      }}>
                        {p.it_run_registrations?.it_run_categories?.name ?? "Unknown"}
                      </span>
                    </div>

                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
                      gap: "6px 16px", marginBottom: 12,
                    }}>
                      {([
                        ["Email",       p.email ?? "-"],
                        ["Mobile",      p.mobile],
                        ["Company",     p.company_name ?? "-"],
                        ["Employee ID", p.employee_id ?? "-"],
                        ["Reg Code",    p.it_run_registrations?.registration_code ?? "-"],
                      ] as [string, string][]).map(([l, v]) => (
                        <div key={l}>
                          <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.07em" }}>{l}</div>
                          <div style={{ fontSize: 13, color: "#ccc" }}>{v}</div>
                        </div>
                      ))}
                    </div>

                    {/* Notes */}
                    <textarea
                      placeholder="Notes / reason for action (optional)"
                      value={notes[p.id] ?? ""}
                      onChange={e => setNotes(prev => ({ ...prev, [p.id]: e.target.value }))}
                      style={{
                        width: "100%", padding: "8px 12px",
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8, color: "#fff", fontSize: 12,
                        fontFamily: "inherit", resize: "none", height: 48,
                        boxSizing: "border-box",
                      }}
                    />

                    {/* Action buttons */}
                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      {tab !== "verified" && (
                        <button
                          onClick={() => updateStatus(p.id, "verified")}
                          disabled={updating === p.id}
                          style={BTN("#10b981")}
                        >
                          {updating === p.id ? "…" : "Verify"}
                        </button>
                      )}
                      {tab !== "rejected" && (
                        <button
                          onClick={() => updateStatus(p.id, "rejected")}
                          disabled={updating === p.id}
                          style={BTN("#ef4444")}
                        >
                          {updating === p.id ? "…" : "Reject"}
                        </button>
                      )}
                      {tab !== "need_clarification" && (
                        <button
                          onClick={() => updateStatus(p.id, "need_clarification")}
                          disabled={updating === p.id}
                          style={BTN("#6366f1")}
                        >
                          {updating === p.id ? "…" : "Clarification"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Right: Company ID thumbnail */}
                  <CompanyIdThumbnail
                    participantId={p.id}
                    hasDocument={!!p.company_id_url}
                    onOpenViewer={setViewer}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {total > 20 && (
            <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "center" }}>
              <button
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                style={{ padding: "7px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#ccc", cursor: "pointer", fontFamily: "inherit" }}
              >
                Prev
              </button>
              <span style={{ padding: "7px 14px", fontSize: 13, color: "#888" }}>
                {page + 1} / {Math.ceil(total / 20)}
              </span>
              <button
                disabled={(page + 1) * 20 >= total}
                onClick={() => setPage(p => p + 1)}
                style={{ padding: "7px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#ccc", cursor: "pointer", fontFamily: "inherit" }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Full-screen document viewer */}
      {viewer && (
        <DocumentViewer
          meta={viewer}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
