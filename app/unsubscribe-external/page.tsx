"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";

function UnsubscribeContent() {
  const params = useSearchParams();
  const token  = params.get("token") ?? "";

  const [state,  setState]  = useState<"loading" | "confirm" | "done" | "already" | "error">("loading");
  const [email,  setEmail]  = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!token) { setState("error"); return; }
    fetch(`/api/unsubscribe-external?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error)               { setState("error");   return; }
        if (d.alreadyUnsubscribed) { setState("already"); setEmail(d.email); return; }
        setState("confirm"); setEmail(d.email);
      })
      .catch(() => setState("error"));
  }, [token]);

  async function confirm() {
    setWorking(true);
    const res  = await fetch("/api/unsubscribe-external", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ token }),
    });
    const data = await res.json();
    setWorking(false);
    if (data.alreadyUnsubscribed || data.unsubscribed) setState("done");
    else setState("error");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f6f7fb", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: "36px 32px", maxWidth: 460, width: "100%", boxShadow: "0 4px 32px rgba(0,0,0,0.08)", textAlign: "center" }}>
        <Image src="/logo.png" alt="Connected Steps" width={48} height={48} style={{ borderRadius: "50%", marginBottom: 16 }} />
        <div style={{ fontSize: 22, fontWeight: 800, color: "#1a1a2e", marginBottom: 4 }}>Connected Steps</div>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 32, letterSpacing: "0.05em", textTransform: "uppercase" }}>Promotional Email Preferences</div>

        {state === "loading" && (
          <p style={{ color: "#666", fontSize: 14 }}>Verifying your link…</p>
        )}

        {state === "error" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <p style={{ color: "#e53e3e", fontWeight: 600, marginBottom: 8 }}>Link invalid or expired</p>
            <p style={{ color: "#666", fontSize: 13 }}>This unsubscribe link is no longer valid. If you continue to receive unwanted emails, please reply to any email from us and ask to be removed.</p>
          </>
        )}

        {state === "already" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <p style={{ color: "#276749", fontWeight: 600, marginBottom: 8 }}>Already unsubscribed</p>
            <p style={{ color: "#666", fontSize: 13 }}><strong>{email}</strong> is already removed from our promotional mailing list.</p>
          </>
        )}

        {state === "confirm" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📧</div>
            <p style={{ color: "#1a1a2e", fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Unsubscribe from promotional emails</p>
            <p style={{ color: "#555", fontSize: 14, marginBottom: 24 }}>
              Clicking "Unsubscribe" below will remove <strong>{email}</strong> from all Connected Steps promotional mailings.
            </p>
            <p style={{ color: "#888", fontSize: 12, marginBottom: 28 }}>Transactional emails such as event confirmations will continue to reach you if you have registered for an event.</p>
            <button
              onClick={confirm}
              disabled={working}
              style={{ padding: "12px 32px", background: "#e8620a", border: "none", borderRadius: 8, color: "#fff", fontSize: 14, fontWeight: 700, cursor: working ? "default" : "pointer", opacity: working ? 0.7 : 1, fontFamily: "inherit", width: "100%" }}>
              {working ? "Processing…" : "Unsubscribe"}
            </button>
            <button
              onClick={() => window.history.back()}
              style={{ marginTop: 10, background: "none", border: "none", color: "#aaa", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              Cancel
            </button>
          </>
        )}

        {state === "done" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <p style={{ color: "#276749", fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Successfully unsubscribed</p>
            <p style={{ color: "#555", fontSize: 14 }}><strong>{email}</strong> will no longer receive promotional emails from Connected Steps.</p>
          </>
        )}

        <div style={{ marginTop: 36, fontSize: 11, color: "#ccc", borderTop: "1px solid #f0f0f0", paddingTop: 16 }}>
          Connected Steps Events · Hyderabad, Telangana<br />
          <a href="https://connectedsteps.in" style={{ color: "#ccc" }}>connectedsteps.in</a>
        </div>
      </div>
    </div>
  );
}

export default function UnsubscribeExternalPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#f6f7fb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", color: "#666" }}>Loading…</div>}>
      <UnsubscribeContent />
    </Suspense>
  );
}
