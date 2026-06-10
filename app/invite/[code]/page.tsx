"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

const STORAGE_KEY = "cs_pending_referral";

/**
 * Invite landing page — /invite/[code]
 *
 * Stores the referral code in localStorage then redirects to signup.
 * Always active regardless of ENABLE_REFERRALS flag so existing links
 * never break (the code is just silently ignored when referrals are off).
 */
export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const code   = typeof params.code === "string" ? params.code.toUpperCase() : "";

  useEffect(() => {
    if (code) localStorage.setItem(STORAGE_KEY, code);
    router.replace("/auth?tab=signup");
  }, [code, router]);

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--background)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "var(--foreground)",
      fontSize: "0.875rem",
    }}>
      Taking you to Connected Steps…
    </div>
  );
}
