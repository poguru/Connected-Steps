"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// Participant company ID correction page. Opened from the "Correct and Resubmit Company ID" link in
// the verification email. Access is the signed link itself (checked by the API): no login is needed.

interface StatusResponse {
  participantName: string;
  eventTitle: string;
  verificationStatus: string;
  reasonText: string | null;
  canResubmit: boolean;
  notice: string | null;
}

const ACCENT = "#e8620a";
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_BYTES = 5 * 1024 * 1024;

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  pending:            { text: "Waiting for review", color: "#6366f1" },
  pending_verification: { text: "Waiting for review", color: "#6366f1" },
  rejected:           { text: "Not verified", color: "#ef4444" },
  need_clarification: { text: "Clarification needed", color: "#f59e0b" },
  verified:           { text: "Verified", color: "#10b981" },
};

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14, padding: 18, marginBottom: 14,
};

export default function CompanyIdCorrectionPage() {
  const [token, setToken]     = useState<string | null>(null);
  const [status, setStatus]   = useState<StatusResponse | null>(null);
  const [error, setError]     = useState<{ code: string; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile]       = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]       = useState<string | null>(null);

  // Read the token from the URL once on the client (the URL is not available during server render)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(new URLSearchParams(window.location.search).get("t") ?? "");
  }, []);

  useEffect(() => {
    if (token === null) return;
    let active = true;
    void (async () => {
      if (!token) {
        if (active) {
          setError({ code: "INVALID_LINK", message: "This participant link is invalid. Please open the latest email from us." });
          setLoading(false);
        }
        return;
      }
      try {
        const res = await fetch(`/api/it-run/company-id/resubmit?t=${encodeURIComponent(token)}`, { cache: "no-store" });
        const body = await res.json().catch(() => ({})) as Partial<StatusResponse> & { error?: string; code?: string };
        if (!active) return;
        if (!res.ok) {
          setError({ code: body.code ?? "SERVER_ERROR", message: body.error ?? "We couldn't load this page right now. Please try again." });
        } else {
          setStatus(body as StatusResponse);
        }
      } catch {
        if (active) setError({ code: "NETWORK", message: "We couldn't reach the server. Check your connection and try again." });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [token]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFileError("");
    if (!f) { setFile(null); return; }
    if (!ALLOWED.includes(f.type)) {
      setFile(null);
      setFileError("Please choose a JPG, PNG, WEBP or PDF file.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setFile(null);
      setFileError("This file is too large. The maximum is 5 MB.");
      return;
    }
    setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !token) { setFileError("Please choose a file to upload."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("t", token);
      form.append("file", file);
      const res = await fetch("/api/it-run/company-id/resubmit", { method: "POST", body: form });
      const body = await res.json().catch(() => ({})) as { ok?: boolean; message?: string; error?: string; code?: string };
      if (res.ok && body.ok) {
        setDone(body.message ?? "Thank you. Your corrected company ID has been submitted.");
        setStatus(s => s ? { ...s, canResubmit: false, verificationStatus: "pending", notice: "Your corrected company ID is waiting for review." } : s);
        setFile(null);
      } else {
        setError({ code: body.code ?? "SERVER_ERROR", message: body.error ?? "Upload failed. Please try again." });
      }
    } catch {
      setError({ code: "NETWORK", message: "Upload failed because of a network problem. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  const label = status ? (STATUS_LABEL[status.verificationStatus] ?? { text: status.verificationStatus, color: "#888" }) : null;

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#fff", fontFamily: "'Inter',system-ui,sans-serif" }}>
      <nav style={{ height: 56, display: "flex", alignItems: "center", padding: "0 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <Link href="/it-run" style={{ color: "#888", fontSize: 13, textDecoration: "none" }}>&larr; The IT Run Sprint-2</Link>
      </nav>

      <main style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px 48px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Company ID verification</h1>

        {loading && <div style={{ color: "#888", fontSize: 14 }}>Loading…</div>}

        {!loading && error && (
          <div role="alert" style={{ ...CARD, borderColor: "rgba(248,113,113,0.3)" }}>
            <div style={{ color: "#f87171", fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>{error.message}</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {error.code !== "INVALID_LINK" && error.code !== "EXPIRED_LINK" && error.code !== "STALE_LINK" && (
                <button onClick={() => window.location.reload()} style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: ACCENT, color: "#fff", fontWeight: 700, cursor: "pointer" }}>Try again</button>
              )}
              <Link href="/it-run" style={{ padding: "10px 16px", borderRadius: 8, border: `1px solid ${ACCENT}`, color: ACCENT, textDecoration: "none", fontWeight: 700 }}>IT Run event page</Link>
            </div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 12 }}>
              Questions? Contact <a href="mailto:info@connectedsteps.in" style={{ color: ACCENT }}>info@connectedsteps.in</a>
            </div>
          </div>
        )}

        {!loading && status && (
          <>
            <div style={CARD}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{status.eventTitle}</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{status.participantName}</div>
              {label && (
                <div style={{ fontSize: 13, color: label.color, fontWeight: 700, marginBottom: 10 }}>Status: {label.text}</div>
              )}
              {status.reasonText && (
                <div style={{ background: "#161616", borderRadius: 8, padding: 12, fontSize: 13, color: "#ccc", lineHeight: 1.6 }}>
                  <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", marginBottom: 4 }}>Reason from our verification team</div>
                  {status.reasonText}
                </div>
              )}
            </div>

            {done && (
              <div role="status" style={{ ...CARD, borderColor: "rgba(16,185,129,0.3)", color: "#10b981", fontSize: 14, lineHeight: 1.6 }}>{done}</div>
            )}

            {status.canResubmit ? (
              <form onSubmit={submit} style={CARD}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Upload a corrected company ID</div>
                <p style={{ fontSize: 13, color: "#888", lineHeight: 1.6, margin: "0 0 14px" }}>
                  Make sure your name, company name, employee ID, and photo are clearly readable. Accepted: JPG, PNG, WEBP or PDF, up to 5 MB. Your other registration details are not changed.
                </p>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={onFileChange}
                  aria-label="Corrected company ID file"
                  style={{ display: "block", width: "100%", marginBottom: 10, color: "#ccc", fontSize: 14 }}
                />
                {file && <div style={{ fontSize: 12, color: "#aaa", marginBottom: 10 }}>Selected: {file.name}</div>}
                {fileError && <div role="alert" style={{ fontSize: 13, color: "#f87171", marginBottom: 10 }}>{fileError}</div>}
                {error && !loading && (
                  <div role="alert" style={{ fontSize: 13, color: "#f87171", marginBottom: 10 }}>{error.message}</div>
                )}
                <button
                  type="submit"
                  disabled={!file || submitting}
                  style={{
                    width: "100%", padding: "14px", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 15,
                    background: !file || submitting ? "rgba(232,98,10,0.4)" : ACCENT, color: "#fff",
                    cursor: !file || submitting ? "not-allowed" : "pointer",
                  }}
                >
                  {submitting ? "Uploading…" : "Submit corrected company ID"}
                </button>
              </form>
            ) : (
              status.notice && <div style={{ ...CARD, fontSize: 14, color: "#ccc", lineHeight: 1.6 }}>{status.notice}</div>
            )}

            <div style={{ fontSize: 12, color: "#666", lineHeight: 1.6 }}>
              Questions? Contact <a href="mailto:info@connectedsteps.in" style={{ color: ACCENT }}>info@connectedsteps.in</a>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
