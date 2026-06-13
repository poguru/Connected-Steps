"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  eventId: string;
  slug:    string;
}

export default function RegisterButton({ eventId, slug }: Props) {
  const router  = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "registered" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  // On mount: check if already registered
  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("cs_user") : null;
    if (!raw) return;
    try {
      const user = JSON.parse(raw);
      if (!user?.email) return;
      fetch(`/api/events/rsvp?event_id=${eventId}&email=${encodeURIComponent(user.email)}`)
        .then(r => r.json())
        .then(d => { if (d.registered) setStatus("registered"); })
        .catch(() => {});
    } catch { /* ignore */ }
  }, [eventId]);

  function handleClick() {
    const raw = typeof window !== "undefined" ? localStorage.getItem("cs_user") : null;

    if (!raw) {
      // Store the destination so LoginForm can return here after login
      sessionStorage.setItem("cs_post_login_redirect", `/events/${slug}`);
      router.push("/auth?tab=login");
      return;
    }

    let user: { email?: string; first_name?: string } = {};
    try { user = JSON.parse(raw); } catch { /* ignore */ }
    if (!user.email) {
      sessionStorage.setItem("cs_post_login_redirect", `/events/${slug}`);
      router.push("/auth?tab=login");
      return;
    }

    setStatus("loading");
    setErrMsg("");

    fetch("/api/events/rsvp", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ event_id: eventId, email: user.email }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setStatus("registered");
        } else {
          setErrMsg(d.error ?? "Registration failed. Please try again.");
          setStatus("error");
        }
      })
      .catch(() => {
        setErrMsg("Network error. Please try again.");
        setStatus("error");
      });
  }

  // ── Registered state ──────────────────────────────────────────────────────

  if (status === "registered") {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "10px",
        padding: "14px 28px",
        borderRadius: "10px",
        background: "rgba(74,222,128,0.08)",
        border: "1px solid rgba(74,222,128,0.3)",
        color: "#4ade80",
        fontWeight: 700,
        fontSize: "1rem",
        marginBottom: "1rem",
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        You&apos;re registered!
      </div>
    );
  }

  // ── Default / loading / error ────────────────────────────────────────────

  return (
    <>
      <button
        onClick={handleClick}
        disabled={status === "loading"}
        style={{
          display: "block",
          width: "100%",
          textAlign: "center",
          padding: "14px 28px",
          borderRadius: "10px",
          background: status === "loading"
            ? "rgba(232,98,10,0.5)"
            : "linear-gradient(135deg,#e8620a,#f07c2a)",
          color: "#fff",
          fontWeight: 700,
          fontSize: "1rem",
          border: "none",
          cursor: status === "loading" ? "not-allowed" : "pointer",
          marginBottom: errMsg ? "0.5rem" : "1rem",
          fontFamily: "inherit",
          boxShadow: status === "loading" ? "none" : "0 4px 20px rgba(232,98,10,0.35)",
          transition: "background 0.2s, box-shadow 0.2s",
        }}
      >
        {status === "loading" ? "Registering…" : "Register for this event"}
      </button>

      {errMsg && (
        <div style={{
          padding: "10px 14px",
          borderRadius: "8px",
          marginBottom: "1rem",
          fontSize: "0.82rem",
          background: "rgba(226,75,74,0.08)",
          border: "1px solid rgba(226,75,74,0.3)",
          color: "#f09595",
          textAlign: "center",
        }}>
          {errMsg}
        </div>
      )}
    </>
  );
}
