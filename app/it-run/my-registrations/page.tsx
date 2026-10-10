"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import RefundRequestPanel from "./RefundRequestPanel";
import CategoryChangeButton from "./CategoryChangeButton";
import AddIdControl from "./AddIdControl";
import { CUTOFF_CLOSED_MESSAGE } from "@/lib/it-run-participant-cutoff";
import {
  parseMyRegistrations,
  parseClaimableCount,
  parseChangesOpen,
  paymentStatusView,
  registrationNote,
  loadFailureMessage,
  type MyRegistration,
  type MyRegistrationsLoadFailure,
} from "@/lib/it-run-my-registrations";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const BG     = "#080808";
const ACCENT = "#e8620a";
const SIGN_IN_HREF = "/auth?redirect=%2Fit-run%2Fmy-registrations";

// ─────────────────────────────────────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────────────────────────────────────

type LoadState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "error"; kind: MyRegistrationsLoadFailure }
  | { status: "ready"; email: string; registrations: MyRegistration[]; claimable: number; changesOpen: boolean };

/** Session check first, then the registrations. Every failure is classified; no raw server text reaches the page. */
async function fetchMyRegistrations(): Promise<LoadState> {
  let meRes: Response;
  try {
    meRes = await fetch("/api/auth/me", { cache: "no-store" });
  } catch {
    return { status: "error", kind: "network" };
  }
  if (meRes.status === 401) return { status: "signed_out" };
  if (!meRes.ok) return { status: "error", kind: "server" };

  const me = await meRes.json().catch(() => null) as { email?: unknown } | null;
  if (!me || typeof me.email !== "string" || me.email === "") return { status: "error", kind: "malformed" };

  let regRes: Response;
  try {
    regRes = await fetch("/api/it-run/my-registrations", { cache: "no-store" });
  } catch {
    return { status: "error", kind: "network" };
  }
  if (regRes.status === 401) return { status: "error", kind: "session" };
  if (!regRes.ok) return { status: "error", kind: "server" };

  const body = await regRes.json().catch(() => null);
  const registrations = parseMyRegistrations(body);
  if (!registrations) return { status: "error", kind: "malformed" };

  return {
    status: "ready", email: me.email, registrations, claimable: parseClaimableCount(body),
    // Fails closed: a response without an explicit open flag hides every change action
    changesOpen: parseChangesOpen(body),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

const PARTICIPANT_TYPE_LABEL: Record<string, string> = {
  solo: "Participant", primary: "Primary", secondary: "Secondary", parent: "Parent", child: "Child",
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function MyRegistrationsPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    void fetchMyRegistrations().then(next => {
      if (active) setState(next);
    });
    return () => { active = false; };
  }, [reloadKey]);

  // Retry, and refresh after a category change. A loaded list stays on screen while it refreshes.
  const refresh = useCallback(() => {
    setState(prev => (prev.status === "ready" ? prev : { status: "loading" }));
    setReloadKey(k => k + 1);
  }, []);

  // Coming back to this tab (for example after paying in another tab) shows the latest state.
  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  const registrations = state.status === "ready" ? state.registrations : [];

  // Linking registrations made with this email to the account (see the claim route for the safety rules)
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function claimRegistrations() {
    if (claiming) return;
    setClaiming(true);
    setClaimMsg(null);
    try {
      const res = await fetch("/api/it-run/my-registrations/claim", { method: "POST", cache: "no-store" });
      const body = await res.json().catch(() => null) as { linked?: unknown; error?: string } | null;
      if (!res.ok || typeof body?.linked !== "number") {
        setClaimMsg({ ok: false, text: body?.error ?? "We couldn't link your registrations. Please try again." });
        return;
      }
      setClaimMsg({
        ok: true,
        text: body.linked > 0
          ? `Linked ${body.linked} registration${body.linked === 1 ? "" : "s"} to your account.`
          : "No registrations needed linking.",
      });
      refresh();
    } catch {
      setClaimMsg({ ok: false, text: "We couldn't reach the server. Check your connection and try again." });
    } finally {
      setClaiming(false);
    }
  }

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
        {state.status === "loading" && (
          <div role="status" aria-label="Loading your registrations" style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 60 }}>
            <div style={{ width: 32, height: 32, border: "3px solid rgba(255,255,255,0.08)", borderTopColor: ACCENT, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          </div>
        )}

        {/* Not signed in */}
        {state.status === "signed_out" && (
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
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <Link href={SIGN_IN_HREF} style={{
                display: "inline-block", padding: "13px 28px",
                background: ACCENT, borderRadius: 12, color: "#fff",
                fontSize: 15, fontWeight: 700, textDecoration: "none",
              }}>
                Sign in
              </Link>
              <Link href="/it-run/register" style={{
                display: "inline-block", padding: "13px 28px",
                border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, color: "#fff",
                fontSize: 15, fontWeight: 700, textDecoration: "none",
              }}>
                Register &amp; Verify Email
              </Link>
            </div>
          </div>
        )}

        {/* Load error: never shown as an empty list */}
        {state.status === "error" && (
          <div role="alert" style={{
            background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)",
            borderRadius: 12, padding: "16px 20px", fontSize: 14, color: "#f87171",
          }}>
            <div style={{ marginBottom: 12, lineHeight: 1.6 }}>{loadFailureMessage(state.kind)}</div>
            {state.kind === "session" ? (
              <Link href={SIGN_IN_HREF} style={{ color: "#fff", fontWeight: 700, textDecoration: "underline" }}>Sign in again</Link>
            ) : (
              <button type="button" onClick={refresh} style={{
                minHeight: 44, padding: "10px 18px", borderRadius: 10, cursor: "pointer",
                background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.35)",
                color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "inherit",
              }}>
                Try again
              </button>
            )}
          </div>
        )}

        {/* Cutoff notice: open until 15 January 2027, closed after it */}
        {state.status === "ready" && (
          <div role="note" style={{
            background: state.changesOpen ? "rgba(96,165,250,0.06)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${state.changesOpen ? "rgba(96,165,250,0.2)" : "rgba(255,255,255,0.1)"}`,
            borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#cbd5e1", lineHeight: 1.6,
          }}>
            {state.changesOpen
              ? "Cancellations, category changes, and new refund requests are available until 15 January 2027."
              : CUTOFF_CLOSED_MESSAGE}
          </div>
        )}

        {/* Registrations made with this email that are not on any account yet */}
        {state.status === "ready" && (state.claimable > 0 || claimMsg) && (
          <div style={{
            background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.2)",
            borderRadius: 12, padding: "14px 18px", marginBottom: 20, fontSize: 14, color: "#cbd5e1", lineHeight: 1.6,
          }}>
            {state.claimable > 0 && (
              <>
                <div style={{ marginBottom: 10 }}>
                  We found {state.claimable} registration{state.claimable === 1 ? "" : "s"} made with <strong style={{ color: "#fff" }}>{state.email}</strong> that {state.claimable === 1 ? "is" : "are"} not on any account yet.
                </div>
                <button type="button" onClick={claimRegistrations} disabled={claiming} style={{
                  minHeight: 44, padding: "10px 18px", borderRadius: 10, cursor: claiming ? "wait" : "pointer",
                  background: ACCENT, border: "none", color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "inherit",
                  opacity: claiming ? 0.6 : 1,
                }}>
                  {claiming ? "Linking…" : "Link to my account"}
                </button>
              </>
            )}
            {claimMsg && (
              <div role="status" style={{ marginTop: state.claimable > 0 ? 10 : 0, color: claimMsg.ok ? "#10b981" : "#f87171" }}>
                {claimMsg.text}
              </div>
            )}
          </div>
        )}

        {/* No registrations (only after a successful response) */}
        {state.status === "ready" && registrations.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: 40 }}>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#fff", margin: "0 0 10px" }}>
              No registrations yet
            </h1>
            <p style={{ fontSize: 14, color: "#666", margin: "0 0 28px", lineHeight: 1.6 }}>
              Registrations made while signed in as <strong style={{ color: "#888" }}>{state.email}</strong> will appear here.
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
        {state.status === "ready" && registrations.length > 0 && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: "clamp(1.3rem,4vw,1.6rem)", fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>
                My Registrations
              </h1>
              <div style={{ fontSize: 13, color: "#555" }}>
                {registrations.length} registration{registrations.length !== 1 ? "s" : ""} for {state.email}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {registrations.map(reg => {
                const badge  = paymentStatusView(reg.payment_status, reg.registration_status);
                const note   = registrationNote(reg);
                const cat    = reg.category;
                const event  = reg.event;
                const bibs   = reg.participants.map(p => p.bib_number).filter((b): b is string => !!b);

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
                      <div style={{ minWidth: 0 }}>
                        {cat && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                            <div style={{ width: 10, height: 10, borderRadius: "50%", background: cat.color || ACCENT, flexShrink: 0 }} />
                            <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{cat.name}</span>
                            {cat.distance_km != null && (
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
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, flexShrink: 0,
                        color: badge.color, background: badge.bg,
                        textTransform: "uppercase", letterSpacing: "0.06em",
                      }}>
                        {badge.label}
                      </span>
                    </div>

                    {note && (
                      <div style={{ fontSize: 13, color: "#fbbf24", marginBottom: 14, lineHeight: 1.5 }}>{note}</div>
                    )}

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
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", letterSpacing: "0.08em", fontFamily: "monospace", overflowWrap: "anywhere" }}>
                          {reg.registration_code}
                        </div>
                      </div>
                      {bibs.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>
                            BIB{bibs.length > 1 ? "s" : ""}
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: ACCENT, fontFamily: "monospace" }}>
                            {bibs.join(", ")}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Participants */}
                    {reg.participants.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {reg.participants.map(p => (
                          <div key={p.id} style={{
                            fontSize: 12, color: "#aaa",
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            borderRadius: 8, padding: "5px 12px",
                          }}>
                            {p.first_name} {p.last_name}
                            <span style={{ color: "#555", marginLeft: 6 }}>
                              {PARTICIPANT_TYPE_LABEL[p.participant_type] ?? ""}
                              {p.collected_at ? " · BIB collected" : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Adults who continued without an ID can add one (the server checks ownership and the participant) */}
                    {reg.participants
                      .filter(p => p.verification_status === "not_provided")
                      .map(p => (
                        <AddIdControl key={p.id} participantId={p.id}
                          participantName={`${p.first_name} ${p.last_name}`.trim()} onAdded={refresh} />
                      ))}

                    {/* Category change: options and prices come from the server */}
                    {reg.actions.canChangeCategory && (
                      <CategoryChangeButton registrationId={reg.id} onChanged={refresh} />
                    )}

                    {/* Footer */}
                    {reg.pricing.discount_label && (
                      <div style={{ marginTop: 14, fontSize: 12, color: "#60a5fa" }}>
                        Base &#8377;{reg.pricing.base_price.toLocaleString("en-IN")} &minus; {reg.pricing.discount_label} &#8377;{reg.pricing.discount_amount.toLocaleString("en-IN")}
                      </div>
                    )}
                    <div style={{ marginTop: 6, fontSize: 12, color: "#333", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
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

        {/* Independent of the registration list: a failed list request does not hide this section's own state */}
        <RefundRequestPanel registrations={registrations} changesOpen={state.status === "ready" && state.changesOpen} />
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
