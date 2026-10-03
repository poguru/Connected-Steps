"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import QRScanner from "./QRScanner";

interface Participant {
  id: string;
  firstName: string;
  lastName: string;
  bibNumber: string | null;
  wave: string | null;
  tshirtSize: string | null;
  verificationStatus: string;
  registrationCode: string;
  category: string;
  categoryColor: string;
  canIssue: boolean;
  paymentStatus: string;
  registrationStatus: string;
}

interface EntitlementData {
  participant?: Participant;
  entitlements?: Record<string, { status: string; issuedAt: string | null }>;
}

export interface OperationPageConfig {
  title: string;
  icon: string;
  entitlementType: "BIB" | "BREAKFAST" | "GOODIES" | "TSHIRT" | "MEDAL" | "CERTIFICATE";
  color: string;
  requiresSize?: boolean;
  instruction?: string;
  fields?: Array<{ key: string; label: string; type?: string }>;
}

interface OperationPageProps {
  config: OperationPageConfig;
}

export default function OperationPage({ config }: OperationPageProps) {
  const router = useRouter();
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [entitlements, setEntitlements] = useState<Record<string, { status: string; issuedAt: string | null }>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [metadata, setMetadata] = useState<Record<string, string>>({});

  async function handleScan(query: string) {
    setError(null);
    setSuccess(null);
    setParticipant(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/it-run/staff/participant/lookup?q=${encodeURIComponent(query)}`);
      const data = (await res.json()) as EntitlementData;

      if (!res.ok) {
        setError(data as any);
        return;
      }

      setParticipant(data.participant!);
      setEntitlements(data.entitlements || {});
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleIssue() {
    if (!participant) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    const idempotencyKey = `${participant.id}-${config.entitlementType}-${Date.now()}`;

    try {
      const res = await fetch("/api/it-run/staff/entitlements/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: participant.id,
          entitlementType: config.entitlementType,
          metadata: metadata,
          idempotencyKey,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(`${config.entitlementType} issued to ${participant.firstName}`);
        setTimeout(() => {
          setParticipant(null);
          setMetadata({});
        }, 2000);
      } else {
        setError(data.error ?? "Failed to issue");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  const entitlementStatus = entitlements[config.entitlementType];
  const isAlreadyIssued = entitlementStatus && entitlementStatus.status !== "pending";

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
          <div style={{ fontSize: 32, marginBottom: 8 }}>{config.icon}</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>
            {config.title}
          </h1>
          {config.instruction && (
            <p style={{ fontSize: 14, color: "#888", marginTop: 8 }}>
              {config.instruction}
            </p>
          )}
        </div>

        {/* Scanner */}
        {!participant && (
          <div style={{ marginBottom: 24 }}>
            <QRScanner onScan={handleScan} onError={setError} />
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: "14px 16px",
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 10,
              color: "#f87171",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ✗ {error}
          </div>
        )}

        {/* Success */}
        {success && (
          <div
            style={{
              marginBottom: 16,
              padding: "14px 16px",
              background: "rgba(16,185,129,0.1)",
              border: "1px solid rgba(16,185,129,0.3)",
              borderRadius: 10,
              color: "#10b981",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ✓ {success}
          </div>
        )}

        {/* Participant Details */}
        {participant && (
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${config.color}40`,
              borderRadius: 12,
              padding: 20,
              marginBottom: 20,
            }}
          >
            <div style={{ display: "flex", gap: 16, marginBottom: 16, alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>
                  {participant.firstName} {participant.lastName}
                </div>
                <div style={{ fontSize: 12, color: config.color, fontWeight: 600, marginTop: 4 }}>
                  {participant.category}
                </div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                  Reg: {participant.registrationCode}
                </div>
              </div>
              {participant.bibNumber && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "8px 12px",
                    background: `${config.color}15`,
                    borderRadius: 8,
                    border: `1px solid ${config.color}40`,
                  }}
                >
                  <div style={{ fontSize: 9, color: "#666", textTransform: "uppercase" }}>
                    BIB
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: config.color }}>
                    {participant.bibNumber}
                  </div>
                </div>
              )}
            </div>

            {/* Status */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                marginBottom: 16,
                fontSize: 12,
              }}
            >
              <div>
                <div style={{ color: "#666", marginBottom: 2 }}>Verification</div>
                <div
                  style={{
                    color:
                      participant.verificationStatus === "verified"
                        ? "#10b981"
                        : "#f59e0b",
                    fontWeight: 600,
                  }}
                >
                  {participant.verificationStatus}
                </div>
              </div>
              <div>
                <div style={{ color: "#666", marginBottom: 2 }}>Payment</div>
                <div style={{ color: "#10b981", fontWeight: 600 }}>
                  {participant.paymentStatus}
                </div>
              </div>
            </div>

            {/* Eligibility Check */}
            {!participant.canIssue && (
              <div
                style={{
                  padding: "10px 12px",
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: 8,
                  color: "#f87171",
                  fontSize: 12,
                  marginBottom: 16,
                }}
              >
                ⚠️ Not eligible: Payment {participant.paymentStatus} or registration cancelled
              </div>
            )}

            {/* Already Issued Check */}
            {isAlreadyIssued && (
              <div
                style={{
                  padding: "10px 12px",
                  background: `${config.color}15`,
                  border: `1px solid ${config.color}40`,
                  borderRadius: 8,
                  color: config.color,
                  fontSize: 12,
                  marginBottom: 16,
                }}
              >
                ℹ️ {config.entitlementType} already {entitlementStatus.status}
                {entitlementStatus.issuedAt && (
                  <>
                    {" "}
                    at {new Date(entitlementStatus.issuedAt).toLocaleTimeString("en-IN")}
                  </>
                )}
              </div>
            )}

            {/* Custom Fields (e.g., T-Shirt Size Override) */}
            {config.fields && config.fields.length > 0 && participant.canIssue && !isAlreadyIssued && (
              <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                {config.fields.map(field => (
                  <div key={field.key}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 11,
                        color: "#666",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        marginBottom: 4,
                        fontWeight: 600,
                      }}
                    >
                      {field.label}
                    </label>
                    {field.type === "select" ? (
                      <select
                        value={metadata[field.key] || ""}
                        onChange={e =>
                          setMetadata({ ...metadata, [field.key]: e.target.value })
                        }
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          padding: "10px 12px",
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 8,
                          color: "#fff",
                          fontSize: 13,
                          fontFamily: "inherit",
                        }}
                      >
                        <option value="">Select…</option>
                        {field.key === "size" &&
                          ["XS", "S", "M", "L", "XL", "XXL", "3XL"].map(s => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <input
                        type={field.type || "text"}
                        value={metadata[field.key] || ""}
                        onChange={e =>
                          setMetadata({ ...metadata, [field.key]: e.target.value })
                        }
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          padding: "10px 12px",
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 8,
                          color: "#fff",
                          fontSize: 13,
                          fontFamily: "inherit",
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: 8 }}>
              {participant.canIssue && !isAlreadyIssued && (
                <button
                  onClick={handleIssue}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: "16px 20px",
                    background: config.color,
                    border: "none",
                    borderRadius: 10,
                    color: "#fff",
                    fontWeight: 700,
                    cursor: loading ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {loading ? "Issuing…" : `Issue ${config.entitlementType}`}
                </button>
              )}
              <button
                onClick={() => setParticipant(null)}
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
                Scan Another
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
