"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import QRScanner from "@/components/QRScanner";

interface Participant {
  id: string;
  firstName: string;
  lastName: string;
  bibNumber: string | null;
  category: string;
  categoryColor: string;
  canIssue: boolean;
  paymentStatus: string;
  registrationStatus: string;
}

export default function CheckinPage() {
  const router = useRouter();
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);

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
        setTimeout(() => setParticipant(null), 2000);
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
            <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>
              {participant.category} · BIB {participant.bibNumber}
            </div>

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
