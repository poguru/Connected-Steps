"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface OrphanedRegistration {
  id: string;
  registration_code: string;
  lead_email: string;
  participant_count: number;
  final_price: number;
  created_at: string;
  participants: { first_name: string; last_name: string }[];
}

interface ConnectedStepsUser {
  email: string;
  first_name: string | null;
  last_name: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const BG = "#080808";
const ACCENT = "#e8620a";
const SUCCESS = "#10b981";

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function UserLinkingPage() {
  const [orphanedRegs, setOrphanedRegs] = useState<OrphanedRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedRegId, setSelectedRegId] = useState<string | null>(null);
  const [selectedReg, setSelectedReg] = useState<OrphanedRegistration | null>(null);
  const [searchEmail, setSearchEmail] = useState("");
  const [searchResults, setSearchResults] = useState<ConnectedStepsUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [linkingRegId, setLinkingRegId] = useState<string | null>(null);

  // Load orphaned registrations
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
        const d = await res.json() as { registrations: OrphanedRegistration[] };
        setOrphanedRegs(d.registrations ?? []);
      } catch (e) {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  // Handle registration selection
  const handleSelectReg = (reg: OrphanedRegistration) => {
    setSelectedRegId(reg.id);
    setSelectedReg(reg);
    setSearchEmail(reg.lead_email);
    setSearchResults([]);
  };

  // Search for users
  const handleSearch = async () => {
    if (!searchEmail.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(`/api/it-run/admin/search-users?email=${encodeURIComponent(searchEmail)}`);
      if (!res.ok) {
        setSearchResults([]);
      } else {
        const d = await res.json() as { users: ConnectedStepsUser[] };
        setSearchResults(d.users ?? []);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  // Link registration to user
  const handleLink = async (userEmail: string) => {
    if (!selectedRegId) return;

    setLinkingRegId(selectedRegId);
    try {
      const res = await fetch("/api/it-run/admin/link-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registration_id: selectedRegId,
          user_email: userEmail,
        }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        setError(err.error ?? "Linking failed");
      } else {
        // Remove from orphaned list
        setOrphanedRegs(prev => prev.filter(r => r.id !== selectedRegId));
        setSelectedRegId(null);
        setSelectedReg(null);
        setSearchEmail("");
        setSearchResults([]);
        alert("Registration linked successfully!");
      }
    } catch {
      setError("Network error");
    } finally {
      setLinkingRegId(null);
    }
  };

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
        <Link href="/it-run/admin" style={{ color: "#888", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
          ← Admin
        </Link>
        <div style={{ fontSize: 13, fontWeight: 600 }}>User Linking Tool</div>
      </nav>

      {/* Content */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "calc(52px + 2rem) clamp(1rem,4vw,2rem) 3rem" }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8 }}>User Linking Tool</h1>
        <p style={{ fontSize: 14, color: "#666", marginBottom: 32, maxWidth: 600, lineHeight: 1.6 }}>
          Link orphaned registrations (without linked_user_email) to Connected Steps accounts.
          This tool is used to repair registrations that were created before user linking was implemented.
        </p>

        {error && (
          <div style={{
            background: "rgba(248,113,113,0.06)",
            border: "1px solid rgba(248,113,113,0.2)",
            borderRadius: 12,
            padding: 16,
            marginBottom: 24,
            color: "#f87171",
            fontSize: 14,
          }}>
            {error}
            <button
              onClick={() => setError("")}
              style={{
                marginLeft: 12,
                background: "transparent",
                border: "none",
                color: "#f87171",
                cursor: "pointer",
                textDecoration: "underline",
                fontSize: 12,
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        {loading && (
          <div style={{ textAlign: "center", paddingTop: 40 }}>
            <div style={{ width: 32, height: 32, border: "3px solid rgba(255,255,255,0.08)", borderTopColor: ACCENT, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
          </div>
        )}

        {!loading && orphanedRegs.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✨</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No orphaned registrations</h2>
            <p style={{ color: "#666", marginBottom: 24 }}>All registrations have been linked to user accounts!</p>
          </div>
        )}

        {!loading && orphanedRegs.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            {/* Left: List of orphaned registrations */}
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
                Orphaned Registrations ({orphanedRegs.length})
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {orphanedRegs.map(reg => (
                  <div
                    key={reg.id}
                    onClick={() => handleSelectReg(reg)}
                    style={{
                      background: selectedRegId === reg.id ? "rgba(232,98,10,0.15)" : "rgba(255,255,255,0.03)",
                      border: selectedRegId === reg.id ? "1px solid rgba(232,98,10,0.3)" : "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 12,
                      padding: 16,
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      if (selectedRegId !== reg.id) {
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedRegId !== reg.id) {
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                      }
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: ACCENT, marginBottom: 4 }}>
                      {reg.registration_code}
                    </div>
                    <div style={{ fontSize: 13, color: "#aaa", marginBottom: 6, wordBreak: "break-all" }}>
                      {reg.lead_email}
                    </div>
                    <div style={{ fontSize: 11, color: "#666" }}>
                      {reg.participant_count} participant{reg.participant_count !== 1 ? "s" : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Linking panel */}
            <div>
              {selectedReg ? (
                <div style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  padding: 20,
                  position: "sticky",
                  top: "calc(52px + 1rem)",
                }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Link Registration</h3>

                  {/* Registration details */}
                  <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>REGISTRATION</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{selectedReg.registration_code}</div>

                    <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>EMAIL</div>
                    <div style={{ fontSize: 12, color: "#aaa", marginBottom: 12, wordBreak: "break-all" }}>
                      {selectedReg.lead_email}
                    </div>

                    <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>PARTICIPANTS</div>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
                      {selectedReg.participants.map((p, i) => (
                        <li key={i} style={{ color: "#aaa" }}>
                          {p.first_name} {p.last_name}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Search */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 11, color: "#888", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Search User Email
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="email"
                        value={searchEmail}
                        onChange={(e) => setSearchEmail(e.target.value)}
                        placeholder="user@example.com"
                        style={{
                          flex: 1,
                          background: "rgba(255,255,255,0.05)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 8,
                          padding: "8px 12px",
                          color: "#fff",
                          fontSize: 12,
                          fontFamily: "inherit",
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSearch();
                        }}
                      />
                      <button
                        onClick={handleSearch}
                        disabled={searching}
                        style={{
                          background: ACCENT,
                          color: "#fff",
                          border: "none",
                          borderRadius: 8,
                          padding: "8px 16px",
                          fontWeight: 600,
                          fontSize: 12,
                          cursor: searching ? "not-allowed" : "pointer",
                          opacity: searching ? 0.6 : 1,
                        }}
                      >
                        {searching ? "..." : "Search"}
                      </button>
                    </div>
                  </div>

                  {/* Search results */}
                  {searchResults.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>FOUND USERS</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {searchResults.map(user => (
                          <div
                            key={user.email}
                            style={{
                              background: "rgba(16,185,129,0.1)",
                              border: "1px solid rgba(16,185,129,0.2)",
                              borderRadius: 8,
                              padding: 12,
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600 }}>
                                {user.first_name} {user.last_name}
                              </div>
                              <div style={{ fontSize: 11, color: "#aaa", wordBreak: "break-all" }}>
                                {user.email}
                              </div>
                            </div>
                            <button
                              onClick={() => handleLink(user.email)}
                              disabled={linkingRegId === selectedReg.id}
                              style={{
                                background: SUCCESS,
                                color: "#fff",
                                border: "none",
                                borderRadius: 6,
                                padding: "6px 12px",
                                fontWeight: 600,
                                fontSize: 11,
                                cursor: linkingRegId === selectedReg.id ? "not-allowed" : "pointer",
                                opacity: linkingRegId === selectedReg.id ? 0.6 : 1,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {linkingRegId === selectedReg.id ? "Linking..." : "Link"}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {searchResults.length === 0 && searchEmail && !searching && (
                    <div style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 12,
                      color: "#666",
                      textAlign: "center",
                    }}>
                      No users found
                    </div>
                  )}
                </div>
              ) : (
                <div style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px dashed rgba(255,255,255,0.1)",
                  borderRadius: 12,
                  padding: 32,
                  textAlign: "center",
                  color: "#666",
                }}>
                  <p>Select a registration to begin linking</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
