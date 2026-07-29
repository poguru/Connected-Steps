"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function UnsubscribeContent() {
  const params  = useSearchParams();
  const success = params.get("success");
  const already = params.get("already");
  const error   = params.get("error");
  const email   = params.get("email");

  if (error) {
    return (
      <div style={card}>
        <div style={iconBox}>❌</div>
        <h1 style={h1}>Invalid link</h1>
        <p style={body}>This unsubscribe link is invalid or has already been used. Please update your preferences from your profile.</p>
        <Link href="/notifications/preferences" style={btn}>Manage Preferences</Link>
      </div>
    );
  }

  if (already) {
    return (
      <div style={card}>
        <div style={iconBox}>ℹ️</div>
        <h1 style={h1}>Already unsubscribed</h1>
        {email && <p style={body}><strong>{decodeURIComponent(email)}</strong> is already unsubscribed from promotional emails.</p>}
        <p style={{ ...body, marginTop: 8 }}>You can manage all preferences from your profile at any time.</p>
        <Link href="/notifications/preferences" style={btn}>Manage Preferences</Link>
      </div>
    );
  }

  if (success) {
    return (
      <div style={card}>
        <div style={iconBox}>✅</div>
        <h1 style={h1}>You've been unsubscribed</h1>
        {email && <p style={body}><strong>{decodeURIComponent(email)}</strong> will no longer receive promotional emails from Connected Steps.</p>}
        <p style={{ ...body, marginTop: 8, color: "rgba(255,255,255,0.4)" }}>
          You will still receive transactional emails like OTP codes, registration confirmations, and payment receipts.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24, justifyContent: "center" }}>
          <Link href="/notifications/preferences" style={btn}>Manage All Preferences</Link>
          <Link href="/" style={{ ...btn, background: "rgba(255,255,255,0.08)", color: "#fff" }}>Go to Home</Link>
        </div>
      </div>
    );
  }

  // Default: no params = generic unsubscribe page (user typed the URL directly)
  return (
    <div style={card}>
      <div style={iconBox}>📧</div>
      <h1 style={h1}>Communication Preferences</h1>
      <p style={body}>To manage your email and WhatsApp preferences, please sign in to your Connected Steps account.</p>
      <Link href="/notifications/preferences" style={btn}>Manage Preferences</Link>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  maxWidth: 480, margin: "0 auto", background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16,
  padding: "48px 40px", textAlign: "center",
};
const iconBox: React.CSSProperties = { fontSize: 48, marginBottom: 16 };
const h1: React.CSSProperties = { margin: "0 0 12px", fontSize: "1.5rem", fontWeight: 800, color: "#fff" };
const body: React.CSSProperties = { color: "rgba(255,255,255,0.6)", fontSize: "0.9rem", lineHeight: 1.6, margin: 0 };
const btn: React.CSSProperties = {
  display: "inline-block", padding: "10px 22px", borderRadius: 8,
  background: "#e8620a", color: "#fff", fontWeight: 600, fontSize: "0.875rem",
  textDecoration: "none", marginTop: 24,
};

export default function UnsubscribePage() {
  return (
    <div style={{ minHeight: "100vh", background: "#0d0d10", color: "#fff", display: "flex", alignItems: "center", padding: "2rem 1.5rem" }}>
      <div style={{ width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <Link href="/" style={{ textDecoration: "none", color: "#e8620a", fontWeight: 800, fontSize: "1.1rem" }}>
            Connected Steps
          </Link>
        </div>
        <Suspense fallback={<div style={card}><p style={body}>Loading…</p></div>}>
          <UnsubscribeContent />
        </Suspense>
        <p style={{ textAlign: "center", marginTop: 24, fontSize: "0.75rem", color: "rgba(255,255,255,0.25)" }}>
          Transactional communications (OTP, receipts, confirmations) are not affected by this action.
        </p>
      </div>
    </div>
  );
}
