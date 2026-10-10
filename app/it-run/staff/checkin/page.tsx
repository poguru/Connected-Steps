"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import QRScanner from "@/components/QRScanner";

interface Participant {
  id: string;
  firstName: string;
  lastName: string;
  bibName: string | null;
  bibNumber: string | null;
  gender: string | null;
  companyName: string | null;
  category: string;
  categoryColor: string;
  canIssue: boolean;
  paymentStatus: string;
  registrationStatus: string;
  verificationStatus: string;
  idDocumentType: string | null;
  services: Service[];
}

interface Service {
  type: string;
  allowed: boolean;
  issued: boolean;
  issuedAt: string | null;
}

const SERVICE_LABEL: Record<string, string> = {
  BIB: "BIB collected",
  BREAKFAST: "Breakfast",
  GOODIES: "Goodies",
  TSHIRT: "T-shirt",
  MEDAL: "Medal",
  CERTIFICATE: "Certificate",
};

// Plain-language identity line for volunteers. The document itself and its number are never shown here.
function identityLabel(p: Participant): { text: string; unverified: boolean } {
  if (p.verificationStatus === "verified") {
    return { text: p.idDocumentType === "government" ? "Government ID verified" : "Company ID verified", unverified: false };
  }
  if (p.verificationStatus === "pending") return { text: "ID awaiting review", unverified: true };
  if (p.verificationStatus === "need_clarification") return { text: "ID needs correction", unverified: true };
  if (p.verificationStatus === "rejected") return { text: "ID rejected", unverified: true };
  return { text: "No ID on file", unverified: true };
}

export default function CheckinPage() {
  const router = useRouter();
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [issuing, setIssuing] = useState<string | null>(null);

  // Issues one service. Each service is independent: a failure on one leaves the others as they were. A service that
  // is already issued is never sent again; the server also refuses a duplicate and reports it as a conflict.
  async function issueService(type: string) {
    if (!participant || issuing) return;
    setIssuing(type);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/it-run/staff/entitlements/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: participant.id,
          entitlementType: type,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok || res.status === 409) {
        const issuedAt = new Date().toISOString();
        setParticipant(p => p && {
          ...p,
          services: p.services.map(s => s.type === type ? { ...s, issued: true, issuedAt: s.issuedAt ?? issuedAt } : s),
        });
        if (res.status === 409) setError(data.error ?? `${SERVICE_LABEL[type] ?? type} already issued`);
        else setSuccess(`${SERVICE_LABEL[type] ?? type} recorded`);
      } else {
        setError(data.error ?? "Could not record that service");
      }
    } catch {
      setError("Network error");
    } finally {
      setIssuing(null);
    }
  }

  // The card stays on screen until the volunteer dismisses it or scans the next participant.
  async function handleScan(query: string) {
    setError(null);
    setSuccess(null);
    setCheckedIn(false);
    setLoading(true);

    try {
      const res = await fetch(`/api/it-run/staff/participant/lookup?q=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Participant not found");
        return;
      }

      setParticipant(data.participant);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckin() {
    if (!participant) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/it-run/admin/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: participant.id }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(`${participant.firstName} checked in!`);
        setCheckedIn(true);
      } else {
        setError(data.error ?? "Failed to check in");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)", padding: "16px", fontFamily: "inherit" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={() => router.back()}
            style={{ background: "none", border: "none", color: "#888", fontSize: 16, cursor: "pointer", marginBottom: 12, fontFamily: "inherit" }}
          >
            ← Back
          </button>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>
            Check In
          </h1>
          <p style={{ fontSize: 14, color: "#888", marginTop: 8 }}>
            Scan participant QR to check them in
          </p>
        </div>

        {!participant && <QRScanner onScan={handleScan} onError={setError} />}

        {error && (
          <div style={{ marginBottom: 16, padding: "14px 16px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, color: "#f87171", fontSize: 13, fontWeight: 600 }}>
            ✗ {error}
          </div>
        )}

        {success && (
          <div style={{ marginBottom: 16, padding: "14px 16px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 10, color: "#10b981", fontSize: 13, fontWeight: 600 }}>
            ✓ {success}
          </div>
        )}

        {participant && (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(16,185,129,0.4)", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
              {participant.firstName} {participant.lastName}
            </div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
              {participant.category} · BIB {participant.bibNumber ?? "not assigned"}
            </div>
            {participant.bibName && (
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
                Bib name: <span style={{ color: "#ccc", fontWeight: 600 }}>{participant.bibName}</span>
              </div>
            )}
            {participant.companyName && (
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
                Company: <span style={{ color: "#ccc" }}>{participant.companyName}</span>
              </div>
            )}
            <div style={{ fontSize: 12, marginBottom: 16, color: identityLabel(participant).unverified ? "#fbbf24" : "#10b981", fontWeight: 600 }}>
              {identityLabel(participant).text}
            </div>

            {identityLabel(participant).unverified && (
              <div role="alert" style={{ padding: "10px 12px", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 8, color: "#fbbf24", fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
                ID not verified. Check with the team lead before handing over any kit. This does not change the registration.
              </div>
            )}

            {!participant.canIssue && (
              <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#f87171", fontSize: 12, marginBottom: 16 }}>
                ⚠️ Not eligible to check in
              </div>
            )}

            {checkedIn && (
              <div style={{ padding: "10px 12px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, color: "#10b981", fontSize: 12, marginBottom: 16 }}>
                ℹ️ Already checked in
              </div>
            )}

            {participant.services.some(s => s.allowed) && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Services</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {participant.services.filter(s => s.allowed).map(s => (
                    <div key={s.type} style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, color: s.issued ? "#10b981" : "#ccc", fontWeight: 600 }}>
                        {s.issued ? "✓ " : ""}{SERVICE_LABEL[s.type] ?? s.type}
                      </span>
                      <button
                        onClick={() => issueService(s.type)}
                        disabled={s.issued || !participant.canIssue || issuing !== null}
                        style={{
                          minHeight: 40, padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                          background: s.issued ? "rgba(16,185,129,0.1)" : "#10b981", color: s.issued ? "#10b981" : "#fff",
                          border: s.issued ? "1px solid rgba(16,185,129,0.3)" : "none",
                          cursor: s.issued || !participant.canIssue || issuing !== null ? "not-allowed" : "pointer",
                          opacity: !participant.canIssue && !s.issued ? 0.5 : 1,
                        }}
                      >
                        {s.issued ? "Done" : issuing === s.type ? "Recording…" : "Record"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              {participant.canIssue && !checkedIn && (
                <button
                  onClick={handleCheckin}
                  disabled={loading}
                  style={{ flex: 1, padding: "16px 20px", background: "#10b981", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit" }}
                >
                  {loading ? "Checking in…" : "Check In"}
                </button>
              )}
              <button
                onClick={() => setParticipant(null)}
                style={{ flex: 1, padding: "16px 20px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#888", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                Scan Another
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
