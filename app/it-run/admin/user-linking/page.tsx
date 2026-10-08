"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Participant {
  first_name: string;
  last_name: string;
}

interface OrphanedReg {
  id: string;
  registration_code: string;
  lead_email: string;
  participant_count: number;
  final_price: number;
  created_at: string;
  participants: Participant[];
}

interface User {
  email: string;
  first_name: string;
  last_name: string;
}

const BG = "#080808";
const ACCENT = "#e8620a";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function UserLinkingPage() {
  const [orphaned, setOrphaned] = useState<OrphanedReg[]>([]);
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searchEmail, setSearchEmail] = useState("");
  const [selectedReg, setSelectedReg] = useState<OrphanedReg | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/it-run/admin/orphaned-registrations");
        if (!res.ok) {
          const err = await res.json() as { error?: string };
          setError(err.error ?? "Failed to load orphaned registrations");
          setLoading(false);
          return;
        }
        const d = await res.json() as { registrations: OrphanedReg[] };
        setOrphaned(d.registrations ?? []);
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  useEffect(() => {
    async function search() {
      if (!searchEmail.trim()) {
        setSearchResults([]);
        return;
      }
      try {
        const res = await fetch(`/api/it-run/admin/search-users?email=${encodeURIComponent(searchEmail)}`);
        if (res.ok) {
          const d = await res.json() as { users: User[] };
          setSearchResults(d.users ?? []);
        }
      } catch {
        setSearchResults([]);
      }
    }

    const timer = setTimeout(search, 300);
    return () => clearTimeout(timer);
  }, [searchEmail]);

  async function handleLink(userId: string) {
    if (!selectedReg) return;
    setLinking(true);
    try {
      const res = await fetch("/api/it-run/admin/link-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registration_id: selectedReg.id,
          user_email: userId,
        }),
      });
      if (!res.ok) {
        alert("Failed to link registration");
        return;
      }
      setOrphaned((prev) => prev.filter((r) => r.id !== selectedReg.id));
      setSelectedReg(null);
      setSearchEmail("");
      alert("Registration linked successfully");
    } catch {
      alert("Error linking registration");
    } finally {
      setLinking(false);
    }
  }

  return (
    <div style={{ background: BG, color: "#fff", fontFamily: "'Inter',system-ui,sans-serif", minHeight: "100vh" }}>
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          background: "rgba(8,8,8,0.97)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          height: 52,
          display: "flex",
          alignItems: "center",
          padding: "0 clamp(1rem,4vw,2rem)",
          justifyContent: "space-between",
        }}
      >
        <Link href="/it-run/admin" style={{ color: "#888", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
          ← Admin Portal
        </Link>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Link Registrations</div>
      </nav>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "calc(52px + 2rem) clamp(1rem,4vw,2rem) 3rem" }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0, marginBottom: 8 }}>Link Registrations</h1>
        <p style={{ fontSize: 14, color: "#666", margin: 0, marginBottom: 32 }}>
          Link orphaned IT Run registrations to Connected Steps user accounts.
        </p>

        {error && (
          <div
            style={{
              background: "rgba(248,113,113,0.06)",
              border: "1px solid rgba(248,113,113,0.2)",
              borderRadius: 12,
              padding: 16,
              color: "#f87171",
              fontSize: 14,
              marginBottom: 24,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, minHeight: 500 }}>
          {/* Left: Orphaned Registrations */}
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              padding: 20,
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px 0" }}>
              Orphaned Registrations ({orphaned.length})
            </h2>

            {loading ? (
              <div style={{ textAlign: "center", paddingTop: 40 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    border: "3px solid rgba(255,255,255,0.08)",
                    borderTopColor: ACCENT,
                    borderRadius: "50%",
                    margin: "0 auto",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
              </div>
            ) : orphaned.length === 0 ? (
              <div style={{ textAlign: "center", paddingTop: 40, color: "#666" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                <p>All registrations are linked!</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {orphaned.map((reg) => (
                  <div
                    key={reg.id}
                    onClick={() => setSelectedReg(reg)}
                    style={{
                      padding: 12,
                      background: selectedReg?.id === reg.id ? "rgba(232,98,10,0.15)" : "rgba(255,255,255,0.02)",
                      border:
                        selectedReg?.id === reg.id
                          ? "1px solid rgba(232,98,10,0.3)"
                          : "1px solid rgba(255,255,255,0.05)",
                      borderRadius: 8,
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      if (selectedReg?.id !== reg.id) {
                        e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedReg?.id !== reg.id) {
                        e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                      }
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{reg.registration_code}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{reg.lead_email}</div>
                    <div style={{ fontSize: 12, color: "#666" }}>
                      {reg.participant_count} participant{reg.participant_count !== 1 ? "s" : ""} • ₹{reg.final_price}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Search & Link */}
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              padding: 20,
              position: "sticky",
              top: "calc(52px + 2rem)",
              height: "fit-content",
              maxHeight: "calc(100vh - 100px)",
              overflowY: "auto",
            }}
          >
            {selectedReg ? (
              <>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px 0" }}>Link Registration</h2>

                <div style={{ marginBottom: 20, fontSize: 13 }}>
                  <div style={{ color: "#666", marginBottom: 4 }}>Registration Code</div>
                  <div style={{ fontFamily: "monospace", fontWeight: 600 }}>{selectedReg.registration_code}</div>
                </div>

                <div style={{ marginBottom: 20, fontSize: 13 }}>
                  <div style={{ color: "#666", marginBottom: 4 }}>Lead Email</div>
                  <div style={{ fontWeight: 600 }}>{selectedReg.lead_email}</div>
                </div>

                <div style={{ marginBottom: 24, fontSize: 13 }}>
                  <div style={{ color: "#666", marginBottom: 8 }}>Participants</div>
                  {selectedReg.participants.map((p, i) => (
                    <div key={i} style={{ color: "#888", fontSize: 12 }}>
                      {p.first_name} {p.last_name}
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 8 }}>
                    Search User by Email
                  </label>
                  <input
                    type="email"
                    placeholder="Enter user email..."
                    value={searchEmail}
                    onChange={(e) => setSearchEmail(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 8,
                      color: "#fff",
                      fontSize: 14,
                      fontFamily: "inherit",
                    }}
                  />
                </div>

                {searchResults.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {searchResults.map((user) => (
                      <button
                        key={user.email}
                        onClick={() => handleLink(user.email)}
                        disabled={linking}
                        style={{
                          padding: 12,
                          background: "rgba(232,98,10,0.2)",
                          border: "1px solid rgba(232,98,10,0.3)",
                          borderRadius: 8,
                          color: "#fff",
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: 600,
                          textAlign: "left",
                          transition: "all 0.2s",
                          opacity: linking ? 0.5 : 1,
                        }}
                        onMouseEnter={(e) => {
                          if (!linking) e.currentTarget.style.background = "rgba(232,98,10,0.3)";
                        }}
                        onMouseLeave={(e) => {
                          if (!linking) e.currentTarget.style.background = "rgba(232,98,10,0.2)";
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{user.email}</div>
                        <div style={{ fontSize: 12, color: "#aaa" }}>
                          {user.first_name} {user.last_name}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setSelectedReg(null)}
                  style={{
                    width: "100%",
                    marginTop: 16,
                    padding: 10,
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 8,
                    color: "#888",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Clear
                </button>
              </>
            ) : (
              <div style={{ textAlign: "center", paddingTop: 60, color: "#666" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>👈</div>
                <p>Select a registration to link</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
