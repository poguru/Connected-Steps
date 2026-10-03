"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import QRScanner from "@/components/QRScanner";

const ACCENT = "#e8620a";
const GREEN = "#10b981";
const RED = "#ef4444";
const YELLOW = "#f59e0b";

interface Participant {
  id: string;
  firstName: string;
  lastName: string;
  bibNumber: string | null;
  tshirtSize: string | null;
  verificationStatus: string;
  registrationCode: string;
  category: string;
  company: string | null;
  paymentStatus: string;
  canIssue: boolean;
  alreadyCollected?: boolean;
  collectedBy?: string;
  collectedAt?: string;
}

interface ModalState {
  type: "confirmation" | "success" | "error" | null;
  title?: string;
  message?: string;
  details?: Record<string, string>;
  actionButton?: string;
  cancelButton?: string;
}

export default function BIBCollectEnhanced() {
  const router = useRouter();
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [modal, setModal] = useState<ModalState>({ type: null });
  const [loading, setLoading] = useState(false);
  const [scannerKey, setScannerKey] = useState(0);

  async function handleScan(query: string) {
    setModal({ type: null });
    setLoading(true);

    try {
      const res = await fetch(`/api/it-run/staff/participant/lookup?q=${encodeURIComponent(query)}`);
      const data = (await res.json());

      if (!res.ok || !data.participant) {
        setModal({
          type: "error",
          title: "Participant Not Found",
          message: data.error || "Could not find participant with that code.",
          cancelButton: "Back to Scanner",
        });
        setParticipant(null);
        return;
      }

      const part = data.participant;

      // Check if already collected
      if (data.entitlements?.BIB?.status === "issued") {
        setModal({
          type: "error",
          title: "BIB Already Collected",
          message: `${part.firstName} already collected their BIB`,
          details: {
            "BIB Number": part.bibNumber || "—",
            "Collected At": data.entitlements.BIB.issuedAt
              ? new Date(data.entitlements.BIB.issuedAt).toLocaleTimeString("en-IN")
              : "—",
          },
          cancelButton: "Scan Another",
        });
        setParticipant(part);
        return;
      }

      // Check eligibility
      if (!part.canIssue) {
        setModal({
          type: "error",
          title: "Not Eligible",
          message: `Cannot issue BIB - Payment: ${part.paymentStatus}`,
          details: {
            "Reason": part.paymentStatus === "pending"
              ? "Payment pending"
              : "Registration cancelled or invalid",
          },
          cancelButton: "Back",
        });
        setParticipant(part);
        return;
      }

      // Show participant details - this is the CONFIRMATION MODAL that doesn't auto-close
      setParticipant(part);
      setModal({
        type: "confirmation",
        title: "Verify Details",
        message: "Please verify the participant details before issuing BIB",
      });
    } catch (error) {
      setModal({
        type: "error",
        title: "Network Error",
        message: "Unable to load participant data. Check your connection and try again.",
        cancelButton: "Back",
      });
      setParticipant(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmIssue() {
    if (!participant) return;

    setLoading(true);
    const idempotencyKey = `${participant.id}-BIB-${Date.now()}`;

    try {
      const res = await fetch("/api/it-run/staff/entitlements/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: participant.id,
          entitlementType: "BIB",
          idempotencyKey,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setModal({
          type: "success",
          title: "BIB Issued Successfully",
          message: `${participant.firstName} ${participant.lastName}`,
          details: {
            "BIB": participant.bibNumber || "—",
            "Time": new Date().toLocaleTimeString("en-IN"),
          },
          actionButton: "Scan Next Participant",
        });
        // Don't clear participant - keep it for reference
      } else if (res.status === 409) {
        // Already issued (concurrency)
        setModal({
          type: "error",
          title: "Already Issued",
          message: data.message || "This participant's BIB was already issued",
          cancelButton: "Back",
        });
      } else {
        setModal({
          type: "error",
          title: "Failed to Issue BIB",
          message: data.error || "An error occurred. Please try again.",
          details: {
            "Reason": data.details || "Unknown error",
          },
          actionButton: "Try Again",
          cancelButton: "Back",
        });
      }
    } catch (error) {
      setModal({
        type: "error",
        title: "Network Error",
        message: "Unable to save. Check connection and try again.",
        details: {
          "Tip": "You can retry safely - the system prevents duplicates",
        },
        actionButton: "Try Again",
        cancelButton: "Cancel",
      });
    } finally {
      setLoading(false);
    }
  }

  function closeModal() {
    if (modal.type === "success") {
      // After success, reset for next scan
      setParticipant(null);
      setModal({ type: null });
      setScannerKey(prev => prev + 1);
    } else {
      setModal({ type: null });
    }
  }

  function handleModalCancel() {
    if (participant && modal.type === "confirmation") {
      // From confirmation screen, go back to scanner
      setParticipant(null);
      setModal({ type: null });
      setScannerKey(prev => prev + 1);
    } else if (participant) {
      // From error/already-issued, show participant again
      setModal({
        type: "confirmation",
        title: "Verify Details",
        message: "Please verify the participant details before issuing BIB",
      });
    } else {
      closeModal();
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)",
        padding: "16px",
        fontFamily: "inherit",
      }}
    >
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={() => router.back()}
            style={{
              background: "none",
              border: "none",
              color: "#888",
              fontSize: 16,
              cursor: "pointer",
              marginBottom: 12,
              fontFamily: "inherit",
            }}
          >
            ← Back
          </button>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🎫</div>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: "#fff", margin: 0 }}>
            BIB Collection
          </h1>
          <p style={{ fontSize: 14, color: "#888", marginTop: 8 }}>
            Scan participant QR or registration code
          </p>
        </div>

        {/* Scanner - shown unless participant selected */}
        {!participant && !modal.type && (
          <div style={{ marginBottom: 24 }}>
            <QRScanner key={scannerKey} onScan={handleScan} onError={() => {}} />
          </div>
        )}

        {/* Modal Overlay */}
        {modal.type && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.85)",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              zIndex: 1000,
              padding: "16px",
            }}
          >
            <div
              style={{
                background: "#1a1a1a",
                border: `1px solid ${
                  modal.type === "confirmation"
                    ? `${ACCENT}40`
                    : modal.type === "success"
                    ? `${GREEN}40`
                    : `${RED}40`
                }`,
                borderRadius: 16,
                padding: 24,
                width: "100%",
                maxWidth: 500,
                maxHeight: "80vh",
                overflowY: "auto",
              }}
            >
              {/* Modal Icon */}
              <div style={{ fontSize: 48, marginBottom: 16, textAlign: "center" }}>
                {modal.type === "confirmation" ? "👤" : modal.type === "success" ? "✅" : "⚠️"}
              </div>

              {/* Title */}
              <h2
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: "#fff",
                  margin: "0 0 8px",
                  textAlign: "center",
                }}
              >
                {modal.title}
              </h2>

              {/* Participant Details - Only in confirmation modal */}
              {modal.type === "confirmation" && participant && (
                <div style={{ marginBottom: 20 }}>
                  {/* Large Participant Name */}
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 800,
                      color: "#fff",
                      marginBottom: 4,
                      textAlign: "center",
                    }}
                  >
                    {participant.firstName} {participant.lastName}
                  </div>

                  {/* Category */}
                  <div
                    style={{
                      fontSize: 14,
                      color: ACCENT,
                      fontWeight: 600,
                      textAlign: "center",
                      marginBottom: 16,
                    }}
                  >
                    {participant.category}
                  </div>

                  {/* Key Details Grid */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                      marginBottom: 16,
                    }}
                  >
                    {/* BIB Number - Prominent */}
                    <div
                      style={{
                        gridColumn: "1 / -1",
                        background: `${ACCENT}15`,
                        border: `1px solid ${ACCENT}40`,
                        borderRadius: 10,
                        padding: 12,
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>
                        BIB NUMBER
                      </div>
                      <div
                        style={{
                          fontSize: 28,
                          fontWeight: 900,
                          color: ACCENT,
                        }}
                      >
                        {participant.bibNumber || "—"}
                      </div>
                    </div>

                    {/* T-Shirt Size */}
                    <div>
                      <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>
                        T-SHIRT
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>
                        {participant.tshirtSize || "—"}
                      </div>
                    </div>

                    {/* Verification */}
                    <div>
                      <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>
                        VERIFICATION
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color:
                            participant.verificationStatus === "verified"
                              ? GREEN
                              : YELLOW,
                        }}
                      >
                        {participant.verificationStatus === "verified"
                          ? "✓ Verified"
                          : "⚠ " + participant.verificationStatus}
                      </div>
                    </div>

                    {/* Code */}
                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>
                        REGISTRATION CODE
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "#ccc",
                          fontFamily: "monospace",
                        }}
                      >
                        {participant.registrationCode}
                      </div>
                    </div>

                    {/* Company */}
                    {participant.company && (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>
                          COMPANY
                        </div>
                        <div style={{ fontSize: 14, color: "#ccc" }}>
                          {participant.company}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Details - For other modals */}
              {modal.details && (
                <div
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 16,
                  }}
                >
                  {Object.entries(modal.details).map(([key, value]) => (
                    <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                      <div style={{ fontSize: 12, color: "#888" }}>{key}</div>
                      <div style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>{value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Message */}
              {modal.message && (
                <p
                  style={{
                    fontSize: 14,
                    color: "#ccc",
                    lineHeight: 1.6,
                    marginBottom: 20,
                    textAlign: "center",
                  }}
                >
                  {modal.message}
                </p>
              )}

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: 10 }}>
                {modal.type === "confirmation" && (
                  <>
                    <button
                      onClick={handleConfirmIssue}
                      disabled={loading}
                      style={{
                        flex: 1,
                        padding: "16px 20px",
                        background: loading ? `${ACCENT}50` : ACCENT,
                        border: "none",
                        borderRadius: 10,
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: 15,
                        cursor: loading ? "not-allowed" : "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {loading ? "Issuing…" : "Confirm Issue"}
                    </button>
                    <button
                      onClick={handleModalCancel}
                      disabled={loading}
                      style={{
                        flex: 1,
                        padding: "16px 20px",
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 10,
                        color: "#888",
                        fontWeight: 700,
                        fontSize: 15,
                        cursor: loading ? "not-allowed" : "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      Cancel
                    </button>
                  </>
                )}

                {modal.type === "success" && (
                  <button
                    onClick={closeModal}
                    style={{
                      width: "100%",
                      padding: "16px 20px",
                      background: GREEN,
                      border: "none",
                      borderRadius: 10,
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 15,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {modal.actionButton || "Done"}
                  </button>
                )}

                {modal.type === "error" && (
                  <>
                    {modal.actionButton && (
                      <button
                        onClick={handleConfirmIssue}
                        disabled={loading}
                        style={{
                          flex: 1,
                          padding: "16px 20px",
                          background: ACCENT,
                          border: "none",
                          borderRadius: 10,
                          color: "#fff",
                          fontWeight: 700,
                          cursor: loading ? "not-allowed" : "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        {loading ? "Retrying…" : modal.actionButton}
                      </button>
                    )}
                    <button
                      onClick={handleModalCancel}
                      style={{
                        flex: 1,
                        padding: "16px 20px",
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 10,
                        color: "#888",
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {modal.cancelButton || "Back"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
