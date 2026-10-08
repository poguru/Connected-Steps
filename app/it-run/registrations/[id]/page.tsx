"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const BG     = "#080808";
const ACCENT = "#e8620a";
const SUCCESS = "#10b981";
const WARNING = "#f59e0b";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface RegistrationDetails {
  registration: {
    id: string;
    code: string;
    status: string;
    event: {
      id: string;
      slug: string;
      title: string;
      event_date: string;
      report_time: string;
      flag_off_time: string;
      venue_name: string;
      venue_address: string;
      city: string;
    } | null;
    category: {
      id: string;
      slug: string;
      name: string;
      distance_km: number;
      category_type: string;
      includes_bib: boolean;
      includes_timing: boolean;
      includes_medal: boolean;
      includes_tshirt: boolean;
      includes_certificate: boolean;
    } | null;
    booking: {
      email: string;
      created_at: string;
    };
    pricing: {
      base: number;
      discount: number;
      final: number;
    };
    payment: {
      status: "pending" | "paid" | "failed" | "free";
      razorpay_order_id: string | null;
      razorpay_payment_id: string | null;
    };
    participants: {
      id: string;
      name: string;
      bib_name: string;
      type: string;
      dob: string | null;
      gender: string;
      email: string | null;
      mobile: string;
      blood_group: string | null;
      emergency: { name: string | null; phone: string | null };
      company: { name: string | null; employee_id: string | null };
      tshirt_size: string | null;
      verification_status: string;
      bib: { number: string | null; collected_at: string | null };
      created_at: string;
    }[];
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function paymentBadge(status: string): { label: string; color: string; bg: string } {
  switch (status) {
    case "paid":    return { label: "Paid",    color: SUCCESS, bg: "rgba(16,185,129,0.1)" };
    case "free":    return { label: "Free",    color: "#60a5fa", bg: "rgba(96,165,250,0.1)" };
    case "pending": return { label: "Pending", color: WARNING, bg: "rgba(245,158,11,0.1)" };
    default:        return { label: "Failed",  color: "#f87171", bg: "rgba(248,113,113,0.1)" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const Section = {
  container: {
    marginBottom: 32,
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    paddingBottom: 32,
  } as React.CSSProperties,
  title: {
    fontSize: 13,
    fontWeight: 700,
    color: ACCENT,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    marginBottom: 16,
  } as React.CSSProperties,
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
    marginBottom: 16,
  } as React.CSSProperties,
};

const Card = {
  base: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 16,
  } as React.CSSProperties,
  label: {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    marginBottom: 6,
  } as React.CSSProperties,
  value: {
    fontSize: 16,
    fontWeight: 600,
    color: "#fff",
  } as React.CSSProperties,
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function RegistrationDetailsPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<RegistrationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/it-run/registrations/${id}`);
        if (!res.ok) {
          const err = await res.json() as { error?: string };
          setError(err.error ?? "Registration not found");
          setLoading(false);
          return;
        }
        const d = await res.json() as RegistrationDetails;
        setData(d);
      } catch (e) {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [id]);

  if (loading) {
    return (
      <div style={{ background: BG, color: "#fff", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 32, height: 32, border: "3px solid rgba(255,255,255,0.08)", borderTopColor: ACCENT, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ background: BG, color: "#fff", minHeight: "100vh", fontFamily: "'Inter',system-ui,sans-serif" }}>
        <nav style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
          background: "rgba(8,8,8,0.97)", backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          height: 52, display: "flex", alignItems: "center",
          padding: "0 clamp(1rem,4vw,2rem)", justifyContent: "space-between",
        }}>
          <Link href="/it-run/my-registrations" style={{ color: "#fff", textDecoration: "none", fontSize: 14, fontWeight: 600 }}>
            ← Back to Registrations
          </Link>
        </nav>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "100px 20px 40px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>😕</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{error}</h1>
          <p style={{ color: "#666", marginBottom: 24 }}>The registration you're looking for doesn't exist or you don't have access to it.</p>
          <Link href="/it-run/my-registrations" style={{
            display: "inline-block",
            padding: "12px 24px",
            background: ACCENT,
            color: "#fff",
            borderRadius: 10,
            textDecoration: "none",
            fontWeight: 600,
            fontSize: 14,
          }}>
            View My Registrations
          </Link>
        </div>
      </div>
    );
  }

  const reg = data.registration;
  const event = reg.event;
  const category = reg.category;
  const paymentStatus = paymentBadge(reg.payment.status);

  return (
    <div style={{ background: BG, color: "#fff", fontFamily: "'Inter',system-ui,sans-serif", minHeight: "100vh" }}>
      {/* Navigation */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        background: "rgba(8,8,8,0.97)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        height: 52, display: "flex", alignItems: "center",
        padding: "0 clamp(1rem,4vw,2rem)", justifyContent: "space-between",
      }}>
        <Link href="/it-run/my-registrations" style={{ color: "#888", textDecoration: "none", fontSize: 13, fontWeight: 600, transition: "color 0.2s" }}>
          ← Back
        </Link>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#888" }}>
          Registration: {reg.code}
        </div>
      </nav>

      {/* Content */}
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "calc(52px + 2rem) clamp(1rem,4vw,2rem) 3rem" }}>

        {/* Event Header */}
        {event && (
          <div style={{ marginBottom: 40, paddingBottom: 24, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>EVENT</div>
            <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0, marginBottom: 12 }}>{event.title}</h1>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 14, color: "#aaa" }}>
              <div>
                <div style={{ color: "#666", fontSize: 11, marginBottom: 4 }}>EVENT DATE</div>
                <div style={{ fontWeight: 600 }}>{formatDate(event.event_date)}</div>
              </div>
              <div>
                <div style={{ color: "#666", fontSize: 11, marginBottom: 4 }}>VENUE</div>
                <div style={{ fontWeight: 600 }}>{event.venue_name}, {event.city}</div>
              </div>
            </div>
          </div>
        )}

        {/* Registration Status */}
        <div style={{ ...Section.container }}>
          <div style={Section.title}>Registration Status</div>
          <div style={Section.grid}>
            <div style={Card.base}>
              <div style={Card.label}>Registration Code</div>
              <div style={{ ...Card.value, fontFamily: "'SF Mono',monospace", fontSize: 14, letterSpacing: 1 }}>{reg.code}</div>
            </div>
            <div style={Card.base}>
              <div style={Card.label}>Payment Status</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: paymentStatus.color }}>
                {paymentStatus.label}
              </div>
            </div>
            <div style={Card.base}>
              <div style={Card.label}>Registered On</div>
              <div style={Card.value}>{formatDateTime(reg.booking.created_at)}</div>
            </div>
            {category && (
              <div style={Card.base}>
                <div style={Card.label}>Category</div>
                <div style={Card.value}>{category.name}</div>
              </div>
            )}
          </div>
        </div>

        {/* Pricing */}
        <div style={{ ...Section.container }}>
          <div style={Section.title}>Pricing</div>
          <div style={Section.grid}>
            <div style={Card.base}>
              <div style={Card.label}>Base Price</div>
              <div style={Card.value}>₹{reg.pricing.base.toLocaleString("en-IN")}</div>
            </div>
            {reg.pricing.discount > 0 && (
              <div style={Card.base}>
                <div style={Card.label}>Discount</div>
                <div style={{ ...Card.value, color: SUCCESS }}>−₹{reg.pricing.discount.toLocaleString("en-IN")}</div>
              </div>
            )}
            <div style={Card.base}>
              <div style={Card.label}>Final Price</div>
              <div style={{ ...Card.value, fontSize: 20, color: ACCENT }}>₹{reg.pricing.final.toLocaleString("en-IN")}</div>
            </div>
          </div>
        </div>

        {/* Participants */}
        <div style={{ ...Section.container }}>
          <div style={Section.title}>Participants ({reg.participants.length})</div>
          {reg.participants.map((p, idx) => (
            <div key={p.id} style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12,
              padding: 20,
              marginBottom: 16,
            }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>NAME</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{p.name}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>BIB NAME</div>
                  <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "'SF Mono',monospace", color: ACCENT }}>
                    {p.bib_name}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>GENDER</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.gender || "–"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>DOB</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.dob ? formatDate(p.dob) : "–"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>BLOOD GROUP</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.blood_group || "–"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>T-SHIRT</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.tshirt_size || "–"}</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div>
                  <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>MOBILE</div>
                  <div style={{ fontSize: 13, fontWeight: 500, fontFamily: "'SF Mono',monospace" }}>{p.mobile}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>EMAIL</div>
                  <div style={{ fontSize: 13, fontWeight: 500, wordBreak: "break-all" }}>{p.email || "–"}</div>
                </div>
              </div>

              {/* Emergency Contact */}
              {(p.emergency.name || p.emergency.phone) && (
                <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ fontSize: 11, color: ACCENT, marginBottom: 8 }}>EMERGENCY CONTACT</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>Name</div>
                      <div style={{ fontSize: 13 }}>{p.emergency.name || "–"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>Phone</div>
                      <div style={{ fontSize: 13, fontFamily: "'SF Mono',monospace" }}>{p.emergency.phone || "–"}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Company */}
              {(p.company.name || p.company.employee_id) && (
                <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ fontSize: 11, color: ACCENT, marginBottom: 8 }}>COMPANY</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>Name</div>
                      <div style={{ fontSize: 13 }}>{p.company.name || "–"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>Employee ID</div>
                      <div style={{ fontSize: 13 }}>{p.company.employee_id || "–"}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* BIB Information */}
              <div>
                <div style={{ fontSize: 11, color: ACCENT, marginBottom: 8 }}>BIB INFORMATION</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>BIB Number</div>
                    <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "'SF Mono',monospace", color: p.bib.number ? SUCCESS : "#666" }}>
                      {p.bib.number || "Not yet allocated"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>Collected</div>
                    <div style={{ fontSize: 13 }}>
                      {p.bib.collected_at ? formatDateTime(p.bib.collected_at) : "Not collected"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Back Button */}
        <div style={{ textAlign: "center", paddingTop: 20 }}>
          <Link href="/it-run/my-registrations" style={{
            display: "inline-block",
            padding: "12px 24px",
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10,
            color: "#888",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: 14,
            transition: "all 0.2s",
          }}>
            Back to My Registrations
          </Link>
        </div>

      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
