"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import RefundRequestPanel from "./RefundRequestPanel";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const BG     = "#080808";
const ACCENT = "#e8620a";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Registration {
  id:                    string;
  registration_code:     string;
  payment_status:        string;
  registration_status:   string;
  final_price:           number;
  created_at:            string;
  lead_email:            string;
  it_run_categories:     { name: string; distance_km: number; color: string; category_type: string } | null;
  it_run_events:         { title: string; event_date: string } | null;
  it_run_participants:   { first_name: string; last_name: string; qr_token: string | null }[];
  it_run_bib_collections: { bib_number: string | null }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function paymentBadge(status: string): { label: string; color: string; bg: string } {
  switch (status) {
    case "paid":    return { label: "Paid",    color: "#4ade80", bg: "rgba(74,222,128,0.1)" };
    case "free":    return { label: "Free",    color: "#60a5fa", bg: "rgba(96,165,250,0.1)" };
    case "pending": return { label: "Pending", color: "#fbbf24", bg: "rgba(251,191,36,0.1)" };
    default:        return { label: "Failed",  color: "#f87171", bg: "rgba(248,113,113,0.1)" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function MyRegistrationsPage() {
  const [userEmail,     setUserEmail]     = useState<string | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");

  useEffect(() => {
    async function load() {
      try {
        const meRes = await fetch("/api/auth/me");
        if (!meRes.ok) {
          setLoading(false);
          return;
        }
        const me = await meRes.json() as { email?: string };
        if (!me.email) { setLoading(false); return; }
        setUserEmail(me.email);

        const regRes = await fetch("/api/it-run/my-registrations");
        if (!regRes.ok) {
          const d = await regRes.json() as { error?: string };
          setError(d.error ?? "Failed to load registrations");
        } else {
          const d = await regRes.json() as { registrations: Registration[] };
          setRegistrations(d.registrations ?? []);
        }
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  return (
    <div style={{ background: BG, color: "#fff", fontFamily: "'Inter',system-ui,sans-serif", minHeight: "100vh" }}>

      {/* Nav */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        background: "rgba(8,8,8,0.97)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        height: 52, display: "flex", alignItems: "center",
        padding: "0 clamp(1rem,4vw,2rem)", justifyContent: "space-between",
      }}>
        <Link href="/it-run" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <Image src="/logo.png" alt="" width={22} height={22} style={{ borderRadius: "50%" }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>IT Run Sprint-2</div>
            <div style={{ fontSize: 10, color: "#444" }}>My Registrations</div>
          </div>
        </Link>
        <Link href="/it-run/register" style={{
          fontSize: 13, fontWeight: 600, color: "#fff",
          background: ACCENT, borderRadius: 8, padding: "6px 14px", textDecoration: "none",
        }}>
          Register
        </Link>
      </nav>

      {/* Content */}
      <div style={{
        maxWidth: 640, margin: "0 auto",
        padding: "calc(52px + clamp(1.5rem,5vw,2.5rem)) clamp(1rem,5vw,2rem) clamp(2rem,5vw,3rem)",
        minHeight: "100vh",
      }}>

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 60 }}>
            <div style={{ width: 32, height: 32, border: "3px solid rgba(255,255,255,0.08)", borderTopColor: ACCENT, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          </div>
        )}

        {/* Not signed in */}
        {!loading && !userEmail && (
          <div style={{ textAlign: "center", paddingTop: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" style={{ display: "inline-block" }}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#fff", margin: "0 0 10px" }}>
              Sign in to view your registrations
            </h1>
            <p style={{ fontSize: 14, color: "#666", margin: "0 0 28px", lineHeight: 1.6 }}>
              Registrations linked to your Connected Steps account will appear here.
            </p>
            <Link href="/it-run/register" style={{
              display: "inline-block", padding: "13px 28px",
              background: ACCENT, borderRadius: 12, color: "#fff",
              fontSize: 15, fontWeight: 700, textDecoration: "none",
            }}>
              Register &amp; Verify Email
            </Link>
          </div>
        )}

        {/* Error */}
        {!loading && userEmail && error && (
          <div style={{
            background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)",
            borderRadius: 12, padding: "16px 20px", fontSize: 14, color: "#f87171",
          }}>
            {error}
          </div>
        )}

        {/* No registrations */}
        {!loading && userEmail && !error && registrations.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: 40 }}>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#fff", margin: "0 0 10px" }}>
              No registrations yet
            </h1>
            <p style={{ fontSize: 14, color: "#666", margin: "0 0 28px", lineHeight: 1.6 }}>
              Registrations made while signed in as <strong style={{ color: "#888" }}>{userEmail}</strong> will appear here.
            </p>
            <Link href="/it-run/register" style={{
              display: "inline-block", padding: "13px 28px",
              background: ACCENT, borderRadius: 12, color: "#fff",
              fontSize: 15, fontWeight: 700, textDecoration: "none",
            }}>
              Register Now
            </Link>
          </div>
        )}

        {/* Registration list */}
        {!loading && userEmail && registrations.length > 0 && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: "clamp(1.3rem,4vw,1.6rem)", fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>
                My Registrations
              </h1>
              <div style={{ fontSize: 13, color: "#555" }}>
                {registrations.length} registration{registrations.length !== 1 ? "s" : ""} for {userEmail}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {registrations.map(reg => {
                const badge   = paymentBadge(reg.payment_status);
                const cat     = reg.it_run_categories;
                const event   = reg.it_run_events;
                const bibs    = reg.it_run_bib_collections.filter(b => b.bib_number);
                const parts   = reg.it_run_participants;

                return (
                  <div key={reg.id} style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 16, padding: "20px 22px",
                  }}>
                    {/* Signed-in owner opens the dashboard by code; the API checks ownership */}
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                      <Link href={`/it-run/dashboard/${reg.registration_code}`} style={{ fontSize: 13, color: ACCENT, fontWeight: 700, textDecoration: "none" }}>
                        View dashboard &rarr;
                      </Link>
                    </div>
                    {/* Header row */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                      <div>
                        {cat && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <div style={{ width: 10, height: 10, borderRadius: "50%", background: cat.color || ACCENT, flexShrink: 0 }} />
                            <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{cat.name}</span>
                            {cat.distance_km && (
                              <span style={{ fontSize: 12, color: "#555" }}>{cat.distance_km} km</span>
                            )}
                          </div>
                        )}
                        {event && (
                          <div style={{ fontSize: 13, color: "#666" }}>
                            {event.title} &bull; {formatDate(event.event_date)}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
                          color: badge.color, background: badge.bg,
                          textTransform: "uppercase", letterSpacing: "0.06em",
                        }}>
                          {badge.label}
                        </span>
                      </div>
                    </div>

                    {/* Registration code */}
                    <div style={{
                      background: "rgba(255,255,255,0.03)", borderRadius: 10,
                      padding: "10px 14px", marginBottom: 14,
                      display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8,
                    }}>
                      <div>
                        <div style={{ fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>
                          Registration Code
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", letterSpacing: "0.08em", fontFamily: "monospace" }}>
                          {reg.registration_code}
                        </div>
                      </div>
                      {bibs.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>
                            BIB{bibs.length > 1 ? "s" : ""}
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: ACCENT, fontFamily: "monospace" }}>
                            {bibs.map(b => b.bib_number).join(", ")}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Participants */}
                    {parts.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {parts.map((p, i) => (
                          <div key={i} style={{
                            fontSize: 12, color: "#aaa",
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            borderRadius: 8, padding: "5px 12px",
                          }}>
                            {p.first_name} {p.last_name}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Footer */}
                    <div style={{ marginTop: 14, fontSize: 12, color: "#333", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
                      <span>Registered {formatDate(reg.created_at)}</span>
                      {reg.final_price > 0 && (
                        <span>&#8377;{reg.final_price.toLocaleString("en-IN")}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <RefundRequestPanel registrations={registrations} />
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
